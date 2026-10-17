/**
 * Live e2e (zero-token): A PAGE THAT RELOADS MID-RUN STILL KNOWS THE RUN IS GOING.
 *
 * s2c-038. A run that writes a module the page never imported (the serve
 * engine's hook, a scaffolded component) makes vite full-reload the page while
 * the run is still working. s2c-037 made the run's own messages reach the page
 * that comes back. But that page came back in its resting state: the bar said
 * "drag to draw · ⌘K…" while files were still being written, so a non-coder
 * reads it as finished (or broken), draws again, and is told "a run is already
 * in progress". Esc did nothing, because the overlay wasn't in its running mode.
 *
 * Deterministic version of that window: the serve run from live-saywhat (a
 * sentence, no model, the engines write the route and hook), with the page's
 * answer to "send me a snapshot of the edited page" held, so the run is
 * provably still going; then the page is reloaded, the way vite does it.
 *
 *   1. after the reload, the overlay is in running mode and the bar says the
 *      run is still going (not the idle hint)
 *   2. Esc stops it: the bar says "Stopping…", then "Stopped, as you asked."
 *
 * Needs the demo app on 5199 (npm run dev). Run FROM THE REPO ROOT:
 *   node tests/e2e/live-reload-running.mjs
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const log = (...a) => console.log('[e2e-reload-running]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}
const IDLE = /drag to draw|⌘K|press D|^\s*$/i

restore()
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
const mode = () => sh(() => document.getElementById('s2c-overlay-host')?.dataset.mode ?? null).catch(() => null)

let failed = false
try {
  // the reading is stubbed to the verb a real one picks for this sentence
  let plan = null
  await page.route('**/@s2c/interpret', async (r) => {
    await r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, v2: {
        interpretation: { reading: plan.reading, actions: plan.grounded, rejected: [] },
        raw: { reading: plan.reading, actions: plan.actions, unclear: null },
        tokens: { input: 1, cacheRead: 0, output: 1 },
      } }),
    })
  })
  // hold the page's answer to the run's snapshot request: the run is then
  // still going, for as long as this test wants it to be
  const held = []
  await page.route('**/@s2c/verify-snapshot', (r) => { held.push(r) })

  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(500)
  for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
    await page.keyboard.press('Alt+a')
    await page.waitForTimeout(150)
  }
  await sh(`${sr()}.getElementById("clear").click()`)
  await page.waitForTimeout(200)

  const row = await sh(() => {
    const el = document.querySelector('table tbody tr td')
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), srcLoc: el.dataset.s2c }
  })
  const id = await sh((loc) => window.__S2C_DEBUG__.snapshot().nodes.find((n) => n.srcLoc === loc)?.id, row.srcLoc)
  plan = {
    reading: 'serve the team list from an endpoint',
    actions: [{ kind: 'serve', elements: [id], instruction: 'this list should come from the server', strokes: [] }],
  }
  plan.grounded = await sh((acts) => {
    const snap = window.__S2C_DEBUG__.snapshot()
    return acts.map((a) => ({
      kind: a.kind, instruction: a.instruction, needsConfirm: false,
      targets: a.elements.map((eid) => {
        const n = snap.nodes.find((x) => x.id === eid)
        return { domId: eid, srcLoc: n.srcLoc, tag: n.tag, text: n.text ?? '', subtreeText: n.text ?? '',
          classes: n.classes ?? [], rect: n.rect }
      }),
    }))
  }, plan.actions)

  await page.mouse.move(row.x, row.y)
  await page.waitForTimeout(150)
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(300)
  await page.keyboard.type('this list should come from the server')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await page.keyboard.press('Alt+r')
  await page.waitForFunction(() => {
    const c = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('confirm')
    return c != null && getComputedStyle(c).display !== 'none' && !c.disabled
  }, null, { timeout: 15000 })
  let reloads = 0
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) reloads++ })
  await sh(`${sr()}.getElementById("confirm").click()`)

  // the run wrote its files and asked the page for a snapshot: it's mid-run
  for (let i = 0; i < 150 && held.length === 0; i++) await page.waitForTimeout(200)
  if (!held.length) throw new Error(`ASSERT: the run never asked for a snapshot · status: ${await status()}`)
  log(`run is mid-way (vite reloaded the page ${String(reloads)}× on its own so far)`)

  // ── 1. the reload vite does when a run adds a module ─────────────────
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(1500) // the stream reconnects, the held events land
  const m1 = await mode()
  const s1 = await status()
  log('after the reload:', m1, '·', JSON.stringify(s1))
  // red before s2c-038: mode "draw", status "drag to draw · ⌘K …"
  if (m1 !== 'running') throw new Error(`ASSERT: overlay is "${String(m1)}", not running, while the run is still going`)
  if (IDLE.test(s1)) throw new Error(`ASSERT: the bar shows the idle hint mid-run: ${s1}`)
  log('✓ the reloaded page says the run is still going')

  // ── 2. Esc still stops it ──────────────────────────────────────────────
  await page.mouse.move(640, 450)
  // every line the bar shows from here on, in order (the stop can be quick)
  await sh(() => {
    const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status')
    window.__lines = []
    new MutationObserver(() => window.__lines.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true })
  })
  await page.keyboard.press('Escape')
  let s3 = ''
  for (let i = 0; i < 120; i++) {
    s3 = await status()
    if (/stopped, as you asked/i.test(s3)) break
    if (i === 8) for (const r of held) await r.continue().catch(() => {}) // let the page answer now
    await page.waitForTimeout(250)
  }
  const lines = await sh(() => window.__lines)
  log('after Esc:', JSON.stringify(lines))
  const stopAt = lines.findIndex((l) => /^stopping/i.test(l))
  const endAt = lines.findIndex((l) => /stopped, as you asked/i.test(l))
  if (stopAt < 0) throw new Error(`ASSERT: Esc did not start a stop: ${JSON.stringify(lines)}`)
  if (endAt < stopAt) throw new Error(`ASSERT: the stop did not end the run: ${JSON.stringify(lines)}`)
  log('end:', JSON.stringify(s3), '· mode', await mode())
  if (!/stopped, as you asked/i.test(s3)) throw new Error(`ASSERT: the run never said it stopped: ${s3}`)
  if ((await mode()) === 'running') throw new Error('ASSERT: still in running mode after the stop')
  log('✓ Esc stopped the run the reloaded page inherited')
} catch (e) {
  failed = true
  console.error(String(e))
} finally {
  await b.close()
  restore()
}
if (failed) process.exit(1)
log('PASS')

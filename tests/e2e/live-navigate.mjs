/**
 * Live e2e: DRAW A LINK (s2c-039) — an arrow from a link to a box named
 * "Reports" makes the link open a Reports screen, and the run proves it by
 * clicking it.
 *
 * The reading is stubbed (the same way live-saywhat does it): it fixes the
 * model's answer to `navigate` on the navbar's "Reports" link with the screen
 * name as written in the box. Everything after that is real: grounding on the
 * live page, the navigate engine writing five files, the page reloading, the
 * navigate probe clicking the link in the real page, the receipt, the undo.
 *
 * Checks:
 *   1. the five files exist (screen, registry, lib, main mount, the link's href)
 *   2. the run's own probe PASSED: the address became #/reports, the home page
 *      went, the "Reports" heading showed, ← Back came home — and the page was
 *      left at the address it had
 *   3. the receipt names the new screen in plain words
 *   4. clicking it by hand does the same (independent of the probe)
 *   5. Ctrl+Z removes every file the run created and restores the two it edited
 *   6. the probe is not hollow: a link that writes #/reports with nothing to
 *      render it FAILS ("didn't show"), and a button with no handler FAILS
 *      ("didn't open"), both straight through /@s2c/probe
 *   and: no page errors, 0 tokens (the stub is the only reading)
 *
 * Needs the demo dev server: npm run dev   (port 5199)
 * Run FROM THE REPO ROOT: node tests/e2e/live-navigate.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { penMode } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const RUNS = `${APPDIR}/.sketch2code/runs`
const log = (...a) => console.log('[e2e-navigate]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}
const assert = (ok, msg) => { if (!ok) throw new Error(`ASSERT: ${msg}`) }
const runsNow = () => (existsSync(RUNS) ? readdirSync(RUNS) : [])

restore()

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

let plan = { reading: '', actions: [] }
let asked = null
let modelCalls = 0
/** The grounded twin of a raw action, built from the live snapshot. */
const groundLocally = async (actions) =>
  sh((acts) => {
    const snap = window.__S2C_DEBUG__.snapshot()
    return acts.map((a) => ({
      kind: a.kind,
      instruction: a.instruction,
      ...(a.screen ? { screen: a.screen } : {}),
      needsConfirm: false,
      targets: (a.elements ?? []).map((id) => {
        const n = snap.nodes.find((x) => x.id === id)
        return {
          domId: id, srcLoc: n?.srcLoc ?? null, tag: n?.tag ?? 'div',
          text: n?.text ?? '', subtreeText: n?.text ?? '', classes: n?.classes ?? [],
          rect: n?.rect ?? { x: 0, y: 0, w: 10, h: 10 },
        }
      }),
    }))
  }, actions)

await page.route('**/@s2c/interpret', async (r) => {
  asked = JSON.parse(r.request().postData() ?? '{}')
  modelCalls++
  const raw = { reading: plan.reading, actions: plan.actions, unclear: null }
  await r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: { reading: plan.reading, actions: plan.grounded ?? [], rejected: [] },
        raw,
        tokens: { input: 1, cacheRead: 0, output: 1 },
      },
    }),
  })
})

const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')

async function waitStatus(re, ms = 90000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(250)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

/**
 * A run that writes new modules makes vite full-reload the page, which tears the
 * overlay down and rebuilds it a second later. The receipt is parked across that
 * — so this waits for the reload to settle and then reads it, rather than racing
 * it and sometimes catching the idle hint.
 */
async function runReceipt() {
  const first = await waitStatus(/verified|✓|✗|⚠|refus|codemod/i)
  await page.waitForTimeout(2200)
  const settled = await status()
  return /verified|✓|✗|⚠|refus|codemod/i.test(settled) ? settled : first
}

const spot = (sel) =>
  sh((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), srcLoc: el.dataset.s2c }
  }, sel)

/** The id the element menu gave this srcLoc, which is what actions target. */
const menuId = async (srcLoc) =>
  sh((loc) => {
    const snap = window.__S2C_DEBUG__.snapshot()
    const hit = snap.nodes.filter((n) => n.srcLoc === loc)
    return hit.length ? hit[0].id : null
  }, srcLoc)

const table = () =>
  sh(() => [...document.querySelectorAll('table tbody tr')]
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | ')))

/**
 * Type a sentence onto whatever is at (x, y), then run it.
 *
 * Alt+R only READS: it outlines what it understood and waits on ✓ Go, which is
 * the point of manual mode — nothing is written until a person agrees to it. So
 * this has to confirm, the way a person would.
 */
async function sayAt(at, text) {
  await page.mouse.move(at.x, at.y)
  await page.waitForTimeout(150)
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(300)
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await triggerRun()
}

/**
 * A clean page AND a clean app.
 *
 * Each phase has to start from the fixture, not from what the phase before it
 * wrote — phase 3 was asserting that two files existed when phase 2 had already
 * made one of them, so it passed while the engine was in fact refusing ("that
 * form is already real"). A test that passes for the wrong reason is worse than
 * one that fails.
 */
/**
 * Ask for the reading, agree to it, and wait for the run to be genuinely over.
 *
 * "Genuinely" is doing work there. The overlay returns to idle as soon as the
 * last event arrives, but the server holds a one-run-at-a-time lock a moment
 * longer, so the next phase pressing Run got "a run is already in progress" —
 * the server being right and the test being impatient. So this retries the
 * trigger rather than assuming the first press lands.
 */
async function triggerRun() {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.keyboard.press('Alt+r')
    let ready = false
    for (let i = 0; i < 60; i++) {
      const s = await status()
      if (/already in progress/i.test(s)) break // let the lock clear, then retry
      ready = await sh(() => {
        const c = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('confirm')
        return c != null && getComputedStyle(c).display !== 'none' && !c.disabled
      }).catch(() => false) // the page is reloading under us
      if (ready) break
      await page.waitForTimeout(200)
    }
    if (ready) {
      await sh(`${sr()}.getElementById("confirm").click()`)
      await page.waitForTimeout(500)
      // The 409 arrives HERE, on the confirm, not while waiting for the preview
      // — which is why the first version of this retry never retried: it only
      // watched for the lock in the wrong half of the sequence.
      if (/already in progress/i.test(await status())) {
        await page.waitForTimeout(2500)
        continue
      }
      for (let i = 0; i < 300; i++) {
        // A write that adds a module full-reloads the page mid-run: for a
        // moment there is no overlay (or no page to ask). That is "not over
        // yet", not a crash; the receipt reaches the new page (s2c-037).
        const busy = await sh(() => {
          const host = document.getElementById('s2c-overlay-host')
          return host == null || host.dataset.mode === 'running'
        }).catch(() => true)
        if (!busy) break
        await page.waitForTimeout(200)
      }
      if (/already in progress/i.test(await status())) {
        await page.waitForTimeout(2500)
        continue
      }
      return
    }
    await page.waitForTimeout(1500)
  }
  throw new Error(`ASSERT: could not start a run · status: ${await status()}`)
}

/**
 * Type a sentence, then point at a second element so it becomes @1 in it.
 *
 * This is the interaction the feature exists for, and it is also what puts that
 * element into the menu the model is allowed to target — the two are the same
 * mechanism, which is the point.
 */
async function sayAtNaming(at, text, also) {
  await page.mouse.move(at.x, at.y)
  await page.waitForTimeout(150)
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(300)
  await page.keyboard.type(text)
  await page.mouse.click(also.x, also.y)
  await page.waitForTimeout(300)
  const written = await sh(() => document.getElementById('s2c-overlay-host')
    .shadowRoot.getElementById('noteInput').value)
  log('sentence:', JSON.stringify(written))
  if (!/@1/.test(written)) throw new Error(`ASSERT: pointing did not name anything: ${written}`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await triggerRun()
}

async function boot() {
  // The overlay parks each receipt in sessionStorage for 20 s so it survives
  // the reload a write causes, and re-shows it on every load inside that
  // window. Without this, the next phase's runReceipt() matched the LAST
  // phase's "✓ Done" the moment the page opened and never waited for its own
  // (s2c-036: phase 2 "passed" on phase 1's sentence).
  await page.evaluate(() => sessionStorage.clear()).catch(() => {})
  restore()
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(500)
  for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
    await page.keyboard.press('Alt+a')
    await page.waitForTimeout(150)
  }
  await sh(`${sr()}.getElementById("clear").click()`)
  await page.waitForTimeout(200)
}


const CREATED = ['src/screens/Reports.tsx', 'src/screens/index.ts', 'src/lib/screens.tsx']
const EDITED = ['src/main.tsx', 'src/components/Navbar.tsx']
const original = Object.fromEntries(EDITED.map((f) => [f, readFileSync(`${APPDIR}/${f}`, 'utf8')]))

try {
  await boot()
  const link = await spot('nav a:nth-of-type(2)')
  assert(link?.srcLoc, 'the navbar\'s Reports link is not stamped')
  const runsBefore = new Set(runsNow())

  // ── the reading a model would give for an arrow from Reports to a box saying "Reports"
  plan = {
    reading: 'the Reports link opens a Reports screen',
    actions: [{
      kind: 'navigate', elements: [await menuId(link.srcLoc)], screen: 'Reports',
      instruction: 'clicking this opens the Reports screen', strokes: [],
    }],
  }
  plan.grounded = await groundLocally(plan.actions)
  await sayAt(link, 'goes to Reports')
  const receipt = await runReceipt()
  log('receipt →', receipt.slice(0, 220))
  assert(modelCalls === 1, `expected exactly one (stubbed) reading, got ${modelCalls}`)

  // 1. files
  for (const f of CREATED) assert(existsSync(`${APPDIR}/${f}`), `${f} was not written`)
  const main = readFileSync(`${APPDIR}/src/main.tsx`, 'utf8')
  assert(/<Screens home=\{<App \/>\}/.test(main), 'main.tsx does not mount <Screens>')
  const nav = readFileSync(`${APPDIR}/src/components/Navbar.tsx`, 'utf8')
  assert(/href="#\/reports"/.test(nav), 'the Reports link does not point at #/reports')
  log('✓ 1. screen, registry, lib written; main mounts <Screens>; the link points at #/reports')

  // 2. the run's own probe
  const fresh = runsNow().filter((r) => !runsBefore.has(r)).sort()
  assert(fresh.length === 1, `expected one new run dir, got ${fresh.length}`)
  const dir = `${RUNS}/${fresh[0]}`
  const verifies = readdirSync(dir).filter((f) => /^verify-.*\.json$/.test(f)).sort()
  assert(verifies.length, `the run wrote no verify file (${readdirSync(dir).join(', ')})`)
  const v = JSON.parse(readFileSync(`${dir}/${verifies.at(-1)}`, 'utf8'))
  const details = Array.isArray(v) ? v : Array.isArray(v?.detail) ? v.detail : []
  const flat = JSON.stringify(v)
  const beh = (Array.isArray(details) ? details : []).filter((d) => d?.kind === 'behaviour')
  log('probe:', beh.length ? beh.map((d) => `${d.status}: ${d.reason}`).join(' | ') : flat.slice(0, 300))
  assert(beh.length === 1, `expected one behaviour verdict, got ${beh.length}: ${flat.slice(0, 300)}`)
  assert(beh[0].status === 'passed', `the navigate probe did not pass: ${beh[0].status}: ${beh[0].reason}`)
  assert(/opened the "Reports" screen, and ← Back came home/.test(beh[0].reason), `unexpected reason: ${beh[0].reason}`)
  const hashNow = await sh(() => location.hash)
  assert(hashNow === '' || hashNow === '#', `the probe left the page at ${hashNow}`)
  log('✓ 2. the run clicked the link itself: passed, and left the page home')

  // 3. receipt
  assert(/Reports/.test(receipt), `the receipt does not name the screen: ${receipt}`)
  assert(!/didn't try|not tested|couldn't test/i.test(receipt), `the receipt says it was not tested: ${receipt}`)
  log('✓ 3. the receipt names the screen and does not say it went untested')

  // 4. by hand
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15000 })
  // the page opens with the pen on, which (rightly) eats clicks: put it down
  for (let i = 0; i < 3 && (await penMode(page)) === 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  assert((await penMode(page)) !== 'draw', 'could not put the pen down')
  await page.click('nav a:nth-of-type(2)')
  await page.waitForFunction(() => location.hash === '#/reports', null, { timeout: 5000 })
  const h1 = await page.locator('#root h1').first().textContent()
  assert(h1?.trim() === 'Reports', `the screen heading is ${h1}`)
  assert(await page.locator('nav').count() === 0, 'the home page is still showing')
  await page.click('text=← Back')
  await page.waitForFunction(() => location.hash === '' && document.querySelector('nav') != null, null, { timeout: 5000 })
  log('✓ 4. by hand: click → Reports, ← Back → home')

  // 5. undo
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(400)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await waitStatus(/undid|nothing to undo/)
  await page.waitForTimeout(2000)
  for (const f of CREATED) assert(!existsSync(`${APPDIR}/${f}`), `undo left ${f} behind`)
  for (const f of EDITED) assert(readFileSync(`${APPDIR}/${f}`, 'utf8') === original[f], `undo did not restore ${f}`)
  assert(!existsSync(`${APPDIR}/src/screens`), 'undo left the empty src/screens folder')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  assert(await page.locator('nav a:nth-of-type(2)').getAttribute('href') === '#', 'the link still goes somewhere after undo')
  log('✓ 5. one undo removed all three files and put main.tsx and Navbar.tsx back byte for byte')

  // 6. the probe must fail what a person would call broken
  const navFile = `${APPDIR}/src/components/Navbar.tsx`
  const { writeFileSync } = await import('node:fs')
  writeFileSync(navFile, readFileSync(navFile, 'utf8').replace('<a href="#" className="text-sm text-gray-600 hover:text-gray-900">Reports', '<a href="#/reports" className="text-sm text-gray-600 hover:text-gray-900">Reports'))
  await page.waitForTimeout(1200)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, null, { timeout: 15000 })
  const probeNav = (sel) => sh(async (sel) => {
    const el = document.querySelector(sel)
    const spec = {
      actionIndex: 0, kind: 'navigate',
      trigger: { srcLoc: el?.getAttribute('data-s2c'), label: `"${el?.textContent?.trim()}"` },
      screen: { route: '#/reports', heading: 'Reports' }, claim: '',
    }
    const res = await fetch('/@s2c/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': window.__S2C_TOKEN__ },
      body: JSON.stringify({ specs: [spec] }),
    })
    return res.json()
  }, sel)
  const unrendered = await probeNav('nav a:nth-of-type(2)')
  log('hash nobody renders →', JSON.stringify(unrendered.verdicts?.[0]))
  assert(unrendered.verdicts?.[0]?.status === 'failed' && /didn't show/.test(unrendered.verdicts[0].reason), 'a route nothing renders did not fail')
  assert(['', '#'].includes(await sh(() => location.hash)), 'the failed probe left the page off home')
  const dead = await probeNav('nav button')
  log('dead button →', JSON.stringify(dead.verdicts?.[0]))
  assert(dead.verdicts?.[0]?.status === 'failed' && /didn't open/.test(dead.verdicts[0].reason), 'a dead button did not fail')
  log('✓ 6. not hollow: an unrendered route and a dead button both fail, in plain words')

  const real = errs.filter((e) => !/ResizeObserver/.test(e))
  assert(real.length === 0, `page errors: ${real.join(' | ')}`)
  log('✓ draw a link: written, probed, explained, undone · 1 stubbed reading, 0 tokens')
} finally {
  await b.close()
  restore()
}

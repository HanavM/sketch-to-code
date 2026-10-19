/**
 * Live e2e (goal loop n8): the pending preview of a move / insert / new
 * section gives way to the real change when the code lands, with nothing
 * stubbed (the model reads the drawing and writes the code).
 *
 * For each gesture on the demo app:
 *   - a pending preview shows < 300 ms after lift, with no Go press
 *   - it stays up while the code is being written (no blank gap: it is only
 *     taken down once the run is done and the page shows the code's result)
 *   - after the run: the preview is gone, the source changed, and the page
 *     shows the real change (button moved up / Blog between Overview and
 *     Reports / an FAQ section)
 *   - Ctrl+Z puts the source back byte for byte
 * The demo app's source is restored (git checkout) whatever happens.
 *
 * Needs the demo dev server (npm run dev, :5199) and a signed-in Claude Code.
 * Costs a few model calls per gesture. Set S2C_ONLY=move,insert,section to
 * run a subset, S2C_APP for another port, S2C_CHROMIUM for a browser binary.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { ensureDraw, inkCount } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const DEMO_SRC = new URL('../../examples/demo-app/src', import.meta.url).pathname
const ONLY = process.env.S2C_ONLY?.split(',')
const log = (...a) => console.log('[e2e-preview-live]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const restoreSource = () => {
  try { execFileSync('git', ['checkout', '--', DEMO_SRC], { stdio: 'ignore' }) } catch { /* nothing to restore */ }
}
const diffStat = () => execFileSync('git', ['diff', '--stat', '--', DEMO_SRC]).toString().trim()
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const results = {}
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ }
  })
  const open = async () => {
    restoreSource()
    await page.goto(APP, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
      if (ping.hasPipeline) break
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(600)
    await ensureDraw(page)
  }
  const rectOf = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
  const byText = (text) => page.evaluate((t) => {
    const el = [...document.querySelectorAll('[data-s2c]')].find((e) => (e.textContent ?? '').trim() === t && getComputedStyle(e).display !== 'none')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, text)
  const pendingN = () => page.evaluate(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending').querySelectorAll(':scope > :not([data-s2c-warm])').length)
  const status = () => page.evaluate(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status')?.textContent ?? '')
  const watchPending = () => page.evaluate(() => {
    const layer = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending')
    globalThis.__PV__ = null
    globalThis.__PVOBS__?.disconnect()
    globalThis.__PVOBS__ = new MutationObserver(() => {
      if (globalThis.__PV__ == null && layer.querySelectorAll(':scope > :not([data-s2c-warm])').length > 0) {
        requestAnimationFrame(() => { globalThis.__PV__ = performance.now() })
      }
    })
    globalThis.__PVOBS__.observe(layer, { childList: true })
  })
  const draw = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 })
    await page.mouse.up()
  }
  const navOrder = () => page.evaluate(() =>
    [...document.querySelectorAll('nav a')].map((a) => ({ t: (a.textContent ?? '').trim(), x: a.getBoundingClientRect().left }))
      .sort((p, q) => p.x - q.x).map((a) => a.t).join(','))

  const gestures = {
    move: {
      make: async () => {
        // the Send invite button, up to the form's heading
        const btn = await rectOf('button[data-s2c^="src/components/ContactForm.tsx"]')
        const h2 = await rectOf('h2[data-s2c^="src/components/ContactForm.tsx"]')
        const x0 = btn.x + btn.w / 2, y0 = btn.y + btn.h / 2
        const x1 = h2.x + h2.w / 2, y1 = h2.y + h2.h / 2
        const shaft = []
        for (let i = 0; i <= 12; i++) shaft.push([x0 + ((x1 - x0) * i) / 12 + (i % 2 ? 1 : -1), y0 + ((y1 - y0) * i) / 12])
        return [...shaft, [x1 - 14, y1 + 18], [x1, y1], [x1 + 14, y1 + 18]]
      },
      note: null,
      before: async () => ({ btn: await byText('Send invite') }),
      real: async (b0) => {
        const btn = await byText('Send invite')
        return !!btn && btn.y < b0.btn.y - 60
      },
    },
    insert: {
      make: async () => {
        const a = await rectOf('a[data-s2c="src/components/Navbar.tsx:7:11"]')
        const c = await rectOf('a[data-s2c="src/components/Navbar.tsx:8:11"]')
        const gx = (a.x + a.w + c.x) / 2
        const y = a.y + a.h
        return [[gx - 9, y + 16], [gx - 4, y + 8], [gx, y], [gx + 4, y + 8], [gx + 9, y + 16]]
      },
      note: 'Blog',
      before: async () => ({}),
      real: async () => (await navOrder()) === 'Overview,Blog,Reports,Settings',
    },
    section: {
      make: async () => {
        const form = await rectOf('form[data-s2c^="src/components/ContactForm.tsx"]')
        const x = form.x + 10, y = form.y + form.h + 40, w = form.w - 20, h = 90
        const pts = []
        const side = (ax, ay, bx, by) => { for (let i = 0; i < 8; i++) pts.push([ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8]) }
        side(x, y, x + w, y + 1); side(x + w, y + 1, x + w - 1, y + h); side(x + w - 1, y + h, x + 1, y + h - 1); side(x + 1, y + h - 1, x + 2, y + 3)
        pts.push([x + 6, y + 1])
        return pts
      },
      note: 'FAQ section',
      before: async () => ({}),
      real: async () => page.evaluate(() => [...document.querySelectorAll('[data-s2c]')].some((e) =>
        /\bFAQ\b|frequently asked/i.test(e.textContent ?? '') && e.getBoundingClientRect().height > 0)),
    },
  }

  for (const [kind, g] of Object.entries(gestures)) {
    if (ONLY && !ONLY.includes(kind)) continue
    await open()
    const b0 = await g.before()
    const n0 = await inkCount(page)
    await watchPending()
    await draw(await g.make())
    await page.waitForFunction(() => globalThis.__PV__ != null, null, { timeout: 3000 })
      .catch(async () => fail(`${kind}: no preview appeared (ink ${await inkCount(page)} vs ${n0})`))
    const ms = await page.evaluate(() => globalThis.__PV__ - globalThis.__LIFT__.at(-1))
    log(`${kind}: preview ${ms.toFixed(1)} ms after lift`)
    if (ms >= 300) fail(`${kind}: lift → preview took ${ms} ms (budget 300)`)
    if (g.note) {
      await page.waitForTimeout(450)
      await page.keyboard.type(g.note, { delay: 20 })
      await page.keyboard.press('Enter')
    }
    // until the run ends: the preview stays, or the real change is already up
    const t0 = Date.now()
    const seen = []
    let gap = false, done = false, endLine = ''
    let realAt = null, goneAt = null
    while (Date.now() - t0 < 240_000) {
      const [pn, st, ink, real] = [await pendingN(), await status(), await inkCount(page), await g.real(b0)]
      if (st && st !== seen.at(-1)) seen.push(st)
      const t = Date.now() - t0
      if (real && realAt == null) realAt = t
      if (pn === 0 && goneAt == null) goneAt = t
      if (pn === 0 && !real) {
        // the preview went down: legal only once the run is over (the result
        // then decides). Mid-run with nothing real on the page is a gap.
        if (!(ink === 0 && /✓|⚠|✗/.test(st))) { gap = true }
      }
      if (ink === 0 && /✓|⚠|✗/.test(st)) { done = true; endLine = st; break }
      await page.waitForTimeout(100)
    }
    for (const s of seen) log(`   │ ${s}`)
    if (!done) fail(`${kind}: the run never finished`)
    await page.waitForTimeout(1200) // HMR settles
    const realEnd = await g.real(b0)
    const pnEnd = await pendingN()
    const diff = diffStat()
    log(`${kind}: run ended "${endLine}"; real change at ${realAt} ms, preview gone at ${goneAt} ms; diff: ${diff || '(none)'}`)
    if (pnEnd) fail(`${kind}: the preview is still up after the run (${pnEnd} boxes)`)
    if (!diff) fail(`${kind}: the code never changed`)
    if (!realEnd) fail(`${kind}: the page does not show the real change after the run`)
    if (gap) fail(`${kind}: the preview came down mid-run before the real change showed`)
    // undo
    await page.keyboard.press(UNDO)
    let undoLine = ''
    for (let i = 0; i < 50 && !/undid|nothing to undo/i.test(undoLine); i++) { await page.waitForTimeout(200); undoLine = await status() }
    await page.waitForTimeout(1500)
    const diffUndo = diffStat()
    if (diffUndo) fail(`${kind}: source still changed after Ctrl+Z (${undoLine}): ${diffUndo}`)
    log(`✓ ${kind}: preview at lift, held until the code landed, real change shown, Ctrl+Z restored the source`)
    results[kind] = { liftToPreviewMs: Math.round(ms * 10) / 10, previewGoneMs: goneAt, realMs: realAt, end: endLine }
  }
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
  log('results:', JSON.stringify(results))
  log('PASS')
} finally {
  await b.close()
  restoreSource()
}

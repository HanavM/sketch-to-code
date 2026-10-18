/**
 * Live e2e (goal loop n7): an arrow (move), a caret (insert) and a box in
 * empty space (new section) each show a pending-marked preview at pen lift,
 * with no Go press, and the preview goes away when the run fails.
 *
 * For each gesture on the demo app, /@s2c/run is stubbed to fail after
 * 400 ms (so no model is called):
 *   - a preview appears in the overlay's #pending layer < 300 ms after lift,
 *     of the right kind, labelled "pending"
 *   - the app's own DOM is untouched (no pending marks, same stamped count)
 *   - the run starts by itself, and its snapshot carries no preview
 *   - when the run fails, the preview is removed
 *
 * Timing: pen-lift event timestamp → the animation frame after the preview
 * was added. Set S2C_APP for a dev server on another port.
 */
import { chromium } from 'playwright'
import { ensureDraw, inkCount } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-preview]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const timings = {}

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ }
  })
  const open = async () => {
    await page.goto(APP, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
      if (ping.hasPipeline) break
      await page.waitForTimeout(500)
    }
    await ensureDraw(page)
  }
  const rectOf = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
  const watchPending = () => page.evaluate(() => {
    const layer = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending')
    globalThis.__PV__ = null
    globalThis.__PVOBS__?.disconnect()
    globalThis.__PVOBS__ = new MutationObserver(() => {
      if (globalThis.__PV__ == null && layer.children.length > 0) {
        requestAnimationFrame(() => { globalThis.__PV__ = performance.now() })
      }
    })
    globalThis.__PVOBS__.observe(layer, { childList: true })
  })
  const pendingState = () => page.evaluate(() => {
    const layer = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending')
    const boxes = [...layer.querySelectorAll('.pg')]
    return {
      n: boxes.length,
      kinds: [...new Set(boxes.map((d) => d.dataset.kind))],
      label: layer.textContent,
      visible: boxes.some((d) => { const r = d.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(d).display !== 'none' }),
    }
  })
  const stampedCount = () => page.evaluate(() => document.querySelectorAll('[data-s2c]').length)
  const draw = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 })
    await page.mouse.up()
  }

  const gestures = {
    move: async () => {
      // the Send invite button, up to the form's heading
      const btn = await rectOf('button[data-s2c^="src/components/ContactForm.tsx"]')
      const h2 = await rectOf('h2[data-s2c^="src/components/ContactForm.tsx"]')
      const x0 = btn.x + btn.w / 2, y0 = btn.y + btn.h / 2
      const x1 = h2.x + h2.w / 2, y1 = h2.y + h2.h / 2
      const shaft = []
      for (let i = 0; i <= 12; i++) shaft.push([x0 + ((x1 - x0) * i) / 12 + (i % 2 ? 1 : -1), y0 + ((y1 - y0) * i) / 12])
      // head: back down-left, to the tip, down-right
      return [...shaft, [x1 - 14, y1 + 18], [x1, y1], [x1 + 14, y1 + 18]]
    },
    insert: async () => {
      // a caret under the gap between Overview and Reports
      const a = await rectOf('a[data-s2c="src/components/Navbar.tsx:7:11"]')
      const c = await rectOf('a[data-s2c="src/components/Navbar.tsx:8:11"]')
      const gx = (a.x + a.w + c.x) / 2
      const y = a.y + a.h
      return [[gx - 9, y + 16], [gx - 4, y + 8], [gx, y], [gx + 4, y + 8], [gx + 9, y + 16]]
    },
    section: async () => {
      // a loose box in the empty part of the invite section, under the form
      const form = await rectOf('form[data-s2c^="src/components/ContactForm.tsx"]')
      const x = form.x + 10, y = form.y + form.h + 40, w = form.w - 20, h = 90
      const pts = []
      const side = (ax, ay, bx, by) => { for (let i = 0; i < 8; i++) pts.push([ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8]) }
      side(x, y, x + w, y + 1); side(x + w, y + 1, x + w - 1, y + h); side(x + w - 1, y + h, x + 1, y + h - 1); side(x + 1, y + h - 1, x + 2, y + 3)
      pts.push([x + 6, y + 1])
      return pts
    },
  }

  for (const [kind, make] of Object.entries(gestures)) {
    await open()
    let runSnap = null
    let runCalls = 0
    await page.route('**/@s2c/run', async (route) => {
      runCalls++
      runSnap = JSON.parse(route.request().postData() ?? '{}').snapshot ?? null
      await new Promise((r) => setTimeout(r, 400))
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed failure' }) })
    })
    const n0 = await inkCount(page)
    const stamped0 = await stampedCount()
    await watchPending()
    await draw(await make())
    await page.waitForFunction(() => globalThis.__PV__ != null, null, { timeout: 3000 })
      .catch(async () => fail(`${kind}: no preview appeared (ink ${await inkCount(page)} vs ${n0}, preview ${JSON.stringify(await page.evaluate(() => globalThis.__s2cPreview ?? null))})`))
    const ms = await page.evaluate(() => globalThis.__PV__ - globalThis.__LIFT__.at(-1))
    timings[kind] = ms
    const st = await pendingState()
    log(`${kind}: preview ${ms.toFixed(1)} ms after lift`, JSON.stringify(st))
    if (ms >= 300) fail(`${kind}: lift → preview took ${ms} ms (budget 300)`)
    if (!st.kinds.includes(kind) || st.kinds.length !== 1) fail(`${kind}: preview reads as ${st.kinds.join(',')}`)
    if (!/pending/.test(st.label) || !st.visible) fail(`${kind}: preview not visibly marked pending (${st.label})`)
    const marks = await page.evaluate(() => document.querySelectorAll('[data-s2c-pending]').length)
    if (marks) fail(`${kind}: the preview touched the app's DOM (${marks} pending marks)`)
    if ((await stampedCount()) !== stamped0) fail(`${kind}: the app's stamped element count changed`)
    // no Go: the run starts by itself, then fails → preview removed
    await page.waitForFunction(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending').children.length === 0, null, { timeout: 20000 })
      .catch(async () => fail(`${kind}: the preview stayed after the run failed (run calls ${runCalls})`))
    if (runCalls !== 1) fail(`${kind}: expected the run to start by itself once, got ${runCalls}`)
    if (runSnap && JSON.stringify(runSnap).includes('pending')) {
      const leaked = runSnap.nodes.some((n) => (n.classes ?? []).includes('pg'))
      if (leaked) fail(`${kind}: the preview leaked into the run's snapshot`)
    }
    log(`✓ ${kind}: pending preview at lift, run started with no Go, removed on failure`)
    await page.unroute('**/@s2c/run')
  }
  log('timings (ms, lift → preview visible):', JSON.stringify(Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, Math.round(v * 10) / 10]))))
  log('PASS')
} finally {
  await b.close()
}

/**
 * Live e2e (goal loop n1): a scribble over an element hides it at pen lift,
 * with no Go press, and the code catches up.
 *
 *   A. ROLLBACK — /@s2c/run is stubbed to fail: the element hides at lift,
 *      the server's snapshot still sees it (the patch never leaks into what
 *      the code is checked against), and when the run fails the element is
 *      back exactly as it was.
 *   B. LANDS — nothing stubbed. The no-model reading (plain-reading.ts) and
 *      the delete codemod run for real; the element stays hidden throughout
 *      and is gone from the DOM when the run is done. The demo app's source
 *      is restored afterwards (git checkout) whatever happens.
 *   C. UNDO — Ctrl+Z after B: the source is back as it was and the element
 *      is on the page again.
 *
 * Timing is measured in the page: pen-lift event timestamp → the first
 * animation frame after the element visibly went (fading, motion.ts, or
 * display:none). Asserted < 100 ms.
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const DEMO_SRC = new URL('../../examples/demo-app/src', import.meta.url).pathname
const log = (...a) => console.log('[e2e-optimistic]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }

const restoreSource = () => {
  try { execFileSync('git', ['checkout', '--', DEMO_SRC], { stdio: 'ignore' }) } catch { /* nothing to restore */ }
}

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    // the pen-lift moment, as the overlay itself sees it
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default is auto anyway */ }
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

  /** A stamped leaf-ish element worth scribbling out: visible, mid-sized. */
  const pickTarget = () => page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-s2c]')].filter((el) => {
      if (el.closest('#s2c-overlay-host')) return false
      const r = el.getBoundingClientRect()
      return r.top > 80 && r.bottom < innerHeight - 20 && r.width >= 120 && r.width <= 420 && r.height >= 40 && r.height <= 160 &&
        (el.textContent ?? '').trim().length > 0
    })
    els.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)
    const el = els[0]
    if (!el) return null
    el.setAttribute('data-e2e-target', '1')
    const r = el.getBoundingClientRect()
    return { src: el.getAttribute('data-s2c'), text: (el.textContent ?? '').trim(), x: r.left, y: r.top, w: r.width, h: r.height, tag: el.tagName }
  })

  /** Watch the target: when it stops rendering, stamp the next frame. */
  const watchHide = () => page.evaluate(() => {
    const el = document.querySelector('[data-e2e-target]')
    globalThis.__HID__ = null
    globalThis.__HIDOBS__?.disconnect()
    const check = () => {
      if (globalThis.__HID__ != null) return
      if (!el.isConnected || getComputedStyle(el).display === 'none' || Number(getComputedStyle(el).opacity) < 0.97) {
        requestAnimationFrame(() => { globalThis.__HID__ = performance.now() })
      }
    }
    globalThis.__HIDOBS__ = new MutationObserver(check)
    globalThis.__HIDOBS__.observe(el, { attributes: true })
    globalThis.__HIDOBS__.observe(document.body, { childList: true, subtree: true })
  })

  const scribble = async (t) => {
    const x0 = t.x + t.w * 0.06, x1 = t.x + t.w * 0.94
    const y0 = t.y + t.h * 0.1, y1 = t.y + t.h * 0.9
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    const zigs = 8
    for (let i = 1; i <= zigs; i++) {
      await page.mouse.move(x0 + ((x1 - x0) * i) / zigs, i % 2 ? y1 : y0, { steps: 6 })
    }
    await page.mouse.up()
  }

  const statusLine = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  const hidden = () => page.evaluate(() => {
    const el = document.querySelector('[data-e2e-target]')
    return !el || !el.isConnected || getComputedStyle(el).display === 'none' || Number(getComputedStyle(el).opacity) < 0.97
  })
  const liftToVisible = () => page.evaluate(() => {
    const lift = globalThis.__LIFT__.at(-1)
    return globalThis.__HID__ != null && lift != null ? globalThis.__HID__ - lift : null
  })

  // ---- A: the run fails → the element comes back -----------------------------
  await open()
  let serverSawTarget = null
  let liftWall = 0
  // goal n10: these runs exercise the model path; refuse the direct (0-token) write so nothing lands in the demo source
  await page.route('**/@s2c/direct', (r) => r.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'e2e: model path' }) }))
  await page.route('**/@s2c/run', async (route) => {
    log(`A: /@s2c/run called ${Date.now() - liftWall} ms after lift`)
    const body = JSON.parse(route.request().postData() ?? '{}')
    const src = await page.evaluate(() => document.querySelector('[data-e2e-target]')?.getAttribute('data-s2c'))
    serverSawTarget = (body.snapshot?.nodes ?? []).some((n) => n.srcLoc === src)
    await new Promise((r) => setTimeout(r, 300))
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed failure' }) })
  })
  const tA = await pickTarget()
  if (!tA) fail('no target element on the demo page')
  log('target A:', tA.tag, tA.src)
  const styleBefore = await page.evaluate(() => document.querySelector('[data-e2e-target]').getAttribute('style'))
  const n0 = await inkCount(page)
  await watchHide()
  await scribble(tA)
  liftWall = Date.now()
  await assertInk(page, n0 + 1, 'the scribble')
  await page.waitForFunction(() => globalThis.__HID__ != null, null, { timeout: 2000 }).catch(() => fail('A: the element never hid'))
  const msA = await liftToVisible()
  log(`A: hidden ${msA?.toFixed(1)} ms after pen lift`)
  if (msA == null || msA >= 100) fail(`A: lift → hidden took ${msA} ms (budget 100)`)
  // no Go press: the run starts by itself, and fails
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-e2e-target]')
    // back in the layout and fully faded back in (motion.ts takes it back smoothly)
    return el && getComputedStyle(el).display !== 'none' && el.getAnimations().length === 0 && Number(getComputedStyle(el).opacity) >= 0.99
  }, null, { timeout: 20000 }).catch(async () => fail(`A: the failed run never put the element back (status: ${await statusLine()}, mode: ${await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)}, run called: ${serverSawTarget !== null})`))
  log(`A: back ${Date.now() - liftWall} ms after lift`)
  if (serverSawTarget !== true) fail(`A: the run's snapshot did not include the target (${serverSawTarget}) — the patch leaked into it`)
  const styleAfter = await page.evaluate(() => document.querySelector('[data-e2e-target]').getAttribute('style'))
  const pendingAfter = await page.evaluate(() => document.querySelector('[data-e2e-target]').getAttribute('data-s2c-pending'))
  if (styleAfter !== styleBefore || pendingAfter !== null) fail(`A: element not restored exactly (style ${styleBefore} → ${styleAfter}, pending ${pendingAfter})`)
  log('✓ A: hid at lift, run started with no Go, failure put it back exactly')
  await page.unroute('**/@s2c/run')

  // ---- B: live, the code lands ------------------------------------------------
  await open()
  const tB = await pickTarget()
  if (!tB) fail('no target element on the demo page')
  log('target B:', tB.tag, tB.src)
  const n1 = await inkCount(page)
  await watchHide()
  try {
    await scribble(tB)
    await assertInk(page, n1 + 1, 'the scribble')
    await page.waitForFunction(() => globalThis.__HID__ != null, null, { timeout: 2000 }).catch(() => fail('B: the element never hid'))
    const msB = await liftToVisible()
    log(`B: hidden ${msB?.toFixed(1)} ms after pen lift`)
    if (msB == null || msB >= 100) fail(`B: lift → hidden took ${msB} ms (budget 100)`)
    // until the run is done the element must never flash back
    let flashed = false
    const t0 = Date.now()
    let done = false
    while (Date.now() - t0 < 90000) {
      if (!(await hidden())) { flashed = true; break }
      const st = await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
      const strokes = await inkCount(page)
      if (strokes === 0 && /✓|⚠|✗/.test(st ?? '')) { done = true; log('B: run ended:', st); break }
      await page.waitForTimeout(100)
    }
    if (flashed) fail('B: the element came back while the code was catching up')
    if (!done) fail('B: the run never finished')
    await page.waitForTimeout(500)
    // the same source line can render several instances (a .map): the one
    // scribbled out is identified by its words, not its stamp
    const gone = await page.evaluate(({ src, text }) => ![...document.querySelectorAll('[data-s2c]')].some((el) =>
      el.getAttribute('data-s2c') === src && (el.textContent ?? '').trim() === text &&
      getComputedStyle(el).display !== 'none'), { src: tB.src, text: tB.text })
    const pendingLeft = await page.evaluate(() => document.querySelectorAll('[data-s2c-pending]').length)
    if (pendingLeft) fail(`B: ${pendingLeft} element(s) still marked pending after the run`)
    const diff = execFileSync('git', ['diff', '--stat', '--', DEMO_SRC]).toString().trim()
    log('B: source diff:', diff || '(none)')
    if (!diff) fail('B: the code never changed')
    if (!gone) fail('B: the element is back after the run — the code did not delete it')
    log('✓ B: hid at lift, code deleted it, no flash back')
    // C: Ctrl+Z takes the landed delete back: source and page as before
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
    let undoLine = ''
    for (let i = 0; i < 50 && !/undid|nothing to undo/i.test(undoLine); i++) { await page.waitForTimeout(200); undoLine = await statusLine() }
    log('C: undo:', undoLine)
    if (!/undid/i.test(undoLine)) fail(`C: Ctrl+Z did not undo (${undoLine})`)
    await page.waitForTimeout(1200) // HMR
    const diffAfterUndo = execFileSync('git', ['diff', '--stat', '--', DEMO_SRC]).toString().trim()
    if (diffAfterUndo) fail(`C: source still changed after undo: ${diffAfterUndo}`)
    const back = await page.evaluate(({ src, text }) => [...document.querySelectorAll('[data-s2c]')].some((el) =>
      el.getAttribute('data-s2c') === src && (el.textContent ?? '').trim() === text &&
      getComputedStyle(el).display !== 'none'), { src: tB.src, text: tB.text })
    if (!back) fail('C: the deleted element is not back on the page after undo')
    log('✓ C: Ctrl+Z put the source and the element back')
  } finally {
    restoreSource()
  }
  log('PASS')
} finally {
  await b.close()
  restoreSource()
}

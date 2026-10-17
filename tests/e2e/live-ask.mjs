/**
 * Live e2e: THE BARE RING ASKS (s2c-020) — a ring around a button, in the
 * default ink, with no words, gets a question back instead of a model call.
 *
 * Zero model calls: /@s2c/interpret is captured and fulfilled locally, and the
 * point of most checks is that it is NOT called. Asserts:
 *   1. manual: ▶ Run on a bare ring makes no interpret call; the status line
 *      asks what should change about the ringed button, by its text, and a note
 *      is open on the ring, focused and empty, so the answer is just typing
 *   2. Esc, then ▶ Run again: the same sketch is sent as it is (a question, not
 *      a wall), with no notes; and Alt+R straight from the focused note does the same
 *   3. answering: type "red", Enter, ▶ Run: one interpret call carrying "red" on
 *      the ring's stroke
 *   4. a ring in empty space is not asked about (that is "add here")
 *   5. auto mode: the countdown ends in the question, not a call; typing the
 *      answer and Enter re-arms it, and the run goes out with the word
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp/s2c-ask-shots'
const log = (...a) => console.log('[e2e-ask]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}
mkdirSync(SHOTS, { recursive: true })

const interprets = []
await page.route('**/@s2c/interpret', async (route) => {
  interprets.push(JSON.parse(route.request().postData() ?? '{}'))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed' }) })
})
await page.route('**/@s2c/instant', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, reason: 'stubbed' }) }))
await page.route('**/@s2c/run', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))

const setAuto = async (m) => {
  await page.evaluate((v) => {
    for (const k of ['s2c:hud', 's2c:fidelity', 's2c:pen']) localStorage.removeItem(k)
    localStorage.setItem('s2c:auto', JSON.stringify(v))
  }, m)
  await page.reload({ waitUntil: 'networkidle' })
}
const ui = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = s.getElementById('noteBox')
    const inp = s.getElementById('noteInput')
    return {
      open: getComputedStyle(box).display !== 'none',
      what: s.getElementById('noteWhat').textContent,
      value: inp.value,
      focused: s.activeElement === inp,
      status: s.getElementById('status').textContent,
    }
  })
const notes = () => page.evaluate(() => window.__S2C_DEBUG__.notes())
const strokes = () => page.evaluate(() => window.__S2C_DEBUG__.strokes().map((s) => s.id))
const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
const setDraw = async () => {
  for (let i = 0; i < 3 && (await mode()) !== 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  if ((await mode()) !== 'draw') throw new Error('could not reach draw mode')
}
const rectOf = (sel) =>
  page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
/** One stroke: a slightly lopsided loop, 1.08 turns, so it runs past its start. */
const ring = async (cx, cy, rx, ry) => {
  const n = 48
  const at = (i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * 1.08 * i) / n
    const k = 1 + 0.06 * (i / n)
    return { x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a) }
  }
  await page.mouse.move(at(0).x, at(0).y)
  await page.mouse.down()
  for (let i = 1; i <= n; i++) await page.mouse.move(at(i).x, at(i).y)
  await page.mouse.up()
}
const waitCalls = async (n, ms = 4000) => {
  for (let i = 0; i < ms / 100 && interprets.length < n; i++) await page.waitForTimeout(100)
}

const BTN = 'button[data-s2c*="Navbar.tsx:10"]'
const btnText = (await page.evaluate((q) => document.querySelector(q).textContent.trim(), BTN))
const ringBtn = async () => {
  const r = await rectOf(BTN)
  await ring(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 22, r.h / 2 + 14)
}

// ---- 1. manual: Run asks, for free --------------------------------------
await setAuto('manual')
await setDraw()
await ringBtn()
if ((await strokes()).length !== 1) throw new Error(`ring drew ${(await strokes()).length} strokes, want 1`)
interprets.length = 0
await page.keyboard.press('Alt+KeyR')
await page.waitForTimeout(600)
let u = await ui()
if (interprets.length) throw new Error(`a bare ring spent ${interprets.length} interpret call(s)`)
if (!u.status.startsWith(`What should change about "${btnText}"?`)) throw new Error(`no question: "${u.status}"`)
if (!/pen colour \(Alt\+P\)/.test(u.status) || !/Run again/.test(u.status)) throw new Error(`question lacks its answers: "${u.status}"`)
if (!u.open || !u.focused || u.value !== '') throw new Error(`note not open, focused and empty: ${JSON.stringify(u)}`)
if (u.what !== 'on this stroke') throw new Error(`note is "${u.what}", want it on the ring`)
writeFileSync(`${SHOTS}/ask.png`, await page.screenshot({ clip: { x: 640, y: 0, width: 640, height: 260 } }))
log(`✓ ▶ Run on a bare ring: 0 interpret calls · "${u.status.slice(0, 60)}…" · note open on the ring`)

// ---- 2. Esc, Run again: sent as it is ---------------------------------------
await page.keyboard.press('Escape')
await page.keyboard.press('Alt+KeyR')
await waitCalls(1)
if (interprets.length !== 1) throw new Error(`▶ Run again: ${interprets.length} interpret calls, want 1`)
if ((interprets[0].notes ?? []).length) throw new Error(`sent as is should carry no notes: ${JSON.stringify(interprets[0].notes)}`)
log('✓ Esc · ▶ Run again: sent as it is, 1 call, no words')

// ---- 2b. Alt+R straight from the focused note: also sent as it is -------------
// The question opens the note focused, and the note field swallows keys. Alt+R
// did nothing there until s2c-036, so the keyboard path the question names
// needed an Esc nobody is told about.
await page.keyboard.press('Alt+KeyX')
await ringBtn()
interprets.length = 0
await page.keyboard.press('Alt+KeyR')
await page.waitForTimeout(400)
if (interprets.length || !(await ui()).focused) throw new Error('2b: the ring was not asked about with the note focused')
await page.keyboard.press('Alt+KeyR')
await waitCalls(1)
if (interprets.length !== 1) throw new Error(`Alt+R in the question's note: ${interprets.length} interpret calls, want 1`)
if ((interprets[0].notes ?? []).length) throw new Error(`Alt+R in a blank note should send no notes: ${JSON.stringify(interprets[0].notes)}`)
if ((await ui()).open) throw new Error('the blank note stayed open after Alt+R sent the sketch')
log('✓ Alt+R from the focused note: sent as it is, 1 call, note closed')

// ---- 3. answer it -------------------------------------------------------------
await page.keyboard.press('Alt+KeyX')
await ringBtn()
interprets.length = 0
await page.keyboard.press('Alt+KeyR')
await page.waitForTimeout(400)
if (interprets.length) throw new Error('second sketch was not asked about')
await page.keyboard.type('red')
await page.keyboard.press('Enter')
const ids = await strokes()
const n = await notes()
if (n.length !== 1 || n[0].text !== 'red' || !eq(n[0].anchor, { kind: 'strokes', strokeIds: ids })) {
  throw new Error(`answer not attached to the ring: ${JSON.stringify(n)}`)
}
await page.keyboard.press('Alt+KeyR')
await waitCalls(1)
if (interprets.length !== 1 || interprets[0].notes?.[0]?.text !== 'red') {
  throw new Error(`answered run: ${interprets.length} calls, notes ${JSON.stringify(interprets[0]?.notes)}`)
}
log('✓ type "red" · Enter · ▶ Run: 1 call, carrying "red" on', ids.join(','))

// ---- 4. a ring in empty space is not a question --------------------------------
await page.keyboard.press('Alt+KeyX')
await ring(75, 640, 45, 35)
interprets.length = 0
await page.keyboard.press('Alt+KeyR')
await waitCalls(1)
u = await ui()
if (interprets.length !== 1) throw new Error(`ring in empty space: ${interprets.length} calls, want 1 (no question)`)
if (/What should change/.test(u.status)) throw new Error(`asked about empty space: "${u.status}"`)
log('✓ a ring around nothing goes straight to the reader')

// ---- 5. auto: the countdown ends in the question; the answer re-arms it -----------
await page.keyboard.press('Alt+KeyX')
await setAuto('auto')
await setDraw()
interprets.length = 0
await ringBtn()
await page.waitForTimeout(2500) // well past the 900ms settle
u = await ui()
if (interprets.length) throw new Error(`auto spent ${interprets.length} call(s) on a bare ring`)
if (!u.status.startsWith('What should change about')) throw new Error(`auto: no question: "${u.status}"`)
if (!u.open || !u.focused) throw new Error(`auto: note not open for the answer: ${JSON.stringify(u)}`)
await page.keyboard.type('bigger')
await page.keyboard.press('Enter')
await waitCalls(1)
if (interprets.length !== 1 || interprets[0].notes?.[0]?.text !== 'bigger') {
  throw new Error(`auto answer: ${interprets.length} calls, notes ${JSON.stringify(interprets[0]?.notes)}`)
}
log('✓ auto: settle → question (0 calls in 2.5s) · "bigger" + Enter → 1 call with the word')

if (errors.length) throw new Error(`page errors: ${errors}`)
log('ALL ASK CHECKS PASSED · screenshots in', SHOTS)
await b.close()

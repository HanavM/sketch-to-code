/**
 * Live e2e: NOBODY PICKS A MODE.
 *
 * "Gesture" and "design" were two buttons a person had to understand before
 * drawing a line — and the answer was always visible in the ink itself: marks
 * over real elements are markup, marks over empty space are a new thing. This
 * checks the reading is right, because a wrong guess here is worse than the
 * button was: it silently sends the wrong instruction.
 *
 * The mode is only observable where it matters — on the wire — so this watches
 * what actually gets posted.
 *
 * Phases, all zero-token (interpret is stubbed):
 *   1. scribble ON a card → posts gesture
 *   2. draw a box in EMPTY space → posts design
 *   3. a circle round a small element, mostly empty by area → still gesture
 *   4. an override sticks, and pressing it again hands the decision back
 *   5. the mode segment is off the bar until somebody overrides
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-infer.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-infer]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

/** Every mode the client posts, in order. */
const posted = []
await page.route('**/@s2c/interpret', async (route) => {
  posted.push(JSON.parse(route.request().postData() ?? '{}').mode)
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: { reading: 'noted', actions: [], unclear: null },
        raw: { reading: 'noted', actions: [], unclear: null },
        tokens: { input: 1, cacheRead: 0, output: 1 },
      },
    }),
  })
})

const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host').shadowRoot
  .getElementById('status').textContent)
const segShown = () => sh(() => getComputedStyle(document.getElementById('s2c-overlay-host')
  .shadowRoot.getElementById('modes')).display !== 'none')

async function ensureDraw() {
  for (let i = 0; i < 3; i++) {
    const m = await sh(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if (m === 'draw') return
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(200)
  }
  throw new Error('could not enter draw mode')
}

/** Scribble, then ask for a reading, and report what mode went on the wire. */
async function sketchAndRun(pts) {
  await sh(`${sr()}.getElementById("clear").click()`)
  await page.waitForTimeout(150)
  await ensureDraw()
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) {
    await page.mouse.move(x, y, { steps: 4 })
    await page.waitForTimeout(14)
  }
  await page.mouse.up()
  await page.waitForTimeout(200)
  const before = posted.length
  await page.keyboard.press('Alt+r')
  for (let i = 0; i < 60 && posted.length === before; i++) await page.waitForTimeout(100)
  if (posted.length === before) throw new Error(`no interpret fired · status: ${await status()}`)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  return posted[posted.length - 1]
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
// manual, so a reading waits instead of applying itself mid-test
for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
  await page.keyboard.press('Alt+a')
  await page.waitForTimeout(150)
}
await page.waitForTimeout(300)

// ── 5 (first, while nothing has been overridden) ────────────────────────
if (await segShown()) throw new Error('the mode segment is on the bar before anyone chose a mode')
log('✓ no mode control on the bar at rest')

// ── 1. scribbling ON something is markup ───────────────────────────────
const card = await sh(() => {
  const el = [...document.querySelectorAll('[data-s2c]')].find((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 200 && r.height > 90 && r.top > 120 && r.bottom < 700
  })
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const onThing = await sketchAndRun([
  [card.x + 20, card.y + 20], [card.x + card.w - 20, card.y + 30],
  [card.x + 25, card.y + card.h - 25], [card.x + card.w - 30, card.y + card.h - 15],
])
log('scribble across a card →', onThing)
if (onThing !== 'gesture') throw new Error(`marks on an element posted "${onThing}"`)

// ── 2. drawing in EMPTY space is a new thing ───────────────────────────
const empty = await sh(() => {
  // the left gutter, outside the content column
  const main = document.querySelector('main').getBoundingClientRect()
  return { x: Math.max(20, main.left - 130), y: 300 }
})
const inSpace = await sketchAndRun([
  [empty.x, empty.y], [empty.x + 90, empty.y], [empty.x + 90, empty.y + 120],
  [empty.x, empty.y + 120], [empty.x, empty.y],
])
log('box drawn in empty space →', inSpace)
if (inSpace !== 'design') throw new Error(`marks on nothing posted "${inSpace}"`)

// ── 3. a loop round a small element is still markup ───────────────────
// mostly empty by AREA, obviously markup to a person — this is why the
// threshold is a third of the samples rather than a majority
const link = await sh(() => {
  const r = document.querySelector('nav a').getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
})
const ring = []
for (let i = 0; i <= 12; i++) {
  const a = (i / 12) * Math.PI * 2
  ring.push([link.x + Math.cos(a) * (link.w * 0.9 + 14), link.y + Math.sin(a) * (link.h * 0.9 + 14)])
}
const circled = await sketchAndRun(ring)
log('circle round a nav link →', circled)
if (circled !== 'gesture') throw new Error(`circling an element posted "${circled}"`)

// ── 4. an override sticks, and lets go ────────────────────────────────
await page.keyboard.press('Alt+e') // always design
await page.waitForTimeout(200)
if (!(await segShown())) throw new Error('overriding did not put the control on the bar to say so')
log('override on:', (await status()).slice(0, 70))
const forced = await sketchAndRun([
  [card.x + 20, card.y + 20], [card.x + card.w - 20, card.y + 30],
  [card.x + 25, card.y + card.h - 25],
])
log('same scribble on a card, with design forced →', forced)
if (forced !== 'design') throw new Error(`the override was ignored: posted "${forced}"`)

await page.keyboard.press('Alt+e') // and back
await page.waitForTimeout(200)
log('pressing it again:', (await status()).slice(0, 70))
if (await segShown()) throw new Error('the control stayed on the bar after the override was released')
const freed = await sketchAndRun([
  [card.x + 20, card.y + 20], [card.x + card.w - 20, card.y + 30],
  [card.x + 25, card.y + card.h - 25],
])
log('and the same scribble again →', freed)
if (freed !== 'gesture') throw new Error(`the override did not let go: posted "${freed}"`)

const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — the ink says what the sketch is for; nobody picks a mode')

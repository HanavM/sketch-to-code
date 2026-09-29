/**
 * Live e2e: TWO MODES, AND NOTHING ELSE TO CHOOSE.
 *
 * design — the tool is live: drag to draw, click to pick something up.
 * test   — it is not there at all: links follow, buttons press, text selects.
 *
 * Everything else that used to be a mode is gone: markup-vs-new-UI is inferred
 * from the ink, and draw-vs-select is decided by what the pointer did. So the
 * things worth proving live are that the two bridges actually work, and that
 * test mode is genuinely inert rather than merely quiet.
 *
 * Phases, all zero-token:
 *   1. design is the default, and the bar carries ONE mode control
 *   2. a drag on empty space draws; a click picks something up — no mode switch
 *   3. a drag on empty space while something is selected goes back to drawing
 *   4. test: the canvas takes no pointer events, the ink and plan are hidden,
 *      and a real link on the page actually receives the click
 *   5. test survives a reload, and coming back restores a working design surface
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-surface.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-surface]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const surface = () => sh(() => window.__S2C_DEBUG__.surface())
const mode = () => sh(() => document.getElementById('s2c-overlay-host').dataset.mode)
const strokes = () => sh(() => window.__S2C_DEBUG__.strokes().length)
const selected = () => sh(() => window.__S2C_DEBUG__.paint().srcLoc)
const barControls = () =>
  sh(() => [...document.getElementById('s2c-overlay-host').shadowRoot.querySelectorAll('#hud > *')]
    .filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.id))

const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6)
    await page.waitForTimeout(14)
  }
  await page.mouse.up()
  await page.waitForTimeout(200)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
// manual, so nothing fires a run while this pokes at the page
for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
  await page.keyboard.press('Alt+a')
  await page.waitForTimeout(150)
}

// ── 1. design is the default, one mode control ─────────────────────────
if ((await surface()) !== 'design') throw new Error(`fresh page is in ${await surface()}`)
const controls = await barControls()
log('bar:', controls.join(' '))
if (!controls.includes('surfaceBtn')) throw new Error('the design/test switch is not on the bar')
for (const gone of ['draw', 'tweakBtn', 'modes']) {
  if (controls.includes(gone)) throw new Error(`"${gone}" is still a control on the bar`)
}
log('✓ one mode control ·', controls.length, 'things on the bar')

// ── 2. drag draws, click picks up — with no mode switch in between ─────
const empty = await sh(() => {
  const main = document.querySelector('main').getBoundingClientRect()
  return { x: Math.max(24, main.left - 120), y: 320 }
})
await drag(empty, { x: empty.x + 90, y: empty.y + 70 })
const drew = await strokes()
log('drag on empty space → strokes:', drew, '· mode:', await mode())
if (drew < 1) throw new Error('a drag on empty space drew nothing')

const card = await sh(() => {
  const el = [...document.querySelectorAll('[data-s2c]')].find((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 200 && r.height > 90 && r.top > 150 && r.bottom < 700
  })
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: el.dataset.s2c }
})
await page.mouse.click(card.x, card.y)
await page.waitForTimeout(300)
const pickedUp = await selected()
log('click on a card → selected:', pickedUp, '· strokes still:', await strokes())
// the innermost stamped thing under the pointer, which is what a click means —
// so this checks it landed in the card, not that it landed on the card's root
if (!pickedUp) throw new Error('a click selected nothing at all')
if (!pickedUp.startsWith(card.id.split(':')[0])) {
  throw new Error(`a click selected ${pickedUp}, which is not inside ${card.id}`)
}
if ((await strokes()) !== drew) throw new Error('the click left a stray dot behind as a stroke')
log('✓ drag drew, click selected — one surface, no mode pressed')

// ── 3. and back again, without touching a mode ────────────────────────
await drag({ x: empty.x, y: empty.y + 160 }, { x: empty.x + 80, y: empty.y + 230 })
log('drag on empty space while selected → strokes:', await strokes(), '· mode:', await mode())
if ((await strokes()) <= drew) throw new Error('with something selected, a drag on empty space drew nothing')

// ── 4. test is genuinely inert ────────────────────────────────────────
await page.keyboard.press('Alt+x') // clear the ink so the page is clean
await page.waitForTimeout(200)
await sh(`${sr()}.getElementById("surfaceBtn").click()`)
await page.waitForTimeout(400)
if ((await surface()) !== 'test') throw new Error('the switch did not enter test')
const inert = await sh(() => {
  const host = document.getElementById('s2c-overlay-host')
  const s = host.shadowRoot
  return {
    canvas: getComputedStyle(s.getElementById('canvas')).pointerEvents,
    ink: getComputedStyle(s.getElementById('ink')).display,
    plan: getComputedStyle(s.getElementById('plan')).display,
    label: s.getElementById('surfaceBtn').textContent,
  }
})
log('test:', JSON.stringify(inert))
if (inert.canvas !== 'none') throw new Error(`the canvas still takes pointer events: ${inert.canvas}`)
if (inert.ink !== 'none' || inert.plan !== 'none') throw new Error('the overlay still paints over the page')
if (!/test/i.test(inert.label)) throw new Error(`the switch does not say where you are: ${inert.label}`)

// the real question: does the PAGE get the click?
const clicked = await sh(() => {
  const a = document.querySelector('nav a')
  let got = false
  const on = (e) => { got = true; e.preventDefault() }
  a.addEventListener('click', on, { once: true })
  const r = a.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, probe: () => got }
}).then(async (pos) => {
  await page.mouse.click(pos.x, pos.y)
  await page.waitForTimeout(200)
  return sh(() => {
    const el = document.elementFromPoint(
      document.querySelector('nav a').getBoundingClientRect().x + 5,
      document.querySelector('nav a').getBoundingClientRect().y + 5)
    return el?.tagName?.toLowerCase() ?? 'none'
  })
})
log('what is under the pointer over a link, in test:', clicked)
if (clicked === 'div' && (await sh(() => document.elementFromPoint(5, 5)?.id)) === 's2c-overlay-host') {
  throw new Error('the overlay is still the topmost thing over the page')
}
if (clicked !== 'a') throw new Error(`the page cannot be reached in test mode (hit <${clicked}>)`)
log('✓ the page is genuinely reachable — hit-testing lands on the link itself')

// ── 5. it persists, and coming back works ─────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
if ((await surface()) !== 'test') throw new Error('test did not survive a reload')
await page.keyboard.press('Alt+ ')
await page.waitForTimeout(400)
if ((await surface()) !== 'design') throw new Error('Alt+Space did not come back to design')
await drag({ x: empty.x, y: empty.y }, { x: empty.x + 80, y: empty.y + 60 })
if ((await strokes()) < 1) throw new Error('coming back from test left a surface that cannot draw')
log('✓ test persisted a reload · design came back live')

await sh(`${sr()}.getElementById("clear").click()`)
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — two modes: one where you build it, one where it is just a page')

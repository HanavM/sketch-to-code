/**
 * Ink follows the element it was drawn on.
 *
 * Page coordinates are what make ink perfect through scroll and zoom, and
 * exactly wrong when the PAGE stands still and an element moves inside it —
 * which is what tweak/canva editing does. A circle drawn around a card must
 * still be around that card after the card is moved, resized, or re-laid out.
 *
 * Layout is changed directly here rather than by driving a tweak drag: a real
 * drag commits an edit to the demo app's source, and the mechanism under test
 * is "the element's box changed", whatever moved it. No model calls.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-follow]', ...a)
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })

let posted = null
await page.route('**/@s2c/interpret', async (route) => {
  posted = route.request().postDataJSON()
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed' }) })
})

const card = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  el.id = 's2c-test-card'
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, src: el.getAttribute('data-s2c') }
})
log('card at', JSON.stringify(card))

// a ring drawn around the card's contents
await page.keyboard.press('Alt+KeyD')
await page.mouse.move(card.x + 30, card.y + card.h / 2)
await page.mouse.down()
for (let i = 1; i <= 18; i++) {
  const t = (i / 18) * Math.PI * 2
  await page.mouse.move(card.x + card.w / 2 + Math.cos(t) * (card.w / 2 - 24), card.y + card.h / 2 + Math.sin(t) * (card.h / 2 - 14), { steps: 2 })
}
await page.mouse.up()
await page.waitForTimeout(150)

const probe = () => page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const p = root.getElementById('ink').querySelector('path')
  const el = document.getElementById('s2c-test-card')
  const pr = p.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  return {
    dx: pr.left - er.left, dy: pr.top - er.top,
    wRatio: pr.width / er.width, hRatio: pr.height / er.height,
    el: { w: er.width, h: er.height },
    anchored: !!root.querySelector('#ink path'),
  }
})

const before = await probe()
log('drawn:', JSON.stringify(before))
if (!(before.wRatio > 0.4 && before.wRatio < 1.1)) throw new Error('the ring was not drawn over the card')

// --- the element MOVES (what a canva drag does) ---
await page.evaluate(() => {
  const el = document.getElementById('s2c-test-card')
  el.style.position = 'relative'
  el.style.left = '140px'
  el.style.top = '60px'
})
await page.waitForTimeout(120)
const moved = await probe()
log('after move:', JSON.stringify(moved))
const drift = (a, c) => Math.abs(a - c)
if (drift(moved.dx, before.dx) > 1 || drift(moved.dy, before.dy) > 1) {
  throw new Error(`ASSERT: ink drifted off its element when it moved — dx ${before.dx}→${moved.dx}, dy ${before.dy}→${moved.dy}`)
}

// --- the element RESIZES ---
await page.evaluate(() => {
  const el = document.getElementById('s2c-test-card')
  el.style.width = `${el.getBoundingClientRect().width * 0.6}px`
  el.style.height = `${el.getBoundingClientRect().height * 1.4}px`
})
await page.waitForTimeout(120)
const resized = await probe()
log('after resize:', JSON.stringify(resized))
if (drift(resized.wRatio, before.wRatio) > 0.05 || drift(resized.hRatio, before.hRatio) > 0.05) {
  throw new Error(`ASSERT: ink did not scale with its element — width ratio ${before.wRatio}→${resized.wRatio}`)
}
// the ink's offset inside the element scales with the element: half as wide
// an element holds ink half as far from its left edge
const sx = resized.el.w / before.el.w
const sy = resized.el.h / before.el.h
if (drift(resized.dx, before.dx * sx) > 1.5 || drift(resized.dy, before.dy * sy) > 1.5) {
  throw new Error(
    `ASSERT: ink is no longer positioned against its element after the resize — ` +
    `dx ${resized.dx} vs expected ${before.dx * sx}, dy ${resized.dy} vs ${before.dy * sy}`,
  )
}

// --- and the wire carries where the ink IS, not where it was drawn ---
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())
await page.waitForTimeout(1200)
if (!posted) throw new Error('interpret was never posted')
const sent = posted.strokes[0].points
const live = await page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const r = root.getElementById('ink').querySelector('path').getBoundingClientRect()
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height }
})
const xs = sent.map((p) => p.x)
const ys = sent.map((p) => p.y)
const sentBox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
log('sent box:', JSON.stringify(sentBox), 'painted box:', JSON.stringify(live))
for (const k of ['x', 'y', 'w', 'h']) {
  if (Math.abs(sentBox[k] - live[k]) > 3) {
    throw new Error(`ASSERT: the server would be told the ink is somewhere it isn't (${k}: sent ${sentBox[k]}, painted ${live[k]})`)
  }
}

log('PASS — ink follows its element through moves, resizes, and onto the wire')
await b.close()

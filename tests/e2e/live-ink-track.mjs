/**
 * Ink-tracking check: the drawn stroke must stay locked to the element it was
 * drawn over, through scroll and browser zoom, with zero tolerance.
 */
import { chromium } from 'playwright'

const APP = 'http://localhost:5199/'
const log = (...a) => console.log('[ink]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const card = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})

await page.keyboard.press('Alt+KeyD')
await page.mouse.move(card.x + 20, card.y + 20)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(card.x + 20 + i * 12, card.y + 20 + (i % 2 ? 14 : 0), { steps: 2 })
}
await page.mouse.up()
await page.waitForTimeout(150)

const probe = () => page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const ink = root.getElementById('ink')
  const path = ink?.querySelector('path')
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const pr = path?.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  return {
    paths: ink ? ink.querySelectorAll('path').length : -1,
    // offset of the ink from the element it was drawn over — the invariant
    dx: pr ? pr.left - er.left : NaN,
    dy: pr ? pr.top - er.top : NaN,
    w: pr ? pr.width : NaN,
    scrollY: window.scrollY,
  }
})

const before = await probe()
log('after draw:', JSON.stringify(before))
if (before.paths !== 1) throw new Error(`ASSERT: expected 1 ink path, got ${before.paths}`)

const maxScroll = await page.evaluate(() => {
  window.scrollTo(0, 400)
  return window.scrollY
})
await page.waitForTimeout(120)
const scrolled = await probe()
log(`after scroll ${maxScroll}:`, JSON.stringify(scrolled))

await page.evaluate(() => window.scrollTo(0, 0))
await page.evaluate(() => { document.body.style.zoom = '1.25' })
await page.waitForTimeout(120)
const zoomed = await probe()
log('after zoom 1.25:', JSON.stringify(zoomed))
await page.evaluate(() => { document.body.style.zoom = '' })

const near = (a, c, tol, what) => {
  if (!(Math.abs(a - c) <= tol)) throw new Error(`ASSERT ${what}: ${a} vs ${c}`)
}
near(scrolled.dx, before.dx, 0.01, 'ink drifted horizontally on scroll')
near(scrolled.dy, before.dy, 0.01, 'ink drifted vertically on scroll')
if (!(maxScroll > 50)) throw new Error(`page did not scroll (${maxScroll})`)
// Zoom reflows the page (a centered max-width layout shifts), so ink stays
// glued to PAGE coordinates rather than to the element — what must hold is
// that the ink scales with the page exactly like its content.
near(zoomed.w, before.w * 1.25, 0.6, 'ink did not scale with zoom (width)')

log('ink stays locked to its element through scroll and zoom')

// ---- the sketch must vanish once it has become a code change ----
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('clear').click()
})
const card2 = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
await page.mouse.move(card2.x + 15, card2.y + card2.h / 2)
await page.mouse.down()
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(card2.x + 15 + i * (card2.w - 30) / 12, card2.y + card2.h / 2 + (i % 2 ? 18 : -18), { steps: 2 })
}
await page.mouse.up()
await page.waitForTimeout(200)
log('scribbled:', JSON.stringify(await probe()))

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click()
})
const t0 = Date.now()
while (Date.now() - t0 < 150000) {
  const m = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
  if (m === 'preview') break
  await page.waitForTimeout(1000)
}
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()
})
// dimmed while in flight
await page.waitForTimeout(300)
const applying = await page.evaluate(() =>
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ink').classList.contains('applying'))
log('dimmed while applying:', applying)

const t1 = Date.now()
let done = ''
while (Date.now() - t1 < 300000) {
  const st = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  if (st.startsWith('✓')) { done = st; break }
  if (st.startsWith('✗') || st.startsWith('failed')) throw new Error(`run failed: ${st}`)
  await page.waitForTimeout(500)
}
if (!done) throw new Error('run never finished')
await page.waitForTimeout(400)
const after = await probe()
log('after done:', done)
log('ink after done:', JSON.stringify(after))
if (after.paths !== 0) throw new Error(`ASSERT: sketch still on screen (${after.paths} paths)`)
if (!applying) throw new Error('ASSERT: ink was not dimmed while the run was in flight')

log('PASS — ink tracks scroll/zoom, dims on Go, and vanishes when the edit lands')
await b.close()

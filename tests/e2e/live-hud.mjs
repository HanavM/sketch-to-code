/**
 * Live e2e: the HUD toolbar itself — draggable, hideable, remembered. Zero
 * model calls, so the whole thing runs in a couple of seconds. Asserts:
 *   1. dragging the grip moves the bar to the cursor, exactly, and it STAYS
 *      there once the pointer leaves (no snap-back to the centered default)
 *   2. pressing a HUD button is a click, never a drag — the bar does not
 *      shift by a pixel and the button's own action still fires
 *   3. Alt+H collapses the bar to the restore dot and Alt+H brings it back,
 *      with the dot parked where the bar was
 *   4. position + hidden state survive a reload (localStorage 's2c:hud')
 *   5. a HIDDEN bar's #run still responds to .click() — it's display:none,
 *      not detached, so scripted clicks (including the other e2e suites')
 *      keep reaching every button
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-hud]', ...a)
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const rects = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = (id) => {
      const el = s.getElementById(id)
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height, display: getComputedStyle(el).display }
    }
    return { hud: box('hud'), grip: box('hudGrip'), pill: box('hudShow') }
  })

// start from a virgin state: no saved placement, default centered bar
await page.evaluate(() => localStorage.removeItem('s2c:hud'))
await page.reload({ waitUntil: 'networkidle' })

// ---- 1. drag the grip -------------------------------------------------
const start = await rects()
if (start.hud.display === 'none') throw new Error('HUD should start visible')
if (start.pill.display !== 'none') throw new Error('restore dot should start hidden')
log('default bar at', Math.round(start.hud.x), Math.round(start.hud.y), `${Math.round(start.hud.w)}px wide`)

const TARGET = { x: 120, y: 140 }
const dx = TARGET.x - start.hud.x
const dy = TARGET.y - start.hud.y
await page.mouse.move(start.grip.x + start.grip.w / 2, start.grip.y + start.grip.h / 2)
await page.mouse.down()
for (let i = 1; i <= 8; i++) {
  await page.mouse.move(
    start.grip.x + start.grip.w / 2 + (dx * i) / 8,
    start.grip.y + start.grip.h / 2 + (dy * i) / 8,
  )
}
await page.mouse.up()

let now = await rects()
if (!near(now.hud.x, TARGET.x) || !near(now.hud.y, TARGET.y)) {
  throw new Error(`drag missed: wanted ${TARGET.x},${TARGET.y} got ${now.hud.x},${now.hud.y}`)
}
const placed = { x: now.hud.x, y: now.hud.y }
// and it stays: move the pointer far away, give the page a beat to misbehave
await page.mouse.move(900, 700)
await page.waitForTimeout(250)
now = await rects()
if (!near(now.hud.x, placed.x) || !near(now.hud.y, placed.y)) {
  throw new Error(`bar drifted after release: ${now.hud.x},${now.hud.y}`)
}
log('✓ dragged to', Math.round(placed.x), Math.round(placed.y), 'and stayed')

// ---- 2. a press on a button is a click, not a drag --------------------
const btn = await page.evaluate(() => {
  const r = document.getElementById('s2c-overlay-host').shadowRoot
    .getElementById('tweakBtn').getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
// press on the button and wander 30px: the bar must not follow the pointer
await page.mouse.move(btn.x, btn.y)
await page.mouse.down()
await page.mouse.move(btn.x + 30, btn.y + 20, { steps: 5 })
await page.mouse.up()
now = await rects()
if (!near(now.hud.x, placed.x) || !near(now.hud.y, placed.y)) {
  throw new Error(`button press dragged the bar to ${now.hud.x},${now.hud.y}`)
}
// and a plain press still activates the button
await page.mouse.click(btn.x, btn.y)
now = await rects()
if (!near(now.hud.x, placed.x) || !near(now.hud.y, placed.y)) {
  throw new Error(`button click moved the bar to ${now.hud.x},${now.hud.y}`)
}
const mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
if (mode !== 'tweak') throw new Error(`tweakBtn click did not fire (mode=${mode})`)
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
log('✓ button press stayed a click; bar unmoved')

// ---- 3. Alt+H hides and restores --------------------------------------
await page.keyboard.press('Alt+KeyH')
now = await rects()
if (now.hud.display !== 'none') throw new Error('Alt+H did not hide the bar')
if (now.pill.display === 'none') throw new Error('restore dot did not appear')
if (!near(now.pill.x, placed.x) || !near(now.pill.y, placed.y)) {
  throw new Error(`dot parked away from the bar: ${now.pill.x},${now.pill.y}`)
}
if (now.pill.w > 40 || now.pill.h > 40) throw new Error(`restore dot is not compact: ${now.pill.w}×${now.pill.h}`)
log('✓ Alt+H → dot at', Math.round(now.pill.x), Math.round(now.pill.y), `${Math.round(now.pill.w)}px`)

await page.keyboard.press('Alt+KeyH')
now = await rects()
if (now.hud.display === 'none') throw new Error('Alt+H did not restore the bar')
if (!near(now.hud.x, placed.x) || !near(now.hud.y, placed.y)) throw new Error('bar lost its spot on restore')
log('✓ Alt+H restored the bar in place')

// clicking the dot restores too
await page.keyboard.press('Alt+KeyH')
await page.mouse.click(placed.x + 13, placed.y + 13)
now = await rects()
if (now.hud.display === 'none') throw new Error('clicking the restore dot did not bring the bar back')
log('✓ clicking the dot restores')

// ---- 4. survives a reload ---------------------------------------------
await page.keyboard.press('Alt+KeyH')
await page.reload({ waitUntil: 'networkidle' })
now = await rects()
if (now.hud.display !== 'none') throw new Error('hidden state did not survive reload')
if (!near(now.pill.x, placed.x) || !near(now.pill.y, placed.y)) {
  throw new Error(`position did not survive reload: ${now.pill.x},${now.pill.y}`)
}
log('✓ hidden + position survived reload')

// ---- 5. a hidden bar's #run still takes .click() -----------------------
// draw one stroke so #run is enabled (a disabled button swallows .click()),
// then stub the interpret call — we only care that the click ARRIVES.
await page.keyboard.press('Alt+KeyH') // show (the reload left it hidden)
await page.keyboard.press('Alt+KeyD')
await page.mouse.move(400, 500)
await page.mouse.down()
for (let i = 1; i <= 8; i++) await page.mouse.move(400 + i * 14, 500 + (i % 2 ? 10 : 0), { steps: 2 })
await page.mouse.up()
await page.keyboard.press('Alt+KeyH') // hide again, strokes and all
const probe = await page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  const orig = window.fetch
  window.fetch = (u, o) => (String(u).includes('/@s2c/interpret')
    ? Promise.reject(new Error('stubbed')) : orig(u, o))
  const run = s.getElementById('run')
  const before = { hidden: getComputedStyle(s.getElementById('hud')).display === 'none', disabled: run.disabled }
  run.click()
  return { ...before, status: s.getElementById('status').textContent }
})
if (!probe.hidden) throw new Error('bar was not hidden for the click test')
if (probe.disabled) throw new Error('fixture drift: #run stayed disabled after drawing a stroke')
if (probe.status !== 'reading your drawing…') {
  throw new Error(`hidden #run swallowed the click (status: ${probe.status})`)
}
log('✓ hidden #run still handled .click()')

// leave no saved state behind for the next suite
await page.evaluate(() => localStorage.removeItem('s2c:hud'))
await b.close()
log('ALL HUD CHECKS PASSED')

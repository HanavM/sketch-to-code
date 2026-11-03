/**
 * Live e2e (n110): in draw mode, a pen stroke that starts on the toolbar is ink.
 * Round 38 e5 (a video call): the row of call controls sits at the bottom of the
 * page, right under the bar; drawing them pressed the bar's buttons — one stroke
 * flipped manual to auto and the half-drawn page built itself. Zero model calls.
 * Asserts:
 *   1. a stroke starting on the auto/manual switch is drawn and the switch never flips
 *   2. a stroke starting on the bar's bare surface is drawn and the bar does not move
 *   3. a plain click on a bar button still works afterwards
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-hud-ink]', ...a)
const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
await page.evaluate(() => localStorage.removeItem('s2c:hud'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null)
const host = `document.getElementById('s2c-overlay-host')`
if ((await page.evaluate(`${host}.dataset.mode`)) !== 'draw') await page.keyboard.press('Alt+KeyD')
if ((await page.evaluate(`${host}.dataset.mode`)) !== 'draw') throw new Error('could not get into draw mode')

const state = () => page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  const r = s.getElementById('hud').getBoundingClientRect()
  return { n: window.__S2C_DEBUG__.strokes().length, auto: s.getElementById('autoBtn').textContent, x: r.left, y: r.top }
})
const centre = (id) => page.evaluate((id) => {
  const r = document.getElementById('s2c-overlay-host').shadowRoot.getElementById(id).getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}, id)
async function drag(from, dx, dy) {
  await page.mouse.move(from.x, from.y); await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(from.x + (dx * i) / 12, from.y + (dy * i) / 12)
  await page.mouse.up(); await page.waitForTimeout(300)
}

// 1. from the auto/manual switch
let before = await state()
await drag(await centre('autoBtn'), 50, -80)
let after = await state()
if (after.auto !== before.auto) throw new Error(`stroke from the switch flipped it: ${before.auto} -> ${after.auto}`)
if (after.n !== before.n + 1) throw new Error(`stroke from the switch not drawn: ${before.n} -> ${after.n}`)
log('✓ stroke from a bar button is drawn; the button never fired')

// 2. from the bar's bare surface (its status text)
before = after
await drag(await centre('status'), -60, -90)
after = await state()
if (after.n !== before.n + 1) throw new Error(`stroke from the bar surface not drawn: ${before.n} -> ${after.n}`)
if (Math.abs(after.x - before.x) > 2 || Math.abs(after.y - before.y) > 2) throw new Error(`stroke moved the bar to ${after.x},${after.y}`)
log('✓ stroke from the bar surface is drawn; the bar stayed put')

// 3. a plain click on a bar button still clicks (the hide button hides the bar)
const h = await centre('hudHide')
await page.mouse.click(h.x, h.y)
await page.waitForTimeout(200)
const shown = await page.evaluate(() => getComputedStyle(document.getElementById('s2c-overlay-host').shadowRoot.getElementById('hud')).display)
if (shown !== 'none') throw new Error('a plain click on the hide button did not hide the bar')
log('✓ a plain click on a bar button still works')
await page.evaluate(() => localStorage.removeItem('s2c:hud'))
await b.close()

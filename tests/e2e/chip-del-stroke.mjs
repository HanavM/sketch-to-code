/**
 * n178: a box drawn from a note's x draws the box and keeps the note; a plain click on the x still deletes,
 * and says which note went. Round 43 e2 (RSVP): two boxes started on a just-typed note's x and came back round
 * to it; both notes were deleted silently and neither box was drawn. Zero tokens: nothing is run.
 *
 *   S2C_APP=http://localhost:5302/ node tests/e2e/chip-del-stroke.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-chip-del]', ...a)
const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 })
for (let i = 0; i < 4; i++) {
  if ((await page.evaluate(() => window.__S2C_DEBUG__.auto().mode)) === 'manual') break
  await page.keyboard.press('Alt+a'); await page.waitForTimeout(150)
}
for (let i = 0; i < 3; i++) {
  if ((await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)) === 'draw') break
  await page.keyboard.press('Alt+d'); await page.waitForTimeout(200)
}
const draw = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1]); await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 8 })
  await page.mouse.up(); await page.waitForTimeout(300)
}
const marks = () => page.evaluate(() => window.__S2C_DEBUG__.wire().strokes.length)
const notes = () => page.evaluate(() => window.__S2C_DEBUG__.notes().map((n) => n.text))
const delAt = (t) => page.evaluate((t) => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const chip = [...root.querySelectorAll('.noteChip')].find((c) => (c.querySelector('.noteText')?.textContent ?? '').startsWith(t))
  const r = chip.querySelector('.noteDel').getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}, t)
const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status')?.textContent ?? '')

// a heading line with its note, as on the RSVP page
await draw([[380, 296], [482, 296]])
await page.mouse.move(430, 296); await page.waitForTimeout(100)
await page.keyboard.press('Alt+n'); await page.waitForTimeout(250)
await page.keyboard.type('Will you come?'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
const x = await delAt('Will you come?')
log('x at', JSON.stringify(x))

// a box whose first corner is the note's x, drawn round back to it
const n0 = await marks()
await draw([[x.x, x.y], [x.x + 150, x.y], [x.x + 150, x.y + 48], [x.x, x.y + 48], [x.x, x.y + 1]])
if ((await marks()) !== n0 + 1) throw new Error(`ASSERT: a box started on a note's x must be drawn (marks ${n0} -> ${await marks()})`)
if (!(await notes()).includes('Will you come?')) throw new Error('ASSERT: a box started on a note\'s x must not delete the note')
log('box drawn from the x; note kept')

// a plain click on the x still deletes, and says which
const x2 = await delAt('Will you come?')
await page.mouse.click(x2.x, x2.y); await page.waitForTimeout(300)
if ((await notes()).includes('Will you come?')) throw new Error('ASSERT: a click on the x must still delete the note')
if ((await marks()) !== n0 + 1) throw new Error('ASSERT: a click on the x must not draw')
const st = await status()
if (!st.includes('Will you come?')) throw new Error(`ASSERT: the delete must say which note went, status "${st}"`)
log('click on x deleted it:', JSON.stringify(st))
await b.close()
log('PASS')

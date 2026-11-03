/**
 * n153: a pen stroke that starts on a note chip is drawn, and only the chip's grip moves the note.
 *
 * Round 41 e4 (file browser): a note typed on the sidebar put its chip where the first folder card's
 * corner was drawn next. The press grabbed the chip: the card was never drawn, the note was dragged
 * onto the wrong mark, and the yellow folder-icon box drawn next (also starting on the moved chip) was
 * lost, so its colour tap painted the whole page. Zero tokens: nothing is run.
 *
 *   S2C_APP=http://localhost:5302/ node tests/e2e/chip-stroke.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-chip-stroke]', ...a)
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
const marks = () => page.evaluate(() => window.__S2C_DEBUG__.wire().strokes.map((s) => s.id))
const notes = () => page.evaluate(() => window.__S2C_DEBUG__.notes().map((n) => ({ text: n.text, at: n.at, anchor: n.anchor })))
const chipBox = (t) => page.evaluate((t) => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const chip = [...root.querySelectorAll('.noteChip')].find((c) => (c.querySelector('.noteText')?.textContent ?? '').startsWith(t))
  const r = chip.getBoundingClientRect(), g = chip.querySelector('.noteGrip').getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height, grip: { x: g.left + g.width / 2, y: g.top + g.height / 2 } }
}, t)

// a sidebar box with a note on it
await draw([[2, 2], [240, 2], [240, 898], [2, 898], [2, 4]])
await page.mouse.move(110, 130); await page.waitForTimeout(100)
await page.keyboard.press('Alt+n'); await page.waitForTimeout(250)
await page.keyboard.type('nav: My files, Shared, Recent, Starred, Trash'); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
const before = await notes()
const chip = await chipBox('nav:')
log('chip at', JSON.stringify(chip))

// a card whose first corner is pressed on the chip's words
const sx = Math.round(chip.x + chip.w * 0.6), sy = Math.round(chip.y + chip.h / 2)
const n0 = (await marks()).length
await draw([[sx, sy], [sx + 220, sy], [sx + 220, sy + 150], [sx, sy + 150], [sx, sy + 2]])
const n1 = (await marks()).length
const after = await notes()
if (n1 !== n0 + 1) throw new Error(`ASSERT: a stroke starting on a chip must be drawn (marks ${n0} -> ${n1})`)
if (JSON.stringify(after[0].at) !== JSON.stringify(before[0].at)) throw new Error(`ASSERT: drawing from a chip must not move the note (${JSON.stringify(before[0].at)} -> ${JSON.stringify(after[0].at)})`)
const wire = await page.evaluate(() => window.__S2C_DEBUG__.wire().strokes.at(-1).points)
const xs = wire.map((p) => p.x), ys = wire.map((p) => p.y)
const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
if (Math.abs(box.x - sx) > 3 || Math.abs(box.y - sy) > 3 || Math.abs(box.w - 220) > 4 || Math.abs(box.h - 150) > 4) {
  throw new Error(`ASSERT: the stroke must start at the press, got box ${JSON.stringify(box)}`)
}
log('stroke from chip drawn, box', JSON.stringify(box), '; note stayed at', JSON.stringify(after[0].at))

// a plain click on the chip still opens it to edit
await page.mouse.click(Math.round(chip.x + chip.w * 0.4), sy); await page.waitForTimeout(250)
const editing = await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('noteBox').classList.contains('on'))
if (!editing) throw new Error('ASSERT: a click on a chip must still open the note to edit')
await page.keyboard.press('Escape'); await page.waitForTimeout(200)
if ((await marks()).length !== n1) throw new Error('ASSERT: a click on a chip must not draw')

// dragging by the grip still moves the note (n9)
const g = (await chipBox('nav:')).grip
await page.mouse.move(g.x, g.y); await page.mouse.down()
await page.mouse.move(sx + 100, sy + 80, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(300)
const moved = await notes()
if ((await marks()).length !== n1) throw new Error('ASSERT: a grip drag must not draw')
if (Math.abs(moved[0].at.x - (sx + 100)) > 3 || Math.abs(moved[0].at.y - (sy + 80)) > 3) throw new Error(`ASSERT: a grip drag must move the note, at ${JSON.stringify(moved[0].at)}`)
log('grip drag moved the note to', JSON.stringify(moved[0].at))
await b.close()
log('PASS')

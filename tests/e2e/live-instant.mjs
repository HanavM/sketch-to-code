/**
 * The instant render: a sketch becomes a real mounted component in well under
 * a second, with no model involved.
 *
 * Measures the time from the last pen-up to the component being ON THE PAGE
 * (an actual painted element, not a DOM node reporting geometry), and proves
 * the gate refuses a mark drawn on an element. The interpret and run routes
 * are stubbed: this path must not need them.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-instant]', ...a)
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.route('**/@s2c/interpret', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"stubbed"}' }))
await page.route('**/@s2c/run', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }))
await page.goto(APP, { waitUntil: 'networkidle' })

const draw = async (pts) => {
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 })
  await page.mouse.up()
}

// ---- a drawing in empty space, to the right of the content column ----
await page.keyboard.press('Alt+KeyD')
const cx = 1180, cy = 300
const ring = []
for (let i = 0; i <= 28; i++) {
  const t = (i / 28) * Math.PI * 2
  ring.push([cx + Math.cos(t) * 46, cy + Math.sin(t) * 34])
}
await draw(ring)
await draw([[cx - 16, cy - 6], [cx - 8, cy - 6]])
await draw([[cx + 8, cy - 6], [cx + 16, cy - 6]])

const before = await page.evaluate(() => document.querySelectorAll('.s2c-etch').length)
const t0 = Date.now()
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())
// wait for the component to be REAL: mounted, sized, and painting
await page.waitForFunction(() => {
  const el = document.querySelector('.s2c-etch')
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 8 && r.height > 8
}, { timeout: 15000 })
const painted = Date.now() - t0

const info = await page.evaluate(() => {
  const el = document.querySelector('.s2c-etch')
  const r = el.getBoundingClientRect()
  const paths = el.querySelectorAll('path').length
  return { paths, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
           status: document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent }
})
log(`on the page in ${painted}ms ·`, JSON.stringify(info))
if (before !== 0) throw new Error('something was already mounted before the run')
if (info.paths < 3) throw new Error(`expected the drawn strokes in the component, got ${info.paths} paths`)
if (painted > 3000) throw new Error(`ASSERT: took ${painted}ms — this path must feel instant`)
// it landed where it was drawn
if (Math.abs(info.x - (cx - 46)) > 60 || Math.abs(info.y - (cy - 34)) > 60) {
  throw new Error(`ASSERT: mounted at ${info.x},${info.y} but drawn at ${cx - 46},${cy - 34}`)
}
log('✓ mounted where it was drawn, carrying the drawn paths')

await page.screenshot({ path: '/tmp/instant.png', clip: { x: cx - 120, y: cy - 110, width: 260, height: 220 } })

// ---- the gate: a mark drawn ON an element must NOT be etched ----
execSync('git checkout -- examples/demo-app/src && rm -f examples/demo-app/src/components/SketchShape.tsx', { cwd: process.cwd() })
await page.goto(APP, { waitUntil: 'networkidle' })
await page.keyboard.press('Alt+KeyD')
const card = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
})
const zig = []
for (let i = 0; i <= 14; i++) zig.push([card.x + 20 + i * ((card.w - 40) / 14), card.y + card.h / 2 + (i % 2 ? 20 : -20)])
await draw(zig)
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())
await page.waitForTimeout(2500)
const etched = await page.evaluate(() => document.querySelectorAll('.s2c-etch').length)
log('scratch-out over a card → components etched:', etched)
if (etched !== 0) throw new Error('ASSERT: a scratch-out was etched — that gesture usually means delete')
log('✓ the gate refused a mark drawn on an element')

log('ALL INSTANT CHECKS PASSED')
await b.close()

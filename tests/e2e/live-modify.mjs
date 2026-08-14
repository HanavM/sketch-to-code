/**
 * Live e2e #2: circle the "Sign out" button and hand-write "red" next to it.
 * Full pipeline: mixed-gesture scene → transcription (real model reads the
 * mouse-written word) → MODIFY op → Claude Code edits Navbar.tsx → HMR →
 * verify. Expects the demo dev server on 5199.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-modify]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })

for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const btn = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button[data-s2c]')].find((e) =>
    e.textContent.includes('Sign out'),
  )
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  return {
    x: r.left, y: r.top, w: r.width, h: r.height,
    src: el.getAttribute('data-s2c'), bg: cs.backgroundColor,
  }
})
log('button:', JSON.stringify(btn))

await page.keyboard.press('Alt+KeyD')

async function draw(points) {
  await page.mouse.move(points[0][0], points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
}

// 1) ellipse around the button
const cx = btn.x + btn.w / 2
const cy = btn.y + btn.h / 2
const rx = btn.w / 2 + 16
const ry = btn.h / 2 + 12
const ellipse = []
for (let i = 0; i <= 44; i++) {
  const a = (i / 44) * 2 * Math.PI - Math.PI / 2
  ellipse.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
}
await draw(ellipse)

// small pause like a human lifting the pen before writing
await page.waitForTimeout(400)

// 2) hand-write "red" below the button (letters as mouse paths, height ~34px)
const s = 34
let lx = cx - 55
const ly = cy + ry + 18
// r: stem + shoulder
await draw([[lx, ly], [lx + 2, ly + s * 0.75]])
await draw([[lx + 1, ly + s * 0.3], [lx + s * 0.22, ly + s * 0.12], [lx + s * 0.42, ly + s * 0.22]])
lx += s * 0.62
// e: mid-bar + loop
await draw([
  [lx, ly + s * 0.4], [lx + s * 0.4, ly + s * 0.38], [lx + s * 0.35, ly + s * 0.15],
  [lx + s * 0.12, ly + s * 0.1], [lx, ly + s * 0.35], [lx + s * 0.08, ly + s * 0.65],
  [lx + s * 0.35, ly + s * 0.72], [lx + s * 0.48, ly + s * 0.6],
])
lx += s * 0.66
// d: bowl + tall stem
await draw([
  [lx + s * 0.35, ly + s * 0.25], [lx + s * 0.1, ly + s * 0.22], [lx, ly + s * 0.45],
  [lx + s * 0.12, ly + s * 0.7], [lx + s * 0.38, ly + s * 0.68],
])
await draw([[lx + s * 0.38, ly - s * 0.15], [lx + s * 0.4, ly + s * 0.75]])
log('gesture + handwriting drawn')

const fileBefore = readFileSync(`${DEMO_ROOT}src/components/Navbar.tsx`, 'utf8')

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click()
})
// interpretation preview gates every structured run (model call: can take ~60s)
{
  const t0 = Date.now()
  let ok = false
  while (Date.now() - t0 < 150000) {
    const m = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if (m === 'preview') { ok = true; break }
    const st = await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
    if (st.includes('failed') || st.startsWith("couldn't")) throw new Error('interpret failed: ' + st)
    await page.waitForTimeout(1000)
  }
  if (!ok) throw new Error('preview never appeared')
}
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()
})
log('run clicked — pipeline running (transcription + codegen)…')

const deadline = Date.now() + 420_000
let lastStatus = ''
let finished = false
while (Date.now() < deadline) {
  const status = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )
  if (status !== lastStatus) { log('status:', status); lastStatus = status }
  if (status.startsWith('✓')) { finished = true; break }
  if (status.startsWith('✗') || status.startsWith('failed')) throw new Error(`pipeline failed: ${status}`)
  await page.waitForTimeout(1000)
}
if (!finished) throw new Error('timed out')

await page.waitForTimeout(1200)

const fileAfter = readFileSync(`${DEMO_ROOT}src/components/Navbar.tsx`, 'utf8')
const btnAfter = await page.evaluate(() => {
  const el = [...document.querySelectorAll('button')].find((e) => e.textContent.includes('Sign out'))
  return el ? getComputedStyle(el).backgroundColor : null
})

log('---- RESULTS ----')
log('source changed:', fileBefore !== fileAfter)
log('button bg before:', btn.bg, '→ after:', btnAfter)

if (fileBefore === fileAfter) throw new Error('ASSERT: Navbar.tsx unchanged')
if (btnAfter === btn.bg) throw new Error('ASSERT: button background did not change')
// "red" transcribed → expect a red-ish bg (rgb with dominant R)
const m = /rgb\((\d+), (\d+), (\d+)/.exec(btnAfter ?? '')
if (m) {
  const [r, g, bl] = [Number(m[1]), Number(m[2]), Number(m[3])]
  log('bg rgb:', r, g, bl, '— red-dominant:', r > g && r > bl)
  if (!(r > g && r > bl)) throw new Error('ASSERT: background not red-dominant — transcription may have failed')
}
log('E2E PASS')
await b.close()

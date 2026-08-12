/**
 * Live e2e #4: DESIGN mode. Sketch a card in the empty area below the stat
 * cards: container rect, a heading line, two body-text squiggles, and a
 * button rect with handwritten "save". Expect the agent to implement a real
 * card component in source, and the summary to report token usage.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-design]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  if (i === 19) throw new Error('pipeline never attached')
  await page.waitForTimeout(500)
}

// switch to design mode + draw mode
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('mode-design').click()
})
await page.keyboard.press('Alt+KeyD')

async function draw(points, pause = 250) {
  await page.mouse.move(points[0][0], points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(pause)
}

// sketch region: empty main area below the stat cards
const X = 200, Y = 420, W = 420, H = 240
// container
await draw([[X, Y], [X + W, Y], [X + W, Y + H], [X, Y + H], [X + 2, Y + 2]])
// heading: one thick-ish long line near the top
await draw([[X + 24, Y + 36], [X + 250, Y + 38]])
// body text: two squiggle lines
for (const dy of [70, 96]) {
  const pts = []
  for (let i = 0; i <= 16; i++) pts.push([X + 24 + i * 20, Y + dy + (i % 2 ? 4 : -4)])
  await draw(pts)
}
// button: small rect bottom-right
const bx = X + W - 130, by = Y + H - 60
await draw([[bx, by], [bx + 100, by], [bx + 100, by + 36], [bx, by + 36], [bx + 2, by + 2]])
// handwritten "save" inside the button area (crude letters)
const s = 22
let lx = bx + 14
const ly = by + 7
const L = {
  s: [[[lx + s * 0.4, ly + s * 0.2], [lx + s * 0.1, ly + s * 0.25], [lx + s * 0.35, ly + s * 0.45], [lx + s * 0.05, ly + s * 0.68]]],
  a: [
    [[lx + s * 0.38, ly + s * 0.25], [lx + s * 0.1, ly + s * 0.2], [lx, ly + s * 0.45], [lx + s * 0.15, ly + s * 0.68], [lx + s * 0.38, ly + s * 0.6]],
    [[lx + s * 0.4, ly + s * 0.2], [lx + s * 0.42, ly + s * 0.7]],
  ],
  v: [[[lx, ly + s * 0.2], [lx + s * 0.2, ly + s * 0.7], [lx + s * 0.4, ly + s * 0.2]]],
  e: [[[lx, ly + s * 0.45], [lx + s * 0.4, ly + s * 0.42], [lx + s * 0.32, ly + s * 0.18], [lx + s * 0.08, ly + s * 0.15], [lx, ly + s * 0.42], [lx + s * 0.1, ly + s * 0.68], [lx + s * 0.4, ly + s * 0.64]]],
}
for (const ch of ['s', 'a', 'v', 'e']) {
  // recompute letter with current lx
  const glyphs = {
    s: L.s, a: L.a, v: L.v, e: L.e,
  }[ch].map((stroke) => stroke.map(([px, py]) => [px + (lx - (bx + 14)) * 0 + 0, py]))
  // (letter fns above already reference lx at definition; rebuild per letter)
  void glyphs
  const defs = {
    s: [[[lx + s * 0.4, ly + s * 0.2], [lx + s * 0.1, ly + s * 0.25], [lx + s * 0.35, ly + s * 0.45], [lx + s * 0.05, ly + s * 0.68]]],
    a: [
      [[lx + s * 0.38, ly + s * 0.25], [lx + s * 0.1, ly + s * 0.2], [lx, ly + s * 0.45], [lx + s * 0.15, ly + s * 0.68], [lx + s * 0.38, ly + s * 0.6]],
      [[lx + s * 0.4, ly + s * 0.2], [lx + s * 0.42, ly + s * 0.7]],
    ],
    v: [[[lx, ly + s * 0.2], [lx + s * 0.2, ly + s * 0.7], [lx + s * 0.4, ly + s * 0.2]]],
    e: [[[lx, ly + s * 0.45], [lx + s * 0.4, ly + s * 0.42], [lx + s * 0.32, ly + s * 0.18], [lx + s * 0.08, ly + s * 0.15], [lx, ly + s * 0.42], [lx + s * 0.1, ly + s * 0.68], [lx + s * 0.4, ly + s * 0.64]]],
  }
  for (const stroke of defs[ch]) await draw(stroke, 120)
  lx += s * 0.6
}
log('design sketch drawn')

const before = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })
const nodesBefore = await page.evaluate(() => document.querySelectorAll('*').length)

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click()
})
log('run clicked — design pipeline running…')

const deadline = Date.now() + 480_000
let lastStatus = ''
let finalStatus = ''
while (Date.now() < deadline) {
  const status = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )
  if (status !== lastStatus) { log('status:', status); lastStatus = status }
  if (status.startsWith('✓')) { finalStatus = status; break }
  if (status.startsWith('✗') || status.startsWith('failed')) throw new Error(`pipeline failed: ${status}`)
  await page.waitForTimeout(1000)
}
if (!finalStatus) throw new Error('timed out')
await page.waitForTimeout(1500)

const after = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })
const nodesAfter = await page.evaluate(() => document.querySelectorAll('*').length)

log('---- RESULTS ----')
log('src dirty before:', JSON.stringify(before.trim()))
log('src dirty after:', JSON.stringify(after.trim()))
log('DOM elements:', nodesBefore, '→', nodesAfter)
log('final:', finalStatus)

if (after.trim() === before.trim()) throw new Error('ASSERT: no source files changed')
if (nodesAfter <= nodesBefore) throw new Error('ASSERT: page did not grow')
if (!/tokens/.test(finalStatus)) throw new Error('ASSERT: summary does not report tokens')
log('E2E PASS')
await b.close()

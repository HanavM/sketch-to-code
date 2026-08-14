/**
 * Live e2e #6: THE RIBBON — regression of the incident that triggered the
 * architecture revision. Draw a long wavy ribbon across the stat cards in
 * design mode. Expect: legend carries an svgPath + layerHint
 * 'background-overlay'; the implementation is a decorative background layer
 * placed/sized where it was drawn (geometric placement verified server-side).
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-ribbon-multi]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  if (i === 19) throw new Error('pipeline never attached')
  await page.waitForTimeout(500)
}

// stat-card band region (the ribbon passes across all three cards)
const band = await page.evaluate(() => {
  const section = document.querySelector('[data-s2c*="StatCards"]')
  const r = section.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
log('card band:', JSON.stringify(band))

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('mode-design').click()
})
await page.keyboard.press('Alt+KeyD')

// THE USER'S ACTUAL FAILURE MODE: the ribbon drawn in FOUR separate strokes
// (v1 classified the pieces as arrows and lines and fragmented the intent)
const wavePoint = (i, N) => [
  band.x + 10 + (i / N) * (band.w - 20),
  band.y + band.h / 2 + Math.sin(i / 5.5) * (band.h * 0.42),
]
const N = 60
const segments = [[0, 16], [15, 31], [30, 46], [45, 60]]
for (const [a, b2] of segments) {
  const pts = []
  for (let i = a; i <= b2; i++) pts.push(wavePoint(i, N))
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(350)
}
log('ribbon drawn in 4 strokes')

const before = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })

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
const previewStatus = await page.evaluate(
  () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
)
log('preview:', previewStatus)
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()
})
log('confirmed — pipeline running…')

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

// ---- assertions ----
const after = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })

// the newest run bundle must show svgPath + layerHint in the prompt
const runsDir = `${DEMO_ROOT}.sketch2code/runs/`
const latest = readdirSync(runsDir).sort().reverse()[0]
const prompt = readFileSync(`${runsDir}${latest}/prompt.txt`, 'utf8')
const hasPath = prompt.includes('svgPath')
const hasHint = prompt.includes('background-overlay')
log('prompt has svgPath:', hasPath, '| layerHint background-overlay:', hasHint)

// the page must have a new SVG-ish decorative element spanning the band
const deco = await page.evaluate((bandRect) => {
  const svgs = [...document.querySelectorAll('svg, [class*="absolute"]')]
  for (const el of svgs) {
    const r = el.getBoundingClientRect()
    const overlapX = Math.min(r.right, bandRect.x + bandRect.w) - Math.max(r.left, bandRect.x)
    if (overlapX > bandRect.w * 0.5 && r.height > 20) {
      return { tag: el.tagName.toLowerCase(), w: Math.round(r.width), h: Math.round(r.height), cls: (el.getAttribute('class') || '').slice(0, 80) }
    }
  }
  return null
}, band)
log('decorative element spanning band:', JSON.stringify(deco))

const cardsIntact = await page.evaluate(() =>
  ['Revenue', 'Active users', 'Conversion'].every((t) => document.body.textContent.includes(t)),
)
log('stat cards intact:', cardsIntact)
log('final:', finalStatus)

if (after.trim() === before.trim()) throw new Error('ASSERT: no source change')
if (!hasPath) throw new Error('ASSERT: svgPath missing from legend')
if (!hasHint) throw new Error('ASSERT: background-overlay layerHint missing')
if (!deco) throw new Error('ASSERT: no wide decorative element found in the band')
if (!cardsIntact) throw new Error('ASSERT: existing cards were damaged')
if (!/tokens/.test(finalStatus)) throw new Error('ASSERT: no token report')
log('E2E PASS — the ribbon is a background element, cards intact')
await b.close()

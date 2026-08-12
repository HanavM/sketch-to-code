/**
 * Live e2e #5: SCREENSHOT benchmark mode. Scribble over the "Revenue" stat
 * card, but hand the agent ONLY a screen capture of the tab — no recognized
 * shapes, no DOM snapshot, no srcLocs. The agent must interpret the ink from
 * pixels and locate the source itself. Compares token cost vs structured runs.
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-screenshot]', ...a)

const b = await chromium.launch({
  headless: false, // getDisplayMedia needs a real compositor for tab frames
  args: [
    '--use-fake-ui-for-media-stream',
    '--auto-select-tab-capture-source-by-title=Demo App',
  ],
})
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  if (i === 19) throw new Error('pipeline never attached')
  await page.waitForTimeout(500)
}

// screenshot mode + draw mode
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('mode-screenshot').click()
})
await page.keyboard.press('Alt+KeyD')

// find the Revenue card (smallest stamped element ≥60px tall containing the label)
const card = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-s2c]')].filter((e) =>
    e.textContent.includes('Revenue'),
  )
  const tall = els.filter((e) => e.getBoundingClientRect().height >= 60)
  const el = (tall.length ? tall : els).reduce((a, c) => {
    const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect()
    return rc.width * rc.height < ra.width * ra.height ? c : a
  })
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
log('target card:', JSON.stringify(card))

// zigzag scribble across it
const pts = []
const zigs = 7
for (let i = 0; i <= zigs; i++) {
  pts.push([card.x + 8 + (i / zigs) * (card.w - 16), i % 2 === 0 ? card.y + 8 : card.y + card.h - 8])
}
await page.mouse.move(pts[0][0], pts[0][1])
await page.mouse.down()
for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 6 })
await page.mouse.up()
log('scribble drawn')

const before = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click()
})
log('run clicked — screen capture + pixels-only pipeline…')

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
await page.waitForTimeout(1200)

const after = execSync('git status --porcelain -- src/', { cwd: DEMO_ROOT, encoding: 'utf8' })
const domHasRevenue = await page.evaluate(() => document.body.textContent.includes('Revenue'))

log('---- BENCHMARK RESULTS ----')
log('pipeline completed:', true)
log('source changed:', after.trim() !== before.trim())
log('final:', finalStatus)

// mechanical soundness is asserted; interpretation quality is REPORTED —
// this script is a benchmark of pixels-only input, not a regression test
if (!/tokens/.test(finalStatus)) throw new Error('ASSERT: summary does not report tokens')
if (after.trim() === before.trim()) throw new Error('ASSERT: agent made no edit at all')

if (domHasRevenue) {
  log('INTERPRETATION: ✗ MISS — the same scribble that gesture mode correctly')
  log('  reads as DELETE was interpreted differently from pixels alone.')
  log('  (Check the run dir reply.txt for what the agent thought it saw.)')
} else {
  log('INTERPRETATION: ✓ HIT — scribble read as delete from pixels alone.')
}
log('BENCHMARK COMPLETE (compare tokens + interpretation vs structured modes)')
await b.close()

/**
 * Live end-to-end: boots nothing itself — expects the demo dev server on 5199.
 * Drives a real browser: scribbles over the "Active users" stat card, clicks
 * Run, waits for the pipeline (real Claude Code edit + HMR + verify), then
 * asserts the card is gone from BOTH the DOM and the source file.
 *
 *   node tests/e2e/live-run.mjs [--gesture=scribble|circle-modify]
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const gesture = process.argv.find((a) => a.startsWith('--gesture='))?.split('=')[1] ?? 'scribble'

const log = (...a) => console.log('[e2e]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
page.on('console', (m) => m.type() === 'error' && log('console error:', m.text()))

await page.goto(APP, { waitUntil: 'networkidle' })

// wait for pipeline attachment
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  if (i === 19) throw new Error('pipeline never attached')
  await page.waitForTimeout(500)
}
log('pipeline attached')

// locate the target card in page coords
const card = await page.evaluate(() => {
  // smallest stamped element containing the label = the card itself, not the section
  const els = [...document.querySelectorAll('[data-s2c]')].filter((e) =>
    e.textContent.includes('Active users') && e.getAttribute('data-s2c').includes('StatCards'),
  )
  // …but not a bare text line: require card-ish height
  const tall = els.filter((e) => e.getBoundingClientRect().height >= 60)
  const el = (tall.length ? tall : els).reduce((a, b) => {
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    return rb.width * rb.height < ra.width * ra.height ? b : a
  })
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height, src: el.getAttribute('data-s2c') }
})
log('target card:', JSON.stringify(card))

// enter draw mode
await page.keyboard.press('Alt+KeyD')

async function drawPath(points) {
  await page.mouse.move(points[0][0], points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 6 })
  await page.mouse.up()
}

if (gesture === 'scribble') {
  // zigzag across the card
  const { x, y, w, h } = card
  const pts = []
  const zigs = 7
  for (let i = 0; i <= zigs; i++) {
    pts.push([x + 8 + (i / zigs) * (w - 16), i % 2 === 0 ? y + 8 : y + h - 8])
  }
  await drawPath(pts)
} else if (gesture === 'circle-modify') {
  // ellipse around the card + handwriting is too hard to mouse — circle only,
  // instruction comes from a canned text injection instead (covered elsewhere)
  const cx = card.x + card.w / 2
  const cy = card.y + card.h / 2
  const rx = card.w / 2 + 18
  const ry = card.h / 2 + 16
  const pts = []
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * 2 * Math.PI - Math.PI / 2
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  await drawPath(pts)
}
log('gesture drawn')

// snapshot source before
const fileBefore = readFileSync(`${DEMO_ROOT}src/components/StatCards.tsx`, 'utf8')

// click Run inside the shadow root
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
log('run clicked — waiting for pipeline (this invokes real Claude Code)…')

// wait for done/err status in the HUD (long timeout: real model call)
const deadline = Date.now() + 360_000
let lastStatus = ''
let finished = false
while (Date.now() < deadline) {
  const status = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )
  if (status !== lastStatus) {
    log('status:', status)
    lastStatus = status
  }
  if (status.startsWith('✓')) { finished = true; break }
  if (status.startsWith('✗') || status.startsWith('failed')) {
    throw new Error(`pipeline failed: ${status}`)
  }
  await page.waitForTimeout(1000)
}
if (!finished) throw new Error('timed out waiting for pipeline')

// assert against a fresh load — the source of truth — rather than racing
// the HMR client's apply window
await page.waitForTimeout(1000)
await page.reload({ waitUntil: 'networkidle' })

// ---- assertions ----
const fileAfter = readFileSync(`${DEMO_ROOT}src/components/StatCards.tsx`, 'utf8')
const domHasCard = await page.evaluate(() => [...document.querySelectorAll('[data-s2c*=StatCards]')].some((e) => e.textContent.includes('Active users')))

const diffFiles = execFileSync(
  'git', ['diff', '--name-only', '--', '.'], { cwd: DEMO_ROOT, encoding: 'utf8' },
).trim().split('\n').filter(Boolean)

log('---- RESULTS ----')
log('source changed:', fileBefore !== fileAfter)
log('DOM still shows "Active users":', domHasCard)
log('files with diffs:', JSON.stringify(diffFiles))

if (gesture === 'scribble') {
  if (fileBefore === fileAfter) throw new Error('ASSERT: source file unchanged')
  if (domHasCard) throw new Error('ASSERT: card still in DOM')
  if (fileAfter.includes('Active users')) throw new Error('ASSERT: card still in source')
  const offTarget = diffFiles.filter((f) => !f.includes('StatCards'))
  if (offTarget.length > 0) throw new Error(`ASSERT: off-target edits: ${offTarget}`)
}

log('E2E PASS')
await b.close()

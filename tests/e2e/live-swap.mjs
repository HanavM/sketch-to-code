/**
 * Live e2e #7: SWAP via v2 — the exact gesture that previously "deleted it
 * all". Draw two arrows between the Revenue and Conversion cards; expect the
 * preview to read "swap", and after Go the two cards' order to be exchanged
 * in source and DOM, with nothing deleted.
 */
import { chromium } from 'playwright'

const APP = 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-swap]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline && ping.engine === 'model') break
  if (i === 19) throw new Error(`pipeline/engine not ready`)
  await page.waitForTimeout(500)
}

const cards = await page.evaluate(() => {
  const find = (label) => {
    const els = [...document.querySelectorAll('[data-s2c*="StatCards"]')].filter(
      (e) => e.textContent.includes(label) && e.getBoundingClientRect().height >= 60,
    )
    const el = els.reduce((a, c) => {
      const ra = a.getBoundingClientRect(), rc = c.getBoundingClientRect()
      return rc.width * rc.height < ra.width * ra.height ? c : a
    })
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }
  return { rev: find('Revenue'), conv: find('Conversion') }
})
log('cards:', JSON.stringify(cards))

await page.keyboard.press('Alt+KeyD')
async function draw(points, pause = 300) {
  await page.mouse.move(points[0][0], points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
  await page.waitForTimeout(pause)
}

// arrow 1: Revenue → Conversion (upper lane)
const y1 = cards.rev.y + cards.rev.h * 0.33
const x1 = cards.rev.x + cards.rev.w * 0.7
const x2 = cards.conv.x + cards.conv.w * 0.3
await draw([[x1, y1], [x2, y1], [x2 - 18, y1 - 12], [x2, y1], [x2 - 18, y1 + 12]])
// arrow 2: Conversion → Revenue (lower lane)
const y2 = cards.rev.y + cards.rev.h * 0.66
await draw([[x2, y2], [x1, y2], [x1 + 18, y2 - 12], [x1, y2], [x1 + 18, y2 + 12]])
log('two arrows drawn')

const orderBefore = await page.evaluate(() =>
  [...document.querySelectorAll('[data-s2c*="StatCards"] p')].map((e) => e.textContent).join('|'),
)

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
const reading = await page.evaluate(
  () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
)
log('preview reading:', reading)
if (!/swap/i.test(reading) && !/exchange/i.test(reading)) {
  throw new Error(`ASSERT: preview does not read as swap: "${reading}"`)
}
if (/delete|remove/i.test(reading)) throw new Error(`ASSERT: destructive reading: "${reading}"`)
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()
})
log('confirmed — codegen running…')

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

const state = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('[data-s2c*="StatCards"] p')].map((e) => e.textContent),
  hasRevenue: document.body.textContent.includes('Revenue'),
  hasUsers: document.body.textContent.includes('Active users'),
  hasConversion: document.body.textContent.includes('Conversion'),
}))
const orderAfter = state.labels.join('|')

log('---- RESULTS ----')
log('order before:', orderBefore.slice(0, 90))
log('order after: ', orderAfter.slice(0, 90))
log('all cards present:', state.hasRevenue && state.hasUsers && state.hasConversion)
log('final:', finalStatus)

if (!state.hasRevenue || !state.hasUsers || !state.hasConversion) {
  throw new Error('ASSERT: a card was deleted — the original failure mode!')
}
const revIdx = orderAfter.indexOf('Revenue')
const convIdx = orderAfter.indexOf('Conversion')
if (!(convIdx >= 0 && revIdx > convIdx)) {
  throw new Error('ASSERT: cards were not swapped (Revenue should now come after Conversion)')
}
log('E2E PASS — swap executed, nothing deleted')
await b.close()

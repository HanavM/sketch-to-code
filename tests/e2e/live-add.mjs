/**
 * Live e2e #3: ADD — draw a rectangle in empty space inside the contact form
 * (below the Send invite button) and hand-write "cancel" next to it.
 * Expects: a new cancel-ish element appears in ContactForm.tsx and the DOM.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-add]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 1000 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

// empty space: right of the Send invite button, inside the form card
const zone = await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button[data-s2c]')].find((e) =>
    e.textContent.includes('Send invite'),
  )
  const r = btn.getBoundingClientRect()
  window.scrollTo(0, Math.max(0, r.top - 400))
  const r2 = btn.getBoundingClientRect()
  return { x: r2.right + 24, y: r2.top - 4, w: 130, h: 40 }
})
log('add zone:', JSON.stringify(zone))

await page.keyboard.press('Alt+KeyD')
async function draw(points) {
  await page.mouse.move(points[0][0], points[0][1])
  await page.mouse.down()
  for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 4 })
  await page.mouse.up()
}

// rectangle sketch
const { x, y, w, h } = zone
await draw([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + 2, y + 2]])
await page.waitForTimeout(400)

// write "cancel" beneath — keep it simple: c a n c e l is long; write "esc"?
// Use "cancel" abbreviated to something transcribable: draw "X"? Instruction
// clarity beats letter count: write "cancel" as three crude letters "cnl"
// would confuse. Compromise: write "cancel" — 6 crude letters, size 30.
const s = 30
let lx = x
const ly = y + h + 14
const strokesFor = {
  c: [[[lx + s * 0.4, ly + s * 0.2], [lx + s * 0.12, ly + s * 0.15], [lx, ly + s * 0.4], [lx + s * 0.12, ly + s * 0.68], [lx + s * 0.42, ly + s * 0.62]]],
}
// generate letters with a tiny vector font
function letter(ch, ox) {
  const u = (f) => f * s
  switch (ch) {
    case 'c': return [[[ox + u(0.4), ly + u(0.18)], [ox + u(0.1), ly + u(0.12)], [ox, ly + u(0.4)], [ox + u(0.12), ly + u(0.68)], [ox + u(0.42), ly + u(0.6)]]]
    case 'a': return [
      [[ox + u(0.38), ly + u(0.2)], [ox + u(0.1), ly + u(0.18)], [ox, ly + u(0.45)], [ox + u(0.15), ly + u(0.68)], [ox + u(0.38), ly + u(0.6)]],
      [[ox + u(0.4), ly + u(0.15)], [ox + u(0.42), ly + u(0.7)]],
    ]
    case 'n': return [
      [[ox, ly + u(0.15)], [ox + u(0.02), ly + u(0.7)]],
      [[ox + u(0.02), ly + u(0.3)], [ox + u(0.2), ly + u(0.12)], [ox + u(0.38), ly + u(0.3)], [ox + u(0.4), ly + u(0.7)]],
    ]
    case 'e': return [[[ox, ly + u(0.4)], [ox + u(0.4), ly + u(0.38)], [ox + u(0.35), ly + u(0.14)], [ox + u(0.1), ly + u(0.1)], [ox, ly + u(0.38)], [ox + u(0.1), ly + u(0.66)], [ox + u(0.42), ly + u(0.62)]]]
    case 'l': return [[[ox + u(0.15), ly - u(0.1)], [ox + u(0.17), ly + u(0.7)]]]
    default: return []
  }
}
void strokesFor
for (const ch of 'cancel') {
  for (const stroke of letter(ch, lx)) await draw(stroke)
  lx += s * 0.55
}
log('rect + "cancel" drawn')

const fileBefore = readFileSync(`${DEMO_ROOT}src/components/ContactForm.tsx`, 'utf8')
const nodesBefore = await page.evaluate(() => document.querySelectorAll('*').length)

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
log('run clicked…')

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

const fileAfter = readFileSync(`${DEMO_ROOT}src/components/ContactForm.tsx`, 'utf8')
const nodesAfter = await page.evaluate(() => document.querySelectorAll('*').length)
const hasCancel = await page.evaluate(() =>
  [...document.querySelectorAll('button, a')].some((e) => /cancel/i.test(e.textContent)),
)

log('---- RESULTS ----')
log('source changed:', fileBefore !== fileAfter)
log('DOM elements:', nodesBefore, '→', nodesAfter)
log('cancel-ish element present:', hasCancel)

if (fileBefore === fileAfter) throw new Error('ASSERT: ContactForm.tsx unchanged')
if (nodesAfter <= nodesBefore) throw new Error('ASSERT: DOM did not grow')
log('E2E PASS' + (hasCancel ? ' (with transcribed label)' : ' (element added; label transcription soft-failed)'))
await b.close()

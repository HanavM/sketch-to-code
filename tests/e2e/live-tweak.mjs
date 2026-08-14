/**
 * Live e2e #8: TWEAK mode — the gap handle. Zero model calls, so this runs in
 * seconds. Select the stat-cards grid, drag the first gap strip +8px, expect
 * gap-4 → gap-6 in StatCards.tsx, verified in source AND computed style.
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const APP = 'http://localhost:5199/'
const DEMO_ROOT = new URL('../../examples/demo-app/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-tweak]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const before = readFileSync(`${DEMO_ROOT}src/components/StatCards.tsx`, 'utf8')
if (!before.includes('gap-4')) throw new Error('fixture drift: StatCards has no gap-4')

// enter tweak mode
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click()
})

// click the middle of the stat-cards section to select the grid container
const section = await page.evaluate(() => {
  const el = document.querySelector('section[data-s2c*="StatCards"]')
  const r = el.getBoundingClientRect()
  const kids = [...el.children].map((c) => c.getBoundingClientRect())
  return {
    rect: { x: r.left, y: r.top, w: r.width, h: r.height },
    gapX: (kids[0].right + kids[1].left) / 2, // middle of first gap strip
    midY: r.top + r.height / 2,
  }
})
await page.mouse.click(section.gapX, section.midY)
await page.waitForTimeout(300)
let status = await page.evaluate(
  () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
)
log('selected:', status)
if (!/grid|flex/.test(status)) throw new Error(`selection failed: ${status}`)

// drag the gap strip +8px (16px → 24px = gap-6)
await page.mouse.move(section.gapX, section.midY)
await page.mouse.down()
await page.mouse.move(section.gapX + 8, section.midY, { steps: 6 })
status = await page.evaluate(
  () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
)
log('during drag:', status)
await page.mouse.up()
log('released — committing')

// commit is a local file edit: fast
const deadline = Date.now() + 20000
let final = ''
while (Date.now() < deadline) {
  const st = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )
  if (st.startsWith('✓') || st.startsWith('✗')) { final = st; break }
  await page.waitForTimeout(200)
}
log('result:', final)
if (!final.startsWith('✓')) throw new Error(`commit failed: ${final}`)
if (!/0 tokens/.test(final)) throw new Error('receipt missing zero-token proof')

await page.waitForTimeout(1200)
const after = readFileSync(`${DEMO_ROOT}src/components/StatCards.tsx`, 'utf8')
const computedGap = await page.evaluate(() => {
  const el = document.querySelector('section[data-s2c*="StatCards"]')
  return getComputedStyle(el).gap
})

log('---- RESULTS ----')
log('source gap-6:', after.includes('gap-6'), '| gap-4 gone:', !after.includes('gap-4'))
log('computed gap after HMR:', computedGap)
log('rest of file unchanged:', after.replace('gap-6', 'gap-4') === before)

if (!after.includes('gap-6')) throw new Error('ASSERT: source not updated to gap-6')
if (after.replace('gap-6', 'gap-4') !== before) throw new Error('ASSERT: edit touched more than the one class')
if (computedGap !== '24px') throw new Error(`ASSERT: computed gap is ${computedGap}, expected 24px`)
log('E2E PASS — one class changed, zero tokens, verified live')
await b.close()

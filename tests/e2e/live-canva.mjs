/**
 * Live e2e #9: CANVA mode — every element visibly interactable. Zero model
 * calls, so the whole flow runs in seconds. Three phases against the demo
 * stat cards:
 *   1. select a card, drag its SE corner handle → w-/h- classes in source
 *   2. free-drag the card somewhere unaligned → translate-x/-y escape hatch
 *   3. drag the card onto a sibling's slot → structural reorder (data array)
 * Demo src is restored via `git checkout -- examples/demo-app/src/` between
 * phases and at the end.
 *
 * Boot first (port 5211 — 5199 belongs to the interactive session):
 *   cd examples/demo-app && npx vite --port 5211
 * Run FROM THE REPO ROOT: node tests/e2e/live-canva.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = 'http://localhost:5211/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const CARDS = `${REPO_ROOT}examples/demo-app/src/components/StatCards.tsx`
const log = (...a) => console.log('[e2e-canva]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

const status = () =>
  page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )

async function waitReceipt(label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const st = await status()
    if (st.startsWith('✓') || st.startsWith('✗')) {
      log(`${label}:`, st)
      if (!st.startsWith('✓')) throw new Error(`${label} failed: ${st}`)
      if (!/0 tokens/.test(st)) throw new Error(`${label}: receipt missing zero-token proof`)
      return st
    }
    await page.waitForTimeout(200)
  }
  throw new Error(`${label}: no receipt (status: ${await status()})`)
}

async function boot() {
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => {
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click()
  })
}

/** Rects of the stat cards (viewport coords). */
const cardRects = () =>
  page.evaluate(() => {
    const els = [...document.querySelectorAll('section[data-s2c*="StatCards"] > div')]
    return els.map((el) => {
      const r = el.getBoundingClientRect()
      return {
        left: r.left, top: r.top, right: r.right, bottom: r.bottom,
        w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      }
    })
  })

/** Click inside the card's padding (misses the inner <p> stamps) to select it. */
async function selectCard(c) {
  await page.mouse.click(c.left + 12, c.top + 12)
  await page.waitForTimeout(150)
  const st = await status()
  log('selected:', st)
  if (!/^div · \d+×\d+/.test(st)) throw new Error(`card selection failed: ${st}`)
}

const before = readFileSync(CARDS, 'utf8')
if (/\bw-|\bh-|translate/.test(before)) throw new Error('fixture drift: StatCards already has size/translate classes')

// ---------- phase 1: resize via the SE corner handle ----------
await boot()
let cards = await cardRects()
let c = cards[0]
await selectCard(c)
await page.mouse.move(c.right, c.bottom)
await page.mouse.down()
await page.mouse.move(c.right + 37, c.bottom + 23, { steps: 6 })
log('during resize:', await status())
await page.mouse.up()
await waitReceipt('resize')
await page.waitForTimeout(300)
{
  const after = readFileSync(CARDS, 'utf8')
  const wOk = /className="[^"]*\bw-(\[\d+px\]|\d)/.test(after)
  const hOk = /className="[^"]*\bh-(\[\d+px\]|\d)/.test(after)
  log('phase 1 — w- landed:', wOk, '| h- landed:', hOk)
  if (!wOk || !hOk) throw new Error('ASSERT: resize did not land w-/h- classes in StatCards.tsx')
}
restore()
await page.waitForTimeout(600)

// ---------- phase 2: free-drag somewhere unaligned → translate escape hatch ----------
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
await page.mouse.move(c.cx, c.cy)
await page.mouse.down()
await page.mouse.move(c.cx + 150, c.cy + 200, { steps: 8 })
log('during move:', await status())
await page.mouse.up()
const moveReceipt = await waitReceipt('free move')
if (!/cosmetic transform/.test(moveReceipt)) throw new Error('ASSERT: translate receipt not flagged cosmetic')
await page.waitForTimeout(300)
{
  const after = readFileSync(CARDS, 'utf8')
  const xOk = /className="[^"]*translate-x-/.test(after)
  const yOk = /className="[^"]*translate-y-/.test(after)
  log('phase 2 — translate-x landed:', xOk, '| translate-y landed:', yOk)
  if (!xOk || !yOk) throw new Error('ASSERT: free move did not land translate classes in StatCards.tsx')
}
restore()
await page.waitForTimeout(600)

// ---------- phase 3: drag onto a sibling slot → structural reorder ----------
await boot()
cards = await cardRects()
c = cards[0]
const dest = cards[2]
await selectCard(c)
await page.mouse.move(c.cx, c.cy)
await page.mouse.down()
await page.mouse.move(dest.cx, dest.cy, { steps: 8 })
log('during reorder drag:', await status())
await page.mouse.up()
const reorderReceipt = await waitReceipt('reorder')
if (!/moved/.test(reorderReceipt)) throw new Error('ASSERT: reorder receipt missing move description')
await page.waitForTimeout(300)
{
  const after = readFileSync(CARDS, 'utf8')
  const revenue = after.indexOf("'Revenue'")
  const conversion = after.indexOf("'Conversion'")
  log('phase 3 — Revenue idx:', revenue, '| Conversion idx:', conversion)
  if (revenue < 0 || conversion < 0 || revenue < conversion) {
    throw new Error('ASSERT: reorder did not move Revenue after Conversion in the stats array')
  }
}
restore()

log('E2E PASS — resize (w-/h-), free move (translate escape hatch), reorder — all zero tokens')
await b.close()

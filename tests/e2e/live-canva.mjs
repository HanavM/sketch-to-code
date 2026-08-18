/**
 * Live e2e #9: CANVA mode — every element visibly interactable. Zero model
 * calls, so the whole flow runs in seconds. Five phases against the demo
 * stat cards (a .map() → 3 linked instances of one template):
 *   1. select a card (all linked), drag its SE corner → w-/h- on the template
 *   2. ghost free-drag PAST the clipping BrowserChrome boundary — the
 *      document-level ghost previews unclipped while the original dims —
 *      then commits the translate escape hatch
 *   3. drag a card onto a sibling's slot → structural reorder (data array)
 *   4. double-click → "this one only" scope → per-ITEM edit (className field
 *      on that array item + `${s.className ?? ''}` spread in the template);
 *      the other instances' geometry must not move
 *   5. magnetic snap: drop with the card's left edge ~4px from a sibling's
 *      left edge → pink-guide snap; the committed translate aligns exactly
 *   6. anchored resize, left edge: pulling the W handle moves the LEFT edge
 *      and keeps the right edge pixel-fixed (w-* + ml compensation)
 *   7. anchored resize, top edge: same for N handle (h-* + mt compensation)
 *   8. shift+click multi-select: two different components drag as one set,
 *      one commit per element, Ctrl+Z reverts them one at a time
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
  return st
}

/** Any painted pixel along a card's top edge on the overlay canvas? */
const edgePainted = (c) =>
  page.evaluate(({ x, y }) => {
    const cv = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('canvas')
    const data = cv.getContext('2d').getImageData(Math.round(x), Math.round(y) - 1, 28, 3).data
    for (let i = 3; i < data.length; i += 4) if (data[i] > 40) return true
    return false
  }, { x: c.cx - 14, y: c.top })

const before = readFileSync(CARDS, 'utf8')
if (/\bw-|\bh-|translate/.test(before)) throw new Error('fixture drift: StatCards already has size/translate classes')

// ---------- phase 1: all linked — resize via the SE corner handle ----------
await boot()
let cards = await cardRects()
let c = cards[0]
{
  const st = await selectCard(c)
  if (!/3 linked/.test(st)) throw new Error(`ASSERT: expected "3 linked" in selection status: ${st}`)
  const linkedOutlines = (await edgePainted(cards[1])) && (await edgePainted(cards[2]))
  log('phase 1 — sibling instances outlined:', linkedOutlines)
  if (!linkedOutlines) throw new Error('ASSERT: linked instances not outlined on select')
}
await page.mouse.move(c.right, c.bottom)
await page.mouse.down()
await page.mouse.move(c.right + 37, c.bottom + 23, { steps: 6 })
log('during resize:', await status())
await page.mouse.up()
await waitReceipt('resize (all linked)')
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

// ---------- phase 2: ghost-drag past the clipping chrome boundary → translate ----------
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
const chromeTop = await page.evaluate(
  () => document.querySelector('div[data-s2c*="BrowserChrome"]').getBoundingClientRect().top,
)
// drag UP past the overflow-hidden BrowserChrome's top edge (plus a bit right)
const dyPast = -(c.top - chromeTop + 30)
await page.mouse.move(c.cx, c.cy)
await page.mouse.down()
await page.mouse.move(c.cx + 60, c.cy + dyPast, { steps: 8 })
log('during ghost move:', await status())
{
  const g = await page.evaluate(() => {
    const ghost = document.querySelector('[data-s2c-ghost]')
    const card = document.querySelectorAll('section[data-s2c*="StatCards"] > div')[0]
    return {
      present: !!ghost,
      top: ghost ? ghost.getBoundingClientRect().top : null,
      cardOpacity: getComputedStyle(card).opacity,
    }
  })
  log('phase 2 — ghost:', JSON.stringify(g), '| chromeTop:', chromeTop.toFixed(1))
  if (!g.present) throw new Error('ASSERT: no document-level ghost during clipped drag')
  if (g.cardOpacity !== '0.4') throw new Error(`ASSERT: original not dimmed to 0.4 (got ${g.cardOpacity})`)
  if (!(g.top < chromeTop - 10)) {
    throw new Error(`ASSERT: ghost (top ${g.top}) did not render past the clipping boundary (${chromeTop})`)
  }
}
await page.mouse.up()
const moveReceipt = await waitReceipt('ghost free move')
if (!/cosmetic transform/.test(moveReceipt)) throw new Error('ASSERT: translate receipt not flagged cosmetic')
await page.waitForTimeout(300)
{
  const after = readFileSync(CARDS, 'utf8')
  const xOk = /translate-x-/.test(after)
  const yOk = /translate-y-/.test(after)
  const ghostGone = await page.evaluate(() => !document.querySelector('[data-s2c-ghost]'))
  log('phase 2 — translate-x landed:', xOk, '| translate-y landed:', yOk, '| ghost cleaned up:', ghostGone)
  if (!xOk || !yOk) throw new Error('ASSERT: ghost move did not land translate classes in StatCards.tsx')
  if (!ghostGone) throw new Error('ASSERT: ghost leaked after release')
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
await page.waitForTimeout(600)

// ---------- phase 4: double-click → "this one only" → per-item edit ----------
await boot()
cards = await cardRects()
c = cards[1] // middle card: instanceIndex 1 exercises non-zero index mapping
await selectCard(c)
await page.waitForTimeout(600) // let the first click's double-click window lapse
await page.mouse.dblclick(c.left + 12, c.top + 12)
await page.waitForTimeout(150)
{
  const st = await status()
  log('after double-click:', st)
  if (!/this one only/.test(st)) throw new Error(`ASSERT: double-click did not narrow scope: ${st}`)
  const siblingOutlined = (await edgePainted(cards[0])) || (await edgePainted(cards[2]))
  log('phase 4 — sibling outlines gone in single scope:', !siblingOutlined)
  if (siblingOutlined) throw new Error('ASSERT: sibling instances still outlined in "this one only" scope')
}
const othersBefore = [cards[0], cards[2]]
await page.mouse.move(c.cx, c.cy)
await page.mouse.down()
await page.mouse.move(c.cx + 60, c.cy + 220, { steps: 8 })
log('during single-scope move:', await status())
await page.mouse.up()
const oneReceipt = await waitReceipt('just-this-one move')
if (!/just this one/.test(oneReceipt)) throw new Error('ASSERT: receipt does not name the single-instance scope')
await page.waitForTimeout(800)
{
  const after = readFileSync(CARDS, 'utf8')
  const itemLine = after.split('\n').find((l) => l.includes("'Active users'")) ?? ''
  const itemOk = /className: '[^']*translate/.test(itemLine)
  const hookOk = after.includes("${s.className ?? ''}")
  log('phase 4 — per-item className:', itemOk, '| template hook:', hookOk)
  if (!itemOk) throw new Error(`ASSERT: 'Active users' item did not gain a translate className: ${itemLine}`)
  if (!hookOk) throw new Error('ASSERT: template did not gain the ${s.className ?? \'\'} spread')
  const now = await cardRects()
  for (const [i, was] of [[0, othersBefore[0]], [2, othersBefore[1]]]) {
    const dx = Math.abs(now[i].left - was.left)
    const dy = Math.abs(now[i].top - was.top)
    log(`phase 4 — card ${i} drift: ${dx.toFixed(2)},${dy.toFixed(2)}`)
    if (dx > 1 || dy > 1) throw new Error(`ASSERT: card ${i} moved (${dx},${dy}) — per-item edit leaked to siblings`)
  }
  const moved = Math.abs(now[1].left - c.left) + Math.abs(now[1].top - c.top)
  if (moved < 30) throw new Error('ASSERT: the targeted instance did not actually move')
}
restore()
await page.waitForTimeout(600)

// ---------- phase 5: magnetic snap — left edge onto a sibling's left edge ----------
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
const exactDelta = cards[1].left - cards[0].left
const rawDx = exactDelta - 4 // 4px shy: inside the 6px snap threshold
await page.mouse.move(c.cx, c.cy)
await page.mouse.down()
await page.mouse.move(c.cx + rawDx, c.cy + 170, { steps: 8 })
{
  const st = await status()
  log('during snap move:', st)
  if (!/⌖ snapped/.test(st)) throw new Error(`ASSERT: no snap indicator near the sibling edge: ${st}`)
}
await page.mouse.up()
await waitReceipt('magnetic snap move')
await page.waitForTimeout(800)
{
  const after = readFileSync(CARDS, 'utf8')
  const m = /translate-x-(?:\[(\d+)px\]|([\d.]+))/.exec(after)
  if (!m) throw new Error('ASSERT: snap move did not land a translate-x class')
  const committedPx = m[1] !== undefined ? Number(m[1]) : Number(m[2]) * 4
  const expected = Math.round(exactDelta)
  log('phase 5 — committed translate-x px:', committedPx, '| expected exact:', expected)
  if (committedPx !== expected) {
    throw new Error(`ASSERT: committed translate (${committedPx}px) is not the exact aligned delta (${expected}px)`)
  }
  const now = await cardRects()
  const align = Math.abs(now[0].left - cards[1].left)
  log('phase 5 — post-HMR left-edge misalignment:', align.toFixed(2), 'px')
  if (align > 1) throw new Error(`ASSERT: card left edge off the sibling guide by ${align}px after commit`)
}
restore()
await page.waitForTimeout(600)

// ---------- phase 6: anchored resize — pull the LEFT edge, right edge stays ----------
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
await page.mouse.move(c.left, c.cy)
await page.mouse.down()
await page.mouse.move(c.left - 40, c.cy, { steps: 6 })
log('during left-edge resize:', await status())
await page.mouse.up()
await waitReceipt('left-edge resize')
await page.waitForTimeout(800)
{
  const after = readFileSync(CARDS, 'utf8')
  const compOk = /-ml-(\[\d+px\]|[\d.]+)/.test(after)
  log('phase 6 — ml compensation landed:', compOk)
  if (!compOk) throw new Error('ASSERT: left-edge resize committed no ml compensation')
  const now = await cardRects()
  const rightDrift = Math.abs(now[0].right - c.right)
  const leftMove = c.left - now[0].left
  log('phase 6 — right-edge drift:', rightDrift.toFixed(2), 'px | left edge moved:', leftMove.toFixed(2), 'px')
  if (rightDrift > 1) throw new Error(`ASSERT: right edge moved ${rightDrift}px on a left-edge drag (anchoring broken)`)
  if (leftMove < 35 || leftMove > 45) throw new Error(`ASSERT: left edge moved ${leftMove}px, expected ≈40`)
}
restore()
await page.waitForTimeout(600)

// ---------- phase 7: anchored resize — pull the TOP edge, bottom edge stays ----------
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
await page.mouse.move(c.cx, c.top)
await page.mouse.down()
await page.mouse.move(c.cx, c.top - 30, { steps: 6 })
log('during top-edge resize:', await status())
await page.mouse.up()
await waitReceipt('top-edge resize')
await page.waitForTimeout(800)
{
  const after = readFileSync(CARDS, 'utf8')
  const compOk = /-mt-(\[\d+px\]|[\d.]+)/.test(after)
  log('phase 7 — mt compensation landed:', compOk)
  if (!compOk) throw new Error('ASSERT: top-edge resize committed no mt compensation')
  const now = await cardRects()
  const bottomDrift = Math.abs(now[0].bottom - c.bottom)
  const topMove = c.top - now[0].top
  log('phase 7 — bottom-edge drift:', bottomDrift.toFixed(2), 'px | top edge moved:', topMove.toFixed(2), 'px')
  if (bottomDrift > 1) throw new Error(`ASSERT: bottom edge moved ${bottomDrift}px on a top-edge drag (anchoring broken)`)
  if (topMove < 25 || topMove > 35) throw new Error(`ASSERT: top edge moved ${topMove}px, expected ≈30`)
}
restore()
await page.waitForTimeout(600)

// ---------- phase 8: shift+click multi-select — group move, per-element undo ----------
const SCHEDULE = `${REPO_ROOT}examples/demo-app/src/components/WeeklySchedule.tsx`
await boot()
cards = await cardRects()
c = cards[0]
await selectCard(c)
const ws = await page.evaluate(() => {
  const r = document.querySelector('section[data-s2c*="WeeklySchedule"]').getBoundingClientRect()
  return { left: r.left, top: r.top, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
})
await page.keyboard.down('Shift')
await page.mouse.click(ws.left + 12, ws.top + 12)
await page.keyboard.up('Shift')
await page.waitForTimeout(150)
{
  const st = await status()
  log('after shift+click:', st)
  if (!/set of 2/.test(st)) throw new Error(`ASSERT: shift+click did not grow the set: ${st}`)
}
await page.mouse.move(ws.cx, ws.cy)
await page.mouse.down()
await page.mouse.move(ws.cx + 80, ws.cy + 40, { steps: 8 })
{
  const st = await status()
  log('during group move:', st)
  // exactly 2 ghosts DEPENDS on the demo App root staying overflow-hidden
  // (App.tsx) — if that class is ever dropped, elements lift in place
  // instead and this assertion (not the feature) needs updating
  const ghosts = await page.evaluate(() => document.querySelectorAll('[data-s2c-ghost]').length)
  log('phase 8 — ghosts during group drag:', ghosts)
  if (ghosts !== 2) throw new Error(`ASSERT: expected one ghost per clipped element (2), got ${ghosts}`)
  if (!/moving 2 elements/.test(st)) throw new Error(`ASSERT: group-drag status wrong: ${st}`)
}
await page.mouse.up()
const groupReceipt = await waitReceipt('group move')
if (!/moved 2 elements/.test(groupReceipt)) throw new Error('ASSERT: collapsed receipt missing element count')
await page.waitForTimeout(800)
{
  const wsAfter = readFileSync(SCHEDULE, 'utf8')
  const cardsAfter = readFileSync(CARDS, 'utf8')
  const wsOk = /translate-x-/.test(wsAfter)
  const cardsOk = /translate-x-/.test(cardsAfter)
  log('phase 8 — WeeklySchedule translated:', wsOk, '| StatCards translated:', cardsOk)
  if (!wsOk || !cardsOk) throw new Error('ASSERT: group move did not land translate classes in both files')
  const ghostsGone = await page.evaluate(() => document.querySelectorAll('[data-s2c-ghost]').length)
  if (ghostsGone !== 0) throw new Error(`ASSERT: ${ghostsGone} ghost(s) leaked after group release`)
}
// one Ctrl+Z reverts exactly ONE element (the most recent commit: the extra)
await page.keyboard.press('Control+z')
{
  const deadline = Date.now() + 10000
  let st = ''
  while (Date.now() < deadline) {
    st = await status()
    if (/undid|undo failed/.test(st)) break
    await page.waitForTimeout(150)
  }
  log('after Ctrl+Z:', st)
  if (!/undid/.test(st)) throw new Error(`ASSERT: undo did not run: ${st}`)
}
await page.waitForTimeout(600)
{
  const wsAfter = readFileSync(SCHEDULE, 'utf8')
  const cardsAfter = readFileSync(CARDS, 'utf8')
  const cardsReverted = !/translate-x-/.test(cardsAfter)
  const wsStill = /translate-x-/.test(wsAfter)
  log('phase 8 — one undo: StatCards reverted:', cardsReverted, '| WeeklySchedule still moved:', wsStill)
  if (!cardsReverted || !wsStill) {
    throw new Error('ASSERT: Ctrl+Z should revert exactly the last element commit (StatCards), leaving the other')
  }
}
restore()

log('E2E PASS — linked resize, ghost-drag past clip boundary, reorder, just-this-one per-item edit, exact magnetic snap, anchored L/T-edge resize, shift+click group move with per-element undo — all zero tokens')
await b.close()

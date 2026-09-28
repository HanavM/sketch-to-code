/**
 * Live e2e: DRAW TO SEARCH THE LIBRARY.
 *
 * The claim: you don't remember what you called a thing, but you remember
 * roughly what it looked like — so sketch it and the library ranks itself. What
 * only a browser can prove is that real components, measured from their real
 * rendered boxes, rank in the order a person would expect: a wide flat scribble
 * should surface the wide flat component, and a boxier one the boxier component,
 * using the SAME library both times.
 *
 * The proportions here are the ones the page actually reports, not the ones the
 * names suggest: the three nav links come out about 10:1, and two stacked form
 * fields about 1.7:1 — boxy, NOT tall, which is what an early version of this
 * test assumed and got wrong.
 *
 * That "same library, two sketches, opposite answers" test is the whole point.
 * A search that always returns the most-used entry would pass any single check.
 *
 * Phases, all zero-token:
 *   1. file two components with very different proportions (a ~10:1 nav row and
 *      a ~1.7:1 pair of form fields) by extracting them from the page
 *   2. draw a WIDE flat box → the wide one ranks first
 *   3. draw a BOXY one → the boxy one ranks first, same library
 *   4. the cards show a match percentage, and the panel says what it is doing
 *   5. clearing the ink puts the whole library back
 *   6. placing the top match works straight from the search results
 *
 * Starts its own dev server with an isolated global library (see live-library).
 * Run FROM THE REPO ROOT: node tests/e2e/live-libsearch.mjs
 */
import { chromium } from 'playwright'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'

const PORT = Number(process.env.S2C_PORT ?? 5221)
const GIVEN = process.env.S2C_APP
const APP = GIVEN ?? `http://localhost:${PORT}/`
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const LIB = `${REPO_ROOT}examples/demo-app/.sketch2code/library`
const log = (...a) => console.log('[e2e-libsearch]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })
  execSync('git clean -fdq examples/demo-app/src/', { cwd: REPO_ROOT })
}

restore()
if (existsSync(LIB)) rmSync(LIB, { recursive: true })

const XDG = GIVEN ? (process.env.XDG_DATA_HOME ?? '') : mkdtempSync(join(tmpdir(), 's2c-xdg-'))
let server = null
if (!GIVEN) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: `${REPO_ROOT}examples/demo-app`,
    env: { ...process.env, XDG_DATA_HOME: XDG },
    stdio: 'ignore',
  })
  process.on('exit', () => {
    server?.kill('SIGTERM')
    rmSync(XDG, { recursive: true, force: true })
  })
}
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(APP)).ok) break
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200))
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const soft = async (fn, arg) => {
  try {
    return await page.evaluate(fn, arg)
  } catch {
    return null
  }
}
const status = async () =>
  (await soft(() => document.getElementById('s2c-overlay-host')?.shadowRoot
    ?.getElementById('status')?.textContent ?? null)) ?? ''
const lib = async () => await soft(() => window.__S2C_DEBUG__?.library() ?? null)

async function waitLib(pred, what, ms = 25000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await lib()
    if (last && pred(last)) return last
    await page.waitForTimeout(300)
  }
  throw new Error(`ASSERT: timed out waiting for ${what} — last: ${JSON.stringify(last?.entries)}`)
}
async function waitStatus(re, ms = 25000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(200)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

const cardMeta = () =>
  soft(() => [...document.getElementById('s2c-overlay-host').shadowRoot
    .querySelectorAll('#libGrid .lCard')].map((c) => ({
    name: c.querySelector('.lName')?.textContent ?? '',
    meta: c.querySelector('.lMeta')?.textContent ?? '',
  })))

/** Alt+D TOGGLES draw mode, so pressing it blind turns it off half the time. */
const mode = () => soft(() => document.getElementById('s2c-overlay-host')?.dataset.mode ?? null)
async function ensureDraw() {
  for (let i = 0; i < 3; i++) {
    if ((await mode()) === 'draw') return
    await page.keyboard.press('Alt+d')
    await page.waitForTimeout(250)
  }
  throw new Error(`ASSERT: could not enter draw mode — mode is ${await mode()}`)
}

/** Draw a rectangle outline in draw mode, in page coordinates. */
async function drawBox(x, y, w, h) {
  const pts = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
  await page.mouse.move(pts[0][0], pts[0][1])
  await page.mouse.down()
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1]
    const [nx, ny] = pts[i]
    for (let s = 1; s <= 6; s++) {
      await page.mouse.move(px + ((nx - px) * s) / 6, py + ((ny - py) * s) / 6)
      await page.waitForTimeout(12)
    }
  }
  await page.mouse.up()
  await page.waitForTimeout(200)
}

/** Lasso a set of elements into a component, the way live-library does. */
async function extractAs(name, boxFn) {
  const box = await soft(boxFn)
  await page.keyboard.press('Alt+l')
  await page.mouse.move(box.x0, box.y0)
  await page.mouse.down()
  let [cx, cy] = [box.x0, box.y0]
  for (const [x, y] of [[box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [box.x0, box.y0]]) {
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(cx + ((x - cx) * i) / 4, cy + ((y - cy) * i) / 4)
      await page.waitForTimeout(14)
    }
    cx = x
    cy = y
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  await soft((n) => {
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('lassoName').value = n
  }, name)
  await page.keyboard.press('Enter')
  await waitStatus(new RegExp(`^✓ ${name}|^✗`))
  const st = await status()
  if (st.startsWith('✗')) throw new Error(`ASSERT: extracting ${name} failed: ${st}`)
  log(`filed ${name}:`, st.slice(0, 64))
  await page.waitForTimeout(1600)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. two components, deliberately different shapes ──────────────────────
await page.keyboard.press('Alt+t')
// WIDE and short: the three nav links in a row
await extractAs('WideRow', () => {
  const as = [...document.querySelectorAll('nav a')]
  const r0 = as[0].getBoundingClientRect()
  const r2 = as[2].getBoundingClientRect()
  return { x0: r0.left - 10, y0: r0.top - 12, x1: r2.right + 10, y1: r2.bottom + 12 }
})
// BOXY: two stacked form fields, about 1.7:1 as the page lays them out
await page.keyboard.press('Alt+t')
await extractAs('BoxyStack', () => {
  const n = document.querySelector('#name').closest('div')
  const e = document.querySelector('#email').closest('div')
  const rn = n.getBoundingClientRect()
  const re = e.getBoundingClientRect()
  return { x0: rn.left - 8, y0: rn.top - 10, x1: rn.right + 8, y1: re.bottom + 10 }
})

// open the panel so the outlines get measured and filed
await page.keyboard.press('Alt+Shift+L')
const filed = await waitLib(
  (l) => ['WideRow', 'BoxyStack'].every((n) => l.entries.some((e) => e.name === n)),
  'both components to be filed',
)
log('library:', filed.entries.map((e) => e.name).join(', '))
// they need shapes on file, or a search cannot tell them apart
await waitLib(
  (l) => l.entries.filter((e) => ['WideRow', 'BoxyStack'].includes(e.name))
    .every((e) => e.hasThumb),
  'both to have pictures',
)
await page.keyboard.press('Alt+Shift+L')

// ── 2. a wide short scribble ─────────────────────────────────────────────
await ensureDraw()
await drawBox(300, 620, 520, 60)
await page.keyboard.press('Alt+Shift+L')
const wide = await waitLib((l) => l.searching && l.entries.some((e) => (e.score ?? 0) > 0),
  'the wide sketch to be scored')
const wideRank = wide.entries.map((e) => `${e.name} ${Math.round((e.score ?? 0) * 100)}%`)
log('wide sketch ranks:', wideRank.join(' | '))
log('status:', await status())
if (wide.entries[0].name !== 'WideRow') {
  throw new Error(`ASSERT: a wide short sketch ranked ${wide.entries[0].name} first`)
}

// ── 3. a tall narrow scribble, SAME library ─────────────────────────────
await page.keyboard.press('Alt+Shift+L')
await page.keyboard.press('Alt+x') // clear the ink
await page.waitForTimeout(300)
await ensureDraw()
await drawBox(380, 560, 240, 140)
await page.keyboard.press('Alt+Shift+L')
const boxy = await waitLib(
  (l) => l.searching && l.entries.some((e) => (e.score ?? 0) > 0) &&
    l.entries[0].name !== 'WideRow',
  'the boxy sketch to re-rank',
)
log('boxy sketch ranks:', boxy.entries.map((e) => `${e.name} ${Math.round((e.score ?? 0) * 100)}%`).join(' | '))
if (boxy.entries[0].name !== 'BoxyStack') {
  throw new Error(`ASSERT: a boxy sketch ranked ${boxy.entries[0].name} first`)
}
log('✓ same library, two sketches, opposite answers')

// ── 4. the panel says what it is doing ──────────────────────────────────
const metas = await cardMeta()
log('cards:', metas.map((m) => `${m.name} (${m.meta})`).join(' | '))
if (!metas.some((m) => /% match/.test(m.meta))) {
  throw new Error(`ASSERT: no card shows how well it matches: ${JSON.stringify(metas)}`)
}
const head = await soft(() => document.getElementById('s2c-overlay-host').shadowRoot
  .getElementById('libHead').textContent)
if (!/sketch/.test(head)) throw new Error(`ASSERT: the panel does not say it is searching: ${head}`)

// ── 5. clearing the ink puts the library back ──────────────────────────
await page.keyboard.press('Alt+x')
const back = await waitLib((l) => !l.searching, 'the search to end with the ink')
log('after clearing the ink: searching =', back.searching, '·', back.entries.length, 'entries')
if (back.entries.some((e) => e.score)) throw new Error('ASSERT: scores survived the ink')

// ── 6. place the top match from a search ───────────────────────────────
await ensureDraw()
await drawBox(300, 620, 520, 60)
await waitLib((l) => l.searching, 're-search')
const top = (await lib()).entries[0]
await soft((i) => document.getElementById('s2c-overlay-host').shadowRoot
  .querySelector(`#libGrid .lCard[data-entry-id="${i}"]`).click(), top.id)
await waitLib((l) => l.armed === top.id, 'the top match to be picked up')
const target = await soft(() => {
  const s = [...document.querySelectorAll('section')].find((x) => x.className.includes('grid'))
  const r = s.getBoundingClientRect()
  return { x: r.left + 6, y: r.top + 6 }
})
await page.mouse.click(target.x, target.y)
const receipt = await waitStatus(/^[✓✗]/)
log('placed from a search:', receipt)
if (receipt.startsWith('✗')) throw new Error(`ASSERT: placing the top match failed: ${receipt}`)

restore()
if (existsSync(LIB)) rmSync(LIB, { recursive: true })
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — a rough sketch ranks the library by shape, and the top match places as real code')

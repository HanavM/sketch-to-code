/**
 * Live e2e: MAKE THIS DATA REAL.
 *
 * The claim: point at a row of a hardcoded list, and it becomes an endpoint the
 * page fetches — without the page changing at all.
 *
 * That last part is the whole design and the only thing worth testing here. A
 * promote that works but flashes empty, or renders a different table, or breaks
 * when the endpoint is down, has failed even if every file it wrote is perfect.
 * So this compares the rendered table before and after, byte for byte.
 *
 * Phases, all zero-token:
 *   1. the table renders from a literal; no endpoint exists
 *   2. promote it: three files written, the component rewritten
 *   3. the endpoint answers with the same records
 *   4. the page renders EXACTLY as before — same rows, same order, no flash
 *   5. it really is fetching: change the route's data, reload, see the change
 *   6. and if the endpoint dies, the page still renders (the seed)
 *   7. Ctrl+Z takes all of it back
 *   8. and both receipts survive the reload their own edit causes
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-api.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const log = (...a) => console.log('[e2e-api]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}

restore()

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
// null-safe on purpose: this promote writes files the page has never imported,
// so vite full-reloads and for a moment there is no overlay to ask
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
/** The users table as a person sees it: every row, in order. */
const table = () =>
  sh(() => [...document.querySelectorAll('table tbody tr')]
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | ')))

async function waitStatus(re, ms = 20000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(200)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. before ───────────────────────────────────────────────────────────
const before = await table()
log('table before:', before.length, 'rows ·', JSON.stringify(before[0]))
if (before.length < 3) throw new Error('fixture drift: the users table is not what this test expects')
if (existsSync(`${APPDIR}/server/api/users.ts`)) throw new Error('an endpoint already exists')

// ── 2. point at a row and promote ───────────────────────────────────────
const row = await sh(() => {
  const td = document.querySelector('table tbody tr td')
  const r = td.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(row.x, row.y)
await page.waitForTimeout(300)
log('selected:', (await status()).slice(0, 64))
await page.keyboard.press('Alt+Shift+D')
const receipt = await waitStatus(/^[✓✗]/)
log('promote:', receipt)
if (receipt.startsWith('✗')) throw new Error(`ASSERT: promote refused: ${receipt}`)
if (!/0 tokens/.test(receipt)) throw new Error('ASSERT: receipt missing the zero-token proof')

// ── 8a. and it survives the reload it just caused ──────────────────────
// Writing two modules the page never imported is past what Fast Refresh can
// patch, so vite full-reloads and tears down the overlay a second later. If the
// receipt does not survive that, the user's only feedback for the whole gesture
// is a blank status bar — and they are never told that Ctrl+Z undoes it. Read it
// here, before this test reloads on purpose: the receipt is consumed by the
// restore that shows it, so being gone by the NEXT reload is correct.
await page.waitForTimeout(1800)
const survived = await status()
log('receipt after its reload:', survived.slice(0, 80))
if (!survived.startsWith('✓')) {
  throw new Error(`ASSERT: the receipt did not survive the reload it caused — status is: ${survived}`)
}
if (!/Ctrl\+Z/.test(survived)) throw new Error('ASSERT: the surviving receipt does not mention undo')

const route = `${APPDIR}/server/api/users.ts`
const hook = `${APPDIR}/src/lib/useApi.ts`
for (const f of [route, hook]) {
  if (!existsSync(f)) throw new Error(`ASSERT: ${f.replace(APPDIR, '')} was not written`)
}
const src = readFileSync(`${APPDIR}/src/components/UserTable.tsx`, 'utf8')
log('component now:', src.split('\n').filter((l) => /useApi|_SEED/.test(l)).map((l) => l.trim()).join(' ⏎ '))
if (!/useApi\(['"]\/api\/users['"]/.test(src)) throw new Error('ASSERT: the component does not fetch the route')
if (!/users_SEED/.test(src)) throw new Error('ASSERT: the literal was not kept as a seed')
// the hook call must be INSIDE the component: at module scope it runs on import
// and throws, which would break the page on every promote
const hookLine = src.split('\n').findIndex((l) => /useApi\(/.test(l) && !/^import/.test(l))
const compLine = src.split('\n').findIndex((l) => /export default function/.test(l))
if (hookLine < compLine) throw new Error('ASSERT: the hook is called at module scope — it would throw on import')

// ── 3. the endpoint answers ────────────────────────────────────────────
const served = await page.request.get(`${APP.replace(/\/$/, '')}/api/users`)
const json = await served.json()
log('GET /api/users →', served.status(), '·', Array.isArray(json) ? `${json.length} records` : typeof json)
if (served.status() !== 200) throw new Error(`ASSERT: the route does not answer: ${served.status()}`)
if (!Array.isArray(json) || json.length !== before.length) {
  throw new Error(`ASSERT: the route serves ${JSON.stringify(json).slice(0, 80)}, not the ${before.length} records`)
}

// ── 4. the page did not change ─────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const after = await table()
log('table after: ', after.length, 'rows ·', JSON.stringify(after[0]))
if (JSON.stringify(after) !== JSON.stringify(before)) {
  throw new Error(`ASSERT: the table changed\n  before ${JSON.stringify(before)}\n  after  ${JSON.stringify(after)}`)
}
log('✓ identical rendering — the promote is invisible to the page')


// ── 5. it really is fetching ───────────────────────────────────────────
// Phase 4 passing is ambiguous on its own: a page that never fetches renders
// identically too. So change the data at the endpoint and see the page follow.
const base = APP.replace(/\/$/, '')
const original = readFileSync(route, 'utf8')
writeFileSync(route, original.replace(/'Maya Chen'/, "'Proof It Fetched'"))
// Wait for the ENDPOINT first. The dev server's file watcher is debounced, so
// reloading immediately serves the previous module and the page caches a stale
// answer it has no reason to ask again — which measures the watcher's latency
// instead of whether the page is wired to the route.
let live = ''
for (let i = 0; i < 50; i++) {
  live = await (await page.request.get(`${base}/api/users`)).text()
  if (live.includes('Proof It Fetched')) break
  await page.waitForTimeout(200)
}
if (!live.includes('Proof It Fetched')) {
  throw new Error('ASSERT: editing the route file never reached the endpoint — it is serving a cached module')
}
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => document.body.textContent.includes('Proof It Fetched'), { timeout: 10000 })
log('✓ editing the route changed the page:', (await table())[0])
writeFileSync(route, original)
for (let i = 0; i < 50; i++) {
  if ((await (await page.request.get(`${base}/api/users`)).text()).includes('Maya Chen')) break
  await page.waitForTimeout(200)
}

// ── 6. and the seed is a real fallback ────────────────────────────────
await page.route('**/api/users', (r) => r.abort())
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const dead = await table()
log('with the endpoint dead:', dead.length, 'rows ·', JSON.stringify(dead[0]))
if (JSON.stringify(dead) !== JSON.stringify(before)) {
  throw new Error('ASSERT: a dead endpoint changed the page — the seed is not doing its job')
}
log('✓ endpoint down, page unchanged')
await page.unroute('**/api/users')

// ── 7. undo ───────────────────────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
await page.waitForTimeout(900)
const undoReceipt = await waitStatus(/^↩/, 8000)
log('undo:', undoReceipt.slice(0, 70))
// ── 8b. and the undo receipt survives its own reload ──────────────────
// Undoing this edit DELETES the two modules, which reloads the page just as
// hard as adding them did. Read it before the manual reload further down: the
// receipt is consumed by the restore that shows it, so it is meant to be gone
// by the next one.
await page.waitForTimeout(1800)
const undoSurvived = await status()
log('undo receipt after its reload:', undoSurvived.slice(0, 80))
if (!undoSurvived.startsWith('↩')) {
  throw new Error(`ASSERT: the undo receipt did not survive its own reload — status is: ${undoSurvived}`)
}
const back = readFileSync(`${APPDIR}/src/components/UserTable.tsx`, 'utf8')
if (/useApi/.test(back)) throw new Error('ASSERT: undo left the component fetching')
if (existsSync(route)) throw new Error('ASSERT: undo left the route file behind')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
if (JSON.stringify(await table()) !== JSON.stringify(before)) {
  throw new Error('ASSERT: the table did not survive the undo')
}
log('✓ undo removed every file and the page is unchanged')


restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — a hardcoded list became an endpoint, and the page never noticed')

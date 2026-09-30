/**
 * Live e2e: CREATE THE ENDPOINT THE PAGE ASKED FOR.
 *
 * The third backend move, and the only one that starts from something you
 * cannot point at — the thing that went wrong is a request, not an element.
 *
 * This one has to be a live test, not a unit test, because the whole premise is
 * a property of a real dev server that no fixture can fake: a fetch to a route
 * that does not exist comes back **200 with text/html**, because an unknown path
 * gets index.html so client-side routing works. Phase 1 asserts that trap is
 * genuinely there before anything else claims to detect it — if the server ever
 * starts returning a 404 instead, this test should be the thing that notices,
 * not the users.
 *
 * Phases, all zero-token:
 *   1. the trap is real: /api/orders answers 200 text/html, and .json() throws
 *      the error that names nothing
 *   2. the overlay noticed, and says the useful sentence
 *   3. the palette writes the route
 *   4. the same fetch now gets JSON, and the miss is gone
 *   5. Ctrl+Z takes it back
 *   6. a route that EXISTS and throws is not reported as missing, and the
 *      refusal says what is actually wrong
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-endpoint.mjs
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const log = (...a) => console.log('[e2e-endpoint]', ...a)
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
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
const misses = () => sh(() => window.__S2C_DEBUG__.apiMisses())

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

/** Run a command by name through the palette, the way a person would. */
async function runCommand(query) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k')
  await page.waitForTimeout(250)
  await sh((q) => {
    const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
    el.value = q
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, query)
  await page.waitForTimeout(250)
  const found = await sh(() => window.__S2C_DEBUG__.commands().matches)
  if (!found.length) throw new Error(`ASSERT: the palette finds nothing for ${JSON.stringify(query)}`)
  log('palette', JSON.stringify(query), '→', found.join(', '))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  return found[0]
}

const route = `${APPDIR}/server/api/orders.ts`

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
if ((await misses()).length) throw new Error(`ASSERT: misses before anything asked: ${JSON.stringify(await misses())}`)
if (existsSync(route)) throw new Error('the route already exists')

// ── 1. the trap is real ────────────────────────────────────────────────
// Asserted, not assumed: everything below only matters because a dev server
// answers an unknown path with a page instead of a 404.
const trap = await sh(async () => {
  const res = await fetch('/api/orders')
  let threw = null
  try { await res.clone().json() } catch (e) { threw = String(e) }
  return { status: res.status, type: res.headers.get('content-type'), threw }
})
log('GET /api/orders →', trap.status, trap.type)
log('and .json() throws:', (trap.threw ?? 'nothing').slice(0, 70))
if (trap.status !== 200 || !/text\/html/i.test(trap.type ?? '')) {
  throw new Error(`ASSERT: the premise no longer holds — a missing route answers ${trap.status} ${trap.type}`)
}
if (!trap.threw) throw new Error('ASSERT: parsing a page as JSON did not throw, so there is nothing to rescue')

// ── 2. the overlay noticed, and says something useful ─────────────────
const warned = await waitStatus(/^⚠/)
log('overlay says:', warned)
const seen = await misses()
log('misses:', JSON.stringify(seen))
if (seen.length !== 1 || seen[0].path !== '/api/orders' || seen[0].how !== 'page') {
  throw new Error(`ASSERT: the miss was not recorded as an SPA fallback: ${JSON.stringify(seen)}`)
}
if (!warned.includes('/api/orders')) throw new Error('ASSERT: the warning does not name the path')
// the point of the message is to connect the useless error to the real cause
if (!/Unexpected token/.test(warned)) {
  throw new Error(`ASSERT: the warning does not connect to the error the user actually saw: ${warned}`)
}
// asking again must not repeat itself
await sh(() => fetch('/api/orders'))
await page.waitForTimeout(300)
if ((await misses()).length !== 1) throw new Error('ASSERT: a repeated request was reported twice')

// ── 3. the palette writes it ──────────────────────────────────────────
const ran = await runCommand('create the endpoint')
if (ran !== 'endpoint') throw new Error(`ASSERT: the palette ran "${ran}" instead`)
const receipt = await waitStatus(/^[✓✗]/)
log('receipt:', receipt)
if (receipt.startsWith('✗')) throw new Error(`ASSERT: refused: ${receipt}`)
if (!/0 tokens/.test(receipt)) throw new Error('ASSERT: receipt missing the zero-token proof')
if (!existsSync(route)) throw new Error('ASSERT: the route file was not written')
const src = readFileSync(route, 'utf8')
log('route:', src.split('\n').filter((l) => /^export/.test(l)).map((l) => l.trim()).join(' ⏎ '))
if (!/export const orders/.test(src)) throw new Error('ASSERT: the route does not export its data')
// nothing invented: an empty list, because there was nothing to infer from
if (!/=\s*\[\]/.test(src)) throw new Error('ASSERT: the route does not answer an empty list')

// ── 4. the same fetch now gets JSON ───────────────────────────────────
const fixed = await sh(async () => {
  const res = await fetch('/api/orders')
  return { status: res.status, type: res.headers.get('content-type'), body: await res.text() }
})
log('GET /api/orders →', fixed.status, fixed.type, fixed.body.slice(0, 20))
if (!/application\/json/i.test(fixed.type ?? '')) {
  throw new Error(`ASSERT: still not JSON: ${fixed.type}`)
}
if (fixed.body.trim() !== '[]') throw new Error(`ASSERT: the route answers ${fixed.body}, want []`)
if ((await misses()).length !== 0) throw new Error('ASSERT: the miss is still on offer after being fixed')
log('✓ the request the page was already making now works')

// ── 5. undo ───────────────────────────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
log('undo:', (await waitStatus(/^↩|nothing to undo/, 10000)).slice(0, 60))
await page.waitForTimeout(800)
if (existsSync(route)) throw new Error('ASSERT: undo left the route behind')
log('✓ undo removed it')

// ── 6. a route that exists and throws is a different problem ──────────
// The discriminator that matters: "missing" and "broken" look nothing alike to
// the page, and offering to create a file that is already there would replace
// the answer instead of supplying one.
mkdirSync(`${APPDIR}/server/api`, { recursive: true })
writeFileSync(route, 'export function GET(): never { throw new Error("deliberate") }\n')
await page.waitForTimeout(600)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
const broken = await sh(async () => {
  const res = await fetch('/api/orders')
  return { status: res.status, type: res.headers.get('content-type'), body: (await res.text()).slice(0, 120) }
})
log('a route that throws →', broken.status, broken.type, '·', broken.body)
if (broken.status !== 500) throw new Error(`ASSERT: a throwing route answered ${broken.status}`)
await page.waitForTimeout(400)
if ((await misses()).length !== 0) {
  throw new Error(`ASSERT: a broken route was reported as missing: ${JSON.stringify(await misses())}`)
}
log('✓ broken is not missing — nothing was offered')

// and asking for it anyway refuses, naming the real reason
const ran2 = await runCommand('create the endpoint')
if (ran2 !== 'endpoint') throw new Error('ASSERT: the palette lost the command')
const idle = await status()
log('with nothing missing:', idle.slice(0, 90))
if (!/nothing has asked/.test(idle)) {
  throw new Error(`ASSERT: it should say there is nothing to create: ${idle}`)
}

restore()
const real = errs.filter((e) => !/ResizeObserver|Unexpected token/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — the page asked for something that was not there, and the tool noticed and wrote it')

/**
 * Live e2e: MAKE THIS FORM REAL.
 *
 * The claim: point at a form that looks finished and throws everything away,
 * and it starts keeping what people type — through the same one command that
 * turns a hardcoded list into an endpoint, because which of the two you meant
 * is something the pointer already said.
 *
 * What makes this worth testing live rather than in a unit test: the record has
 * to survive a round trip through a real browser, a real submit event, a real
 * POST, and a real file on disk. Every one of those is a place the field names
 * can silently not line up — and a form that appears to save while storing
 * `{}` is the worst possible outcome, because it looks like success.
 *
 * Phases, all zero-token:
 *   1. the form submits into nothing; no endpoint, no store
 *   2. point at a field, press the one key → files written, JSX rewired
 *   3. fill it in and submit → the page says so, and the record is ON DISK
 *      with the values that were typed, under the names the fields were given
 *   4. GET returns what was posted, so a page could read it back
 *   5. a required field, and a junk key, are refused by the route itself
 *   6. submitting does NOT reload the page (an imported JSON store would)
 *   7. Ctrl+Z takes all of it back
 *   8. and the same key on a NON-form element does the data move instead —
 *      one command, two outcomes, nobody picked a mode
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-form.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const log = (...a) => console.log('[e2e-form]', ...a)
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
// null-safe: these writes add modules the page never imported, so vite
// full-reloads and for a moment there is no overlay to ask
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')

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

/** Click the middle of the first element matching a page selector. */
async function clickOn(sel) {
  const at = await sh((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, sel)
  if (!at) throw new Error(`fixture drift: nothing matches ${sel}`)
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(300)
}

const store = `${APPDIR}/server/data/contacts.json`
const route = `${APPDIR}/server/api/contacts.ts`
const readStore = () => JSON.parse(readFileSync(store, 'utf8'))

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. before: a form that discards everything ──────────────────────────
const fixture = readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8')
if (!/onSubmit=\{\(e\) => e\.preventDefault\(\)\}/.test(fixture)) {
  throw new Error('fixture drift: ContactForm no longer throws its submit away')
}
if (/name=/.test(fixture)) throw new Error('fixture drift: the fields already have name attributes')
if (existsSync(route)) throw new Error('an endpoint already exists')
log('before: form discards its submit · fields have ids, no names · no route')

// ── 2. point at a field and press the one key ───────────────────────────
await clickOn('form input#name')
log('selected:', (await status()).slice(0, 60))
await page.keyboard.press('Alt+Shift+D')
const receipt = await waitStatus(/^[✓✗]/)
log('receipt:', receipt)
if (receipt.startsWith('✗')) throw new Error(`ASSERT: refused: ${receipt}`)
if (!/0 tokens/.test(receipt)) throw new Error('ASSERT: receipt missing the zero-token proof')
await page.waitForTimeout(1800)
const survived = await status()
if (!survived.startsWith('✓')) {
  throw new Error(`ASSERT: the receipt did not survive the reload it caused — status is: ${survived}`)
}

for (const f of [route, `${APPDIR}/src/lib/useForm.ts`]) {
  if (!existsSync(f)) throw new Error(`ASSERT: ${f.replace(APPDIR, '')} was not written`)
}
const src = readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8')
log('component now:', src.split('\n').filter((l) => /useForm|onSubmit|name="/.test(l))
  .map((l) => l.trim()).join(' ⏎ '))
if (!/onSubmit=\{form\.onSubmit\}/.test(src)) throw new Error('ASSERT: the form still does not submit anywhere')
// FormData only sees fields that have a name — this is the step that silently
// stores {} if it is skipped
for (const n of ['name', 'email', 'role']) {
  if (!new RegExp(`name="${n}"`).test(src)) throw new Error(`ASSERT: the ${n} field never got a name attribute`)
}
// a hook at module scope runs on import and throws
const hookLine = src.split('\n').findIndex((l) => /useForm\(/.test(l) && !/^import/.test(l))
const compLine = src.split('\n').findIndex((l) => /export default function/.test(l))
if (hookLine < compLine) throw new Error('ASSERT: the hook is at module scope — it would throw on import')
// an imported JSON store joins vite's module graph, so every submit would
// hot-reload the page out from under the user
const routeSrc = readFileSync(route, 'utf8')
if (/^import .*\.json['"]/m.test(routeSrc)) {
  throw new Error('ASSERT: the route imports its store — every submit would reload the page')
}
if (existsSync(store)) throw new Error('ASSERT: the store was created before anything was submitted')

// ── 3. fill it in, submit, and look on disk ─────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
// test mode, so the overlay is not between the user and the form
await page.keyboard.press('Alt+ ')
await page.waitForTimeout(400)
await page.fill('form input#name', 'Grace Hopper')
await page.fill('form input#email', 'grace@example.com')
await page.selectOption('form select#role', 'Admin')
const reloaded = []
page.on('load', () => reloaded.push(Date.now()))
await page.click('form button[type="submit"]')
await page.waitForFunction(() => /Saved/i.test(document.querySelector('form')?.textContent ?? ''), { timeout: 10000 })
log('the page says:', (await sh(() => [...document.querySelectorAll('form p')]
  .map((p) => p.textContent.trim()).filter(Boolean).join(' | '))))

if (!existsSync(store)) throw new Error('ASSERT: the page said Saved but no store exists')
const saved = readStore()
log('on disk:', JSON.stringify(saved))
if (saved.length !== 1) throw new Error(`ASSERT: ${saved.length} records on disk, want 1`)
const rec = saved[0]
// the whole point: the values that were TYPED, under the names the fields got
if (rec.name !== 'Grace Hopper' || rec.email !== 'grace@example.com' || rec.role !== 'Admin') {
  throw new Error(`ASSERT: the record is not what was typed: ${JSON.stringify(rec)}`)
}
if (!rec.id || !rec.createdAt) throw new Error('ASSERT: the record has no id/createdAt stamp')
log('✓ the typed values reached the disk under the right keys')

// ── 4. and can be read back ────────────────────────────────────────────
const base = APP.replace(/\/$/, '')
const got = await page.request.get(`${base}/api/contacts`)
const list = await got.json()
log('GET /api/contacts →', got.status(), '·', JSON.stringify(list).slice(0, 90))
if (got.status() !== 200 || !Array.isArray(list) || list.length !== 1 || list[0].name !== 'Grace Hopper') {
  throw new Error('ASSERT: the route does not return what was posted')
}

// ── 5. the route defends itself ────────────────────────────────────────
const post = (body) => page.request.post(`${base}/api/contacts`, { data: body })
// `required` comes from the JSX — the engine does not invent validation the
// form never asked for — so the fixture marks name and email required and the
// route enforces exactly those two.
if (!/REQUIRED/.test(routeSrc)) throw new Error('ASSERT: the route has no notion of a required field')
const blank = await (await post({ name: '   ', email: 'x@y.z', role: 'Admin' })).json()
log('blank required field →', JSON.stringify(blank).slice(0, 110))
if (!blank.error) throw new Error(`ASSERT: a blank required field was accepted: ${JSON.stringify(blank)}`)
const missing = await (await post({ email: 'x@y.z', role: 'Admin' })).json()
log('missing required field →', JSON.stringify(missing).slice(0, 110))
if (!missing.error) throw new Error('ASSERT: a missing required field was accepted')
// role is NOT marked required, so leaving it out must be fine — the route
// enforces the form, not a rule someone imagined
const partial = await (await post({ name: 'Ada', email: 'a@b.c' })).json()
if (partial.error) throw new Error(`ASSERT: an optional field was treated as required: ${partial.error}`)
const junk = await (await post({ name: 'Ada', email: 'a@b.c', role: 'Admin', admin: true })).json()
log('unknown key      →', JSON.stringify(junk).slice(0, 110))
if ('admin' in junk) throw new Error('ASSERT: a caller can write arbitrary keys into the store')
const held = readStore()
if (held.length !== 3) throw new Error(`ASSERT: the store holds ${held.length}, want 3 (two refused)`)
if (held.some((r) => 'admin' in r)) throw new Error('ASSERT: an unknown key reached the disk')
log('✓ required fields enforced, optional ones not, unknown keys dropped, refusals not stored')

// ── 6. submitting did not reload the page ──────────────────────────────
// It would if the route imported its store: the write lands inside the project
// and vite would hot-reload the page mid-form.
log('page loads during the submit:', reloaded.length)
if (reloaded.length) throw new Error(`ASSERT: submitting reloaded the page ${reloaded.length}×`)

// ── 7. undo ───────────────────────────────────────────────────────────
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
if ((await sh(() => window.__S2C_DEBUG__.surface())) !== 'design') {
  await page.keyboard.press('Alt+ ')
  await page.waitForTimeout(400)
}
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
log('undo:', (await waitStatus(/^↩/, 10000)).slice(0, 70))
await page.waitForTimeout(1200)
const back = readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8')
if (/useForm/.test(back)) throw new Error('ASSERT: undo left the component submitting')
if (existsSync(route)) throw new Error('ASSERT: undo left the route file behind')
// …but NOT the records. Undo reverses an edit; the submissions that arrived
// afterwards are not part of it, and quietly deleting somebody's data as a side
// effect of undoing a code change is not a trade this tool gets to make. They
// are also what makes re-making the form real non-destructive.
if (!existsSync(store)) throw new Error('ASSERT: undo deleted the submitted records along with the code')
if (readStore().length !== 3) throw new Error(`ASSERT: undo changed the stored records (${readStore().length} left)`)
log('✓ undo removed the route and un-rewired the form, and kept the', readStore().length, 'submitted records')

// ── 8. the SAME key on a non-form element does the data move ──────────
// One command, two outcomes, and nobody chose between them.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(500)
await clickOn('table tbody tr td')
await page.keyboard.press('Alt+Shift+D')
const other = await waitStatus(/^[✓✗]/)
log('same key, pointing at a table row:', other.slice(0, 80))
if (other.startsWith('✗')) throw new Error(`ASSERT: the data move refused: ${other}`)
if (!existsSync(`${APPDIR}/server/api/users.ts`)) {
  throw new Error('ASSERT: pointing at a table row did not make the DATA real')
}
if (existsSync(route)) throw new Error('ASSERT: pointing at a table row made a form real instead')
log('✓ one key: inside a form it saves, outside one it serves')

restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — a form that threw everything away now keeps it, and the same key still serves a list')

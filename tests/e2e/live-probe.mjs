/**
 * Live e2e: BEHAVIOUR PROBES — a dead form never reports "verified".
 *
 * The claim: the verifier can now tell a form that saves from one that throws
 * its submit away, by USING it — filling it in and submitting it in the real
 * page — and it leaves no trace: the data store is byte-identical afterwards,
 * the fields are put back, the page never navigates.
 *
 * Why live: every link in the chain is a place the test could lie. The probe
 * must reach the browser over SSE, act through React's own event system,
 * observe a real POST, see the real file land, and the server must put the
 * bytes back. A unit test of any one link proves nothing about the chain.
 *
 * Phases, all zero-token (the form is made real by the AST codemod):
 *   1. the fixture form discards its submit → FAILED, "sends … nowhere"
 *   2. make it real (Alt+Shift+D) → PASSED, store absent before and after
 *   3. a store with existing records → PASSED, every byte the same after
 *   4. handler removed again (preventDefault only) → FAILED
 *   5. no handler at all → FAILED as "nothing handles", page did not navigate
 *   6. a handler that calls a third-party host → UNVERIFIED, never clicked
 *   and through 2–3: writing/restoring server/data/ never reloads the page
 *
 * Needs the demo dev server: npm run dev   (port 5199)
 * Run FROM THE REPO ROOT: node tests/e2e/live-probe.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const COMP = `${APPDIR}/src/components/ContactForm.tsx`
const STORE = `${APPDIR}/server/data/contacts.json`
const log = (...a) => console.log('[e2e-probe]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}
const assert = (ok, msg) => { if (!ok) throw new Error(`ASSERT: ${msg}`) }

restore()
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const navigations = []
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()) })

const sh = (fn, arg) => page.evaluate(fn, arg)
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')

async function ready() {
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null && document.querySelector('form input#name'), null, { timeout: 15000 })
  await page.waitForTimeout(300)
}

/** Ask the server to test the form; returns the verdicts. */
async function probeForm() {
  return sh(async () => {
    const srcLoc = document.querySelector('form input#name')?.getAttribute('data-s2c')
    const res = await fetch('/@s2c/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': window.__S2C_TOKEN__ },
      body: JSON.stringify({ srcLoc }),
    })
    return res.json()
  })
}

/** Rewrite the component and wait for HMR to show it. */
async function rewrite(fn) {
  writeFileSync(COMP, fn(readFileSync(COMP, 'utf8')))
  await page.waitForTimeout(1200)
  await ready()
}

const fieldValues = () => sh(() => [...document.querySelectorAll('form input, form select, form textarea')].map((f) => f.value))

try {
  await page.goto(APP, { waitUntil: 'networkidle' })
  await ready()

  // ── 1. the fixture: a form that looks finished and discards its submit ──
  assert(/onSubmit=\{\(e\) => e\.preventDefault\(\)\}/.test(readFileSync(COMP, 'utf8')), 'fixture drift: ContactForm no longer discards its submit')
  const v1 = await probeForm()
  log('1. dead form →', JSON.stringify(v1.verdicts))
  assert(v1.ok && v1.verdicts[0].status === 'failed', `a dead form was not FAILED: ${JSON.stringify(v1)}`)
  assert(/sends what was typed nowhere/.test(v1.verdicts[0].reason), 'the failure is not said in plain words')
  assert(!existsSync(`${APPDIR}/server/data`), 'probing a dead form created server/data')

  // ── 2. make it real, then the same probe passes ────────────────────────
  const at = await sh(() => {
    const r = document.querySelector('form input#name').getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  await page.mouse.click(at.x, at.y)
  await page.waitForTimeout(300)
  await page.keyboard.press('Alt+Shift+D')
  const deadline = Date.now() + 25000
  let receipt = ''
  while (Date.now() < deadline && !/^[✓✗]/.test(receipt)) { receipt = await status(); await page.waitForTimeout(200) }
  log('2. make real →', receipt)
  assert(receipt.startsWith('✓'), `the form codemod did not succeed: ${receipt}`)
  // the codemod adds modules the page never imported, so vite full-reloads on
  // its own schedule; wait it out before reloading ourselves, or our request
  // dies with the page
  await page.waitForTimeout(3000)
  await page.reload({ waitUntil: 'networkidle' })
  await ready()
  await page.waitForTimeout(1000)
  const fieldsBefore = await fieldValues()
  // Tailwind v4 puts server/data/*.json in the client graph, so before the
  // plugin's handleHotUpdate guard every write there reloaded the page — the
  // first probe found it. A reload mid-probe would also kill this request.
  const loads = []
  page.on('load', () => loads.push(Date.now()))
  const v2 = await probeForm()
  log('2. real form →', JSON.stringify(v2.verdicts))
  assert(v2.verdicts[0].status === 'passed', `a working form did not pass: ${JSON.stringify(v2)}`)
  assert(!existsSync(STORE), 'the test record was left on disk')
  assert(!existsSync(`${APPDIR}/server/data`), 'the probe left the server/data directory it created')
  assert(JSON.stringify(await fieldValues()) === JSON.stringify(fieldsBefore), 'the probe left its values in the form')

  // ── 3. existing records: every byte is the same afterwards ─────────────
  mkdirSync(`${APPDIR}/server/data`, { recursive: true })
  const bytes = '[\n  {\n    "id": "x1",\n    "name": "Grace Hopper",\n    "email": "grace@example.com"\n  }\n]\n'
  writeFileSync(STORE, bytes)
  const v3 = await probeForm()
  log('3. with existing data →', v3.verdicts[0].status)
  assert(v3.verdicts[0].status === 'passed', `failed with a pre-existing store: ${JSON.stringify(v3)}`)
  assert(readFileSync(STORE, 'utf8') === bytes, 'the store is not byte-identical after the probe')
  await page.waitForTimeout(800)
  assert(loads.length === 0, `writing or restoring the data store reloaded the page ${loads.length}×`)

  // ── 4. the handler taken out again: back to FAILED ─────────────────────
  await rewrite((s) => s.replace(/onSubmit=\{\w+\.onSubmit\}/, 'onSubmit={(e) => e.preventDefault()}'))
  const v4 = await probeForm()
  log('4. handler removed →', JSON.stringify(v4.verdicts))
  assert(v4.verdicts[0].status === 'failed', 'a form whose handler was removed still passed')
  assert(readFileSync(STORE, 'utf8') === bytes, 'store changed')

  // ── 5. no handler at all: the submit would navigate; it must not ───────
  await rewrite((s) => s.replace(/\s*onSubmit=\{\(e\) => e\.preventDefault\(\)\}/, ''))
  const navsBefore = navigations.length
  await sh(() => { window.__probeMarker = 1 })
  const v5 = await probeForm()
  log('5. no handler →', JSON.stringify(v5.verdicts))
  assert(v5.verdicts[0].status === 'failed' && /nothing handles the submit/.test(v5.verdicts[0].reason), 'an unhandled submit was not named')
  await page.waitForTimeout(500)
  assert(navigations.length === navsBefore, `the probe navigated the page: ${navigations.slice(navsBefore)}`)
  assert(await sh(() => window.__probeMarker === 1), 'the page was reloaded under the probe')

  // ── 6. a handler that reaches off the dev server is never clicked ──────
  await rewrite((s) => s.replace('<form ', `<form onSubmit={(e) => { e.preventDefault(); void fetch('https://api.example.com/charge', { method: 'POST' }) }} `))
  const reqs = []
  page.on('request', (r) => { if (/api\.example\.com/.test(r.url())) reqs.push(r.url()) })
  const v6 = await probeForm()
  log('6. third-party handler →', JSON.stringify(v6.verdicts))
  assert(v6.verdicts[0].status === 'unverified', 'an unsafe trigger was not left unverified')
  assert(/api\.example\.com/.test(v6.verdicts[0].reason), 'the reason does not name the host')
  assert(reqs.length === 0, 'the probe clicked an unsafe trigger')

  assert(errs.length === 0, `page errors: ${errs.join(' | ')}`)
  log('✓ dead fails, real passes, data byte-identical, no navigation, unsafe never clicked · 0 tokens')
} finally {
  await b.close()
  restore()
}

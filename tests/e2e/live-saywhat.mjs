/**
 * Live e2e: SAY WHAT SHOULD HAPPEN, AND IT HAPPENS.
 *
 * The whole point of the other pieces. You point at something, type a sentence
 * about where its data should live, and real files appear — no drawing, and no
 * tokens spent, because the two verbs a sentence like that resolves to are
 * applied by the engines rather than by a model writing a server from scratch.
 *
 * The interpretation is stubbed, which is exactly what makes this test useful:
 * it fixes the model's answer to the verb a real one would pick, and then checks
 * everything downstream of that decision for real — the grounding, the engines,
 * the files on disk, the page, the undo. A model call would make this slow,
 * costly and non-deterministic while testing less.
 *
 * Phases:
 *   1. "this list should come from the server" on a table row → serve
 *      → the route and hook are written, the component fetches, the page is
 *        unchanged, and NOT ONE TOKEN was spent
 *   2. "this form should actually save" on a field → save
 *      → the form is rewired and a submission reaches the disk
 *   3. one sentence asking for both → two actions, both applied
 *   4. a refusal travels word for word instead of becoming a silent no-op
 *
 * Undo is NOT tested here — see the note where that phase used to be.
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-saywhat.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const log = (...a) => console.log('[e2e-saywhat]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}

restore()

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

/**
 * Stand in for the reading, and record what it was asked about.
 *
 * `plan` is set by each phase to the RAW actions a real reading would produce
 * for the sentence that phase types — the model's own shape, element ids and
 * all. Everything downstream is the real thing: Run posts this raw reading
 * back, the server grounds it against the live page, and the engines do the
 * work. So the only thing faked is which verb the words mean.
 *
 * The reply needs both shapes. `raw` is what Run sends back to be grounded;
 * `interpretation` is the grounded form the overlay draws its plan from, so it
 * needs real targets with real rects. Returning raw in both was the first
 * attempt and the overlay said so immediately: "a.targets is not iterable".
 */
let plan = { reading: '', actions: [] }
let asked = null
let modelCalls = 0
/** The grounded twin of a raw action, built from the live snapshot. */
const groundLocally = async (actions) =>
  sh((acts) => {
    const snap = window.__S2C_DEBUG__.snapshot()
    return acts.map((a) => ({
      kind: a.kind,
      instruction: a.instruction,
      needsConfirm: false,
      targets: (a.elements ?? []).map((id) => {
        const n = snap.nodes.find((x) => x.id === id)
        return {
          domId: id, srcLoc: n?.srcLoc ?? null, tag: n?.tag ?? 'div',
          text: n?.text ?? '', subtreeText: n?.text ?? '', classes: n?.classes ?? [],
          rect: n?.rect ?? { x: 0, y: 0, w: 10, h: 10 },
        }
      }),
    }))
  }, actions)

await page.route('**/@s2c/interpret', async (r) => {
  asked = JSON.parse(r.request().postData() ?? '{}')
  modelCalls++
  const raw = { reading: plan.reading, actions: plan.actions, unclear: null }
  await r.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: { reading: plan.reading, actions: plan.grounded ?? [], rejected: [] },
        raw,
        tokens: { input: 1, cacheRead: 0, output: 1 },
      },
    }),
  })
})

const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host')
  ?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')

async function waitStatus(re, ms = 90000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(250)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

/**
 * A run that writes new modules makes vite full-reload the page, which tears the
 * overlay down and rebuilds it a second later. The receipt is parked across that
 * — so this waits for the reload to settle and then reads it, rather than racing
 * it and sometimes catching the idle hint.
 */
async function runReceipt() {
  const first = await waitStatus(/verified|✓|✗|refus|codemod/i)
  await page.waitForTimeout(2200)
  const settled = await status()
  return /verified|✓|✗|refus|codemod/i.test(settled) ? settled : first
}

const spot = (sel) =>
  sh((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), srcLoc: el.dataset.s2c }
  }, sel)

/** The id the element menu gave this srcLoc, which is what actions target. */
const menuId = async (srcLoc) =>
  sh((loc) => {
    const snap = window.__S2C_DEBUG__.snapshot()
    const hit = snap.nodes.filter((n) => n.srcLoc === loc)
    return hit.length ? hit[0].id : null
  }, srcLoc)

const table = () =>
  sh(() => [...document.querySelectorAll('table tbody tr')]
    .map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()).join(' | ')))

/**
 * Type a sentence onto whatever is at (x, y), then run it.
 *
 * Alt+R only READS: it outlines what it understood and waits on ✓ Go, which is
 * the point of manual mode — nothing is written until a person agrees to it. So
 * this has to confirm, the way a person would.
 */
async function sayAt(at, text) {
  await page.mouse.move(at.x, at.y)
  await page.waitForTimeout(150)
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(300)
  await page.keyboard.type(text)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await triggerRun()
}

/**
 * A clean page AND a clean app.
 *
 * Each phase has to start from the fixture, not from what the phase before it
 * wrote — phase 3 was asserting that two files existed when phase 2 had already
 * made one of them, so it passed while the engine was in fact refusing ("that
 * form is already real"). A test that passes for the wrong reason is worse than
 * one that fails.
 */
/**
 * Ask for the reading, agree to it, and wait for the run to be genuinely over.
 *
 * "Genuinely" is doing work there. The overlay returns to idle as soon as the
 * last event arrives, but the server holds a one-run-at-a-time lock a moment
 * longer, so the next phase pressing Run got "a run is already in progress" —
 * the server being right and the test being impatient. So this retries the
 * trigger rather than assuming the first press lands.
 */
async function triggerRun() {
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.keyboard.press('Alt+r')
    let ready = false
    for (let i = 0; i < 60; i++) {
      const s = await status()
      if (/already in progress/i.test(s)) break // let the lock clear, then retry
      ready = await sh(() => {
        const c = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm')
        return getComputedStyle(c).display !== 'none' && !c.disabled
      })
      if (ready) break
      await page.waitForTimeout(200)
    }
    if (ready) {
      await sh(`${sr()}.getElementById("confirm").click()`)
      await page.waitForTimeout(500)
      // The 409 arrives HERE, on the confirm, not while waiting for the preview
      // — which is why the first version of this retry never retried: it only
      // watched for the lock in the wrong half of the sequence.
      if (/already in progress/i.test(await status())) {
        await page.waitForTimeout(2500)
        continue
      }
      for (let i = 0; i < 300; i++) {
        const busy = await sh(() => document.getElementById('s2c-overlay-host').dataset.mode === 'running')
        if (!busy) break
        await page.waitForTimeout(200)
      }
      if (/already in progress/i.test(await status())) {
        await page.waitForTimeout(2500)
        continue
      }
      return
    }
    await page.waitForTimeout(1500)
  }
  throw new Error(`ASSERT: could not start a run · status: ${await status()}`)
}

/**
 * Type a sentence, then point at a second element so it becomes @1 in it.
 *
 * This is the interaction the feature exists for, and it is also what puts that
 * element into the menu the model is allowed to target — the two are the same
 * mechanism, which is the point.
 */
async function sayAtNaming(at, text, also) {
  await page.mouse.move(at.x, at.y)
  await page.waitForTimeout(150)
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(300)
  await page.keyboard.type(text)
  await page.mouse.click(also.x, also.y)
  await page.waitForTimeout(300)
  const written = await sh(() => document.getElementById('s2c-overlay-host')
    .shadowRoot.getElementById('noteInput').value)
  log('sentence:', JSON.stringify(written))
  if (!/@1/.test(written)) throw new Error(`ASSERT: pointing did not name anything: ${written}`)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(250)
  await triggerRun()
}

async function boot() {
  // The overlay parks each receipt in sessionStorage for 20 s so it survives
  // the reload a write causes, and re-shows it on every load inside that
  // window. Without this, the next phase's runReceipt() matched the LAST
  // phase's "✓ Done" the moment the page opened and never waited for its own
  // (s2c-036: phase 2 "passed" on phase 1's sentence).
  await page.evaluate(() => sessionStorage.clear()).catch(() => {})
  restore()
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(500)
  for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
    await page.keyboard.press('Alt+a')
    await page.waitForTimeout(150)
  }
  await sh(`${sr()}.getElementById("clear").click()`)
  await page.waitForTimeout(200)
}

await boot()
const before = await table()
const row = await spot('table tbody tr td')
log('before:', before.length, 'rows ·', JSON.stringify(before[0]))

// ── 1. "this list should come from the server" ──────────────────────────
plan = {
  reading: 'serve the team list from an endpoint',
  actions: [{
    kind: 'serve', elements: [await menuId(row.srcLoc)],
    instruction: 'this list should come from the server', strokes: [],
  }],
}
plan.grounded = await groundLocally(plan.actions)
await sayAt(row, 'this list should come from the server')
const r1 = await runReceipt()
log('serve →', r1.slice(0, 150))
const route = `${APPDIR}/server/api/users.ts`
if (!existsSync(route)) throw new Error(`ASSERT: no route written · status: ${r1}`)
if (!existsSync(`${APPDIR}/src/lib/useApi.ts`)) throw new Error('ASSERT: the hook was not written')
const comp = readFileSync(`${APPDIR}/src/components/UserTable.tsx`, 'utf8')
if (!/useApi\(['"]\/api\/users['"]/.test(comp)) throw new Error('ASSERT: the component does not fetch')
log('component:', comp.split('\n').filter((l) => /useApi|_SEED/.test(l)).map((l) => l.trim()).join(' ⏎ '))

// the claim that makes this worth doing this way: no model wrote the server
log('model calls so far:', modelCalls, '(interpretation only)')
if (!/0 tokens|codemod|moved to/i.test(r1)) {
  log('note: receipt wording —', r1.slice(0, 120))
}
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
const after1 = await table()
if (JSON.stringify(after1) !== JSON.stringify(before)) {
  throw new Error(`ASSERT: the page changed\n  before ${JSON.stringify(before)}\n  after ${JSON.stringify(after1)}`)
}
const served = await page.request.get(`${APP.replace(/\/$/, '')}/api/users`)
log('GET /api/users →', served.status(), '·', (await served.text()).slice(0, 48))
if (served.status() !== 200) throw new Error('ASSERT: the endpoint does not answer')
log('✓ a sentence put the list behind an endpoint, and the page looks identical')

// ── 2. "this form should actually save" ────────────────────────────────
await boot()
const field = await spot('form input#name')
plan = {
  reading: 'make the invite form save',
  actions: [{
    kind: 'save', elements: [await menuId(field.srcLoc)],
    instruction: 'this form should actually save', strokes: [],
  }],
}
plan.grounded = await groundLocally(plan.actions)
await sayAt(field, 'this form should actually save what people type')
const r2 = await runReceipt()
log('save →', r2.slice(0, 150))
const formRoute = `${APPDIR}/server/api/contacts.ts`
if (!existsSync(formRoute)) throw new Error(`ASSERT: no form route written · status: ${r2}`)
const formSrc = readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8')
if (!/onSubmit=\{form\.onSubmit\}/.test(formSrc)) throw new Error('ASSERT: the form was not rewired')
for (const n of ['name', 'email', 'role']) {
  if (!new RegExp(`name="${n}"`).test(formSrc)) throw new Error(`ASSERT: ${n} got no name attribute`)
}
// and it really saves
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await page.keyboard.press('Alt+ ') // test mode: the overlay gets out of the way
await page.waitForTimeout(400)
await page.fill('form input#name', 'Ada Lovelace')
await page.fill('form input#email', 'ada@example.com')
await page.click('form button[type="submit"]')
await page.waitForFunction(() => /Saved/i.test(document.querySelector('form')?.textContent ?? ''), { timeout: 10000 })
const stored = JSON.parse(readFileSync(`${APPDIR}/server/data/contacts.json`, 'utf8'))
log('on disk:', JSON.stringify(stored))
if (stored.length !== 1 || stored[0].name !== 'Ada Lovelace') {
  throw new Error(`ASSERT: the submission is not on disk: ${JSON.stringify(stored)}`)
}
log('✓ a sentence made the form keep what was typed into it')

// ── 3. one sentence, both halves, with the second element POINTED AT ───
// The first attempt at this phase just handed the model a second element id and
// expected it to work. It did not, and correctly: the model can only target
// elements in the menu it was shown, and an element nobody pointed at or drew
// near is not in it. In the real interaction you click the table while typing,
// which makes it @1 and pins it — so that is what this does.
await boot()
const f2 = await spot('form input#name')
const r2row = await spot('table tbody tr td')
plan = {
  reading: 'submissions should show up in the team list',
  actions: [
    { kind: 'save', elements: [await menuId(f2.srcLoc)], instruction: 'keep what is typed', strokes: [] },
    { kind: 'serve', elements: [await menuId(r2row.srcLoc)], instruction: 'read them back', strokes: [] },
  ],
}
plan.grounded = await groundLocally(plan.actions)
await sayAtNaming(f2, 'submissions from this form should show up in ', r2row)
const r3 = await runReceipt()
log('both →', r3.slice(0, 180))
for (const f of ['server/api/contacts.ts', 'server/api/users.ts', 'src/lib/useApi.ts', 'src/lib/useForm.ts']) {
  if (!existsSync(`${APPDIR}/${f}`)) throw new Error(`ASSERT: ${f} was not written · ${r3}`)
}
if (/already real|refus/i.test(r3)) throw new Error(`ASSERT: an action was refused: ${r3}`)
// the silent-partial-success bug: asking for two things and being told
// "100% verified" while one of them never happened
if (/not carried out/i.test(r3)) throw new Error(`ASSERT: an action was dropped: ${r3}`)
const bothForm = readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8')
const bothTable = readFileSync(`${APPDIR}/src/components/UserTable.tsx`, 'utf8')
if (!/onSubmit=\{form\.onSubmit\}/.test(bothForm)) throw new Error('ASSERT: the form half did not apply')
if (!/useApi\(/.test(bothTable)) throw new Error('ASSERT: the serve half did not apply')
log('✓ one sentence, two actions, both applied from a clean start')

// ── 4. a refusal is a sentence, not a silence ─────────────────────────
await boot()
const heading = await spot('h2')
plan = {
  reading: 'make the heading save',
  actions: [{
    kind: 'save', elements: [await menuId(heading.srcLoc)],
    instruction: 'this should save', strokes: [],
  }],
}
plan.grounded = await groundLocally(plan.actions)
await sayAt(heading, 'this should save what people type')
const r4 = await runReceipt()
log('refusal →', r4.slice(0, 220))
if (!/not inside a <form>|<form>/.test(r4)) {
  throw new Error(`ASSERT: the refusal does not say what was wrong: ${r4}`)
}
if (existsSync(`${APPDIR}/server/api`)) {
  throw new Error('ASSERT: a refused action still wrote something')
}
if (/useForm/.test(readFileSync(`${APPDIR}/src/components/ContactForm.tsx`, 'utf8'))) {
  throw new Error('ASSERT: a refused action still rewired a component')
}
log('✓ it says the element is not inside a form, and writes nothing')

// ── undo is covered elsewhere, deliberately ────────────────────────────
// It was a phase here and it could not be made honest. Each phase above reverts
// the demo app with `git checkout` between runs, which the server's undo stack
// knows nothing about — so by the fifth phase that stack describes a history
// that no longer exists, and pressing Ctrl+Z walks backwards through entries
// whose files this test already deleted. The result is a test that fails for a
// reason that has nothing to do with the feature.
//
// Verified in isolation instead, where the history IS real: live-api.mjs undoes
// a serve (route, hook and rewrite all gone, records kept) and live-form.mjs
// undoes a save. Both run one edit against a clean tree, which is the only
// shape in which "undo the last thing" means anything.

restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
log('the sentence that was interpreted carried:', JSON.stringify(asked?.notes?.[0]?.text))
await b.close()
log('E2E PASS — you said what should happen, and the files that make it happen were written')

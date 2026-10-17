/**
 * Live e2e: a MISREAD run, said in plain words, with a one-click Undo.
 *
 * SEED done #4: every misread sketch produces a plain-language explanation and
 * a one-click undo. Zero model calls: the edit is a real deterministic write
 * (the props endpoint, which checkpoints and pushes the undo stack exactly as
 * a run does), and the run's outcome is fed to the overlay through the debug
 * hook with sentences built by the REAL @s2c/pipeline explain builder from
 * real verifier strings. Asserts:
 *   1. a partial miss opens the card: the sentence is plain (no ids, paths,
 *      action numbers, git), names what was understood and what didn't happen
 *   2. the card survives the full reload a run that creates a file causes
 *   3. one click on Undo puts App.tsx back byte for byte and closes the card
 *   4. a run that changed nothing says so, and offers no Undo
 *   5. a clean run shows no card
 *   6. starting the next run clears a stale card, and ▶ Run inside the auto
 *      countdown is the only reading sent (no second one when the countdown ends)
 *
 * Boot first: cd examples/demo-app && npx vite --port 5215
 * Run FROM THE REPO ROOT: node tests/e2e/live-misread.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { explainError, explainRun, isPlain } from '../../packages/pipeline/dist/index.js'

const APP = process.env.S2C_APP ?? 'http://localhost:5215/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const APPTSX = `${REPO_ROOT}examples/demo-app/src/App.tsx`
const log = (...a) => console.log('[e2e-misread]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }

restore()
const APP_BEFORE = readFileSync(APPTSX, 'utf8')
if (!APP_BEFORE.includes('seats={12}')) fail('fixture drift: App.tsx has no seats={12}')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const sh = (fn, arg) => page.evaluate(fn, arg)
const card = () => sh(() => window.__S2C_DEBUG__.misread())
const status = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const boot = async () => {
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForTimeout(300)
}
const clickIn = (id) =>
  sh((i) => document.getElementById('s2c-overlay-host').shadowRoot.getElementById(i).click(), id)

try {
  await page.goto(APP, { waitUntil: 'networkidle' })
  await boot()

  // ── a real, undoable write: Team seats 12 → 30 ─────────────────────────
  const wrote = await sh(async () => {
    const post = (url, body) => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': window.__S2C_TOKEN__ },
      body: JSON.stringify(body),
    }).then((r) => r.json())
    const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'Team')
    const stamp = h.closest('section').querySelector('p').dataset.s2c
    const read = await post('/@s2c/props/read', { srcLoc: stamp })
    const site = (read.callSites ?? []).find((c) => String(c.values?.title ?? '').includes('Team'))
    if (!site) return { ok: false, error: `no Team call site: ${JSON.stringify(read).slice(0, 200)}` }
    return post('/@s2c/props/set', { callSite: site.loc, name: 'seats', value: 30 })
  })
  if (!wrote.ok) fail(`props write failed: ${wrote.error}`)
  if (!readFileSync(APPTSX, 'utf8').includes('seats={30}')) fail('App.tsx was not written')
  log('wrote:', wrote.change)
  await page.waitForTimeout(800)

  // ── 1. a partial miss, explained by the real builder ───────────────────
  const T = (tag, text) => ({ domId: 'e7', srcLoc: 'src/App.tsx:40:9', tag, text, subtreeText: text, classes: [], rect: { x: 0, y: 0, w: 1, h: 1 } })
  const ex = explainRun({
    reading: 'Make the Team plan 30 seats and move the user table (e31) above it',
    actions: [
      { kind: 'modify', targets: [T('p', '12 seats included')], instruction: '', needsConfirm: false },
      { kind: 'move', targets: [T('section', 'Team members')], instruction: '', needsConfirm: false },
    ],
    failures: ['action 1 (MOVE): source not inside dest'],
    files: ['src/App.tsx'],
  })
  log('sentence:', ex.sentence)
  if (!ex.problem || !ex.undoable || !isPlain(ex.sentence)) fail(`builder output wrong: ${JSON.stringify(ex)}`)
  await sh((d) => window.__S2C_DEBUG__.runDone(d), {
    summary: '[v2] 50% verified · 1 file(s) · revert: git restore --source=abc -- <paths>', explanation: ex,
  })
  let c = await card()
  if (!c.open) fail('the card did not open on a partial miss')
  if (c.text !== ex.sentence) fail(`card text differs: ${c.text}`)
  if (!/I read your sketch as: .*But I couldn't move the section with "Team members"/.test(c.text)) fail('sentence missing its parts')
  if (/e31|App\.tsx|action \d|git/.test(c.text)) fail(`jargon on the card: ${c.text}`)
  if (!c.undo) fail('no Undo on an undoable miss')
  await page.screenshot({ path: '/tmp/s2c-misread-card.png' })
  log('1 ok: card open, plain, Undo offered')

  // ── 2. it survives the reload ──────────────────────────────────────────
  await page.reload({ waitUntil: 'networkidle' })
  await boot()
  c = await card()
  if (!c.open || c.text !== ex.sentence) fail('the card did not survive the reload')
  log('2 ok: card back after reload')

  // ── 3. one click undoes it ─────────────────────────────────────────────
  await clickIn('misreadUndo')
  const deadline = Date.now() + 10000
  while (Date.now() < deadline && readFileSync(APPTSX, 'utf8') !== APP_BEFORE) await page.waitForTimeout(150)
  if (readFileSync(APPTSX, 'utf8') !== APP_BEFORE) fail('Undo did not restore App.tsx')
  c = await card()
  if (c.open) fail('the card stayed open after Undo')
  await page.waitForFunction(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent.startsWith('↩'),
    { timeout: 10000 },
  ).catch(() => {})
  log('3 ok: App.tsx restored byte for byte · status:', (await status()).slice(0, 60))

  // ── 4. nothing changed: no Undo ───────────────────────────────────────
  const none = explainError('no valid actions (rejected: unknown element id "e99")', false)
  await sh((d) => window.__S2C_DEBUG__.runError(d), { message: 'no valid actions (rejected: unknown element id "e99")', explanation: none })
  c = await card()
  if (!c.open || c.undo) fail(`error card wrong: ${JSON.stringify(c)}`)
  if (/e99|rejected/.test(c.text) || /e99|rejected/.test(await status())) fail('raw error leaked')
  log('4 ok:', c.text)
  await clickIn('misreadKeep')
  if ((await card()).open) fail('OK did not close the card')

  // ── 5. a clean run: no card ────────────────────────────────────────────
  await sh((d) => window.__S2C_DEBUG__.runDone(d), {
    summary: 'ok', explanation: { problem: false, sentence: 'Done: removed the card.', undoable: true },
  })
  if ((await card()).open) fail('a clean run opened the card')
  log('5 ok: clean run, no card')

  // ── 6. the next run clears a stale card, and is the only run ──────────
  // The page opens with the pen on (s2c-010 audit), so there is no Alt+D
  // here: pressing it PAUSED drawing, the stroke never landed, ▶ Run stayed
  // disabled and the click did nothing. That is why this step was red
  // (s2c-033). The stroke is asserted now, so that can't hide again.
  await sh((d) => window.__S2C_DEBUG__.runError(d), { message: 'x', explanation: explainError('boom', false) })
  if (!(await card()).open) fail('card did not open for 6')
  let readings = 0
  let renders = 0
  await page.route('**/@s2c/interpret', (r) => {
    readings++
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"error":"stubbed"}' })
  })
  // the instant render writes source on success: decline it, and count it
  await page.route('**/@s2c/instant', (r) => {
    renders++
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":false,"reason":"stubbed"}' })
  })
  await page.mouse.move(300, 300); await page.mouse.down(); await page.mouse.move(400, 360, { steps: 6 }); await page.mouse.up()
  await page.waitForTimeout(200)
  const inked = await sh(() => window.__S2C_DEBUG__.strokes().length)
  if (inked !== 1) fail(`the stroke did not land (${inked} strokes): is the pen on at load?`)
  if (!(await card()).open) fail('drawing alone closed the card (only a run should)')
  // ▶ Run INSIDE the auto settle window: the run must replace the countdown
  const pending = await sh(() => window.__S2C_DEBUG__.auto?.().pending)
  await clickIn('run')
  await page.waitForTimeout(400)
  if ((await card()).open) fail('starting a run left the old card up')
  // the stubbed reading fails at once; wait out the whole settle window to
  // see whether the countdown fires a second, paid, reading of the same ink
  await page.waitForTimeout(1500)
  if (readings !== 1 || renders > 1) {
    fail(`one ▶ Run sent ${readings} reading(s) and ${renders} instant render(s) (countdown was ${pending ? 'pending' : 'idle'})`)
  }
  if (/auto-run in/.test(await status())) fail(`a countdown is still on the line: ${await status()}`)
  log(`6 ok: a new run clears it · 1 reading, countdown ${pending ? 'was pending and was dropped' : 'idle'}`)

  if (errs.length) fail(`page errors: ${errs.join(' | ')}`)
  log('ALL OK')
} finally {
  await b.close()
  restore()
}

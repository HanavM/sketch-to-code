/**
 * Live e2e: AUTO MODE — you draw, you lift the pen, and the sketch turns
 * itself into code.
 *
 * Zero model calls: /@s2c/interpret and /@s2c/run are both stubbed with
 * page.route, so nothing is spent and the demo app's source is never touched.
 * The stubs answer SLOWLY on purpose (250ms / 150ms) — the phases this feature
 * has to report are only observable if they last longer than a frame — and the
 * interpret stub is built FROM LIVE ELEMENT RECTS, so the destructive variant
 * is a real grounded interpretation rather than a shape of its own invention.
 *
 * Asserts:
 *   1. a fresh profile has it OFF, and OFF fires nothing however long you wait
 *   2. Alt+A toggles it, the toolbar shows on/off without changing width, and
 *      the ? overlay lists the binding (it is rendered from the same table)
 *   3. THE FIRING RULE: a three-stroke drawing fires ONCE, after the settle
 *      period, not once per stroke — and the countdown paints in the status
 *      line while the HUD box does not move a pixel
 *   4. any new stroke restarts the wait
 *   5. Esc cancels the pending run and does NOT fall through the Escape ladder
 *      (draw mode and the ink survive), and nothing runs afterwards
 *   6. it never fires while the note editor is open, while a panel is open, or
 *      outside draw mode
 *   7. the single-run lock: a second stroke during an in-flight interpret does
 *      not start a second run
 *   8. a destructive reading (needsConfirm) falls back to the normal preview
 *      gate and says why — auto mode may write code, not destroy things
 *   9. the toggle persists under 's2c:auto', and garbage in storage means OFF
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp/s2c-auto-shots'
const log = (...a) => console.log('[e2e-auto]', ...a)
/** The settle period the overlay ships with (AUTO_SETTLE_MS). */
const SETTLE = 900

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
// Hold on to the overlay's own EventSource so a run can be COMPLETED here:
// the server's 'done' event is what ends a run, and without it every step
// after the first would be blocked by a run that never finished.
await page.addInitScript(() => {
  const Real = globalThis.EventSource
  globalThis.EventSource = class extends Real {
    constructor(url, init) {
      super(url, init)
      if (String(url).includes('@s2c/events')) globalThis.__S2C_SSE__ = this
    }
  }
})
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}
mkdirSync(SHOTS, { recursive: true })

const sr = () => 'document.getElementById("s2c-overlay-host").shadowRoot'
const click = (id) => page.evaluate(`${sr()}.getElementById(${JSON.stringify(id)}).click()`)
const status = () => page.evaluate(`${sr()}.getElementById("status").textContent`)
const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
const auto = () => page.evaluate(() => window.__S2C_DEBUG__.auto())
const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(60) }

/** Everything the toolbar is showing about auto mode, plus the bar's own box. */
const ui = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const btn = s.getElementById('autoBtn')
    const br = btn.getBoundingClientRect()
    const hr = s.getElementById('hud').getBoundingClientRect()
    const cs = getComputedStyle(btn)
    return {
      word: s.getElementById('autoState').textContent,
      on: btn.classList.contains('on'),
      pressed: btn.getAttribute('aria-pressed'),
      title: btn.title,
      bg: cs.backgroundColor,
      btnBox: { x: br.left, y: br.top, w: br.width, h: br.height },
      hud: { x: hr.left, y: hr.top, w: hr.width, h: hr.height },
      stored: localStorage.getItem('s2c:auto'),
      // a rect is not proof of paint: hit-test the middle of the button
      hitIsOverlay:
        document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2)?.id === 's2c-overlay-host',
    }
  })

/**
 * Record every change to the status line, WITH the HUD's box at that instant.
 * The countdown rewrites itself ten times a second and the bar is
 * width:max-content — this is what proves the ticking never moved it.
 */
const watchStatus = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const st = s.getElementById('status')
    const hud = s.getElementById('hud')
    globalThis.__LOG__ = []
    const push = () => {
      const r = hud.getBoundingClientRect()
      globalThis.__LOG__.push({ t: Date.now(), text: st.textContent, x: r.left, y: r.top, w: r.width })
    }
    push()
    globalThis.__OBS__?.disconnect()
    globalThis.__OBS__ = new MutationObserver(push)
    globalThis.__OBS__.observe(st, { childList: true, characterData: true, subtree: true })
  })
const statusLog = () => page.evaluate(() => globalThis.__LOG__)

// ---- three real elements, so the stubbed reading is a real reading -------
const picked = await page.evaluate(() => {
  const pageRect = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
  }
  const chosen = []
  for (const el of document.querySelectorAll('[data-s2c]')) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
    if (!(el.textContent ?? '').trim()) continue
    const r = el.getBoundingClientRect()
    const a = r.width * r.height
    if (a < 3000 || a > 90000 || r.top < 40 || r.top > 600 || r.width < 80 || r.height < 30) continue
    if (chosen.some((c) => c.contains(el) || el.contains(c))) continue
    chosen.push(el)
    if (chosen.length === 3) break
  }
  if (chosen.length < 3) throw new Error(`only found ${chosen.length} disjoint elements`)
  return chosen.map((el, i) => ({
    domId: `e${i + 1}`,
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30),
    srcLoc: el.getAttribute('data-s2c'),
    rect: pageRect(el),
  }))
})
const target = (p) => ({
  domId: p.domId, srcLoc: p.srcLoc, tag: p.tag, text: p.text, subtreeText: p.text, classes: [], rect: p.rect,
})
log('targets:', picked.map((p) => `${p.domId}=<${p.tag}>`).join(' · '))

/** The ordinary reading: one recolour, nothing destroyed. */
const SAFE = {
  reading: 'Make the circled card red.',
  unclear: null,
  rejected: [],
  actions: [{
    kind: 'modify',
    targets: [target(picked[0])],
    instruction: 'make this card red',
    color: { drawn: '#e11d48', nearest: { token: 'bg-rose-600', css: '#e11d48' }, distance: 2.4 },
    needsConfirm: false,
  }],
}
/** The same drawing read as a wide delete — the server's own destructive gate
 *  (groundInterpretation: ≥3 targets, or >35% of the viewport) has fired. */
const DESTRUCTIVE = {
  reading: 'Delete the three scribbled-out cards.',
  unclear: null,
  rejected: [],
  actions: [{
    kind: 'delete',
    targets: picked.map(target),
    instruction: 'remove all three scribbled-out cards',
    needsConfirm: true,
  }],
}

let interprets = []
let runs = []
let reading = SAFE
let interpretMs = 250
await page.route('**/@s2c/interpret', async (route) => {
  interprets.push(Date.now())
  // slow on purpose: 'reading your drawing…' has to be observable, and step 7
  // needs a window in which a run is genuinely in flight
  await new Promise((r) => setTimeout(r, interpretMs))
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: reading,
        raw: { reading: reading.reading, actions: [], unclear: null },
        tokens: { input: 3100, cacheRead: 0, output: 260 },
      },
    }),
  })
})
await page.route('**/@s2c/run', async (route) => {
  runs.push(JSON.parse(route.request().postData() ?? '{}'))
  await new Promise((r) => setTimeout(r, 150))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
})

// ---- helpers over the overlay -------------------------------------------
const ensureDraw = async () => { if ((await mode()) !== 'draw') await press('Alt+KeyD') }
const setAuto = async (on) => { if ((await auto()).on !== on) await press('Alt+KeyA') }

/** One scribble, over the given target, in the CURRENT mode. */
async function stroke(i = 0, dx = 0) {
  const t = picked[i].rect
  const x = t.x + 16 + dx
  const y = t.y + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let k = 1; k <= 6; k++) await page.mouse.move(x + k * 9, y + (k % 2 ? 11 : -11), { steps: 2 })
  await page.mouse.up()
}

/** Finish whatever run is open, the way the server would. */
async function finishRun(summary = 'wrote 1 file') {
  await page.evaluate((s) => {
    globalThis.__S2C_SSE__.dispatchEvent(new MessageEvent('done', { data: JSON.stringify({ summary: s }) }))
  }, summary)
  await page.waitForTimeout(80)
}

/** Back to a blank, quiet slate — auto off, nothing open, no ink. */
async function reset() {
  await setAuto(false)
  await press('Escape')
  if ((await mode()) === 'preview') await press('Escape')
  await ensureDraw()
  await page.evaluate(`${sr()}.getElementById("clear").click()`)
  interprets = []
  runs = []
  reading = SAFE
  interpretMs = 250
}

const waitFor = async (fn, ms = 4000, what = 'condition') => {
  for (let i = 0; i < ms / 50; i++) {
    if (await fn()) return
    await page.waitForTimeout(50)
  }
  throw new Error(`timed out waiting for ${what} · status: ${await status()}`)
}

// ---- 1. a fresh profile is OFF, and OFF means OFF -----------------------
await page.evaluate(() => {
  for (const k of ['s2c:auto', 's2c:hud', 's2c:fidelity', 's2c:candidates', 's2c:pen']) localStorage.removeItem(k)
})
await page.reload({ waitUntil: 'networkidle' })

let u = await ui()
if ((await auto()).on) throw new Error('auto mode is ON on a fresh profile')
if (u.word !== 'off') throw new Error(`toggle reads ${JSON.stringify(u.word)}, want 'off'`)
if (u.pressed !== 'false') throw new Error(`aria-pressed is ${u.pressed} on a fresh profile`)
if (u.on) throw new Error('the toggle is painted as on while the state is off')
if (!u.hitIsOverlay) throw new Error('#autoBtn reports a box but nothing is hit-testable there')
if (u.btnBox.w < 30 || u.btnBox.h < 16) throw new Error(`#autoBtn is not painted: ${JSON.stringify(u.btnBox)}`)
if (!/without a click/.test(u.title)) throw new Error(`the OFF tooltip does not say why it is off: ${u.title}`)
if (u.hud.w > 900) throw new Error(`HUD is no longer a compact pill: ${Math.round(u.hud.w)}px`)
const offBox = u.btnBox
await page.screenshot({
  path: `${SHOTS}/toggle-off.png`,
  clip: { x: Math.round(u.hud.x - 8), y: Math.round(u.hud.y - 8), width: Math.round(u.hud.w + 16), height: Math.round(u.hud.h + 16) },
})

await ensureDraw()
await stroke(0)
await page.waitForTimeout(SETTLE * 2)
if (interprets.length) throw new Error(`auto mode fired while OFF (${interprets.length} interpret calls)`)
log('✓ fresh profile: off · nothing fired after', SETTLE * 2, 'ms of stillness · pill', Math.round(u.hud.w), 'px')
await page.evaluate(`${sr()}.getElementById("clear").click()`)

// ---- 2. Alt+A, the toolbar state, and the ? overlay --------------------
await press('Alt+KeyA')
u = await ui()
if (!(await auto()).on) throw new Error('Alt+A did not turn auto mode on')
if (u.word !== 'on') throw new Error(`toggle reads ${JSON.stringify(u.word)} after Alt+A`)
if (u.pressed !== 'true') throw new Error('aria-pressed did not follow the state')
if (!u.on) throw new Error('the toggle is not painted as on')
if (!/rgba?\(37, 99, 235/.test(u.bg)) throw new Error(`the ON state has no colour of its own: ${u.bg}`)
if (u.stored !== 'true') throw new Error(`s2c:auto is ${u.stored}, want 'true'`)
if (Math.abs(u.btnBox.w - offBox.w) > 0.5) {
  throw new Error(`the toggle resized when it flipped: ${offBox.w} → ${u.btnBox.w}`)
}
let st = await status()
if (!/auto mode on/.test(st)) throw new Error(`Alt+A said nothing useful: ${st}`)
if (!/0\.9s/.test(st)) throw new Error(`the ON message never names the settle period: ${st}`)
await page.screenshot({
  path: `${SHOTS}/toggle-on.png`,
  clip: { x: Math.round(u.hud.x - 8), y: Math.round(u.hud.y - 8), width: Math.round(u.hud.w + 16), height: Math.round(u.hud.h + 16) },
})

const bind = (await page.evaluate(() => window.__S2C_DEBUG__.keymap())).find((k) => k.id === 'auto')
if (!bind) throw new Error('auto mode is not in the keymap table, so ? cannot list it')
if (bind.keys !== 'Alt+A') throw new Error(`auto is bound to ${bind.keys}`)
await press('?')
const row = await page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  const r = s.querySelector('#help .hRow[data-bind="auto"]')
  if (!r) return null
  const box = r.getBoundingClientRect()
  return { keys: r.querySelector('.hKeys').textContent, label: r.querySelector('.hLabel').textContent, h: box.height, w: box.width }
})
if (!row) throw new Error('the ? overlay does not list auto mode')
if (row.keys !== bind.keys || row.label !== bind.label) throw new Error(`the help row drifted: ${JSON.stringify(row)}`)
if (row.h < 12 || row.w < 100) throw new Error(`the help row is not painted: ${JSON.stringify(row)}`)
await press('?')
log('✓ Alt+A on/off · same width · listed in ? as', JSON.stringify(`${row.keys}  ${row.label}`))

// ---- 3. THE FIRING RULE: once, after the settle, HUD immobile -----------
await reset()
await setAuto(true)
await ensureDraw()
await watchStatus()
await stroke(0, 0)
await stroke(0, 40)
await stroke(1, 0)
const lastUp = Date.now()
if (interprets.length) throw new Error('fired before the drawing had even settled')
// half a settle in, still nothing — the pen coming up is NOT the trigger
await page.waitForTimeout(SETTLE / 2)
if (interprets.length) throw new Error(`fired ${interprets.length}× mid-settle, i.e. per stroke`)
await waitFor(async () => interprets.length > 0, 4000, 'the auto-run to fire')
const delay = interprets[0] - lastUp
if (interprets.length !== 1) throw new Error(`three strokes fired ${interprets.length} runs, want exactly 1`)
if (delay < SETTLE * 0.8) throw new Error(`fired after only ${delay}ms — the settle period is not being honoured`)
if (delay > SETTLE * 2.5) throw new Error(`fired ${delay}ms after the last stroke — far too late`)

const ticks = (await statusLog()).filter((e) => /auto-run in \d\.\ds/.test(e.text))
const nums = [...new Set(ticks.map((e) => e.text.match(/(\d\.\d)s/)[1]))]
if (nums.length < 4) throw new Error(`the countdown barely ticked: ${JSON.stringify(nums)}`)
if (!ticks.every((e) => /Esc to cancel/.test(e.text))) throw new Error('the countdown does not offer Esc')
const moved = ticks.filter((e) => Math.abs(e.x - ticks[0].x) > 0.5 || Math.abs(e.w - ticks[0].w) > 0.5)
if (moved.length) {
  throw new Error(`the HUD moved while the countdown ticked: ${JSON.stringify([ticks[0], moved[0]])}`)
}
// phases: settling → reading → running → done
const timeline = (await statusLog()).map((e) => e.text)
if (!timeline.some((t) => /reading your drawing/.test(t))) throw new Error(`no 'reading' phase: ${JSON.stringify(timeline)}`)
await waitFor(async () => runs.length > 0, 4000, 'the run to be posted')
if (runs.length !== 1) throw new Error(`${runs.length} runs posted for one drawing`)
if ((runs[0].strokes ?? []).length !== 3) throw new Error(`the run carried ${runs[0].strokes?.length} strokes, want 3`)
if (!runs[0].fidelity || runs[0].candidates !== 1) throw new Error('the auto-run payload lost fidelity/candidates')
await waitFor(async () => /running/.test(await status()), 3000, "the 'running' phase")
if ((await mode()) !== 'running') throw new Error(`mode is ${await mode()} with a run in flight`)
await finishRun('auto: wrote Card.tsx')
if (!/auto: wrote Card\.tsx/.test(await status())) throw new Error(`the done phase never landed: ${await status()}`)
log('✓ 3 strokes → 1 run, ' + delay + 'ms after the last one · countdown ticked', nums.join(' → '), '· HUD immobile')

// ---- 3b. the countdown, painted -----------------------------------------
await reset()
await setAuto(true)
await ensureDraw()
await stroke(0)
await waitFor(async () => /auto-run in/.test(await status()), 2000, 'the countdown')
const cd = await ui()
await page.screenshot({
  path: `${SHOTS}/countdown.png`,
  clip: { x: Math.round(cd.hud.x - 8), y: Math.round(cd.hud.y - 8), width: Math.round(cd.hud.w + 16), height: Math.round(cd.hud.h + 16) },
})
log('✓ countdown screenshot:', JSON.stringify(await status()))
await press('Escape')

// ---- 4. any new stroke restarts the wait --------------------------------
await reset()
await setAuto(true)
await ensureDraw()
await stroke(0)
const firstUp = Date.now()
await page.waitForTimeout(SETTLE * 0.55)
await stroke(0, 50)
await page.waitForTimeout(SETTLE * 0.55)
if (interprets.length) throw new Error('the second stroke did not restart the wait — it fired mid-drawing')
await waitFor(async () => interprets.length > 0, 4000, 'the restarted wait to fire')
const total = interprets[0] - firstUp
if (total < SETTLE * 1.3) throw new Error(`fired ${total}ms after the FIRST stroke — the wait was never restarted`)
if (interprets.length !== 1) throw new Error(`${interprets.length} runs for a restarted wait`)
await waitFor(async () => runs.length > 0, 4000, 'the run')
await finishRun()
log('✓ a new stroke restarts the wait ·', total, 'ms after the first stroke,', interprets[0] - (firstUp + SETTLE * 0.55), 'ms-ish after the second')

// ---- 5. Esc cancels, and does NOT fall through the ladder ---------------
await reset()
await setAuto(true)
await ensureDraw()
await stroke(0)
await waitFor(async () => (await auto()).pending, 2000, 'a pending run')
await press('Escape')
if ((await auto()).pending) throw new Error('Esc left the run pending')
st = await status()
if (!/cancel/i.test(st)) throw new Error(`Esc said nothing about cancelling: ${st}`)
if ((await mode()) !== 'draw') throw new Error(`Esc fell through the ladder and left draw mode (${await mode()})`)
const inkLeft = await page.evaluate(() => window.__S2C_DEBUG__.strokes().length)
if (inkLeft !== 1) throw new Error(`Esc took the ink with it (${inkLeft} strokes left)`)
await page.waitForTimeout(SETTLE * 2)
if (interprets.length) throw new Error('a cancelled run fired anyway')
log('✓ Esc cancels · still in draw mode · ink intact · nothing ran:', JSON.stringify(st))

// ---- 6. never while a note, a panel, or another mode is in the way ------
// (a) the note editor
await press('Alt+KeyN')
await page.waitForTimeout(SETTLE * 2)
if (interprets.length) throw new Error('auto mode fired with the note editor open')
if (!(await page.evaluate(`getComputedStyle(${sr()}.getElementById("noteBox")).display !== "none"`))) {
  throw new Error('the note editor never opened, so that proved nothing')
}
await setAuto(false) // so closing the note cannot resume the held wait mid-check
await press('Escape')
log('✓ a note being typed holds the run back')

// (b) a panel
await reset()
await setAuto(true)
await ensureDraw()
await stroke(0)
await press('Alt+KeyF')
if (!(await page.evaluate(`getComputedStyle(${sr()}.getElementById("fidelityPanel")).display !== "none"`))) {
  throw new Error('the fidelity panel never opened')
}
await page.waitForTimeout(SETTLE * 2)
if (interprets.length) throw new Error('auto mode fired with the fidelity panel open')
await setAuto(false)
await press('Alt+KeyF')
log('✓ an open panel holds the run back (the user is adjusting settings, not finishing a drawing)')

// (c) outside draw mode
await reset()
await setAuto(true)
await ensureDraw()
await stroke(0)
await press('Alt+KeyD')
if ((await mode()) === 'draw') throw new Error('Alt+D did not leave draw mode')
await page.waitForTimeout(SETTLE * 2)
if (interprets.length) throw new Error('auto mode fired outside draw mode')
if ((await auto()).pending) throw new Error('leaving draw mode left a run pending')
log('✓ nothing fires outside draw mode')

// ---- 7. the single-run lock ---------------------------------------------
await reset()
await setAuto(true)
await ensureDraw()
interpretMs = 1400 // longer than the settle: a real in-flight window
await stroke(0)
await waitFor(async () => interprets.length === 1, 3000, 'the first interpret')
if (!(await auto()).busy) throw new Error('the run lock is not held during the interpret')
if ((await mode()) !== 'draw') throw new Error('mode changed before interpret answered, so the lock is untested here')
await stroke(0, 60) // a stroke DURING the in-flight interpret
await page.waitForTimeout(SETTLE * 2)
if (interprets.length !== 1) throw new Error(`${interprets.length} interprets — the lock let a second run in`)
if ((await auto()).pending) throw new Error('a countdown was scheduled while a run was in flight')
await waitFor(async () => runs.length > 0, 5000, 'the locked run to post')
if (runs.length !== 1) throw new Error(`${runs.length} runs posted`)
await finishRun()
interpretMs = 250
log('✓ one run at a time: a stroke during an in-flight interpret starts nothing')

// ---- 8. a destructive reading falls back to the preview gate ------------
await reset()
reading = DESTRUCTIVE
await setAuto(true)
await ensureDraw()
await stroke(0)
await waitFor(async () => (await mode()) === 'preview', 5000, 'the preview gate')
st = await status()
if (runs.length) throw new Error(`auto mode DELETED without asking (${runs.length} runs posted)`)
if (!/delete/i.test(st)) throw new Error(`the fallback does not say what it would have done: ${st}`)
if (!/\b3\b/.test(st)) throw new Error(`the fallback does not count the elements: ${st}`)
if (!/Go/.test(st)) throw new Error(`the fallback does not hand the user the gate: ${st}`)
const gate = await page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  return {
    confirm: s.getElementById('confirm').style.display !== 'none',
    cancel: s.getElementById('cancel').style.display !== 'none',
    plan: getComputedStyle(s.getElementById('plan')).display !== 'none',
    labels: s.querySelectorAll('.planLabel').length,
    err: s.getElementById('status').classList.contains('err'),
  }
})
if (!gate.confirm || !gate.cancel) throw new Error('the normal preview gate is not showing')
if (!gate.plan || gate.labels < 1) throw new Error('the plan was not painted for the user to check')
if (!gate.err) throw new Error('the stop is not flagged as something to look at')
await page.waitForTimeout(SETTLE * 2)
if (runs.length) throw new Error('the destructive run went ahead a moment later')
// and the gate still works by hand
await click('confirm')
await waitFor(async () => runs.length === 1, 4000, 'the hand-confirmed run')
await finishRun()
log('✓ destructive reading stops at the gate:', JSON.stringify(st))

// ---- 9. persistence ------------------------------------------------------
await reset()
await setAuto(true)
await page.reload({ waitUntil: 'networkidle' })
u = await ui()
if (!(await auto()).on || u.word !== 'on') throw new Error('the toggle did not survive a reload')
await page.evaluate(() => localStorage.setItem('s2c:auto', '"yes please"'))
await page.reload({ waitUntil: 'networkidle' })
if ((await auto()).on) throw new Error('garbage in s2c:auto turned auto mode ON')
if ((await ui()).word !== 'off') throw new Error('garbage in storage left the toggle claiming on')
await page.evaluate(() => localStorage.removeItem('s2c:auto'))
await page.reload({ waitUntil: 'networkidle' })
if ((await auto()).on) throw new Error('a missing key turned auto mode ON')
log('✓ persists under s2c:auto · garbage and absence both land on OFF')

await b.close()
log('ALL GOOD')

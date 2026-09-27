/**
 * Live e2e: DRAWN RULES — a line that stays and keeps checking itself.
 *
 * Every other gesture here is an instruction that happens once. A rule is
 * drawn once and then keeps being true, so the things worth proving live are
 * the ones a unit test cannot reach: that the line picks the elements the user
 * was pointing at, that the mark is actually PAINTED (a marker that computes
 * correctly and draws nothing is the bug this suite has shipped before), and
 * that an edit made in the editor turns it red without anyone asking.
 *
 * Phases, all zero-token:
 *   1. the two new bindings are listed, and Alt+Shift+R arms
 *   2. a line down the two form inputs' left edges → readings, the first of
 *      which is left-alignment BETWEEN THE INPUTS (not the <form> that shares
 *      their edge), each with what the page says right now
 *   3. number keys change the choice; Enter saves; the file on disk says so
 *   4. the mark is painted on the canvas, in green, where the edges are
 *   5. an EDITOR edit (ml-6 on one input) breaks it: red, numeric message,
 *      no keystroke involved — then restoring the file makes it hold again
 *   6. Alt+W hides holding rules and keeps showing broken ones
 *   7. refusals and cancels: a line over nothing, Esc while armed, Esc while
 *      a reading is pending
 *   8. ✕ forgets a rule, and the file forgets it too
 *
 * Boot first (port 5212 — 5199 belongs to the interactive session):
 *   cd examples/demo-app && npx vite --port 5212
 * Run FROM THE REPO ROOT: node tests/e2e/live-rules.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5212/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const FORM = `${REPO_ROOT}examples/demo-app/src/components/ContactForm.tsx`
const RULES = `${REPO_ROOT}examples/demo-app/.sketch2code/constraints.json`
const log = (...a) => console.log('[e2e-rules]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

restore()
// a leftover rules file from an earlier run would make every count wrong
if (existsSync(RULES)) rmSync(RULES)
const FORM_BEFORE = readFileSync(FORM, 'utf8')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const shadow = (fn, arg) => page.evaluate(fn, arg)
const status = () =>
  shadow(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const rules = () => shadow(() => window.__S2C_DEBUG__.rules())

async function waitFor(pred, what, ms = 12000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await rules()
    if (pred(last)) return last
    await page.waitForTimeout(200)
  }
  throw new Error(`ASSERT: timed out waiting for ${what} — last: ${JSON.stringify(last)}`)
}

async function waitStatus(re, ms = 12000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(150)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

/** Viewport rect of a live element, by CSS selector. */
const rectOf = (sel) =>
  shadow((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)

/**
 * Any pixel painted on the overlay canvas in this box, and its colour.
 *
 * The lesson that earned this: a marker whose geometry is right and whose
 * layer never renders passes every assertion about its numbers.
 */
const paintedIn = (box) =>
  shadow((b) => {
    const cv = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('canvas')
    const d = cv.getContext('2d').getImageData(
      Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h),
    ).data
    let hits = 0
    let sample = null
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 40) {
        hits++
        if (!sample) sample = [d[i], d[i + 1], d[i + 2]]
      }
    }
    return { hits, sample }
  }, box)

const drawLine = async (from, to) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  // several moves: one jump would be a click as far as the gesture is concerned
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / 6,
      from.y + ((to.y - from.y) * i) / 6,
    )
    await page.waitForTimeout(16)
  }
  await page.mouse.up()
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. the bindings exist and arm ──────────────────────────────────────────
const keymap = await shadow(() => window.__S2C_DEBUG__.keymap())
const ruleBind = keymap.find((k) => k.id === 'rule')
const watchBind = keymap.find((k) => k.id === 'watching')
if (!ruleBind || !watchBind) throw new Error('ASSERT: the rule bindings are not in the keymap')
log('keymap:', ruleBind.keys, '·', ruleBind.label)
log('keymap:', watchBind.keys, '·', watchBind.label)

const fresh = await rules()
if (fresh.saved.length !== 0) throw new Error(`ASSERT: started with rules: ${JSON.stringify(fresh.saved)}`)

await page.keyboard.press('Alt+Shift+R')
const armed = await rules()
if (!armed.armed) throw new Error('ASSERT: Alt+Shift+R did not arm the gesture')
log('armed:', await status())

// ── 2. a line down two inputs' left edges ─────────────────────────────────
const nameIn = await rectOf('#name')
const mailIn = await rectOf('#email')
log('inputs at x', Math.round(nameIn.x), '·', Math.round(nameIn.y), 'and', Math.round(mailIn.y))
await drawLine(
  { x: nameIn.x + 1, y: nameIn.y - 4 },
  { x: nameIn.x, y: mailIn.y + mailIn.h + 4 },
)
const proposed = await waitFor((r) => r.proposals.length > 0, 'readings')
log('head:', await shadow(() =>
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ruleWhat').textContent))
for (const [i, p] of proposed.proposals.entries()) log(`  ${i + 1}. ${p.desc} — ${p.reading}`)
if (proposed.proposals[0].kind !== 'aligned-left') {
  throw new Error(`ASSERT: a line down two left edges did not read as left-alignment: ${proposed.proposals[0].kind}`)
}
// the discriminating assertion: the <form> and both wrapper divs share that
// exact left edge, and a rule about them is not the rule anyone drew
const subjects = proposed.proposals[0].subjects
const tags = await shadow((ss) => ss.map((s) =>
  document.querySelector(`[data-s2c="${s}"]`)?.tagName.toLowerCase() ?? '?'), subjects)
log('subjects:', subjects.join(' + '), '→', tags.join(' + '))
if (tags.join(',') !== 'input,input') {
  throw new Error(`ASSERT: the rule is about ${tags.join(' + ')}, not the two inputs`)
}
if (proposed.proposals[0].reading !== 'holds right now') {
  throw new Error(`ASSERT: an alignment that holds was reported as ${proposed.proposals[0].reading}`)
}
if (!proposed.proposals.some((p) => p.kind === 'same-width')) {
  throw new Error('ASSERT: the alternatives a line cannot distinguish were not offered')
}

// ── 3. picking, then saving ───────────────────────────────────────────────
await page.keyboard.press('2')
const picked = await waitFor((r) => r.choice === 1, 'the second reading')
log('picked 2:', picked.proposals[1].desc)
await page.keyboard.press('1')
await waitFor((r) => r.choice === 0, 'back to the first reading')
await page.keyboard.press('Enter')
const saved = await waitFor((r) => r.saved.length === 1, 'the rule to be saved')
log('saved:', await status())
if (saved.saved[0].kind !== 'aligned-left') throw new Error('ASSERT: saved the wrong reading')
if (saved.saved[0].broken) throw new Error('ASSERT: a rule that holds was saved broken')
if (!saved.watching) throw new Error('ASSERT: saving a rule did not turn its marks on')
if (!existsSync(RULES)) throw new Error('ASSERT: nothing was written to .sketch2code/constraints.json')
const onDisk = JSON.parse(readFileSync(RULES, 'utf8'))
log('on disk:', JSON.stringify(onDisk[0]))
if (onDisk.length !== 1 || onDisk[0].kind !== 'aligned-left') {
  throw new Error(`ASSERT: the file does not hold the rule: ${JSON.stringify(onDisk)}`)
}

// ── 4. the mark is actually painted, and it is green ─────────────────────
const holding = await paintedIn({ x: nameIn.x - 3, y: nameIn.y, w: 7, h: mailIn.y - nameIn.y })
log('painted along the edge:', holding.hits, 'px · rgb', holding.sample)
if (holding.hits < 4) throw new Error('ASSERT: the rule mark computes but paints nothing')
if (!(holding.sample[1] > holding.sample[0] + 20)) {
  throw new Error(`ASSERT: a holding rule is not drawn green: rgb(${holding.sample})`)
}

// ── 5. an editor edit breaks it, with no keystroke at all ───────────────
const shifted = FORM_BEFORE.replace(
  `            id="email"`,
  `            id="email"\n            style={{ marginLeft: 24 }}`,
)
if (shifted === FORM_BEFORE) throw new Error('fixture drift: the email input is not where this test edits')
execSync(`cat > ${JSON.stringify(FORM)}`, { input: shifted })
log('edited ContactForm.tsx in the "editor" — nothing pressed in the page')
const broke = await waitFor((r) => r.saved[0]?.broken, 'the rule to notice the edit', 15000)
log('broken:', broke.saved[0].message)
if (!/24px|left edges are \d+px apart/.test(broke.saved[0].message)) {
  throw new Error(`ASSERT: the complaint is not numeric: ${broke.saved[0].message}`)
}
await waitStatus(/⚠/)
log('status announced it:', await status())
const mailAfter = await rectOf('#email')
const red = await paintedIn({ x: mailAfter.x - 3, y: mailAfter.y, w: 7, h: 20 })
log('painted at the moved edge:', red.hits, 'px · rgb', red.sample)
if (red.hits < 3) throw new Error('ASSERT: the broken mark did not follow the element that moved')
if (!(red.sample[0] > red.sample[1] + 40)) {
  throw new Error(`ASSERT: a broken rule is not drawn red: rgb(${red.sample})`)
}

restore()
const healed = await waitFor((r) => r.saved[0] && !r.saved[0].broken, 'the rule to hold again', 15000)
log('after undoing the edit:', healed.saved[0].broken ? 'still broken' : 'holding again')

// ── 6. Alt+W hides what holds, never what is broken ────────────────────
await page.keyboard.press('Alt+w')
const hidden = await waitFor((r) => !r.watching, 'rules hidden')
log('Alt+W:', await status())
if (hidden.listOpen) throw new Error('ASSERT: the list stayed open after hiding')
const gone = await paintedIn({ x: nameIn.x - 3, y: nameIn.y, w: 7, h: mailIn.y - nameIn.y })
if (gone.hits > 2) throw new Error(`ASSERT: a holding rule kept drawing after Alt+W (${gone.hits}px)`)
execSync(`cat > ${JSON.stringify(FORM)}`, { input: shifted })
await waitFor((r) => r.saved[0]?.broken, 'a broken rule while hidden', 15000)
const shownAnyway = await paintedIn({ x: (await rectOf('#email')).x - 3, y: (await rectOf('#email')).y, w: 7, h: 20 })
log('broken while hidden — still painted:', shownAnyway.hits, 'px')
if (shownAnyway.hits < 3) throw new Error('ASSERT: a broken rule stayed hidden, which is the one thing it must not do')
restore()
await waitFor((r) => r.saved[0] && !r.saved[0].broken, 'holding again', 15000)
await page.keyboard.press('Alt+w')
await waitFor((r) => r.watching, 'rules shown again')

// ── 7. refusals and cancels ────────────────────────────────────────────
await page.keyboard.press('Alt+Shift+R')
await page.keyboard.press('Escape')
const disarmed = await rules()
if (disarmed.armed) throw new Error('ASSERT: Esc did not disarm the rule gesture')
log('Esc while armed:', await status())

await page.keyboard.press('Alt+Shift+R')
// The one genuinely empty part of this page: the gutter is full of stamped
// decoration (GutterMarks, the flourish SVG) and the bottom right belongs to
// the watch panel, which takes its own pointer events.
await drawLine({ x: 60, y: 820 }, { x: 60, y: 878 })
const refused = await waitStatus(/✗/)
log('line over nothing:', refused)
if (!/edges|gap/.test(refused)) throw new Error(`ASSERT: the refusal does not say what would work: ${refused}`)

await page.keyboard.press('Alt+Shift+R')
await drawLine(
  { x: nameIn.x + 1, y: nameIn.y - 4 },
  { x: nameIn.x, y: mailIn.y + mailIn.h + 4 },
)
await waitFor((r) => r.panelOpen, 'a pending rule')
await page.keyboard.press('Escape')
const cancelled = await waitFor((r) => !r.panelOpen, 'the pending rule to cancel')
log('Esc while pending:', await status())
if (cancelled.saved.length !== 1) throw new Error('ASSERT: cancelling saved something anyway')

// ── 8. forgetting one ──────────────────────────────────────────────────
await shadow(() => {
  document.getElementById('s2c-overlay-host').shadowRoot
    .querySelector('#watchList button[data-rule-id]').click()
})
const forgotten = await waitFor((r) => r.saved.length === 0, 'the rule to be forgotten')
log('forgot it:', await status())
if (forgotten.saved.length !== 0) throw new Error('ASSERT: the rule survived being forgotten')
if (JSON.parse(readFileSync(RULES, 'utf8')).length !== 0) {
  throw new Error('ASSERT: the file still holds the forgotten rule')
}
const after = await paintedIn({ x: nameIn.x - 3, y: nameIn.y, w: 7, h: mailIn.y - nameIn.y })
if (after.hits > 2) throw new Error(`ASSERT: a forgotten rule is still drawn (${after.hits}px)`)

restore()
if (existsSync(RULES)) rmSync(RULES)
// HMR from the restores runs React remounts; a warning is not a failure, an
// uncaught exception is
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — a drawn line becomes a rule, the rule paints, an editor edit breaks it, and forgetting it clears both')

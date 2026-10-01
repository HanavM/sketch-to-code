/**
 * Live e2e: POINT AT THINGS WHILE YOU TYPE.
 *
 * A sentence attaches to the element you started on. This is about the other
 * elements it needs to mention: you reach out mid-sentence, click a button, and
 * it lands in the text as `@1` — a pointer to that element's place in the code,
 * not a description of it that something later has to resolve.
 *
 * The reason this has to be a browser test: the whole feature is a conflict over
 * what a click means. While a sentence is open a press must name an element,
 * which is NOT what a press means in any other state — in design mode it draws
 * or selects. Nothing but a real pointer on a real page can show that the right
 * one wins, that the token lands at the caret rather than the end, and that the
 * page is never drawn on by accident.
 *
 * Phases, all zero-token (the one interpret call is stubbed):
 *   1. open a sentence on one element; no references yet
 *   2. click two more elements → @1 and @2 land in the text, each with a
 *      legend row and a dashed outline on the page
 *   3. the token goes in at the CARET, not appended
 *   4. pointing at the same element twice reuses its token
 *   5. clicking did not draw: no strokes, nothing selected
 *   6. deleting @2 out of the words un-references it, visibly
 *   7. Enter attaches; reopening the chip brings the references back
 *   8. the wire carries each token with its element's source location
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-noterefs.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-noterefs]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

/** Capture the one interpret call so the wire shape is asserted for free. */
let posted = null
await page.route('**/@s2c/interpret', async (route) => {
  posted = JSON.parse(route.request().postData() ?? '{}')
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: { reading: 'noted', actions: [], unclear: null },
        raw: { reading: 'noted', actions: [], unclear: null },
        tokens: { input: 1, cacheRead: 0, output: 1 },
      },
    }),
  })
})

const sh = (fn, arg) => page.evaluate(fn, arg)
const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
const status = () => sh(() => document.getElementById('s2c-overlay-host').shadowRoot
  .getElementById('status').textContent)
const notes = () => sh(() => window.__S2C_DEBUG__.notes())
const strokes = () => sh(() => window.__S2C_DEBUG__.strokes().length)
/** Everything the editor is showing about references. */
const refUi = () =>
  sh(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const legend = s.getElementById('noteRefs')
    const hi = s.getElementById('noteRefHi')
    const input = s.getElementById('noteInput')
    return {
      value: input.value,
      caret: input.selectionStart,
      legendOn: getComputedStyle(legend).display !== 'none',
      rows: [...legend.querySelectorAll('.refRow')].map((r) => ({
        token: r.querySelector('.refTok').textContent,
        label: r.lastElementChild.textContent,
      })),
      outlinesOn: getComputedStyle(hi).display !== 'none',
      outlines: [...hi.querySelectorAll('.refBox')].map((o) => ({
        tag: o.querySelector('.refTag').textContent,
        w: Math.round(o.getBoundingClientRect().width),
        h: Math.round(o.getBoundingClientRect().height),
      })),
    }
  })

/** Where to click, and what that element is, for a page selector. */
const spot = (sel) =>
  sh((s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), srcLoc: el.dataset.s2c }
  }, sel)

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)
// manual, so nothing fires a run while this types
for (let i = 0; i < 4 && (await sh(() => window.__S2C_DEBUG__.auto().mode)) !== 'manual'; i++) {
  await page.keyboard.press('Alt+a')
  await page.waitForTimeout(150)
}
await sh(`${sr()}.getElementById("clear").click()`)
await page.waitForTimeout(200)

const button = await spot('form button[type="submit"]')
const table = await spot('table')
const heading = await spot('h2')
for (const [name, s] of [['button', button], ['table', table], ['heading', heading]]) {
  if (!s?.srcLoc) throw new Error(`fixture drift: no stamped ${name}`)
}
log('targets:', JSON.stringify({ button: button.srcLoc, table: table.srcLoc }))

// ── 1. open a sentence on the button ───────────────────────────────────
await page.mouse.move(button.x, button.y)
await page.waitForTimeout(150)
await page.keyboard.press('Alt+n')
await page.waitForTimeout(300)
let ui = await refUi()
log('opened:', (await status()).slice(0, 80))
if (ui.legendOn) throw new Error('ASSERT: a fresh sentence already shows references')
if (!/click anything to name it/.test(await status())) {
  throw new Error('ASSERT: nothing tells the user they can point at things while typing')
}
await page.keyboard.type('when this is clicked add the name to ')

// ── 2. reach out and name two elements ────────────────────────────────
await page.mouse.click(table.x, table.y)
await page.waitForTimeout(250)
log('after clicking the table:', JSON.stringify(await refUi()))
await page.keyboard.type('and announce it in ')
await page.mouse.click(heading.x, heading.y)
await page.waitForTimeout(250)
ui = await refUi()
log('text now:', JSON.stringify(ui.value))
log('legend:  ', JSON.stringify(ui.rows))
log('outlines:', JSON.stringify(ui.outlines))
if (!/@1/.test(ui.value) || !/@2/.test(ui.value)) {
  throw new Error(`ASSERT: the tokens are not in the sentence: ${ui.value}`)
}
if (ui.rows.length !== 2) throw new Error(`ASSERT: ${ui.rows.length} legend rows, want 2`)
if (ui.rows[0].token !== '@1' || !/^<[a-z0-9]+>/.test(ui.rows[0].label)) {
  throw new Error(`ASSERT: @1 has no usable label: ${JSON.stringify(ui.rows[0])}`)
}
// tokens are words: the text typed after one must not fuse onto it
if (/@\d\w/.test(ui.value)) throw new Error(`ASSERT: a token ran into the next word: ${ui.value}`)
if (!ui.outlinesOn || ui.outlines.length !== 2) {
  throw new Error('ASSERT: the referenced elements are not outlined on the page')
}
if (ui.outlines.some((o) => o.w < 4 || o.h < 4)) {
  throw new Error(`ASSERT: an outline has no size: ${JSON.stringify(ui.outlines)}`)
}
log('✓ two elements named, each with a legend row and an outline')

// ── 3. the token lands at the caret, not at the end ───────────────────
// Going back to fix a word and then pointing is the normal case; appending
// would put the reference in the wrong half of the sentence.
await sh(() => {
  const i = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('noteInput')
  i.setSelectionRange(0, 0) // caret to the very start
  i.focus()
})
await page.mouse.click(button.x, button.y)
await page.waitForTimeout(250)
ui = await refUi()
log('after pointing with the caret at the start:', JSON.stringify(ui.value))
if (!/^@3\b/.test(ui.value.trim())) {
  throw new Error(`ASSERT: the token did not land at the caret: ${ui.value}`)
}
if (ui.rows.length !== 3) throw new Error(`ASSERT: ${ui.rows.length} rows, want 3`)

// ── 4. the same element twice reuses its token ─────────────────────────
await sh(() => {
  const i = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('noteInput')
  i.setSelectionRange(i.value.length, i.value.length)
  i.focus()
})
await page.mouse.click(table.x, table.y)
await page.waitForTimeout(250)
ui = await refUi()
const ones = (ui.value.match(/@1/g) ?? []).length
log('table named twice → @1 appears', ones, 'times · rows:', ui.rows.length)
if (ui.rows.length !== 3) throw new Error(`ASSERT: a second mention made a 4th reference: ${ui.rows.length}`)
if (ones !== 2) throw new Error(`ASSERT: the second mention did not reuse @1 (${ones} occurrences)`)
log('✓ pointing twice at one element reuses its token')

// ── 5. none of that drew on the page ──────────────────────────────────
log('strokes:', await strokes(), '· selection:', await sh(() => window.__S2C_DEBUG__.paint().srcLoc))
if ((await strokes()) !== 0) throw new Error('ASSERT: naming an element drew a stroke')
if (await sh(() => window.__S2C_DEBUG__.paint().srcLoc)) {
  throw new Error('ASSERT: naming an element also selected it — the click did two things')
}

// ── 6. deleting a token un-references it ──────────────────────────────
await sh(() => {
  const i = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('noteInput')
  i.value = i.value.replace(/@2/g, '')
  i.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(250)
ui = await refUi()
log('after deleting @2:', JSON.stringify(ui.rows.map((r) => r.token)), '· outlines:', ui.outlines.length)
if (ui.rows.some((r) => r.token === '@2')) throw new Error('ASSERT: the legend still lists a token nobody mentions')
if (ui.outlines.length !== 2) throw new Error(`ASSERT: ${ui.outlines.length} outlines for 2 live tokens`)

// ── 7. Enter attaches, and reopening brings them back ─────────────────
const written = ui.value
await page.keyboard.press('Enter')
await page.waitForTimeout(300)
const saved = await notes()
log('attached:', JSON.stringify(saved[0]?.refs?.map((r) => r.token)), '·', JSON.stringify(saved[0]?.text))
if (saved.length !== 1) throw new Error(`ASSERT: ${saved.length} notes, want 1`)
if (saved[0].text !== written) throw new Error('ASSERT: the attached text is not what was typed')
if (saved[0].refs.length !== 2) throw new Error(`ASSERT: ${saved[0].refs.length} refs kept, want 2 (@2 was deleted)`)
if (saved[0].refs.some((r) => r.token === '@2')) throw new Error('ASSERT: a deleted token was still attached')
for (const r of saved[0].refs) {
  if (!/^[^:]+:\d+:\d+$/.test(r.srcLoc)) throw new Error(`ASSERT: ref ${r.token} has no source location: ${r.srcLoc}`)
}
// @1 was the users table, @3 the submit button — the tokens point where the
// pointer was, which is the entire claim
const byToken = Object.fromEntries(saved[0].refs.map((r) => [r.token, r.srcLoc]))
log('tokens point at:', JSON.stringify(byToken))
if (!byToken['@1']?.startsWith('src/components/UserTable.tsx')) {
  throw new Error(`ASSERT: @1 does not point into the users table: ${byToken['@1']}`)
}
if (byToken['@3'] !== button.srcLoc) {
  throw new Error(`ASSERT: @3 does not point at the button: ${byToken['@3']}`)
}

await sh(`${sr()}.querySelector('.noteChip').click()`)
await page.waitForTimeout(300)
ui = await refUi()
log('reopened:', JSON.stringify(ui.rows.map((r) => r.token)), '· outlines:', ui.outlines.length)
if (ui.rows.length !== 2) throw new Error('ASSERT: reopening the sentence lost its references')
if (!ui.outlinesOn) throw new Error('ASSERT: reopening did not put the outlines back')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ── 8. and it all reaches the server ──────────────────────────────────
await page.keyboard.press('Alt+r')
for (let i = 0; i < 80 && !posted; i++) await page.waitForTimeout(100)
if (!posted) throw new Error(`ASSERT: no interpret call · status: ${await status()}`)
const wire = posted.notes?.[0]
log('on the wire:', JSON.stringify(wire?.refs))
if (!wire) throw new Error('ASSERT: the note never reached the wire')
if (JSON.stringify(wire.refs) !== JSON.stringify(saved[0].refs)) {
  throw new Error(`ASSERT: the wire disagrees with the client\n  client ${JSON.stringify(saved[0].refs)}\n  wire   ${JSON.stringify(wire.refs)}`)
}
if (wire.anchor.srcLoc !== button.srcLoc) {
  throw new Error(`ASSERT: the note is anchored to ${wire.anchor.srcLoc}, not the button`)
}
log('✓ every token travelled with the element it points at')

await page.keyboard.press('Escape')
await sh(`${sr()}.getElementById("clear").click()`)
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — you can point at things mid-sentence, and they become real pointers into the code')

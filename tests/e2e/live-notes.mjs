/**
 * Live e2e: typed notes — exact words, attached to what they are about.
 * Zero model calls: the one /@s2c/interpret request is captured AND fulfilled
 * locally, so the wire shape is asserted without spending a run. Asserts:
 *   1. rule 1 — a stamped element under the pointer wins, and travels as its
 *      data-s2c stamp; the page wrapper is NOT an element (it falls through)
 *   2. rule 2 — near freshly drawn ink, the note takes the whole CLUSTER, not
 *      the one nearest stroke, and not the unrelated stroke across the page
 *   3. rule 3 — over nothing, the note is about the run; Alt+Shift+N forces
 *      that scope even with an element under the pointer
 *   4. Enter commits, Escape cancels, and the editor PAINTS — an opaque box
 *      with a focused field and a highlight sitting on the real subject
 *   5. chips are laid out in PAGE space: zero drift from their anchor across
 *      a scroll (a chip that slides is the bug this check exists for)
 *   6. clicking a chip re-opens it, ✕ deletes it, Clear takes them all
 *   7. POST /@s2c/interpret carries `notes` deep-equal to the client's model,
 *      and a note alone is enough to enable ▶ Run
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp/s2c-notes-shots'
const log = (...a) => console.log('[e2e-notes]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}
mkdirSync(SHOTS, { recursive: true })
await page.evaluate(() => { localStorage.removeItem('s2c:hud'); localStorage.removeItem('s2c:fidelity') })
await page.reload({ waitUntil: 'networkidle' })

/** Everything the note editor is supposed to be showing. */
const ui = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = s.getElementById('noteBox')
    const inp = s.getElementById('noteInput')
    const hi = s.getElementById('noteHi')
    const r = box.getBoundingClientRect()
    const hr = hi.getBoundingClientRect()
    return {
      open: getComputedStyle(box).display !== 'none',
      what: s.getElementById('noteWhat').textContent,
      value: inp.value,
      focused: s.activeElement === inp,
      box: { x: r.left, y: r.top, w: r.width, h: r.height },
      hiOn: getComputedStyle(hi).display !== 'none',
      hi: { x: hr.left, y: hr.top, w: hr.width, h: hr.height },
      status: s.getElementById('status').textContent,
      runDisabled: s.getElementById('run').disabled,
      clearDisabled: s.getElementById('clear').disabled,
    }
  })
const notes = () => page.evaluate(() => window.__S2C_DEBUG__.notes())
/** Client-space rect of every chip, plus where PAGE space says it should be. */
const chips = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    return [...s.querySelectorAll('.noteChip')].map((c) => {
      const r = c.getBoundingClientRect()
      return {
        id: c.dataset.note,
        text: c.querySelector('.noteText').textContent,
        x: r.left, y: r.top, w: r.width, h: r.height,
        scrollX: window.scrollX, scrollY: window.scrollY,
      }
    })
  })
const rectOf = (sel) =>
  page.evaluate((q) => {
    const el = document.querySelector(q)
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
const near = (a, c, tol = 2) => Math.abs(a - c) <= tol

const SIGNOUT = 'button[data-s2c*="Navbar.tsx:10"]'
const btn = await rectOf(SIGNOUT)
const btnStamp = await page.evaluate((q) => document.querySelector(q).dataset.s2c, SIGNOUT)

// ---- 1. rule 1: a stamped element under the pointer --------------------
await page.mouse.move(btn.x + btn.w / 2, btn.y + btn.h / 2)
await page.keyboard.press('Alt+KeyN')
let u = await ui()
if (!u.open) throw new Error('Alt+N did not open the note editor')
if (!u.focused) throw new Error('note field is not pre-focused — the user could not just type')
if (u.what !== `on this element · button`) throw new Error(`anchor label: ${u.what}`)
if (!u.hiOn) throw new Error('no highlight — nothing tells the user WHAT it attached to')
if (!near(u.hi.x, btn.x) || !near(u.hi.y, btn.y) || !near(u.hi.w, btn.w) || !near(u.hi.h, btn.h)) {
  throw new Error(`highlight is not on the button: ${JSON.stringify(u.hi)} vs ${JSON.stringify(btn)}`)
}
await page.keyboard.type('make all of them fade in and out')
await page.keyboard.press('Enter')
let n = await notes()
if (n.length !== 1) throw new Error(`Enter did not commit: ${JSON.stringify(n)}`)
if (n[0].id !== 'n0') throw new Error(`first note id ${n[0].id}, want n0`)
if (n[0].text !== 'make all of them fade in and out') throw new Error(`text mangled: ${n[0].text}`)
if (!eq(n[0].anchor, { kind: 'element', srcLoc: btnStamp })) {
  throw new Error(`rule 1 anchor wrong: ${JSON.stringify(n[0].anchor)}`)
}
if (!near(n[0].at.x, btn.x + btn.w / 2) || !near(n[0].at.y, btn.y + btn.h / 2)) {
  throw new Error(`note.at is not the pointer: ${JSON.stringify(n[0].at)}`)
}
log('✓ rule 1 · element', n[0].anchor.srcLoc, '· at', n[0].at.x + ',' + n[0].at.y)

// ---- 2. Escape cancels -------------------------------------------------
await page.mouse.move(btn.x + btn.w / 2, btn.y + btn.h / 2)
await page.keyboard.press('Alt+KeyN')
await page.keyboard.type('this one must never exist')
await page.keyboard.press('Escape')
u = await ui()
if (u.open) throw new Error('Escape left the editor open')
n = await notes()
if (n.length !== 1) throw new Error(`Escape committed anyway: ${JSON.stringify(n)}`)
log('✓ Escape cancels, Enter commits')

// ---- 3. rule 2: the cluster of strokes near the pointer ----------------
// left gutter (x < 128) is bare page wrapper: rule 1 must decline it, which
// is exactly the "not merely the page background" clause
//
// Alt+D TOGGLES, and the design surface is live on load, so pressing it blind
// turns drawing OFF and the strokes below are never recorded — which showed up
// here as "whole sketch" instead of "on these 3 strokes", a failure that looks
// like broken note anchoring and is actually an empty canvas.
const setDraw = async (want) => {
  for (let i = 0; i < 3; i++) {
    const m = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if ((m === 'draw') === want) return
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  throw new Error(`could not turn draw mode ${want ? 'on' : 'off'}`)
}
await setDraw(true)
const stroke = async (x0, y0) => {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + i * 7, y0 + (i % 2 ? 6 : 0), { steps: 2 })
  await page.mouse.up()
}
await stroke(30, 700)
await stroke(30, 742)
await stroke(30, 784)
await stroke(880, 250) // a separate drawing, far away — must NOT be swept in
await setDraw(false)
// and the strokes really are there, so a later "whole sketch" can only mean the
// anchoring rule declined them, never that nothing was drawn
const drew = await page.evaluate(() => window.__S2C_DEBUG__.strokes().length)
if (drew !== 4) throw new Error(`ASSERT: ${drew} strokes recorded, want 4 — the canvas was not in draw mode`)

await page.mouse.move(45, 745)
await page.keyboard.press('Alt+KeyN')
u = await ui()
if (u.what !== 'on these 3 strokes') throw new Error(`rule 2 label: ${u.what}`)
if (!u.hiOn) throw new Error('stroke group got no highlight')
await page.keyboard.type('these three should fade in and out')
writeFileSync(`${SHOTS}/note-strokes.png`, await page.screenshot({
  clip: { x: 0, y: 630, width: 560, height: 260 },
}))
await page.keyboard.press('Enter')
n = await notes()
if (n.length !== 2) throw new Error(`stroke note not committed: ${JSON.stringify(n)}`)
if (!eq(n[1].anchor, { kind: 'strokes', strokeIds: ['s0', 's1', 's2'] })) {
  throw new Error(`rule 2 anchor wrong (s3 is a different drawing): ${JSON.stringify(n[1].anchor)}`)
}
log('✓ rule 2 · strokes', n[1].anchor.strokeIds.join(','), '— s3 correctly left out')

// ---- 4. rule 3: nothing under the pointer, and the forced scope --------
await page.mouse.move(1210, 420) // bare wrapper, no ink within 120px
await page.keyboard.press('Alt+KeyN')
u = await ui()
if (u.what !== 'whole sketch') throw new Error(`rule 3 label: ${u.what}`)
if (u.hiOn) throw new Error('a run-level note has no subject to outline')
await page.keyboard.type('ship this by friday')
await page.keyboard.press('Enter')
n = await notes()
if (!eq(n[2].anchor, { kind: 'run' })) throw new Error(`rule 3 anchor: ${JSON.stringify(n[2].anchor)}`)

// the modifier must beat an element sitting right under the pointer (a
// DIFFERENT element from note 1's, so the two chips don't land on each other)
const navLink = await rectOf('span[data-s2c*="Navbar.tsx:5"]')
await page.mouse.move(navLink.x + navLink.w / 2, navLink.y + navLink.h / 2)
await page.keyboard.press('Alt+Shift+KeyN')
u = await ui()
if (u.what !== 'whole sketch') throw new Error(`Alt+Shift+N did not force run scope: ${u.what}`)
await page.keyboard.type('and keep the copy short')
await page.keyboard.press('Enter')
n = await notes()
if (n.length !== 4 || !eq(n[3].anchor, { kind: 'run' })) {
  throw new Error(`forced run note wrong: ${JSON.stringify(n[3])}`)
}
if (n.map((x) => x.id).join(',') !== 'n0,n1,n2,n3') throw new Error('note ids are not stable/sequential')
log('✓ rule 3 · run · and Alt+Shift+N forces it over an element')

// ---- 5. chips are page-space: zero drift across a scroll ---------------
/** A chip's position in PAGE coords — the number that must never change. */
const pagePos = (c) => ({ x: c.x + c.scrollX, y: c.y + c.scrollY })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(100)
let cs = await chips()
if (cs.length !== 4) throw new Error(`want 4 chips, got ${cs.length}`)
const beforeAnchor = await rectOf(SIGNOUT)
const beforeChip = cs.find((c) => c.id === 'n0')
const pageW = await page.evaluate(() => document.documentElement.scrollWidth)
for (const c of cs) {
  const note = n.find((x) => x.id === c.id)
  const p = pagePos(c)
  // beside its anchor point (either side — a chip near the edge flips)…
  if (Math.abs(p.x - note.at.x) > c.w + 14 || Math.abs(p.y - note.at.y) > 14) {
    throw new Error(`chip ${c.id} is not beside its anchor point: ${JSON.stringify(p)} vs ${JSON.stringify(note.at)}`)
  }
  // …and entirely on the page, not sliced off by the right edge
  if (p.x < 0 || p.x + c.w > pageW) throw new Error(`chip ${c.id} hangs off the page: ${p.x}+${c.w} of ${pageW}`)
}
const beforePage = cs.map(pagePos)
await page.evaluate(() => window.scrollTo(0, 200))
await page.waitForTimeout(150)
cs = await chips()
if (cs[0].scrollY !== 200) throw new Error('the page did not actually scroll — drift check is vacuous')
cs.forEach((c, i) => {
  const p = pagePos(c)
  if (Math.abs(p.x - beforePage[i].x) > 0.5 || Math.abs(p.y - beforePage[i].y) > 0.5) {
    throw new Error(`chip ${c.id} DRIFTED on scroll: ${JSON.stringify(p)} vs ${JSON.stringify(beforePage[i])}`)
  }
})
const afterAnchor = await rectOf(SIGNOUT)
const afterChip = cs.find((c) => c.id === 'n0')
const dx = (afterChip.x - afterAnchor.x) - (beforeChip.x - beforeAnchor.x)
const dy = (afterChip.y - afterAnchor.y) - (beforeChip.y - beforeAnchor.y)
if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
  throw new Error(`chip drifted from its anchored element by ${dx},${dy} px over 200px of scroll`)
}
log('✓ chips glued to their anchors across 200px of scroll · drift', dx + ',' + dy)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(100)
writeFileSync(`${SHOTS}/note-chips.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 400 } }))

// ---- 6. the editor actually paints ------------------------------------
const card = await rectOf('section[data-s2c*="StatCards"] > *')
await page.mouse.move(card.x + card.w / 2, card.y + card.h / 2)
await page.keyboard.press('Alt+KeyN')
await page.keyboard.type('two columns on mobile, please')
const paints = await page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  const box = s.getElementById('noteBox')
  const inp = s.getElementById('noteInput')
  const what = s.getElementById('noteWhat')
  const r = box.getBoundingClientRect()
  const ir = inp.getBoundingClientRect()
  const ics = getComputedStyle(inp)
  return {
    opacity: getComputedStyle(box).opacity,
    visibility: getComputedStyle(box).visibility,
    inputBg: ics.backgroundColor,
    inputColor: ics.color,
    fontSize: ics.fontSize,
    inputW: ir.width, inputH: ir.height,
    whatW: what.getBoundingClientRect().width,
    whatText: what.textContent,
    // a hit-test at the field's centre must reach the overlay, not the app
    hitIsOverlay: document.elementFromPoint(ir.left + ir.width / 2, ir.top + ir.height / 2)?.id === 's2c-overlay-host',
    // nothing may spill out of the editor's own box
    spill: [...box.querySelectorAll('*')].filter((el) => {
      const er = el.getBoundingClientRect()
      return er.width > 0 && (er.right > r.right + 1 || er.left < r.left - 1)
    }).map((el) => el.id),
    onScreen: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
  }
})
if (paints.opacity !== '1' || paints.visibility !== 'visible') throw new Error('editor present but invisible')
if (!/rgba?\(15, 23, 42/.test(paints.inputBg)) throw new Error(`field lost its chrome: ${paints.inputBg}`)
if (paints.inputW < 200 || paints.inputH < 24) throw new Error(`field collapsed: ${paints.inputW}x${paints.inputH}`)
if (paints.whatW < 60 || !paints.whatText) throw new Error('anchor label rendered with no width')
if (!paints.hitIsOverlay) throw new Error('field centre is not hit-testable — something covers it')
if (paints.spill.length) throw new Error(`editor content overflows: ${paints.spill.join(', ')}`)
if (!paints.onScreen) throw new Error('editor opened partly off-screen')
writeFileSync(`${SHOTS}/note-input.png`, await page.screenshot({
  clip: { x: Math.max(0, card.x - 40), y: Math.max(0, card.y - 30), width: 620, height: 330 },
}))
log('✓ editor paints ·', paints.whatText, '·', Math.round(paints.inputW) + 'x' + Math.round(paints.inputH),
  paints.inputBg, paints.fontSize)
await page.keyboard.press('Escape')

// ---- 7. edit and delete from the chip ---------------------------------
cs = await chips()
const target = cs.find((c) => c.id === 'n0')
await page.mouse.click(target.x + 20, target.y + target.h / 2)
await page.waitForTimeout(80)
u = await ui()
if (!u.open || u.value !== 'make all of them fade in and out') {
  throw new Error(`clicking a chip did not re-open it: ${JSON.stringify(u)}`)
}
if (u.what !== 'on this element · button') throw new Error(`edit lost the anchor: ${u.what}`)
// no select-all needed: re-opening pre-selects the old text, so typing
// replaces it — that IS the edit affordance
await page.keyboard.type('fade them in and out, slowly')
await page.keyboard.press('Enter')
n = await notes()
if (n.length !== 4) throw new Error('editing created a second note')
if (n[0].text !== 'fade them in and out, slowly') throw new Error(`edit did not stick: ${n[0].text}`)
if (!eq(n[0].anchor, { kind: 'element', srcLoc: btnStamp })) throw new Error('edit moved the anchor')

cs = await chips()
const doomed = cs.find((c) => c.id === 'n3')
await page.mouse.click(doomed.x + doomed.w - 10, doomed.y + doomed.h / 2)
await page.waitForTimeout(80)
n = await notes()
if (n.length !== 3 || n.some((x) => x.id === 'n3')) throw new Error(`✕ did not delete: ${JSON.stringify(n)}`)
log('✓ chip click edits · ✕ deletes ·', n.length, 'left')

// ---- 8. the wire shape -------------------------------------------------
// captured AND stubbed: the body is real, the model call never happens
let sent = null
page.on('request', (req) => {
  if (req.url().includes('/@s2c/interpret')) sent = req.postDataJSON()
})
await page.route('**/@s2c/interpret', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed by e2e' }) }))
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())
await page.waitForTimeout(500)
if (!sent) throw new Error('no /@s2c/interpret request was made')
if (!Array.isArray(sent.notes)) throw new Error('request body carries no notes array')
const model = await notes()
if (!eq(sent.notes, model)) {
  throw new Error(`wire notes ≠ client model:\n  sent: ${JSON.stringify(sent.notes)}\n  model: ${JSON.stringify(model)}`)
}
for (const note of sent.notes) {
  const keys = Object.keys(note).sort().join(',')
  // `refs` rides along only when the sentence named something by pointing at it
  if (keys !== 'anchor,at,id,text' && keys !== 'anchor,at,id,refs,text') {
    throw new Error(`note has the wrong fields: ${keys}`)
  }
  if (typeof note.at?.x !== 'number' || typeof note.at?.y !== 'number') throw new Error('note.at is not a point')
  if (!['element', 'strokes', 'run'].includes(note.anchor.kind)) throw new Error('bad anchor kind')
  if (note.anchor.kind === 'element' && typeof note.anchor.srcLoc !== 'string') throw new Error('element anchor has no srcLoc')
  if (note.anchor.kind === 'element' && 'id' in note.anchor) throw new Error('element anchor leaked a DOM id')
  if (note.anchor.kind === 'strokes' && !Array.isArray(note.anchor.strokeIds)) throw new Error('strokes anchor has no ids')
}
log('✓ /@s2c/interpret carries', sent.notes.length, 'notes ·', JSON.stringify(sent.notes[0]))
await page.unroute('**/@s2c/interpret')

// ---- 9. notes count as work, and clear with the drawing ---------------
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('clear').click())
await page.waitForTimeout(80)
n = await notes()
cs = await chips()
u = await ui()
if (n.length !== 0 || cs.length !== 0) throw new Error('Clear left notes behind')
if (!u.runDisabled || !u.clearDisabled) throw new Error('nothing to run, but the buttons stayed live')
await page.mouse.move(1210, 420)
await page.keyboard.press('Alt+KeyN')
await page.keyboard.type('just words, no drawing at all')
await page.keyboard.press('Enter')
u = await ui()
if (u.runDisabled) throw new Error('a note alone did not enable ▶ Run')
if (u.clearDisabled) throw new Error('a note alone did not enable ✕ Clear')
const strokeCount = await page.evaluate(() => window.__S2C_DEBUG__.notes().length)
log('✓ a note alone enables Run ·', strokeCount, 'note, 0 strokes')
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('clear').click())

await b.close()
log('ALL NOTE CHECKS PASSED · screenshots in', SHOTS)

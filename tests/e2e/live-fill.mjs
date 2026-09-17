/**
 * Live e2e: the SECOND fidelity axis — how filled-in the result should be.
 *
 * The resemblance slider says how closely the drawn geometry is followed; it
 * says nothing about whether what comes back is line art or a finished thing.
 * This suite covers that axis end to end, and spends ZERO model calls: the
 * interpret route is stubbed with page.route, so the only thing step 6 proves
 * is what the overlay puts on the wire. Asserts:
 *   1. a fresh profile defaults to `filled` (NOT outline), and the bar's
 *      always-visible readout carries the choice
 *   2. the three buttons select, show as selected exclusively, and the hint
 *      under them rewrites itself — and all of it actually PAINTS (opaque
 *      chrome, non-zero text boxes, nothing spilling out of the panel)
 *   3. NO LAYOUT REGRESSION: the HUD box and the fidelity panel box are
 *      identical before/after every selection change. A shrink-to-fit label
 *      here once resized the slider track under the user's thumb and slid the
 *      whole centred toolbar sideways; this is the regression gate for that.
 *   4. Alt+5 / Alt+6 / Alt+7 drive it from the keyboard, and the ? help
 *      overlay lists all three (it is rendered from the keymap table, so a
 *      binding that isn't in the table cannot be listed)
 *   5. the choice survives a reload, stored under 's2c:fidelity'
 *   6. POST /@s2c/interpret carries exactly the `fidelity.fill` the UI shows
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-fill]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const FILLS = ['outline', 'filled', 'realized']

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

// Stub the model call outright. The only assertion that needs the request is
// "what did the overlay send", and a real interpret would both cost tokens and
// let the server rewrite the demo app underneath us.
let sent = null
await page.route('**/@s2c/interpret', async (route) => {
  try { sent = route.request().postDataJSON() } catch { sent = 'unparseable' }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, result: {
      shapes: [], textRegions: [], arrows: [], ops: [], warnings: [], escalatesToDesign: false,
    } }),
  })
})

await page.goto(APP, { waitUntil: 'networkidle' })

const sr = () => 'document.getElementById("s2c-overlay-host").shadowRoot'
/** Everything the fill axis is supposed to be showing, read out of the shadow root. */
const state = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const p = s.getElementById('fidelityPanel')
    const pr = p.getBoundingClientRect()
    const hr = s.getElementById('hud').getBoundingClientRect()
    const r2 = (n) => Math.round(n * 100) / 100
    const on = ['outline', 'filled', 'realized'].filter((k) =>
      s.getElementById(`fill-${k}`).classList.contains('on'))
    return {
      open: getComputedStyle(p).display !== 'none',
      panel: { x: r2(pr.left), y: r2(pr.top), w: r2(pr.width), h: r2(pr.height) },
      hud: { x: r2(hr.left), y: r2(hr.top), w: r2(hr.width), h: r2(hr.height) },
      selected: on.length === 1 ? on[0] : `AMBIGUOUS:${on.join('+')}`,
      hint: s.getElementById('fillHint').textContent.trim(),
      hintBox: (() => {
        const e = s.getElementById('fillHint').getBoundingClientRect()
        return { w: r2(e.width), h: r2(e.height) }
      })(),
      glyph: s.getElementById('fillNow').textContent,
      glyphBox: (() => {
        const e = s.getElementById('fillNow').getBoundingClientRect()
        return { w: r2(e.width) }
      })(),
      now: s.getElementById('fidelityNow').textContent,
      title: s.getElementById('fidelityBtn').title,
      aria: s.getElementById('fidelityBtn').getAttribute('aria-label'),
      stored: localStorage.getItem('s2c:fidelity'),
    }
  })
const clickBtn = (id) => page.evaluate(`${sr()}.getElementById(${JSON.stringify(id)}).click()`)
const ensureOpen = async () => { if (!(await state()).open) await clickBtn('fidelityBtn') }

// a virgin install: no saved fidelity, no saved HUD placement
await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await page.reload({ waitUntil: 'networkidle' })

// ---- 1. the default is `filled` ---------------------------------------
let s = await state()
if (s.open) throw new Error('panel should start closed')
if (s.selected !== 'filled') throw new Error(`default fill is "${s.selected}", want "filled"`)
if (!s.title.includes('result: filled')) throw new Error(`bar title does not carry the fill: ${s.title}`)
if (s.aria !== s.title) throw new Error('aria-label drifted from title')
if (!s.glyph) throw new Error('bar carries no fill glyph')
const pillW = s.hud.w
if (pillW > 900) throw new Error(`HUD is no longer a compact pill: ${Math.round(pillW)}px`)
log('✓ fresh profile defaults to filled · bar shows', JSON.stringify(s.glyph),
  `· pill ${Math.round(pillW)}px`)

// ---- 2. the three buttons select, and the control actually paints -------
await clickBtn('fidelityBtn')
s = await state()
if (!s.open) throw new Error('fidelityBtn did not open the panel')

const paints = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const p = s2.getElementById('fidelityPanel')
  const pr = p.getBoundingClientRect()
  const seg = s2.getElementById('fillSeg').getBoundingClientRect()
  const btns = ['outline', 'filled', 'realized'].map((k) => {
    const el = s2.getElementById(`fill-${k}`)
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      id: el.id, text: el.textContent.trim(), title: el.title,
      w: Math.round(r.width), h: Math.round(r.height),
      // a button whose centre does not hit the overlay is covered by something
      hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id,
      color: cs.color, bg: cs.backgroundColor, fontSize: cs.fontSize,
    }
  })
  const hint = s2.getElementById('fillHint')
  const hr = hint.getBoundingClientRect()
  return {
    seg: { w: Math.round(seg.width), h: Math.round(seg.height) },
    btns,
    hint: { w: Math.round(hr.width), h: Math.round(hr.height), color: getComputedStyle(hint).color },
    // the RESULT heading must actually be in the panel, above the segment
    heads: [...p.querySelectorAll('.fSect')].map((e) => e.textContent.trim()),
    // nothing may spill out of the panel's own box
    overflow: [...p.querySelectorAll('*')].filter((el) => {
      const er = el.getBoundingClientRect()
      return er.width > 0 && (er.right > pr.right + 1 || er.left < pr.left - 1 ||
        er.bottom > pr.bottom + 1 || er.top < pr.top - 1)
    }).map((el) => el.id || el.className),
  }
})
if (paints.btns.length !== 3) throw new Error('want 3 fill buttons')
for (const btn of paints.btns) {
  if (btn.w < 40 || btn.h < 14) throw new Error(`${btn.id} rendered at ${btn.w}x${btn.h}`)
  if (!btn.text) throw new Error(`${btn.id} has no label`)
  if (!btn.title || btn.title.length < 20) throw new Error(`${btn.id} has no explanatory tooltip`)
  if (btn.hit !== 's2c-overlay-host') throw new Error(`${btn.id} is covered by <${btn.hit}>`)
  if (/rgba\(0, 0, 0, 0\)/.test(btn.color)) throw new Error(`${btn.id} text is transparent`)
}
if (!paints.heads.includes('result')) {
  throw new Error(`no RESULT heading in the panel (got ${paints.heads.join(' / ')})`)
}
if (paints.hint.w < 200 || paints.hint.h < 20) {
  throw new Error(`fill hint box is ${paints.hint.w}x${paints.hint.h} — too small to read`)
}
if (paints.overflow.length) throw new Error(`content clipped/overflowing: ${paints.overflow.join(', ')}`)
log('✓ segment paints:', paints.btns.map((x) => `${x.text} ${x.w}x${x.h}`).join(' / '),
  `· hint ${paints.hint.w}x${paints.hint.h}`)

// ---- 3. selection changes everything that should, and NOTHING that shouldn't
const baseHud = s.hud
const basePanel = s.panel
const seenHints = new Set()
const seenGlyphs = new Set()
const hintBoxes = new Set()
const glyphWidths = new Set()
for (const want of [...FILLS, 'filled', 'outline', 'realized', 'outline']) {
  await clickBtn(`fill-${want}`)
  const r = await state()
  if (r.selected !== want) throw new Error(`clicked fill-${want}, selection is "${r.selected}"`)
  if (!r.hint || r.hint.length < 20) throw new Error(`no hint for ${want}: ${JSON.stringify(r.hint)}`)
  if (!r.title.includes(`result: ${want}`)) throw new Error(`bar title stale for ${want}: ${r.title}`)
  if (r.aria !== r.title) throw new Error('aria-label drifted from title')
  seenHints.add(r.hint)
  seenGlyphs.add(r.glyph)
  hintBoxes.add(JSON.stringify(r.hintBox))
  glyphWidths.add(r.glyphBox.w)
  // THE regression gate: the panel is anchored to the bar and grows upward, and
  // the bar is width:max-content centred by translateX(-50%). Either the hint
  // or the glyph being shrink-to-fit moves controls out from under the cursor.
  if (!eq(r.hud, baseHud)) {
    throw new Error(`HUD moved/resized on fill=${want}: ${JSON.stringify(r.hud)} vs ${JSON.stringify(baseHud)}`)
  }
  if (!eq(r.panel, basePanel)) {
    throw new Error(`panel moved/resized on fill=${want}: ${JSON.stringify(r.panel)} vs ${JSON.stringify(basePanel)}`)
  }
  // the resemblance readout is a different axis and must be untouched by this one
  if (r.now !== s.now) throw new Error(`fill selection rewrote the resemblance readout: ${r.now}`)
}
if (seenHints.size !== 3) throw new Error(`the hint does not change per mode: ${[...seenHints].join(' | ')}`)
if (seenGlyphs.size !== 3) throw new Error(`the bar glyph does not change per mode: ${[...seenGlyphs].join('')}`)
if (hintBoxes.size !== 1) throw new Error(`the hint box resizes with its text: ${[...hintBoxes].join(' ')}`)
if (glyphWidths.size !== 1) throw new Error(`the bar glyph slot resizes: ${[...glyphWidths].join(' ')}`)
log('✓ 3 distinct hints / 3 distinct glyphs · HUD and panel boxes identical across 7 changes ·',
  `hint box fixed at ${JSON.parse([...hintBoxes][0]).w}x${JSON.parse([...hintBoxes][0]).h}`)

// ---- 4. Alt+5 / Alt+6 / Alt+7, and the help overlay lists them ---------
for (const [key, want] of [['Digit5', 'outline'], ['Digit6', 'filled'], ['Digit7', 'realized'],
  ['Digit5', 'outline'], ['Digit7', 'realized']]) {
  await page.keyboard.press(`Alt+${key}`)
  const r = await state()
  if (r.selected !== want) throw new Error(`Alt+${key} → "${r.selected}", want "${want}"`)
  if (!eq(r.hud, baseHud) || !eq(r.panel, basePanel)) {
    throw new Error(`Alt+${key} moved the chrome: ${JSON.stringify(r.hud)} ${JSON.stringify(r.panel)}`)
  }
}
// Alt+1..4 (the keeps) and Alt+0 (default ink) must be undisturbed
const keepBefore = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  return ['asymmetry', 'rhythm', 'proportions', 'placement'].map((k) => s2.getElementById(`keep-${k}`).checked)
})
await page.keyboard.press('Alt+Digit2')
const keepAfter = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  return ['asymmetry', 'rhythm', 'proportions', 'placement'].map((k) => s2.getElementById(`keep-${k}`).checked)
})
if (keepBefore[1] === keepAfter[1]) throw new Error('Alt+2 no longer toggles keep-rhythm')
if ((await state()).selected !== 'realized') throw new Error('Alt+2 disturbed the fill selection')
await page.keyboard.press('Alt+Digit2')  // put it back

const helpRows = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const binds = window.__S2C_DEBUG__.keymap()
  const help = s2.getElementById('help')
  return {
    binds: binds.filter((x) => x.id.startsWith('fill-')),
    listed: [...help.querySelectorAll('.hRow')].map((r) => ({
      id: r.dataset.bind,
      keys: r.querySelector('.hKeys').textContent,
      label: r.querySelector('.hLabel').textContent,
      w: Math.round(r.getBoundingClientRect().width),
    })).filter((r) => r.id.startsWith('fill-')),
  }
})
if (helpRows.binds.length !== 3) throw new Error(`keymap table has ${helpRows.binds.length} fill binds`)
for (const [i, k] of FILLS.entries()) {
  const want = `Alt+${5 + i}`
  const bind = helpRows.binds.find((x) => x.id === `fill-${k}`)
  if (!bind) throw new Error(`no keymap entry for fill-${k}`)
  if (bind.keys !== want) throw new Error(`fill-${k} bound to ${bind.keys}, want ${want}`)
  const row = helpRows.listed.find((x) => x.id === `fill-${k}`)
  if (!row) throw new Error(`the ? overlay does not list fill-${k}`)
  if (row.keys !== want || !row.label.includes(k)) {
    throw new Error(`help row for fill-${k} reads "${row.keys} / ${row.label}"`)
  }
}
// and the rows genuinely render when the overlay is up
await page.keyboard.press('Escape')  // close the panel first
await page.keyboard.press('?')
const helpPaint = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const h = s2.getElementById('help')
  return {
    open: getComputedStyle(h).display !== 'none',
    rows: ['outline', 'filled', 'realized'].map((k) => {
      const r = h.querySelector(`.hRow[data-bind="fill-${k}"]`).getBoundingClientRect()
      return { k, w: Math.round(r.width), h: Math.round(r.height) }
    }),
  }
})
if (!helpPaint.open) throw new Error('? did not open the help overlay')
for (const r of helpPaint.rows) {
  if (r.w < 100 || r.h < 10) throw new Error(`help row fill-${r.k} rendered at ${r.w}x${r.h}`)
}
await page.keyboard.press('Escape')
log('✓ Alt+5/6/7 select outline/filled/realized · Alt+1..4 untouched · ? lists all three')

// ---- 5. a look at the open panel, for human eyes -----------------------
await ensureOpen()
await clickBtn('fill-realized')
await page.screenshot({ path: process.env.S2C_SHOT ?? '/tmp/s2c-fill-panel.png' })

// ---- 6. survives a reload ----------------------------------------------
s = await state()
if (!eq(JSON.parse(s.stored).fill, 'realized')) {
  throw new Error(`stored fidelity has fill=${JSON.parse(s.stored).fill}, want realized`)
}
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
s = await state()
if (s.selected !== 'realized') throw new Error(`fill did not survive reload: "${s.selected}"`)
if (!s.hint.length || !s.title.includes('result: realized')) {
  throw new Error(`restored fill not re-rendered: "${s.hint}" / "${s.title}"`)
}
// a junk value in storage must fall back to the DEFAULT, not to outline
await page.evaluate(() => {
  const o = JSON.parse(localStorage.getItem('s2c:fidelity'))
  o.fill = 'nonsense'
  localStorage.setItem('s2c:fidelity', JSON.stringify(o))
})
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
if ((await state()).selected !== 'filled') {
  throw new Error(`an unknown stored fill did not fall back to filled: "${(await state()).selected}"`)
}
log('✓ the choice survives a reload; an unknown value falls back to filled')

// ---- 7. the wire: /@s2c/interpret carries fidelity.fill ----------------
for (const want of ['outline', 'realized', 'filled']) {
  sent = null
  await ensureOpen()
  await clickBtn(`fill-${want}`)
  const shown = (await state()).selected
  await page.keyboard.press('Escape')
  // a real stroke: a 2-point drag is discarded as noise, so draw a proper one
  await page.keyboard.press('Alt+KeyD')
  await page.mouse.move(420, 520)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(420 + i * 16, 520 + (i % 2 ? 12 : -8), { steps: 2 })
  await page.mouse.up()
  await clickBtn('run')
  for (let i = 0; i < 60 && sent === null; i++) await page.waitForTimeout(100)
  if (sent === null) throw new Error(`no /@s2c/interpret POST for fill=${want}`)
  if (sent === 'unparseable') throw new Error('interpret body was not JSON')
  if (sent.fidelity?.fill !== shown) {
    throw new Error(`UI shows "${shown}" but the wire carried "${sent.fidelity?.fill}"`)
  }
  // the rest of the fidelity contract must be intact alongside the new field
  for (const k of ['resemblance', 'keep', 'palette']) {
    if (!(k in (sent.fidelity ?? {}))) throw new Error(`fidelity.${k} vanished from the payload`)
  }
  log(`  · fill=${want} → wire`, JSON.stringify(sent.fidelity))
  // the stub answers with an (empty) reading, so the overlay lands in preview
  // mode — walk the Escape ladder back to idle before the next round
  for (let i = 0; i < 4; i++) {
    const mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if (mode === 'idle') break
    await page.keyboard.press('Escape')
  }
  await clickBtn('clear')
}
log('✓ POST /@s2c/interpret carries exactly the fill the UI shows (3/3, zero model calls)')

await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await b.close()
log('ALL FILL CHECKS PASSED')

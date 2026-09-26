/**
 * Live e2e: the STYLE axis — the aesthetic the result is rendered in.
 *
 * Zero model calls: /@s2c/interpret, /@s2c/run AND /@s2c/instant are all
 * stubbed with page.route, so nothing is spent and the demo app's source is
 * never written (the instant render WRITES a component, hence the third stub).
 * Asserts:
 *   1. a fresh profile defaults to 'auto' — no aesthetic imposed — and the bar
 *      stays a compact pill (two suites hold it under 900px, so this control
 *      may not add a readout to it; it rides in the tooltip instead)
 *   2. all six options select, show as selected, and the one-line hint under
 *      the picker rewrites itself — and all of it actually PAINTS (opaque
 *      chrome, non-zero boxes, hit-testable, nothing clipped or ellipsised)
 *   3. NO LAYOUT REGRESSION: the HUD box and the fidelity panel box are
 *      byte-identical across all six selections, and the panel still does not
 *      scroll and still fits the viewport with the bar in a corner. A
 *      shrink-to-fit label here once resized the slider track under the user's
 *      thumb and slid the whole centred toolbar sideways.
 *   4. Alt+Y cycles forward through all six and wraps; Alt+Shift+Y goes back;
 *      the ? overlay lists both (it renders from the keymap table, so a
 *      binding that isn't in the table cannot be listed)
 *   5. the choice survives a reload under 's2c:fidelity', and an unknown
 *      stored value falls back to 'auto' WITHOUT dropping the rest of the
 *      object
 *   6. POST /@s2c/interpret carries exactly the `fidelity.style` the UI shows,
 *      alongside the rest of the fidelity contract
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOT = process.env.S2C_SHOT ?? '/tmp/s2c-style-panel.png'
const log = (...a) => console.log('[e2e-style]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const STYLES = ['auto', 'flat', 'soft', 'line', 'grain', 'glow']

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

// every network path a run can take is stubbed: interpret (the reading), run
// (the edit) and instant (which WRITES a component into examples/demo-app)
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
let ran = 0
let ranBody = null
await page.route('**/@s2c/run', async (route) => {
  ran++
  try { ranBody = route.request().postDataJSON() } catch { ranBody = 'unparseable' }
  await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
})
let etched = 0
await page.route('**/@s2c/instant', async (route) => {
  etched++
  await route.fulfill({
    status: 200, contentType: 'application/json',
    body: '{"ok":false,"reason":"stubbed — this test never writes source"}',
  })
})

await page.goto(APP, { waitUntil: 'networkidle' })

const sr = () => 'document.getElementById("s2c-overlay-host").shadowRoot'
/** Everything the style axis is supposed to be showing, out of the shadow root. */
const state = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const p = s.getElementById('fidelityPanel')
    const pr = p.getBoundingClientRect()
    const hr = s.getElementById('hud').getBoundingClientRect()
    const sel = s.getElementById('styleSel')
    const hint = s.getElementById('styleHint')
    const hr2 = hint.getBoundingClientRect()
    const selR = sel.getBoundingClientRect()
    const r2 = (n) => Math.round(n * 100) / 100
    return {
      open: getComputedStyle(p).display !== 'none',
      panel: { x: r2(pr.left), y: r2(pr.top), w: r2(pr.width), h: r2(pr.height) },
      hud: { x: r2(hr.left), y: r2(hr.top), w: r2(hr.width), h: r2(hr.height) },
      // the value AND the option's id: the ids are the contract other suites
      // address these by
      selected: sel.value,
      selectedId: sel.selectedOptions[0]?.id ?? null,
      optionIds: [...sel.options].map((o) => o.id),
      optionText: [...sel.options].map((o) => o.textContent.trim()),
      hint: hint.textContent.trim(),
      hintBox: { w: r2(hr2.width), h: r2(hr2.height) },
      // a fixed-height, nowrap hint may never be ellipsised: that would be a
      // silently half-shown sentence
      hintClipped: hint.scrollWidth > hint.clientWidth + 1,
      selBox: { w: r2(selR.width), h: r2(selR.height) },
      // the panel may not start scrolling: a popover whose controls are below
      // the fold is one the user cannot reach, and every other suite measures
      // its children against its box
      panelScrolls: p.scrollHeight > p.clientHeight + 1,
      now: s.getElementById('fidelityNow').textContent,
      title: s.getElementById('fidelityBtn').title,
      aria: s.getElementById('fidelityBtn').getAttribute('aria-label'),
      stored: localStorage.getItem('s2c:fidelity'),
    }
  })
const clickBtn = (id) => page.evaluate(`${sr()}.getElementById(${JSON.stringify(id)}).click()`)
const ensureOpen = async () => { if (!(await state()).open) await clickBtn('fidelityBtn') }
/** Pick through the real control: selectOption fires input+change like a user. */
const pick = async (k) => {
  await page.selectOption('#styleSel', k)
  return state()
}

// a virgin install: no saved fidelity, no saved HUD placement
await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await page.reload({ waitUntil: 'networkidle' })

// ---- 1. the default is 'auto' -----------------------------------------
let s = await state()
if (s.open) throw new Error('panel should start closed')
if (s.selected !== 'auto') throw new Error(`default style is "${s.selected}", want "auto"`)
if (!s.title.includes('style: auto')) throw new Error(`bar title does not carry the style: ${s.title}`)
if (s.aria !== s.title) throw new Error('aria-label drifted from title')
const pillW = s.hud.w
if (pillW > 900) throw new Error(`HUD is no longer a compact pill: ${Math.round(pillW)}px`)
// the bar must NOT have grown a fourth readout for this axis
if (/\bflat\b|\bglow\b|\bgrain\b/.test(s.now)) {
  throw new Error(`the style leaked into the always-visible readout: ${s.now}`)
}
log('✓ fresh profile defaults to auto · pill', Math.round(pillW), 'px · tooltip carries it')

// ---- 2. the six options select, and the control actually paints --------
await clickBtn('fidelityBtn')
s = await state()
if (!s.open) throw new Error('fidelityBtn did not open the panel')
if (!eq(s.optionIds, STYLES.map((k) => `style-${k}`))) {
  throw new Error(`option ids are ${s.optionIds.join(', ')}`)
}
for (const [i, t] of s.optionText.entries()) {
  if (!t.startsWith(STYLES[i])) throw new Error(`option ${i} reads "${t}"`)
  if (t.length < 8) throw new Error(`option "${t}" says nothing about the look`)
}

const paints = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const p = s2.getElementById('fidelityPanel')
  const pr = p.getBoundingClientRect()
  const sel = s2.getElementById('styleSel')
  const r = sel.getBoundingClientRect()
  const cs = getComputedStyle(sel)
  const hint = s2.getElementById('styleHint')
  const hr = hint.getBoundingClientRect()
  const label = p.querySelector('.fPickLabel')
  const lr = label.getBoundingClientRect()
  return {
    sel: {
      w: Math.round(r.width), h: Math.round(r.height),
      color: cs.color, bg: cs.backgroundColor, fontSize: cs.fontSize,
      title: sel.title,
      // a control whose centre does not hit the overlay is covered by something
      hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id,
    },
    label: { text: label.textContent.trim(), w: Math.round(lr.width), h: Math.round(lr.height) },
    hint: { w: Math.round(hr.width), h: Math.round(hr.height), color: getComputedStyle(hint).color },
    heads: [...p.querySelectorAll('.fSect')].map((e) => e.textContent.trim()),
    // the picker sits in a section, not floating in the padding
    inPanel: r.left >= pr.left && r.right <= pr.right && r.top >= pr.top && r.bottom <= pr.bottom,
    // nothing may spill out of the panel's own box (the whole panel included:
    // this control was added to a panel that was already 768 of its 868px)
    overflow: [...p.querySelectorAll('*')].filter((el) => {
      const er = el.getBoundingClientRect()
      return er.width > 0 && (er.right > pr.right + 1 || er.left < pr.left - 1 ||
        er.bottom > pr.bottom + 1 || er.top < pr.top - 1)
    }).map((el) => el.id || el.className),
  }
})
if (paints.sel.w < 120 || paints.sel.h < 16) {
  throw new Error(`the picker rendered at ${paints.sel.w}x${paints.sel.h}`)
}
if (!paints.inPanel) throw new Error('the picker is outside the panel box')
if (paints.sel.hit !== 's2c-overlay-host') throw new Error(`the picker is covered by <${paints.sel.hit}>`)
if (/rgba\(0, 0, 0, 0\)/.test(paints.sel.color)) throw new Error('the picker text is transparent')
if (/rgba\(0, 0, 0, 0\)/.test(paints.sel.bg)) throw new Error('the picker has no chrome of its own')
if (!paints.sel.title || paints.sel.title.length < 20) throw new Error('the picker has no explanatory tooltip')
if (!/Alt\+Y/.test(paints.sel.title)) throw new Error(`the picker tooltip omits the keybinding: ${paints.sel.title}`)
if (paints.label.text !== 'style' || paints.label.w < 20) {
  throw new Error(`the control is not labelled "style": ${JSON.stringify(paints.label)}`)
}
if (paints.hint.w < 200 || paints.hint.h < 12) {
  throw new Error(`style hint box is ${paints.hint.w}x${paints.hint.h} — too small to read`)
}
if (!paints.heads.includes('look')) throw new Error(`no LOOK heading over the picker: ${paints.heads.join(' / ')}`)
if (paints.overflow.length) throw new Error(`content clipped/overflowing: ${paints.overflow.join(', ')}`)
if (s.panelScrolls) throw new Error('the panel now scrolls — the style control cost it too much height')
log('✓ picker paints:', `${paints.label.text} [${paints.sel.w}x${paints.sel.h}]`,
  `· hint ${paints.hint.w}x${paints.hint.h} · panel ${s.panel.h}px, no scroll`)

// ---- 3. every option selects, and NOTHING moves -----------------------
const baseHud = s.hud
const basePanel = s.panel
const seenHints = new Set()
const hintBoxes = new Set()
const selBoxes = new Set()
for (const want of [...STYLES, 'glow', 'auto', 'soft', 'auto']) {
  const r = await pick(want)
  if (r.selected !== want) throw new Error(`picked ${want}, selection is "${r.selected}"`)
  if (r.selectedId !== `style-${want}`) throw new Error(`selected option id is "${r.selectedId}"`)
  if (!r.hint || r.hint.length < 15) throw new Error(`no hint for ${want}: ${JSON.stringify(r.hint)}`)
  if (r.hintClipped) throw new Error(`the hint for ${want} is ellipsised: "${r.hint}"`)
  if (!r.title.includes(`style: ${want}`)) throw new Error(`bar title stale for ${want}: ${r.title}`)
  if (r.aria !== r.title) throw new Error('aria-label drifted from title')
  seenHints.add(r.hint)
  hintBoxes.add(JSON.stringify(r.hintBox))
  selBoxes.add(JSON.stringify(r.selBox))
  // THE regression gate: the panel is anchored to the bar and grows upward, and
  // the bar is width:max-content centred by translateX(-50%). A shrink-to-fit
  // hint or picker moves controls out from under the cursor.
  if (!eq(r.hud, baseHud)) {
    throw new Error(`HUD moved/resized on style=${want}: ${JSON.stringify(r.hud)} vs ${JSON.stringify(baseHud)}`)
  }
  if (!eq(r.panel, basePanel)) {
    throw new Error(`panel moved/resized on style=${want}: ${JSON.stringify(r.panel)} vs ${JSON.stringify(basePanel)}`)
  }
  if (r.panelScrolls) throw new Error(`the panel scrolls at style=${want}`)
  // the other two axes are separate and must be untouched by this one
  if (r.now !== s.now) throw new Error(`the style pick rewrote the resemblance readout: ${r.now}`)
}
if (seenHints.size !== 6) throw new Error(`the hint does not change per style: ${[...seenHints].join(' | ')}`)
if (hintBoxes.size !== 1) throw new Error(`the hint box resizes with its text: ${[...hintBoxes].join(' ')}`)
if (selBoxes.size !== 1) throw new Error(`the picker resizes with its label: ${[...selBoxes].join(' ')}`)
log('✓ 6 distinct hints · HUD and panel boxes identical across 10 changes ·',
  `hint box fixed at ${JSON.parse([...hintBoxes][0]).w}x${JSON.parse([...hintBoxes][0]).h}`)

// the panel must still fit the viewport with the bar parked in any corner —
// this axis made it ~50px taller, and past ~827px it fits neither above nor
// below a bar at the top of the screen
for (const corner of [{ x: 8, y: 8 }, { x: 1250, y: 8 }, { x: 1250, y: 870 }, { x: 8, y: 870 }]) {
  await page.evaluate((c) => {
    const s2 = document.getElementById('s2c-overlay-host').shadowRoot
    const hud = s2.getElementById('hud')
    const r = hud.getBoundingClientRect()
    hud.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, composed: true, button: 0, pointerId: 1,
      clientX: r.left + 4, clientY: r.top + 4,
    }))
    hud.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, composed: true, pointerId: 1, clientX: c.x, clientY: c.y,
    }))
    hud.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, composed: true, pointerId: 1, clientX: c.x, clientY: c.y,
    }))
  }, corner)
  await ensureOpen()
  const r = await state()
  if (r.panel.y < -1 || r.panel.x < -1 ||
      r.panel.x + r.panel.w > 1281 || r.panel.y + r.panel.h > 901) {
    throw new Error(`panel overflowed the viewport at ${corner.x},${corner.y}: ${JSON.stringify(r.panel)}`)
  }
  if (r.panelScrolls) throw new Error(`the panel scrolls at corner ${corner.x},${corner.y}`)
  await page.keyboard.press('Escape')
}
await page.evaluate(() => { localStorage.removeItem('s2c:hud') })
await page.reload({ waitUntil: 'networkidle' })
log('✓ the taller panel still fits, unscrolled, with the bar in all four corners')

// ---- 4. Alt+Y cycles, Alt+Shift+Y goes back, ? lists both -------------
await ensureOpen()
await pick('auto')
const fwd = []
for (let i = 0; i < 7; i++) {
  await page.keyboard.press('Alt+KeyY')
  fwd.push((await state()).selected)
}
// six forward presses walk the whole list; the seventh wraps back to the start
if (!eq(fwd, [...STYLES.slice(1), 'auto', 'flat'])) {
  throw new Error(`Alt+Y cycle is ${fwd.join(' → ')}`)
}
const back = []
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Alt+Shift+KeyY')
  back.push((await state()).selected)
}
if (!eq(back, ['auto', 'glow', 'grain'])) throw new Error(`Alt+Shift+Y cycle is ${back.join(' → ')}`)
// the keyboard path must move nothing either
let k = await state()
if (!eq(k.hud, baseHud)) throw new Error(`Alt+Y moved the bar: ${JSON.stringify(k.hud)}`)
// and it must not have disturbed the neighbouring axes' keys
await page.keyboard.press('Alt+Digit6')
if ((await state()).selected !== 'grain') throw new Error('Alt+6 disturbed the style selection')

const helpRows = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const binds = window.__S2C_DEBUG__.keymap()
  const help = s2.getElementById('help')
  return {
    binds: binds.filter((x) => x.id === 'style-next' || x.id === 'style-prev'),
    groups: [...new Set(binds.map((x) => x.group))],
    combos: binds.map((x) => x.keys),
    listed: [...help.querySelectorAll('.hRow')].map((r) => ({
      id: r.dataset.bind,
      keys: r.querySelector('.hKeys').textContent,
      label: r.querySelector('.hLabel').textContent,
      w: Math.round(r.getBoundingClientRect().width),
    })).filter((r) => r.id === 'style-next' || r.id === 'style-prev'),
  }
})
if (helpRows.binds.length !== 2) throw new Error(`keymap has ${helpRows.binds.length} style binds, want 2`)
for (const [id, keys] of [['style-next', 'Alt+Y'], ['style-prev', 'Alt+Shift+Y']]) {
  const bind = helpRows.binds.find((x) => x.id === id)
  if (!bind) throw new Error(`no keymap entry for ${id}`)
  if (bind.keys !== keys) throw new Error(`${id} is bound to ${bind.keys}, want ${keys}`)
  if (bind.group !== 'fidelity') throw new Error(`${id} is in group "${bind.group}"`)
  if (!/style/.test(bind.label)) throw new Error(`${id} label says nothing about style: ${bind.label}`)
  const row = helpRows.listed.find((x) => x.id === id)
  if (!row) throw new Error(`the ? overlay does not list ${id}`)
  // (the row's BOX is measured further down, with the overlay actually open —
  //  a display:none panel measures 0 and proves nothing either way)
  if (row.keys !== keys) throw new Error(`help row for ${id}: ${JSON.stringify(row)}`)
}
const dupes = helpRows.combos.filter((c, i) => helpRows.combos.indexOf(c) !== i)
if (dupes.length) throw new Error(`the new binds collide: ${dupes.join(', ')}`)
// and the rows genuinely render with the overlay up
await page.keyboard.press('Escape')
await page.keyboard.press('?')
const helpPaint = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const h = s2.getElementById('help')
  return {
    open: getComputedStyle(h).display !== 'none',
    rows: ['style-next', 'style-prev'].map((id) => {
      const r = h.querySelector(`.hRow[data-bind="${id}"]`).getBoundingClientRect()
      return { id, w: Math.round(r.width), h: Math.round(r.height) }
    }),
  }
})
if (!helpPaint.open) throw new Error('? did not open the help overlay')
for (const r of helpPaint.rows) {
  if (r.w < 100 || r.h < 10) throw new Error(`help row ${r.id} rendered at ${r.w}x${r.h}`)
}
await page.keyboard.press('Escape')
log('✓ Alt+Y walks all six and wraps · Alt+Shift+Y reverses · ? lists both, no collisions')

// ---- 5. a look at each option, for human eyes -------------------------
await ensureOpen()
for (const want of STYLES) {
  await pick(want)
  await page.screenshot({ path: SHOT.replace(/\.png$/, `-${want}.png`) })
}
await pick('glow')
await page.screenshot({ path: SHOT })

// ---- 6. persistence, and the fallback ---------------------------------
s = await state()
const stored = JSON.parse(s.stored)
if (stored.style !== 'glow') throw new Error(`stored fidelity has style=${stored.style}, want glow`)
// the new field must not have displaced the rest of the object
for (const key of ['resemblance', 'keep', 'palette', 'fill']) {
  if (!(key in stored)) throw new Error(`fidelity.${key} vanished from storage`)
}
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
s = await state()
if (s.selected !== 'glow') throw new Error(`style did not survive reload: "${s.selected}"`)
if (!s.hint.includes('Dark ground')) throw new Error(`restored style not re-rendered: "${s.hint}"`)
if (!s.title.includes('style: glow')) throw new Error(`restored style missing from the tooltip: ${s.title}`)
// a junk value falls back to 'auto' and keeps every other field
await page.evaluate(() => {
  const o = JSON.parse(localStorage.getItem('s2c:fidelity'))
  o.style = 'vaporwave'
  o.resemblance = 0.7
  o.fill = 'realized'
  localStorage.setItem('s2c:fidelity', JSON.stringify(o))
})
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
s = await state()
if (s.selected !== 'auto') throw new Error(`an unknown stored style did not fall back to auto: "${s.selected}"`)
if (!s.now.includes('70%')) throw new Error(`the bad style dropped the rest of the object: ${s.now}`)
if (!s.title.includes('result: realized')) throw new Error(`the bad style dropped fill: ${s.title}`)
// and a profile saved before this axis existed (no `style` key at all)
await page.evaluate(() => {
  const o = JSON.parse(localStorage.getItem('s2c:fidelity'))
  delete o.style
  localStorage.setItem('s2c:fidelity', JSON.stringify(o))
})
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
if ((await state()).selected !== 'auto') throw new Error('a profile with no style field did not default to auto')
log("✓ the choice survives a reload · unknown and missing values fall back to 'auto', object intact")

// ---- 7. the wire: /@s2c/interpret carries fidelity.style ---------------
for (const want of ['flat', 'grain', 'auto']) {
  sent = null
  await ensureOpen()
  await pick(want)
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
  if (sent === null) throw new Error(`no /@s2c/interpret POST for style=${want}`)
  if (sent === 'unparseable') throw new Error('interpret body was not JSON')
  if (sent.fidelity?.style !== shown) {
    throw new Error(`UI shows "${shown}" but the wire carried "${sent.fidelity?.style}"`)
  }
  // the rest of the fidelity contract must be intact alongside the new field
  for (const key of ['resemblance', 'keep', 'palette', 'fill']) {
    if (!(key in (sent.fidelity ?? {}))) throw new Error(`fidelity.${key} vanished from the payload`)
  }
  log(`  · style=${want} → wire`, JSON.stringify(sent.fidelity))
  // …and the SECOND half of the contract: ✓ Go sends the same object to
  // /@s2c/run. Once is enough — both bodies come from one fidelityPayload().
  if (want === 'grain') {
    ranBody = null
    await clickBtn('confirm')
    for (let i = 0; i < 60 && ranBody === null; i++) await page.waitForTimeout(100)
    if (ranBody === null) throw new Error('✓ Go made no /@s2c/run POST')
    if (ranBody === 'unparseable') throw new Error('run body was not JSON')
    if (ranBody.fidelity?.style !== shown) {
      throw new Error(`run body carried style "${ranBody.fidelity?.style}", UI shows "${shown}"`)
    }
    log('  · ✓ Go → /@s2c/run carried style', JSON.stringify(ranBody.fidelity.style))
  }
  // the stub answers with an (empty) reading, so the overlay lands in preview
  // mode — walk the Escape ladder back to idle before the next round
  for (let i = 0; i < 4; i++) {
    const mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if (mode === 'idle') break
    await page.keyboard.press('Escape')
  }
  await clickBtn('clear')
}
log('✓ POST /@s2c/interpret carries exactly the style the UI shows (3/3, zero model calls)')
log(`  (stubs answered: ${etched} instant, ${ran} run — no source was written)`)

await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await b.close()
log('ALL STYLE CHECKS PASSED')

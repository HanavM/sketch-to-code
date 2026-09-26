/**
 * Live e2e: the fidelity controls — the user's half of the fidelity contract.
 * Everything up to step 6 is free (zero model calls); step 6 spends ONE real
 * interpret call because the only assertion that actually matters is what
 * lands in the request body. Asserts:
 *   1. a fresh install shows the documented defaults, and the HUD stays a
 *      compact pill (the panel is out of flow, so it must not widen the bar)
 *   2. #fidelityBtn toggles the panel; it PAINTS (non-zero box, opaque
 *      background, real text) rather than merely reporting a rect
 *   3. dragging the slider renames the zone live across all four bands
 *      (reinterpret / normalize / rebuild / trace) and the bar's always-
 *      visible readout follows
 *   4. Escape closes the panel and STOPS — it must not fall through to the
 *      rest of the Escape ladder (tweak mode underneath survives); a click
 *      outside closes it too
 *   5. the panel stays on screen with the bar dragged into a corner, and
 *      settings survive a reload (localStorage 's2c:fidelity')
 *   6. POST /@s2c/interpret carries a `fidelity` object deep-equal to what
 *      the controls are showing
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-fidelity]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const sr = () => 'document.getElementById("s2c-overlay-host").shadowRoot'
/** Everything the panel is supposed to be showing, read out of the shadow root. */
const state = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const p = s.getElementById('fidelityPanel')
    const pr = p.getBoundingClientRect()
    const hr = s.getElementById('hud').getBoundingClientRect()
    const keep = {}
    for (const k of ['asymmetry', 'rhythm', 'proportions', 'placement']) {
      keep[k] = s.getElementById(`keep-${k}`).checked
    }
    return {
      open: getComputedStyle(p).display !== 'none',
      panel: { x: pr.left, y: pr.top, w: pr.width, h: pr.height },
      hud: { x: hr.left, y: hr.top, w: hr.width, h: hr.height },
      resemblance: Number(s.getElementById('fidelityRange').value) / 100,
      zone: s.getElementById('fidelityZone').textContent,
      hint: s.getElementById('fidelityHint').textContent,
      now: s.getElementById('fidelityNow').textContent,
      title: s.getElementById('fidelityBtn').title,
      expanded: s.getElementById('fidelityBtn').getAttribute('aria-expanded'),
      keep,
      palette: s.getElementById('palette-app').classList.contains('on') ? 'app'
        : s.getElementById('palette-sketch').classList.contains('on') ? 'sketch' : null,
      stored: localStorage.getItem('s2c:fidelity'),
    }
  })
const clickBtn = (id) => page.evaluate(`${sr()}.getElementById(${JSON.stringify(id)}).click()`)
/** The button TOGGLES, so 'click it to open' is only true when it is shut. */
const ensureOpen = async () => { if (!(await state()).open) await clickBtn('fidelityBtn') }

// a virgin install: no saved fidelity, no saved HUD placement
await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await page.reload({ waitUntil: 'networkidle' })

// ---- 1. defaults + the pill stays a pill ------------------------------
let s = await state()
if (s.open) throw new Error('panel should start closed')
if (s.resemblance !== 0.5) throw new Error(`default resemblance ${s.resemblance}, want 0.5`)
if (!eq(s.keep, { asymmetry: true, rhythm: true, proportions: true, placement: true })) {
  throw new Error(`default keep flags wrong: ${JSON.stringify(s.keep)}`)
}
if (s.palette !== 'app') throw new Error(`default palette ${s.palette}, want app`)
const pillW = s.hud.w
if (pillW > 900) throw new Error(`HUD is no longer a compact pill: ${Math.round(pillW)}px`)
log('✓ defaults: 0.5 / all kept / app · pill', Math.round(pillW), 'px wide ·', JSON.stringify(s.now))

// ---- 2. the panel opens AND actually paints ---------------------------
await clickBtn('fidelityBtn')
s = await state()
if (!s.open) throw new Error('fidelityBtn did not open the panel')
if (s.expanded !== 'true') throw new Error('aria-expanded did not follow the panel')
if (s.hud.w > pillW + 1) throw new Error(`open panel widened the bar to ${Math.round(s.hud.w)}px`)
if (s.panel.w < 200 || s.panel.h < 150) {
  throw new Error(`panel box is too small to hold the controls: ${s.panel.w}x${s.panel.h}`)
}
// A rect is NOT proof of rendering (a zero-sized <svg> once reported perfect
// geometry while painting nothing). Sample real pixels: the panel's own
// centre must be the opaque dark chrome, not whatever is behind it.
const paints = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const p = s2.getElementById('fidelityPanel')
  const cs = getComputedStyle(p)
  const r = p.getBoundingClientRect()
  // what does a hit-test at the panel's centre actually reach?
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  const rows = [...p.querySelectorAll('.fCheck')].map((el) => ({
    text: el.textContent.trim(),
    w: el.getBoundingClientRect().width,
    h: el.getBoundingClientRect().height,
  }))
  return {
    bg: cs.backgroundColor,
    opacity: cs.opacity,
    visibility: cs.visibility,
    hitIsOverlay: hit?.id === 's2c-overlay-host',
    zoneW: s2.getElementById('fidelityZone').getBoundingClientRect().width,
    rangeW: s2.getElementById('fidelityRange').getBoundingClientRect().width,
    rows,
    // nothing may spill out of the panel's own box
    overflow: [...p.querySelectorAll('*')].filter((el) => {
      const er = el.getBoundingClientRect()
      return er.width > 0 && (er.right > r.right + 1 || er.left < r.left - 1 || er.bottom > r.bottom + 1)
    }).map((el) => el.id || el.className),
  }
})
if (paints.opacity !== '1' || paints.visibility !== 'visible') {
  throw new Error(`panel is present but not visible: ${JSON.stringify(paints)}`)
}
if (!/rgba?\(17, 24, 39/.test(paints.bg)) throw new Error(`panel lost its dark chrome: ${paints.bg}`)
if (!paints.hitIsOverlay) throw new Error('panel centre is not hit-testable — something covers it')
if (paints.zoneW < 40) throw new Error('zone label rendered with no width')
if (paints.rangeW < 80) throw new Error(`slider collapsed to ${paints.rangeW}px`)
if (paints.rows.length !== 4) throw new Error(`want 4 keep rows, got ${paints.rows.length}`)
for (const r of paints.rows) {
  if (r.h < 12 || r.w < 60 || !r.text) throw new Error(`keep row not rendered: ${JSON.stringify(r)}`)
}
if (paints.overflow.length) throw new Error(`content clipped/overflowing: ${paints.overflow.join(', ')}`)
log('✓ panel paints:', paints.bg, `· slider ${Math.round(paints.rangeW)}px ·`,
  paints.rows.map((r) => r.text).join(' / '))

// ---- 3. the slider renames the zone live ------------------------------
const setRange = async (pct) => {
  await page.evaluate((v) => {
    const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('fidelityRange')
    el.value = String(v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, pct)
  return state()
}
const trackWidths = new Set()
for (const [pct, want] of [[10, 'reinterpret'], [34, 'reinterpret'], [35, 'normalize'], [50, 'normalize'],
  [59, 'normalize'], [60, 'rebuild'], [70, 'rebuild'], [84, 'rebuild'], [85, 'trace'], [100, 'trace']]) {
  const r = await setRange(pct)
  if (!r.zone.includes(want)) throw new Error(`${pct}% → "${r.zone}", want "${want}"`)
  if (r.now !== `${want} ${pct}%`) throw new Error(`bar readout "${r.now}" at ${pct}%, want "${want} ${pct}%"`)
  if (!r.hint || r.hint.length < 15) throw new Error(`no zone hint at ${pct}%`)
  trackWidths.add(Math.round(await page.evaluate(() => document.getElementById('s2c-overlay-host')
    .shadowRoot.getElementById('fidelityRange').getBoundingClientRect().width)))
  // the zone name also lands in the bar; a shrink-to-fit readout would slide
  // the whole centred pill sideways on every tick
  if (Math.abs(r.hud.x - s.hud.x) > 1 || Math.abs(r.hud.w - s.hud.w) > 1) {
    throw new Error(`the bar itself moved/resized at ${pct}%: ${JSON.stringify(r.hud)}`)
  }
}
// the zone name changes on every input event; if its label were shrink-to-fit
// the track would resize under the thumb and re-map cursor position to value
if (trackWidths.size !== 1) throw new Error(`slider track resizes with the zone name: ${[...trackWidths]}`)
log('✓ all four zones name themselves live, the bar readout follows, track stays',
  [...trackWidths][0], 'px')

// also drag the real thumb once — the zone must change mid-gesture, not only
// on release (that live feedback is the whole point of naming the zones)
await setRange(0)
const knob = await page.evaluate(() => {
  const r = document.getElementById('s2c-overlay-host').shadowRoot
    .getElementById('fidelityRange').getBoundingClientRect()
  return { x: r.left, y: r.top + r.height / 2, w: r.width }
})
await page.mouse.move(knob.x + 4, knob.y)
await page.mouse.down()
await page.mouse.move(knob.x + knob.w * 0.95, knob.y, { steps: 10 })
const midDrag = await state()
if (!midDrag.zone.includes('trace')) throw new Error(`mid-drag zone stuck at "${midDrag.zone}"`)
await page.mouse.up()
// and dragging the slider must NOT have dragged the whole toolbar with it
if (Math.abs((await state()).hud.x - s.hud.x) > 2) throw new Error('slider drag moved the HUD')
log('✓ thumb drag updates live and does not drag the bar')

// ---- 4. Escape closes the panel and stops there -----------------------
// arm tweak mode underneath: if Escape fell through, this would be torn down
await clickBtn('tweakBtn')
await ensureOpen()
if (!(await state()).open) throw new Error('panel did not reopen over tweak mode')
await page.keyboard.press('Escape')
s = await state()
if (s.open) throw new Error('Escape did not close the panel')
if (s.expanded !== 'false') throw new Error('aria-expanded stuck open')
let mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
if (mode !== 'tweak') throw new Error(`Escape fell through the ladder — mode is now "${mode}"`)
log('✓ Escape closed the panel only; tweak mode underneath survived')

// Escape with focus parked IN the slider must still close it
await ensureOpen()
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot
  .getElementById('fidelityRange').focus())
await page.keyboard.press('Escape')
if ((await state()).open) throw new Error('Escape from inside the slider did not close the panel')
log('✓ Escape works with focus inside the panel')

// click-outside
await ensureOpen()
if (!(await state()).open) throw new Error('panel did not reopen')
await page.mouse.click(60, 60)
if ((await state()).open) throw new Error('click outside did not close the panel')
// …and with the panel out of the way the rest of the ladder runs as it always
// did: that click landed in tweak mode, so it selected something — Esc now
// deselects, then leaves tweak (two rungs, in that order)
for (let i = 0; i < 3; i++) {
  mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
  if (mode === 'idle') break
  await page.keyboard.press('Escape')
}
mode = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
if (mode !== 'idle') throw new Error(`Escape ladder broken below the panel (mode=${mode})`)
log('✓ click-outside closes; the ladder below is intact')

// ---- 5. stays on screen in a corner, and survives a reload ------------
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
  if (!r.open) throw new Error('panel failed to open in a corner')
  if (r.panel.x < -1 || r.panel.y < -1 ||
      r.panel.x + r.panel.w > 1281 || r.panel.y + r.panel.h > 901) {
    throw new Error(`panel overflowed the viewport at ${corner.x},${corner.y}: ${JSON.stringify(r.panel)}`)
  }
  await page.keyboard.press('Escape')
}
log('✓ panel stays inside the viewport with the bar in all four corners')

// set a distinctive, non-default state and reload
await page.evaluate(() => { localStorage.removeItem('s2c:hud') })
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
await setRange(70)
await clickBtn('keep-rhythm')       // off
await clickBtn('keep-placement')    // off
await clickBtn('palette-sketch')
const want = {
  resemblance: 0.7,
  keep: { asymmetry: true, rhythm: false, proportions: true, placement: false },
  palette: 'sketch',
  // the second axis (how filled-in the result is) rides in the same object and
  // is covered on its own in live-fill.mjs; left at its default here
  fill: 'filled',
  // likewise the aesthetic, covered in live-style.mjs
  style: 'auto',
}
s = await state()
if (!eq(JSON.parse(s.stored), want)) throw new Error(`stored ${s.stored}, want ${JSON.stringify(want)}`)
await page.reload({ waitUntil: 'networkidle' })
await ensureOpen()
s = await state()
if (s.resemblance !== want.resemblance || !eq(s.keep, want.keep) || s.palette !== want.palette) {
  throw new Error(`settings did not survive reload: ${JSON.stringify(s)}`)
}
if (!s.zone.includes('rebuild') || s.now !== 'rebuild 70%') {
  throw new Error(`restored controls not reflected: "${s.zone}" / "${s.now}"`)
}
log('✓ settings persisted and re-rendered after reload:', s.now, s.palette)

// a look at the open panel, for human eyes
await page.screenshot({ path: process.env.S2C_SHOT ?? '/tmp/s2c-fidelity-panel.png' })

// ---- 6. the wire: /@s2c/interpret actually carries it -----------------
await page.keyboard.press('Escape')
let sent = null
page.on('request', (req) => {
  if (req.url().includes('/@s2c/interpret') && req.method() === 'POST') {
    try { sent = req.postDataJSON().fidelity } catch { sent = 'unparseable' }
  }
})
// a real stroke: a 2-point drag is discarded as noise, so draw a proper one
await page.keyboard.press('Alt+KeyD')
await page.mouse.move(420, 520)
await page.mouse.down()
for (let i = 1; i <= 10; i++) await page.mouse.move(420 + i * 16, 520 + (i % 2 ? 12 : -8), { steps: 2 })
await page.mouse.up()
await clickBtn('run')
for (let i = 0; i < 120 && sent === null; i++) await page.waitForTimeout(500)
if (sent === null) throw new Error('no /@s2c/interpret POST was ever made')
if (!eq(sent, want)) {
  throw new Error(`request body fidelity ${JSON.stringify(sent)} != controls ${JSON.stringify(want)}`)
}
log('✓ POST /@s2c/interpret carried', JSON.stringify(sent))

await page.evaluate(() => { localStorage.removeItem('s2c:fidelity'); localStorage.removeItem('s2c:hud') })
await b.close()
log('ALL FIDELITY CHECKS PASSED')

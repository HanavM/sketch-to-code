/**
 * Live e2e: SHOW THE PLAN before spending tokens, and the ATTEMPTS control.
 *
 * Zero model calls — /@s2c/interpret and /@s2c/run are both stubbed with
 * page.route, so the whole file is free and deterministic. The interpret stub
 * is built FROM LIVE ELEMENT RECTS on the page, which is what makes the
 * geometry assertions mean anything: the plan is supposed to outline the
 * actual boxes, not boxes of its own invention.
 *
 * Asserts:
 *   1. every action's target rect is outlined, in its kind's own colour, at
 *      the live element's real position, with the wide delete drawn heavier
 *   2. labels name the action and its target (e2 · <button>) and PAINT —
 *      non-zero, opaque, and a clipped screenshot that changes when the layer
 *      is hidden (a rect is not proof: this repo has shipped a 0×0 <svg> that
 *      reported perfect geometry while painting nothing)
 *   3. move draws source → destination with a head; design outlines its region
 *   4. the resolved colour is a really-painted swatch plus its token name
 *   5. typed notes render verbatim — uncut, unellipsised
 *   6. ZERO drift across a 200px scroll, checked against the live elements
 *   7. ✗ Cancel and ✓ Go still work; the ✓ Go body carries a TOP-LEVEL
 *      `candidates` and an unchanged `fidelity`
 *   8. the attempts segment selects, persists (s2c:candidates), survives a
 *      reload, falls back to 1 on garbage, answers Alt+8 / Alt+9, is listed in
 *      the ? overlay, and moves neither the HUD nor the panel when it changes
 *   9. a `candidate` stage SSE event reaches the status line
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp'
const log = (...a) => console.log('[e2e-preview]', ...a)
const near = (a, z, tol = 1.5) => Math.abs(a - z) <= tol

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
// Hold on to the overlay's own EventSource so step 9 can deliver a real
// server-shaped event to the handler the overlay actually registered.
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

const sr = () => 'document.getElementById("s2c-overlay-host").shadowRoot'
const click = (id) => page.evaluate(`${sr()}.getElementById(${JSON.stringify(id)}).click()`)
const status = () => page.evaluate(`${sr()}.getElementById("status").textContent`)
const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)

// ---- pick five real elements and read their PAGE rects ------------------
// Page coords (client + scroll), because that is the space the server's
// interpretation speaks and the space the plan layer is laid out in.
const picked = await page.evaluate(() => {
  const pageRect = (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }
  }
  // real, text-bearing HTML boxes: an 80×600 decorative <svg> outlines fine
  // but makes a screenshot nobody can read
  const chosen = []
  for (const el of document.querySelectorAll('[data-s2c]')) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
    if (!(el.textContent ?? '').trim()) continue
    const r = el.getBoundingClientRect()
    const a = r.width * r.height
    if (a < 3000 || a > 90000 || r.top < 40 || r.top > 640 || r.width < 80 || r.height < 30) continue
    if (chosen.some((c) => c.contains(el) || el.contains(c))) continue
    chosen.push(el)
    if (chosen.length === 5) break
  }
  if (chosen.length < 5) throw new Error(`only found ${chosen.length} disjoint elements`)
  return chosen.map((el, i) => {
    const loc = el.getAttribute('data-s2c')
    return {
      domId: `e${i + 1}`,
      tag: el.tagName.toLowerCase(),
      text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 30),
      srcLoc: loc,
      // a .map()'d template stamps every instance with the SAME srcLoc, so
      // the instance index is the only way to re-find this exact box later
      idx: [...document.querySelectorAll(`[data-s2c="${loc}"]`)].indexOf(el),
      rect: pageRect(el),
    }
  })
})
log('targets:', picked.map((p) => `${p.domId}=<${p.tag}> ${Math.round(p.rect.w)}x${Math.round(p.rect.h)}`).join(' · '))

const NOTE_A = 'the red one, not the pink one — and keep the corner sharp'
const NOTE_B = 'this whole band sits BEHIND the cards'
const REGION = {
  x: Math.round(picked[0].rect.x),
  y: Math.round(Math.max(...picked.map((p) => p.rect.y + p.rect.h)) + 30),
  w: 340,
  h: 150,
}
const target = (p) => ({
  domId: p.domId, srcLoc: p.srcLoc, tag: p.tag, text: p.text,
  subtreeText: p.text, classes: [], rect: p.rect,
})

/** A realistic grounded interpretation covering four kinds. */
const INTERPRETATION = {
  reading: 'Delete the two scribbled blocks, move the third above the fourth, recolour the fifth, and add a ribbon below.',
  unclear: null,
  rejected: [],
  runNotes: ['do not touch the header'],
  actions: [
    {
      kind: 'delete',
      targets: [target(picked[0]), target(picked[1])],
      instruction: 'remove both scribbled-out blocks',
      needsConfirm: true,
    },
    {
      kind: 'move',
      targets: [target(picked[2])],
      dest: target(picked[3]),
      position: 'before',
      instruction: 'move it above the other one',
      needsConfirm: false,
    },
    {
      kind: 'modify',
      targets: [target(picked[4])],
      instruction: 'make this one red',
      color: { drawn: '#e11d48', nearest: { token: 'bg-rose-600', css: '#e11d48' }, distance: 2.4 },
      notes: [NOTE_A],
      needsConfirm: false,
    },
    {
      kind: 'design',
      targets: [],
      region: REGION,
      instruction: 'a wavy decorative ribbon sweeping across the section',
      depicts: 'ribbon',
      fidelity: 'verbatim',
      color: { drawn: '#0ea5e9', nearest: { token: 'text-sky-500', css: '#0ea5e9' }, distance: 1.1 },
      notes: [NOTE_B],
      needsConfirm: false,
    },
  ],
}

let runBody = null
await page.route('**/@s2c/interpret', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: INTERPRETATION,
        raw: { reading: INTERPRETATION.reading, actions: [], unclear: null },
        tokens: { input: 4210, cacheRead: 0, output: 380 },
      },
    }),
  }))
await page.route('**/@s2c/run', (route) => {
  runBody = JSON.parse(route.request().postData() ?? '{}')
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
})

/** One scribble over the first target, so ▶ Run has work to do. */
async function scribble() {
  // design mode is live on load now, so a blind Alt+D toggles drawing OFF
  for (let i = 0; i < 3; i++) {
    const m = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
    if (m === 'draw') break
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(140)
  }
  const { x, y } = picked[0].rect
  await page.mouse.move(x + 20, y + 20)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + 20 + i * 12, y + 20 + (i % 2 ? 14 : -14), { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(150)
}
async function preview() {
  await click('run')
  for (let i = 0; i < 40 && (await mode()) !== 'preview'; i++) await page.waitForTimeout(100)
  if ((await mode()) !== 'preview') throw new Error(`never entered preview: ${await status()}`)
}

await scribble()
await preview()
log('status:', await status())

/** Everything the plan layer is showing, read out of the shadow root. */
const plan = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const layer = s.getElementById('plan')
    const svg = s.getElementById('planSvg')
    const box = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    }
    return {
      on: getComputedStyle(layer).display !== 'none',
      pointer: getComputedStyle(layer).pointerEvents,
      svg: box(svg),
      rects: [...svg.querySelectorAll('rect')].map((r) => ({
        cls: r.getAttribute('class'),
        stroke: getComputedStyle(r).stroke,
        dash: getComputedStyle(r).strokeDasharray,
        sw: Number.parseFloat(getComputedStyle(r).strokeWidth),
        ...box(r),
      })),
      lines: [...svg.querySelectorAll('line')].map((l) => ({
        stroke: getComputedStyle(l).stroke,
        x1: +l.getAttribute('x1'), y1: +l.getAttribute('y1'),
        x2: +l.getAttribute('x2'), y2: +l.getAttribute('y2'),
      })),
      heads: [...svg.querySelectorAll('polygon')].map((p) => ({ fill: getComputedStyle(p).fill, ...box(p) })),
      // The plan's words used to be a slab over every target; they are one card
      // now, and a travelling cursor carries "where". Same questions, two
      // surfaces: the card must NAME each action and the cursor must VISIT the
      // right rects.
      card: [...(document.getElementById('s2c-overlay-host').shadowRoot
        .querySelectorAll('#planCard .cRow'))].map((el) => {
        const sw = el.querySelector('.cSwatch')
        return {
          kind: el.querySelector('.cKind')?.textContent ?? null,
          what: el.querySelector('.cWhat')?.textContent ?? null,
          instr: el.querySelector('.cInstr')?.textContent ?? null,
          token: el.querySelector('.cToken')?.textContent ?? null,
          swatch: sw ? { bg: getComputedStyle(sw).backgroundColor, ...box(sw) } : null,
          notes: [...el.querySelectorAll('.cNote')].map((n) => n.textContent),
          ...box(el),
        }
      }),
      stops: window.__S2C_DEBUG__.plan(),
      cardBox: (() => {
        const c = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('planCard')
        const cs = getComputedStyle(c)
        return { shown: cs.display !== 'none', bg: cs.backgroundColor, ...box(c) }
      })(),
      labels: [...layer.querySelectorAll('.planLabel')].map((el) => {
        const cs = getComputedStyle(el)
        const sw = el.querySelector('.pSwatch')
        return {
          kind: el.querySelector('.pKind')?.textContent ?? null,
          what: el.querySelector('.pWhat')?.textContent ?? null,
          instr: el.querySelector('.pInstr')?.textContent ?? null,
          token: el.querySelector('.pToken')?.textContent ?? null,
          swatch: sw ? { bg: getComputedStyle(sw).backgroundColor, ...box(sw) } : null,
          notes: [...el.querySelectorAll('.pNote')].map((n) => n.textContent),
          bg: cs.backgroundColor,
          fontSize: Number.parseFloat(cs.fontSize),
          opacity: Number(cs.opacity),
          visibility: cs.visibility,
          ...box(el),
        }
      }),
    }
  })

let p = await plan()
if (!p.on) throw new Error('#plan layer is not displayed')
// the layer must never eat the per-shape correction tap meant for the canvas
if (p.pointer !== 'none') throw new Error(`#plan takes pointer events (${p.pointer})`)
// the 0×0-<svg> trap: a layer with no box renders nothing, whatever its
// children report to getBoundingClientRect
if (p.svg.w < 100 || p.svg.h < 100) throw new Error(`#planSvg has no box: ${p.svg.w}x${p.svg.h}`)

// ---- 1. every target rect outlined, in its kind's colour ----------------
const KIND_RGB = {
  delete: 'rgb(220, 38, 38)', modify: 'rgb(217, 119, 6)', move: 'rgb(37, 99, 235)',
  swap: 'rgb(124, 58, 237)', add: 'rgb(5, 150, 105)', design: 'rgb(8, 145, 178)',
}
const liveRects = () =>
  page.evaluate((refs) =>
    refs.map(({ loc, idx }) => {
      const r = document.querySelectorAll(`[data-s2c="${loc}"]`)[idx].getBoundingClientRect()
      return { x: r.left, y: r.top, w: r.width, h: r.height }
    }), picked.map((x) => ({ loc: x.srcLoc, idx: x.idx })))
const live = await liveRects()

for (const e of [
  { kind: 'delete', box: live[0] }, { kind: 'delete', box: live[1] },
  { kind: 'move', box: live[2] }, { kind: 'move', box: live[3] },
  { kind: 'modify', box: live[4] },
]) {
  const hit = p.rects.find((r) =>
    r.stroke === KIND_RGB[e.kind] &&
    near(r.x, e.box.x, 1.5) && near(r.y, e.box.y, 1.5) &&
    near(r.w, e.box.w, 1.5) && near(r.h, e.box.h, 1.5))
  if (!hit) {
    throw new Error(
      `no ${e.kind}-coloured outline at ${JSON.stringify(e.box)}; drew ` +
      JSON.stringify(p.rects.map((r) => [r.cls, r.stroke, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)])),
    )
  }
}
const region = p.rects.find((r) => r.cls === 'pRegion')
if (!region) throw new Error('design action drew no region outline')
if (region.stroke !== KIND_RGB.design) throw new Error(`region stroke ${region.stroke}`)
if (!/\d/.test(region.dash)) throw new Error(`region is not dashed: ${region.dash}`)
if (!near(region.w, REGION.w, 1.5)) throw new Error(`region is ${region.w}px wide, want ${REGION.w}`)
// the destructive action gets the heavier line — that weight difference is
// the only visual warning ⚠ carries
const delRect = p.rects.find((r) => r.stroke === KIND_RGB.delete)
const modRect = p.rects.find((r) => r.stroke === KIND_RGB.modify)
if (delRect.sw <= modRect.sw) throw new Error(`wide delete is not heavier: ${delRect.sw} vs ${modRect.sw}`)
log(`✓ ${p.rects.length} outlines on the live rects, colour-coded · region dashed · ⚠ delete ${delRect.sw}px vs ${modRect.sw}px`)

// ---- 2. the card names every action; the cursor visits every target -----
// There are no labels on the page at all now, and that is the point: a slab
// over each target buried the page it was explaining.
if (p.labels.length !== 0) {
  throw new Error(`${p.labels.length} slabs are still painted over the page`)
}
if (!p.cardBox.shown) throw new Error('the plan card is not shown while a plan waits')
// one row per ACTION (not per target): delete, move, modify, design
if (p.card.length !== 4) {
  throw new Error(`expected 4 card rows (delete, move, modify, design), got ${p.card.length}: ` +
    JSON.stringify(p.card.map((c) => c.kind)))
}
for (const l of p.card) {
  if (l.w < 100 || l.h < 12) throw new Error(`card row "${l.kind} ${l.what}" is unreadably small: ${l.w}x${l.h}`)
}
const named = p.card.map((l) => `${l.kind}|${l.what}`)
for (const want of ['DELETE|', 'MOVE|', 'MODIFY|', 'DESIGN|']) {
  // the wide delete keeps its ⚠, which is the point of the marker
  if (!named.some((n) => n.replace(/^⚠ /, '').startsWith(want))) {
    throw new Error(`no card row "${want}" among ${JSON.stringify(named)}`)
  }
}
// one row for a two-target delete, naming both: the consolidation is the whole
// reason the slabs went away
const del = p.card.find((l) => l.kind.includes('DELETE'))
if (!/e1 .*e2/s.test(del.what)) throw new Error(`the delete row does not name both targets: ${del.what}`)
if (!p.card.some((l) => (l.instr ?? '').includes('move it above'))) throw new Error('the card carries no instruction')
log('✓ card rows:', JSON.stringify(named))

// the cursor: one stop per TARGET, each on the live rect of the thing it means
const stops = await page.evaluate(() => window.__S2C_DEBUG__.plan())
if (stops.length !== 6) {
  throw new Error(`expected 6 cursor stops (2 delete + move + TO + modify + design), got ${stops.length}`)
}
const cur = await page.evaluate(() => window.__S2C_DEBUG__.cursor())
if (!cur) throw new Error('a plan is showing and no cursor is working it')
if (cur.stops !== 6) throw new Error(`the cursor knows ${cur.stops} stops, not 6`)
log('✓ cursor:', JSON.stringify({ phase: cur.phase, stops: cur.stops, colour: cur.color }))

// it MOVES, and its tail grows — a cursor that computes a position and paints
// nothing would satisfy every assertion above
const first = await page.evaluate(() => window.__S2C_DEBUG__.cursor())
await page.waitForTimeout(700)
const later = await page.evaluate(() => window.__S2C_DEBUG__.cursor())
if (Math.hypot(later.x - first.x, later.y - first.y) < 2) {
  throw new Error(`the cursor is frozen at ${JSON.stringify(first)}`)
}
if (later.trail < 5) throw new Error(`the cursor leaves no trail (${later.trail} points)`)
log(`✓ the cursor moves (${Math.round(Math.hypot(later.x - first.x, later.y - first.y))}px in 0.7s) and trails ${later.trail} points`)

// A rect is not paint: clip a box around the cursor, hide the canvas, shoot
// again. Identical bytes mean nothing was ever drawn there.
const at = await page.evaluate(() => window.__S2C_DEBUG__.cursor())
const clip = {
  x: Math.max(0, Math.round(at.x) - 30), y: Math.max(0, Math.round(at.y) - 30),
  width: 60, height: 60,
}
const withCursor = await page.screenshot({ clip })
await page.evaluate(`${sr()}.getElementById("canvas").style.display = "none"`)
const withoutCursor = await page.screenshot({ clip })
await page.evaluate(`${sr()}.getElementById("canvas").style.display = ""`)
if (Buffer.compare(withCursor, withoutCursor) === 0) {
  throw new Error('hiding the canvas changed nothing where the cursor is — it paints nothing')
}
log(`✓ the cursor really paints (${withCursor.length} vs ${withoutCursor.length} bytes)`)

// ---- 3. move draws the relationship ------------------------------------
const arrow = p.lines.find((l) => l.stroke === KIND_RGB.move)
if (!arrow) throw new Error(`no move-coloured arrow: ${JSON.stringify(p.lines)}`)
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const src = centre(picked[2].rect)
const dst = centre(picked[3].rect)
const span = Math.hypot(dst.x - src.x, dst.y - src.y)
if (Math.hypot(arrow.x1 - src.x, arrow.y1 - src.y) > 20) throw new Error(`arrow does not start at the source: ${JSON.stringify(arrow)}`)
if (Math.hypot(arrow.x2 - dst.x, arrow.y2 - dst.y) > 20) throw new Error(`arrow does not end at the destination: ${JSON.stringify(arrow)}`)
if (span < 24) throw new Error('picked elements are too close to test the arrow')
const head = p.heads.find((h) => h.fill === KIND_RGB.move)
if (!head || head.w < 3 || head.h < 3) throw new Error(`arrow has no visible head: ${JSON.stringify(p.heads)}`)
log('✓ move arrow: source centre → destination centre, with a painted head')

// ---- 4. colour swatch + token name --------------------------------------
const rose = p.card.find((l) => l.token === 'bg-rose-600')
if (!rose) throw new Error(`no card row carries the resolved token: ${JSON.stringify(p.card.map((l) => l.token))}`)
if (!rose.swatch) throw new Error('token shown without a swatch')
if (rose.swatch.bg !== 'rgb(225, 29, 72)') throw new Error(`swatch paints ${rose.swatch.bg}, want rgb(225, 29, 72)`)
if (rose.swatch.w < 8 || rose.swatch.h < 8) throw new Error(`swatch is ${rose.swatch.w}x${rose.swatch.h}`)
const sky = p.card.find((l) => l.token === 'text-sky-500')
if (!sky?.swatch || sky.swatch.bg !== 'rgb(14, 165, 233)') throw new Error('design action lost its colour')
log('✓ swatches paint the resolved colour and name the token: bg-rose-600, text-sky-500')

// ---- 5. notes render verbatim -------------------------------------------
const allNotes = p.card.flatMap((l) => l.notes)
if (!allNotes.includes(NOTE_A)) throw new Error(`note A not verbatim: ${JSON.stringify(allNotes)}`)
if (!allNotes.includes(NOTE_B)) throw new Error(`note B not verbatim: ${JSON.stringify(allNotes)}`)
if (!(await status()).includes('do not touch the header')) {
  throw new Error(`run-scope note missing from the status line: ${await status()}`)
}
log('✓ notes verbatim · run-scope note in the status line')

// the money shot: four actions outlined over the real page
await page.screenshot({ path: `${SHOTS}/s2c-plan.png` })

// ---- 6. zero drift across a 200px scroll --------------------------------
const beforePlan = p
await page.evaluate(() => window.scrollTo(0, 200))
await page.waitForTimeout(250)
const scrolled = await page.evaluate(() => window.scrollY)
if (scrolled < 150) throw new Error(`page did not scroll (${scrolled}px)`)
const afterPlan = await plan()
const liveAfter = await liveRects()
for (let i = 0; i < live.length; i++) {
  if (Math.abs(liveAfter[i].y - (live[i].y - scrolled)) > 1) {
    throw new Error(`element ${i} moved ${liveAfter[i].y - live[i].y}, expected ${-scrolled}`)
  }
}
for (let i = 0; i < beforePlan.rects.length; i++) {
  const a = beforePlan.rects[i], z = afterPlan.rects[i]
  if (Math.abs(z.y - (a.y - scrolled)) > 1 || Math.abs(z.x - a.x) > 1) {
    throw new Error(`outline ${i} drifted: ${a.x},${a.y} → ${z.x},${z.y} over ${scrolled}px`)
  }
}
// the cursor's stops are viewport coords too, so they must track the same way
const stopsBefore = beforePlan.stops ?? []
const stopsAfter = afterPlan.stops ?? []
for (let i = 0; i < stopsBefore.length; i++) {
  const a = stopsBefore[i], z = stopsAfter[i]
  if (Math.abs(z.y - (a.y - scrolled)) > 1 || Math.abs(z.x - a.x) > 1) {
    throw new Error(`cursor stop ${i} drifted: ${a.x},${a.y} → ${z.x},${z.y} over ${scrolled}px`)
  }
}
log(`✓ zero drift across ${scrolled}px of scroll — outlines and the cursor's stops both`)
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(150)

// …and zoom, which is the other half of "tracks exactly like the ink does".
// Zoom is not a scroll: a responsive layout RE-FLOWS under it, so page
// coordinates captured before it are legitimately stale — the ink has the
// same property, which is what the stroke-anchor machinery exists for. What
// must hold is that the plan lives in the SAME page-space frame as the ink
// and is scaled by exactly the same factor, so the two can never diverge.
await page.evaluate(() => { document.documentElement.style.zoom = '1.25' })
await page.waitForTimeout(250)
{
  const frames = await page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = (id) => { const r = s.getElementById(id).getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }
    return { probe: box('scaleProbe'), ink: box('ink'), plan: box('planSvg') }
  })
  const scale = frames.probe.w / 100
  if (!near(scale, 1.25, 0.02)) throw new Error(`zoom did not take (probe scale ${scale})`)
  for (const k of ['x', 'y', 'w', 'h']) {
    if (!near(frames.plan[k], frames.ink[k], 1)) {
      throw new Error(`the plan layer is not in the ink's frame at ${scale}×: ${JSON.stringify(frames)}`)
    }
  }
  const zoomed = await plan()
  // and each outline sits at its page rect times that same scale
  for (const [i, kind] of [[0, 'delete'], [2, 'move'], [4, 'modify']]) {
    const want = { x: frames.ink.x + picked[i].rect.x * scale, y: frames.ink.y + picked[i].rect.y * scale }
    const hit = zoomed.rects.find((r) =>
      r.stroke === KIND_RGB[kind] && near(r.x, want.x, 2) && near(r.y, want.y, 2) &&
      near(r.w, picked[i].rect.w * scale, 2) && near(r.h, picked[i].rect.h * scale, 2))
    if (!hit) {
      throw new Error(
        `outline ${i} did not scale with the layer at ${scale}×: want ${JSON.stringify(want)}, have ` +
        JSON.stringify(zoomed.rects.filter((r) => r.stroke === KIND_RGB[kind]).map((r) => [r.x, r.y, r.w, r.h])),
      )
    }
  }
  log(`✓ at ${scale}× zoom the plan shares the ink's frame exactly and scales with it`)
}
await page.evaluate(() => { document.documentElement.style.zoom = '' })
await page.waitForTimeout(200)

// ---- 7a. ✗ Cancel still works -------------------------------------------
await click('cancel')
await page.waitForTimeout(150)
if ((await mode()) !== 'draw') throw new Error(`cancel left mode ${await mode()}`)
const cancelled = await plan()
if (cancelled.on || cancelled.stops.length || cancelled.rects.length) throw new Error('cancel left the plan on screen')
log('✓ ✗ Cancel clears the plan and returns to draw')

// ---- 8. the attempts control --------------------------------------------
/** HUD + panel geometry and the attempts state, in one read. */
const cand = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } }
    const on = [1, 2, 3].filter((n) => s.getElementById(`cand-${n}`).classList.contains('on'))
    return {
      on: on.length === 1 ? on[0] : on,
      labels: [1, 2, 3].map((n) => s.getElementById(`cand-${n}`).textContent),
      tips: [1, 2, 3].map((n) => s.getElementById(`cand-${n}`).title),
      hint: s.getElementById('candHint').textContent,
      hintBox: box(s.getElementById('candHint')),
      notes: [...s.getElementById('fidelityPanel').querySelectorAll('.fNote')]
        .map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
      hud: box(s.getElementById('hud')),
      panel: box(s.getElementById('fidelityPanel')),
      title: s.getElementById('fidelityBtn').title,
      debug: globalThis.__S2C_DEBUG__.candidates(),
      stored: localStorage.getItem('s2c:candidates'),
    }
  })

await page.evaluate(() => { localStorage.removeItem('s2c:candidates') })
await page.reload({ waitUntil: 'networkidle' })
await click('fidelityBtn')
await page.waitForTimeout(150)
let c = await cand()
if (c.on !== 1) throw new Error(`default attempts is ${JSON.stringify(c.on)}, want 1`)
if (c.debug !== 1) throw new Error(`payload default is ${c.debug}`)
const copy = `${c.hint} ${c.notes.join(' ')} ${c.tips.join(' ')}`.toLowerCase()
for (const must of ['token', 'best', 'discard', 'time']) {
  if (!copy.includes(must)) throw new Error(`attempts copy never mentions "${must}"`)
}
log('✓ default 1 · copy names the tokens, the time, the keep-the-best rule and the discards')

const hud0 = c.hud, panel0 = c.panel, hint0 = c.hintBox
for (const n of [3, 2, 1, 3]) {
  await click(`cand-${n}`)
  await page.waitForTimeout(80)
  c = await cand()
  if (c.on !== n) throw new Error(`cand-${n} did not select (on=${JSON.stringify(c.on)})`)
  if (c.debug !== n) throw new Error(`payload says ${c.debug} after selecting ${n}`)
  if (c.stored !== String(n)) throw new Error(`storage says ${c.stored} after selecting ${n}`)
  const word = n === 1 ? 'one attempt' : n === 2 ? 'best of two' : 'best of three'
  if (!c.title.includes(word)) throw new Error(`bar tooltip did not follow: ${c.title}`)
  // the fixed-size rule: a hint that reflowed would move the segment out from
  // under the cursor, and a bar readout that grew would slide the whole toolbar
  for (const [what, a, z] of [['hud', hud0, c.hud], ['panel', panel0, c.panel], ['candHint', hint0, c.hintBox]]) {
    if (!near(a.x, z.x) || !near(a.y, z.y) || !near(a.w, z.w) || !near(a.h, z.h)) {
      throw new Error(`${what} box moved on an attempts change: ${JSON.stringify(a)} → ${JSON.stringify(z)}`)
    }
  }
}
log('✓ segment selects + persists; HUD, panel and hint boxes all stand still')

await page.reload({ waitUntil: 'networkidle' })
await click('fidelityBtn')
await page.waitForTimeout(150)
c = await cand()
if (c.on !== 3 || c.debug !== 3) throw new Error(`3 did not survive a reload: ${JSON.stringify(c.on)}/${c.debug}`)
await page.evaluate(() => { localStorage.setItem('s2c:candidates', '{"lol":true}') })
await page.reload({ waitUntil: 'networkidle' })
await click('fidelityBtn')
await page.waitForTimeout(150)
c = await cand()
if (c.on !== 1 || c.debug !== 1) throw new Error(`invalid storage did not fall back to 1: ${JSON.stringify(c.on)}`)
log('✓ persists across a reload · invalid storage falls back to 1')

// …with the panel OPEN, so the keyboard path is held to the same fixed-size
// rule as the clicks: nothing under the user's hand may move
const kbd0 = await cand()
await page.keyboard.press('Alt+Digit9')
await page.waitForTimeout(60)
if ((await cand()).on !== 2) throw new Error('Alt+9 did not raise the count')
const kbd1 = await cand()
for (const [what, a, z] of [['hud', kbd0.hud, kbd1.hud], ['panel', kbd0.panel, kbd1.panel]]) {
  if (!near(a.x, z.x) || !near(a.y, z.y) || !near(a.w, z.w) || !near(a.h, z.h)) {
    throw new Error(`${what} moved on Alt+9: ${JSON.stringify(a)} → ${JSON.stringify(z)}`)
  }
}
await page.keyboard.press('Alt+Digit9')
await page.keyboard.press('Alt+Digit9')
await page.waitForTimeout(60)
if ((await cand()).on !== 3) throw new Error('Alt+9 did not clamp at 3')
await page.keyboard.press('Alt+Digit8')
await page.keyboard.press('Alt+Digit8')
await page.keyboard.press('Alt+Digit8')
await page.waitForTimeout(60)
if ((await cand()).on !== 1) throw new Error('Alt+8 did not lower and clamp at 1')
await page.keyboard.press('Alt+Digit9')
await page.keyboard.press('Alt+Digit9')
await page.waitForTimeout(60)
if ((await cand()).on !== 3) throw new Error('Alt+9 did not get back to 3')
log('✓ Alt+9 / Alt+8 raise and lower, clamped at 3 and at 1')

// the panel, open, with the attempts segment in it
await page.screenshot({ path: `${SHOTS}/s2c-attempts.png` })

// the ? overlay is rendered FROM the keymap, so a binding cannot go undocumented
await page.keyboard.press('Escape')
await page.keyboard.press('Shift+Slash')
await page.waitForTimeout(120)
const help = await page.evaluate(() => {
  const s = document.getElementById('s2c-overlay-host').shadowRoot
  const el = s.getElementById('help')
  return {
    open: getComputedStyle(el).display !== 'none',
    rows: [...el.querySelectorAll('.hRow')].map((r) => ({
      id: r.dataset.bind,
      keys: r.querySelector('.hKeys').textContent,
      label: r.querySelector('.hLabel').textContent,
      w: r.getBoundingClientRect().width,
      h: r.getBoundingClientRect().height,
    })),
    keymap: globalThis.__S2C_DEBUG__.keymap().map((k) => k.id),
  }
})
if (!help.open) throw new Error('? did not open the help overlay')
for (const id of ['candidates-fewer', 'candidates-more']) {
  const row = help.rows.find((r) => r.id === id)
  if (!row) throw new Error(`${id} is not listed in the ? overlay`)
  if (row.w < 100 || row.h < 8) throw new Error(`${id} row is not rendered: ${row.w}x${row.h}`)
  if (!help.keymap.includes(id)) throw new Error(`${id} is not in the keymap table`)
}
const fewer = help.rows.find((r) => r.id === 'candidates-fewer')
const more = help.rows.find((r) => r.id === 'candidates-more')
if (fewer.keys !== 'Alt+8' || more.keys !== 'Alt+9') throw new Error(`? lists ${fewer.keys}/${more.keys}`)
if (!more.label.toLowerCase().includes('token')) throw new Error(`? does not state the cost: ${more.label}`)
log(`✓ ? lists Alt+8 "${fewer.label}" / Alt+9 "${more.label}" (${help.rows.length} bindings)`)
await page.keyboard.press('Escape')

// ---- 7b. ✓ Go carries a TOP-LEVEL `candidates` --------------------------
runBody = null
await scribble()
await preview()
if (!(await status()).includes('best of three')) throw new Error(`preview does not warn about the bill: ${await status()}`)
if ((await plan()).stops.length !== 6) throw new Error('second preview drew no plan')
await click('confirm')
for (let i = 0; i < 40 && !runBody; i++) await page.waitForTimeout(100)
if (!runBody) throw new Error('✓ Go sent no run')
if (runBody.candidates !== 3) throw new Error(`run body candidates = ${JSON.stringify(runBody.candidates)}, want 3`)
if ('candidates' in (runBody.fidelity ?? {})) throw new Error('candidates leaked into the fidelity object')
if (typeof runBody.fidelity?.resemblance !== 'number' || !runBody.fidelity.keep || !runBody.fidelity.fill) {
  throw new Error(`fidelity payload shape changed: ${JSON.stringify(runBody.fidelity)}`)
}
if (!runBody.rawInterpretation) throw new Error('✓ Go dropped the confirmed interpretation')
// the stub answers before the client has processed the response, so poll
let gone = await plan()
for (let i = 0; i < 30 && (gone.on || gone.stops.length); i++) {
  await page.waitForTimeout(100)
  gone = await plan()
}
if (gone.on || gone.stops.length) throw new Error('the plan outlived ✓ Go')
log('✓ ✓ Go posts top-level candidates:3 · fidelity untouched:', JSON.stringify(runBody.fidelity))

// ---- 9. a candidate stage event reaches the status line ------------------
await page.evaluate(() => {
  globalThis.__S2C_SSE__.dispatchEvent(new MessageEvent('stage', {
    data: JSON.stringify({ stage: 'candidate', detail: 'attempt 2/3: 71% faithful' }),
  }))
})
await page.waitForTimeout(80)
const st = await status()
// s2c-030: the bar says it in plain words; the raw detail rides the tooltip
if (!st.includes('version 2 of 3')) throw new Error(`candidate progress never reached the status line: ${st}`)
const tip = await page.evaluate(`${sr()}.getElementById("status").title`)
if (!tip.includes('attempt 2/3: 71% faithful')) throw new Error(`the raw candidate detail is not on the tooltip: ${tip}`)
if (!st.toLowerCase().includes('best')) throw new Error(`status does not say only the best is kept: ${st}`)
log('✓ candidate stage in the status line:', JSON.stringify(st))

await b.close()
log('ALL GOOD')

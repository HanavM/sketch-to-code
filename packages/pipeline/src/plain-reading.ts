/**
 * Readings that need no model (s2c-049).
 *
 * The reader's own prompt states one rule as outranking every other reading:
 * "Reversals ≥ 4 + confined to one element = DELETE that element, never a
 * decoration". The features it decides on (directionReversals,
 * mostlyInsideElement) are computed here, exactly, before the model is asked.
 * So for a sketch that is nothing but such scribbles, the paid call could
 * only ever return the answer we already hold, ~10 s and a few thousand
 * tokens later, or a wrong one.
 *
 * This answers those sketches itself, in the same RawInterpretation shape the
 * model returns, so everything downstream is unchanged: the reading is still
 * shown before a file is touched, grounding re-validates it on run, the
 * codemod deletes, the DOM check verifies, and one Ctrl+Z undoes it.
 *
 * Restraint is the whole job. It declines (and the model reads as before)
 * whenever anything else is in the sketch: a typed note, a stroke that is not
 * a scribble, a scribble not confined to one element, one that covers too
 * little of its element to mean "this" (a scratch in the corner of a whole
 * section might be a fill), two scribbles on nested elements, design mode.
 */
import { classifyStroke, resampleBySpacing, type Stroke } from '@s2c/ink'
import { containedElements, type DomNode, type DomSnapshot } from '@s2c/dom'
import type { TokenUsage } from '@s2c/providers'
import { colourName, describeTarget } from './explain.js'
import { parseCssColor } from './palette.js'
import {
  buildEvidence, groundInterpretation,
  type GroundedInterpretation, type RawInterpretation, type TypedNote,
} from './intent2.js'

/** The prompt's own delete threshold (INTERPRET_PROMPT). */
export const SCRIBBLE_MIN_REVERSALS = 4
/** Share of the element's area the scribbles' box must cover to mean "this". */
export const SCRIBBLE_MIN_COVER = 0.25

export type PlainReading =
  | {
      ok: true
      rule: 'scribble-delete' | 'ring-recolor'
      interpretation: GroundedInterpretation
      raw: RawInterpretation
      tokens: TokenUsage
    }
  | { ok: false; reason: string }

interface BriefStroke {
  id: string
  bbox: { x: number; y: number; w: number; h: number }
  directionReversals: number
  mostlyInsideElement: string | null
}

/** Share of a stroke's samples that must fall on one element (or inside it). */
const CONFINED = 0.85

const overlap = (a: BriefStroke['bbox'], b: BriefStroke['bbox']): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function plainReading(
  strokes: Stroke[],
  snap: DomSnapshot,
  mode: 'gesture' | 'design' = 'gesture',
  notes: TypedNote[] = [],
): PlainReading {
  const no = (reason: string): PlainReading => ({ ok: false, reason })
  if (mode !== 'gesture') return no('design mode: drawings there are things to build')
  if (strokes.length === 0) return no('no ink')
  if (notes.some((n) => typeof n.text === 'string' && n.text.trim())) return no('typed words: the model reads them')

  const ev = buildEvidence(strokes, snap, notes)

  // s2c-050: one ring in a picked pen colour round one text element
  if (strokes.length === 1 && strokes[0]!.color) {
    const ring = ringRecolor(strokes[0]!, snap, ev, mode)
    if (ring) return ring
  }

  const brief = JSON.parse(ev.brief) as { strokes: BriefStroke[] }

  const parentOf = new Map(snap.nodes.map((n) => [n.id, n.parent]))
  const ancestors = (id: string): Set<string> => {
    const out = new Set<string>()
    for (let p = parentOf.get(id) ?? null; p && !out.has(p); p = parentOf.get(p) ?? null) out.add(p)
    return out
  }
  const depthOf = (id: string) => ancestors(id).size

  /**
   * Which element the stroke stays on, counting what is inside it.
   *
   * The brief's mostlyInsideElement credits only the innermost element under
   * each point, so a scratch-out across "Edit <code>src/App.jsx</code> and
   * save" splits between the <p> and its <code>s and reads as unconfined.
   * Here a point on the <code> also counts for the <p>; the deepest element
   * holding ≥ 85% of the stroke wins. (The brief is left as it is: changing a
   * feature the model reads is a separate, measured change.)
   */
  const viewCap = snap.viewport.w * snap.viewport.h * 0.5
  const menu = [...ev.elements.values()].filter((n) => n.rect.w * n.rect.h <= viewCap)
  const innermost = (x: number, y: number) => {
    let best: (typeof menu)[number] | null = null
    for (const n of menu) {
      const r = n.rect
      if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue
      if (!best || r.w * r.h < best.rect.w * best.rect.h) best = n
    }
    return best
  }
  const confinedTo = (st: Stroke): string | null => {
    const rs = resampleBySpacing(st.points, 8)
    if (rs.length === 0) return null
    const counts = new Map<string, number>()
    for (const p of rs) {
      const el = innermost(p.x, p.y)
      if (!el) continue
      for (const id of [el.id, ...ancestors(el.id)]) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    let pick: string | null = null
    for (const [id, c] of counts) {
      if (c / rs.length < CONFINED || !ev.elements.has(id)) continue
      if (!pick || depthOf(id) > depthOf(pick)) pick = id
    }
    return pick
  }
  const strokeById = new Map(strokes.map((st) => [st.id, st]))

  // every stroke must be a delete scribble on one element
  const byElement = new Map<string, BriefStroke[]>()
  for (const s of brief.strokes) {
    if (s.directionReversals < SCRIBBLE_MIN_REVERSALS && zigzags(strokeById.get(s.id)!) < SCRIBBLE_MIN_REVERSALS) {
      return no(`stroke ${s.id} is not a scribble`)
    }
    const on = s.mostlyInsideElement ?? confinedTo(strokeById.get(s.id)!)
    if (!on) return no(`stroke ${s.id} is not confined to one element`)
    const list = byElement.get(on) ?? []
    list.push(s)
    byElement.set(on, list)
  }

  const ids = [...byElement.keys()]
  // nested targets: "delete the card" and "delete its title" can't both hold
  for (const id of ids) {
    const up = ancestors(id)
    if (ids.some((other) => other !== id && up.has(other))) return no('scribbles on an element and on something inside it')
  }

  const actions: RawAction[] = []
  for (const [id, group] of byElement) {
    const el = ev.elements.get(id)
    if (!el) return no(`element ${id} is not on the menu`)
    if (!el.srcLoc) return no(`element ${id} has no source location`)
    const r = el.rect
    const area = r.w * r.h
    if (area <= 0) return no(`element ${id} has no size`)
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const s of group) {
      x0 = Math.min(x0, s.bbox.x); y0 = Math.min(y0, s.bbox.y)
      x1 = Math.max(x1, s.bbox.x + s.bbox.w); y1 = Math.max(y1, s.bbox.y + s.bbox.h)
    }
    const inkBox = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    // A ring goes AROUND what it means; a scratch-out goes THROUGH it. A
    // stamped child sitting inside the ink's box that the ink barely touches
    // is being circled, and a scribbly ring round a button must never delete
    // the card the button sits in.
    const samples = group.flatMap((g) => resampleBySpacing(strokeById.get(g.id)!.points, 8))
    for (const c of menu) {
      if (c.id === id || !ancestors(c.id).has(id)) continue
      const cr = c.rect
      const ca = cr.w * cr.h
      if (ca <= 0 || overlap(inkBox, cr) / ca < 0.5) continue
      const on = samples.filter((p) => p.x >= cr.x && p.y >= cr.y && p.x <= cr.x + cr.w && p.y <= cr.y + cr.h).length
      if (on / Math.max(1, samples.length) < 0.1) return no(`the ink circles something inside ${id} rather than crossing it out`)
    }
    const cover = overlap(inkBox, r) / area
    if (cover < SCRIBBLE_MIN_COVER) {
      return no(`the scribble covers ${Math.round(cover * 100)}% of its element: too little to mean "this"`)
    }
    actions.push({
      kind: 'delete',
      elements: [id],
      destElement: null,
      position: null,
      instruction: 'delete it (scribbled out)',
      strokes: group.map((s) => s.id),
      layer: null,
      depicts: null,
      fidelity: null,
      screen: null,
    })
  }

  const draft: RawInterpretation = { reading: '', actions, unclear: null }
  const interpretation = groundInterpretation(draft, ev, snap, mode)
  if (interpretation.rejected.length || interpretation.actions.length !== actions.length) {
    return no(`grounding refused: ${interpretation.rejected.join('; ') || 'an action was dropped'}`)
  }
  const what = interpretation.actions.map((a) => describeTarget(a.targets[0]))
  const reading = `You scribbled out ${joinWords(what)}: delete ${what.length > 1 ? 'them' : 'it'}.`
  const raw: RawInterpretation = { ...draft, reading }
  interpretation.reading = reading
  return { ok: true, rule: 'scribble-delete', interpretation, raw, tokens: { input: 0, cacheRead: 0, output: 0 } }
}

type RawAction = RawInterpretation['actions'][number]

/**
 * The instructions a plain ring-recolour reading carries, one per colour it
 * can mean. run2 applies an action with exactly one of these, a drawn colour
 * and no typed words with the recolour engine (recolor.ts) instead of a
 * codegen session. The model never writes them, so a model reading never
 * takes that path by accident. Each is also a plain sentence, so if the engine
 * refuses, codegen gets an instruction it can follow.
 */
export const RECOLOR_INSTRUCTION = {
  color: 'make its text the colour the ring was drawn in',
  backgroundColor: 'make its background the colour the ring was drawn in',
} as const
export type RecolorProp = keyof typeof RECOLOR_INSTRUCTION

/** The engine's prop for an instruction, or null when it is not a plain recolour. */
export function recolorPropOf(instruction: string | undefined): RecolorProp | null {
  if (instruction === RECOLOR_INSTRUCTION.color) return 'color'
  if (instruction === RECOLOR_INSTRUCTION.backgroundColor) return 'backgroundColor'
  return null
}

/**
 * Row 7 of the visual language: a ring drawn in a pen colour, no words, means
 * "make it this colour". The pen colour is the value, so the only question is
 * which colour "it" has, and the page answers that:
 *   - an element with a fill of its own (a button, a badge, a card) → the
 *     fill. The rough bench's r12 (green ring round a button) is scored on
 *     exactly that: background hue green.
 *   - text with no fill anywhere in it (a heading, a line, a link) → the words.
 *   - anything else (a clear box holding buttons and pictures) → the model.
 *
 * Null = not this rule; the scribble rule and then the model take it.
 */
function ringRecolor(
  stroke: Stroke,
  snap: DomSnapshot,
  ev: ReturnType<typeof buildEvidence>,
  mode: 'gesture' | 'design',
): PlainReading | null {
  const drawn = parseCssColor(stroke.color ?? '')
  if (!drawn) return null
  if (!isRing(stroke)) return null
  const target = ringTarget(stroke, snap)
  if (!target || !target.srcLoc || !ev.elements.has(target.id)) return null
  const prop = recolorPropFor(target, snap)
  if (!prop) return null

  const action: RawAction = {
    kind: 'modify',
    elements: [target.id],
    destElement: null,
    position: null,
    instruction: RECOLOR_INSTRUCTION[prop],
    strokes: [stroke.id],
    layer: null,
    depicts: null,
    fidelity: null,
    screen: null,
  }
  const draft: RawInterpretation = { reading: '', actions: [action], unclear: null }
  const interpretation = groundInterpretation(draft, ev, snap, mode)
  const a = interpretation.actions[0]
  if (interpretation.rejected.length || interpretation.actions.length !== 1 || !a?.color) return null
  const hue = colourName(a.color.drawn) || a.color.drawn
  const reading = prop === 'color'
    ? `You ringed ${describeTarget(a.targets[0])} in ${hue}: make it ${hue}.`
    : `You ringed ${describeTarget(a.targets[0])} in ${hue}: make its background ${hue}.`
  interpretation.reading = reading
  return {
    ok: true,
    rule: 'ring-recolor',
    interpretation,
    raw: { ...draft, reading },
    tokens: { input: 0, cacheRead: 0, output: 0 },
  }
}

/** No fill: 'transparent' or zero alpha. An unreadable value counts as a fill. */
const isTransparent = (css: string | undefined): boolean => {
  const s = (css ?? '').trim().toLowerCase()
  return !s || s === 'transparent' || /^(rgba?|oklch|hsla?)\(.*[,/]\s*0(\.0+)?%?\s*\)$/.test(s)
}

const NOT_RECOLOURABLE = ['img', 'svg', 'path', 'video', 'canvas', 'input', 'textarea', 'select', 'iframe']

/** Which colour a ring means on this element, or null when it is not clear. */
export function recolorPropFor(n: DomNode, snap: DomSnapshot): RecolorProp | null {
  if (NOT_RECOLOURABLE.includes(n.tag)) return null
  if (!isTransparent(n.style?.backgroundColor)) return 'backgroundColor'
  return isTextOnly(n, snap) ? 'color' : null
}

/**
 * Text, and only text: it has words of its own, no fill of its own, and
 * nothing inside it with a fill or a picture.
 */
function isTextOnly(n: DomNode, snap: DomSnapshot): boolean {
  if (n.tag === 'button') return false
  if (!(n.text ?? '').trim()) return false
  if (!isTransparent(n.style?.backgroundColor)) return false
  const parentOf = new Map(snap.nodes.map((x) => [x.id, x.parent]))
  const inside = (x: DomNode) => {
    for (let p = x.parent; p != null; p = parentOf.get(p) ?? null) if (p === n.id) return true
    return false
  }
  return !snap.nodes.some((x) => inside(x) && (!isTransparent(x.style?.backgroundColor) || ['img', 'svg', 'button', 'input'].includes(x.tag)))
}

// ── the ring, read the way the overlay's bare-ring question reads it ────────
// Ported from overlay-client/src/bare-ring.ts (isRing, closingGap,
// ringTarget): the browser bundle can't be imported here. A parity test in
// plain-reading.test.ts runs both on the same rings, so they can't drift apart.

const RING_KINDS = new Set(['rect', 'rounded-rect', 'ellipse', 'circle', 'diamond', 'triangle'])
const RING_MIN_TARGET_SHARE = 0.12
const RING_COVER = 0.8
const RING_PAD = 6
const boxArea = (b: { w: number; h: number }) => Math.max(0, b.w) * Math.max(0, b.h)
function boxOf(points: Stroke['points']) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function closingGap(points: Stroke['points']): number {
  const n = points.length
  const k = Math.max(1, Math.floor(n * 0.3))
  const near = (p: { x: number; y: number }, from: number, to: number) => {
    let best = Infinity
    for (let i = from; i < to; i++) best = Math.min(best, Math.hypot(points[i]!.x - p.x, points[i]!.y - p.y))
    return best
  }
  return Math.min(near(points[n - 1]!, 0, k), near(points[0]!, n - k, n))
}

export function isRing(stroke: Stroke): boolean {
  if (stroke.points.length < 8) return false
  const b = boxOf(stroke.points)
  if (closingGap(stroke.points) > Math.max(24, 0.4 * Math.min(b.w, b.h))) return false
  if (closedShape(stroke.id, stroke.points)) return true
  // A ring round a heading or a line of text is long and flat (5:1 and more),
  // and the classifier's hull ratios are tuned for round-ish shapes: it calls
  // that ring "ink". Squash the box square and ask again; an ellipse becomes a
  // circle and a box a square, while a scribble or a strike stays what it is.
  // (s2c-050: found when the ring-recolour reading missed every heading.)
  const long = Math.max(b.w, b.h)
  const short = Math.min(b.w, b.h)
  if (short <= 0 || long / short < 2.5) return false
  const sx = b.w > b.h ? short / long : 1
  const sy = b.h > b.w ? short / long : 1
  return closedShape(stroke.id, stroke.points.map((p) => ({ ...p, x: b.x + (p.x - b.x) * sx, y: b.y + (p.y - b.y) * sy })))
}

function closedShape(id: string, points: Stroke['points']): boolean {
  const { candidates } = classifyStroke({ id, points })
  const top = [...candidates].sort((a, b) => b.confidence - a.confidence)[0]
  return top != null && RING_KINDS.has(top.kind) && top.confidence >= 0.5
}

export function ringTarget(stroke: Stroke, snap: DomSnapshot): DomNode | null {
  const b = boxOf(stroke.points)
  const box = { x: b.x - RING_PAD, y: b.y - RING_PAD, w: b.w + 2 * RING_PAD, h: b.h + 2 * RING_PAD }
  const view = boxArea(snap.viewport)
  const inside = containedElements(snap, box, RING_COVER).filter((n) =>
    boxArea(n.rect) >= RING_MIN_TARGET_SHARE * boxArea(b) &&
    (view === 0 || boxArea(n.rect) < 0.9 * view))
  if (inside.length === 0) return null
  return inside.reduce((a, c) => (boxArea(c.rect) > boxArea(a.rect) ? c : a))
}

/**
 * Up-down turns across the stroke's own height: how a loose scratch-out reads.
 *
 * directionReversals counts turns sharper than 60°, so a wide, flat zigzag
 * across a line of text (teeth 48 px apart, 16 px tall: each turn ~36°) has
 * none, though nobody would call it anything but crossing the line out. The
 * README's own demo draws exactly that. A turn here is the pen heading back
 * the other way vertically by at least a quarter of the stroke's height
 * (min 4 px, so tremor never counts).
 */
export function zigzags(st: Stroke): number {
  const pts = st.points
  if (pts.length < 3) return 0
  let lo = Infinity, hi = -Infinity
  for (const p of pts) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y) }
  const hyst = Math.max(4, (hi - lo) * 0.25)
  let turns = 0
  let dir = 0
  let ext = pts[0]!.y
  for (const p of pts) {
    if (dir === 0) {
      if (p.y > ext + hyst) { dir = 1; ext = p.y } else if (p.y < ext - hyst) { dir = -1; ext = p.y }
    } else if (dir > 0) {
      if (p.y > ext) ext = p.y
      else if (p.y < ext - hyst) { turns++; dir = -1; ext = p.y }
    } else {
      if (p.y < ext) ext = p.y
      else if (p.y > ext + hyst) { turns++; dir = 1; ext = p.y }
    }
  }
  return turns
}

function joinWords(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

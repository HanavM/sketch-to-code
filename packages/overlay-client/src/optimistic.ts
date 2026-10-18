/**
 * Optimistic changes: the page changes the moment the pen lifts, and the code
 * catches up afterwards (goal loop, approach n1).
 *
 * The two gestures the server already reads with no model (plain-reading.ts:
 * s2c-049 scribble-delete, s2c-050 ring-recolor) are cheap and unambiguous
 * enough to show before anything is asked. This reads them in the browser, on
 * the same features the server decides on, picks the element, and applies a
 * patch that can be taken back in one call. The run that follows either lands
 * the same change in source (hot reload replaces the patched element and the
 * patch is simply dropped) or fails, and the page is put back.
 *
 * Pure apart from `applyPatch`, which only touches the inline style and one
 * marker attribute of the element it is given. main.ts owns the DOM walk, the
 * timing and the run.
 *
 * Restraint mirrors the server: anything this declines still runs the normal
 * way, just without the instant preview. A false accept costs one flicker
 * (the patch is rolled back when the reading disagrees), so the rules are the
 * server's, not looser ones.
 */
import { classifyStroke } from '@s2c/ink/classify'
import { closingGap, isRing } from './bare-ring.js'

export interface QPoint { x: number; y: number; t: number }
export interface QStroke { id: string; points: QPoint[]; color?: string }
export interface Box { x: number; y: number; w: number; h: number }

/** One stamped element on the page, as main.ts collects it. */
export interface Cand<E = unknown> {
  ref: E
  rect: Box
  srcLoc: string
  /** Index of the parent candidate (nearest stamped ancestor), or -1. */
  parent: number
  /** Has a background fill of its own (not transparent). */
  filled: boolean
}

export type QuickReading<E = unknown> =
  | { kind: 'hide'; target: Cand<E>; ink: Box }
  | { kind: 'recolour'; target: Cand<E>; ink: Box; color: string; prop: 'background-color' | 'color' }

/** plain-reading.ts SCRIBBLE_MIN_REVERSALS / CONFINED / SCRIBBLE_MIN_COVER. */
const MIN_REVERSALS = 4
const CONFINED = 0.85
const MIN_COVER = 0.25
/** Ring box padding and coverage, as bare-ring.ts. */
const PAD = 6
const RING_COVER = 0.8
const MIN_TARGET_SHARE = 0.12

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h)
const inside = (b: Box, x: number, y: number) => x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h
function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function bboxOfPoints(points: QPoint[]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Points every `step` px along the path (same spacing the server reads at). */
export function resample(points: QPoint[], step = 8): QPoint[] {
  if (points.length === 0) return []
  const out: QPoint[] = [points[0]!]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]!
    const b = points[i]!
    let seg = Math.hypot(b.x - a.x, b.y - a.y)
    while (carry + seg >= step) {
      const k = (step - carry) / seg
      const p = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, t: a.t + (b.t - a.t) * k }
      out.push(p)
      a = p
      seg = Math.hypot(b.x - a.x, b.y - a.y)
      carry = 0
    }
    carry += seg
  }
  return out
}

/** Sharp (> 60°) direction changes: intent2.ts's directionReversals. */
export function sharpTurns(points: QPoint[]): number {
  const rs = resample(points)
  let n = 0
  for (let i = 2; i < rs.length; i++) {
    const a1 = Math.atan2(rs[i - 1]!.y - rs[i - 2]!.y, rs[i - 1]!.x - rs[i - 2]!.x)
    const a2 = Math.atan2(rs[i]!.y - rs[i - 1]!.y, rs[i]!.x - rs[i - 1]!.x)
    let d = Math.abs(a2 - a1)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (d > Math.PI / 3) n++
  }
  return n
}

/** Vertical zig-zag swings with hysteresis: plain-reading.ts zigzags(). */
export function zigzags(points: QPoint[]): number {
  if (points.length < 3) return 0
  let lo = Infinity, hi = -Infinity
  for (const p of points) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y) }
  const hyst = Math.max(4, (hi - lo) * 0.25)
  let turns = 0, dir = 0, ext = points[0]!.y
  for (const p of points) {
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

export function isScribble(st: QStroke): boolean {
  if (st.points.length < 3) return false
  if (sharpTurns(st.points) >= MIN_REVERSALS || zigzags(st.points) >= MIN_REVERSALS) {
    // a ring drawn in several laps also turns a lot: a closed round shape is a ring
    const top = [...classifyStroke({ id: st.id, points: st.points }).candidates].sort((a, b) => b.confidence - a.confidence)[0]
    if (top && (top.kind === 'circle' || top.kind === 'ellipse') && top.confidence >= 0.7 &&
      closingGap(st.points) < 12) return false
    return true
  }
  return false
}

function depth<E>(cands: Cand<E>[], i: number): number {
  let d = 0
  for (let p = cands[i]!.parent; p >= 0 && d < 1000; p = cands[p]!.parent) d++
  return d
}

/**
 * The element a scribble stays on: the deepest candidate holding ≥ 85% of the
 * stroke's points, a point on a child counting for its ancestors too
 * (plain-reading.ts confinedTo).
 */
export function confinedTo<E>(st: QStroke, cands: Cand<E>[], viewArea: number): number {
  const rs = resample(st.points)
  if (rs.length === 0) return -1
  const cap = viewArea > 0 ? viewArea * 0.5 : Infinity
  const counts = new Map<number, number>()
  for (const p of rs) {
    let best = -1
    for (let i = 0; i < cands.length; i++) {
      const r = cands[i]!.rect
      if (area(r) > cap || !inside(r, p.x, p.y)) continue
      if (best < 0 || area(r) < area(cands[best]!.rect)) best = i
    }
    for (let i = best; i >= 0; i = cands[i]!.parent) counts.set(i, (counts.get(i) ?? 0) + 1)
  }
  let pick = -1
  for (const [i, c] of counts) {
    if (c / rs.length < CONFINED || area(cands[i]!.rect) > cap) continue
    if (pick < 0 || depth(cands, i) > depth(cands, pick)) pick = i
  }
  return pick
}

/** The biggest candidate a ring encloses (bare-ring.ts ringTarget). */
export function ringed<E>(st: QStroke, cands: Cand<E>[], viewArea: number): number {
  const b = bboxOfPoints(st.points)
  const box = { x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD }
  let best = -1
  for (let i = 0; i < cands.length; i++) {
    const r = cands[i]!.rect
    const a = area(r)
    if (a <= 0 || inter(r, box) / a < RING_COVER) continue
    if (a < MIN_TARGET_SHARE * area(b)) continue
    if (viewArea > 0 && a >= 0.9 * viewArea) continue
    if (best < 0 || a > area(cands[best]!.rect)) best = i
  }
  return best
}

/**
 * Read the sketch for an instant change, or null to leave it to the normal run.
 * `hasNotes`: typed words are the model's to read, so nothing is guessed.
 */
export function quickReading<E>(
  strokes: QStroke[], cands: Cand<E>[], viewArea: number, hasNotes = false,
): QuickReading<E> | null {
  if (hasNotes || strokes.length === 0) return null
  // one ring in a picked pen colour round one element
  if (strokes.length === 1 && strokes[0]!.color && isRing(strokes[0]!)) {
    const i = ringed(strokes[0]!, cands, viewArea)
    if (i < 0) return null
    const t = cands[i]!
    return {
      kind: 'recolour', target: t, ink: bboxOfPoints(strokes[0]!.points), color: strokes[0]!.color!,
      prop: t.filled ? 'background-color' : 'color',
    }
  }
  // every stroke a scribble, all on the same one element
  let on = -1
  let ink: Box | null = null
  for (const st of strokes) {
    if (!isScribble(st)) return null
    const i = confinedTo(st, cands, viewArea)
    if (i < 0 || (on >= 0 && i !== on)) return null
    on = i
    const b = bboxOfPoints(st.points)
    ink = ink ? union(ink, b) : b
  }
  if (on < 0 || !ink) return null
  const t = cands[on]!
  if (area(t.rect) <= 0 || inter(ink, t.rect) / area(t.rect) < MIN_COVER) return null
  return { kind: 'hide', target: t, ink }
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }
}

// ---- the patch ---------------------------------------------------------------

/** The slice of an Element the patch touches (tests pass a plain object). */
export interface Patchable {
  style: {
    getPropertyValue(p: string): string
    getPropertyPriority(p: string): string
    setProperty(p: string, v: string, prio?: string): void
    removeProperty(p: string): string
  }
  setAttribute(n: string, v: string): void
  removeAttribute(n: string): void
  getAttribute(n: string): string | null
}

/** Marks an element showing a change that is not in the code yet. */
export const PENDING_ATTR = 'data-s2c-pending'

export interface Applied {
  kind: QuickReading['kind']
  srcLoc: string
  /** Put the element back exactly as it was. Safe to call twice. */
  undo(): void
}

/**
 * Apply the reading to its element. Inline `!important`, so the app's own
 * classes can't win before the real edit lands; the previous inline value and
 * priority are kept, so undo restores the exact original.
 */
export function applyPatch(r: QuickReading<Patchable>): Applied {
  const el = r.target.ref
  const prop = r.kind === 'hide' ? 'display' : r.prop
  const value = r.kind === 'hide' ? 'none' : r.color
  const before = { v: el.style.getPropertyValue(prop), p: el.style.getPropertyPriority(prop) }
  const hadMark = el.getAttribute(PENDING_ATTR)
  el.style.setProperty(prop, value, 'important')
  el.setAttribute(PENDING_ATTR, r.kind)
  let done = false
  return {
    kind: r.kind,
    srcLoc: r.target.srcLoc,
    undo() {
      if (done) return
      done = true
      if (before.v) el.style.setProperty(prop, before.v, before.p)
      else el.style.removeProperty(prop)
      if (hadMark === null) el.removeAttribute(PENDING_ATTR)
      else el.setAttribute(PENDING_ATTR, hadMark)
    },
  }
}

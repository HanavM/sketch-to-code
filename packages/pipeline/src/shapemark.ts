/**
 * Is this stroke a plain layout shape — a box, a straight line or a ring?
 *
 * Goal 2026-10-27, node n7 ("drawn means placed"). The hand baseline drew ten
 * pages from screenshots with 5-10 simple strokes each, and the three worst
 * (seat booking 14, data grid 25, settings 39) all lost points the same way:
 * the person's own ink came back as the page. A tab underline drawn by hand
 * was rebuilt as a wobbly SVG line crossing the tabs; a box drawn round the
 * big "09" became a framed card; a hand circle became a lumpy blob.
 *
 * The cause is the same one textmark.ts found for squiggles: grounding fitted
 * an svgPath for every stroke an add/design action cited, and the scaffold,
 * the trace rung and the instant render all turn those paths into SVG. A
 * person drawing a box means "something goes here, this big"; a line means a
 * rule, an edge or a row; a ring means a circle. None of them means "draw my
 * wobble". So the shape is decided here from the ink, and such a stroke never
 * becomes a path: it is kept as a ShapeMark with its clean geometry (the box,
 * the two ends, the ellipse), which sets the region and tells codegen what was
 * drawn, exactly.
 *
 * A depiction (the interpreter said the ink depicts "a sun", "a cat") keeps its
 * paths: there the outline may be the point. Even then a box, line or ring is
 * handed over as its clean shape (cleanPath), never the wobble.
 */
import type { BBox, Point } from '@s2c/ink'
import { resampleBySpacing } from '@s2c/ink'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export type ShapeKind = 'box' | 'line' | 'ellipse'

export interface ShapeMark {
  strokeId: string
  shape: ShapeKind
  /** The clean shape's bounding box, page px. */
  box: BBox
  /** line only: where the pen started and ended, page px. */
  from?: { x: number; y: number }
  to?: { x: number; y: number }
  /** box only (n14): its notes say it holds a big word or number, so it marks that word's area: no card. */
  area?: true
  /** line only (n14): a slanted line running most of the page: the edge between two areas. */
  edge?: true
}

const r1 = (v: number) => Math.round(v)

function bbox(pts: Point[] | Array<{ x: number; y: number }>): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function inkLength(pts: Array<{ x: number; y: number }>): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  return l
}

/** Straight: ink barely longer than its chord, never far off it. */
function asLine(pts: Array<{ x: number; y: number }>): Omit<ShapeMark, 'strokeId'> | null {
  const a = pts[0]!, b = pts[pts.length - 1]!
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  if (chord < 24) return null
  const len = inkLength(pts)
  if (len / chord > 1.12) return null
  const ux = (b.x - a.x) / chord, uy = (b.y - a.y) / chord
  // A hurried long line bows once (up to ~25px over 1100px); a decorative wave
  // of the same height crosses its chord again and again. So: a bow is allowed,
  // a second crossing is not.
  let dev = 0, side = 0, crossings = 0
  for (const p of pts) {
    const o = (p.x - a.x) * uy - (p.y - a.y) * ux
    dev = Math.max(dev, Math.abs(o))
    if (o > 4 && side <= 0) { if (side < 0) crossings++; side = 1 }
    else if (o < -4 && side >= 0) { if (side > 0) crossings++; side = -1 }
  }
  if (dev > Math.max(8, Math.min(30, chord * 0.05)) || crossings > 1) return null
  // a near-level or near-plumb line is set exactly level or plumb: that is
  // what a person means by it (a rule, a divider, a column edge)
  const tilt = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180
  let from = { x: r1(a.x), y: r1(a.y) }, to = { x: r1(b.x), y: r1(b.y) }
  if (Math.min(tilt, 180 - tilt) <= 6) {
    const y = r1((a.y + b.y) / 2); from = { ...from, y }; to = { ...to, y }
  } else if (Math.abs(tilt - 90) <= 6) {
    const x = r1((a.x + b.x) / 2); from = { ...from, x }; to = { ...to, x }
  }
  return { shape: 'line', box: bbox([from, to]), from, to }
}

/** Fraction of points within `tol` of `near`. */
const share = (pts: Array<{ x: number; y: number }>, near: (p: { x: number; y: number }) => boolean) =>
  pts.filter(near).length / pts.length

function asClosed(pts: Array<{ x: number; y: number }>): Omit<ShapeMark, 'strokeId'> | null {
  const b = bbox(pts)
  if (b.w < 14 || b.h < 14) return null
  const len = inkLength(pts)
  const first = pts[0]!, last = pts[pts.length - 1]!
  const gap = Math.hypot(last.x - first.x, last.y - first.y)
  // closes on itself (a quarter-lap overshoot is still a closed ring)
  if (gap > Math.max(24, len * 0.15)) return null
  const m = Math.min(b.w, b.h)
  // BOX: hugs its bounding box's edges and reaches all four corners
  const edgeTol = Math.max(6, m * 0.12)
  const onEdge = (p: { x: number; y: number }) =>
    Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y) <= edgeTol
  const cornerTol = Math.max(10, m * 0.2)
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as const
  const allCorners = corners.every(([cx, cy]) => pts.some((p) => Math.hypot(p.x - cx, p.y - cy) <= cornerTol))
  const perim = 2 * (b.w + b.h)
  if (allCorners && share(pts, onEdge) >= 0.92 && len <= perim * 1.6) {
    return { shape: 'box', box: { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) } }
  }
  // RING: every point near the ellipse inscribed in the box, corners empty
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, rx = b.w / 2, ry = b.h / 2
  const onRing = (p: { x: number; y: number }) => {
    const r = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry)
    return r >= 0.78 && r <= 1.18
  }
  const ellPerim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
  if (!allCorners && share(pts, onRing) >= 0.92 && len >= ellPerim * 0.85 && len <= ellPerim * 1.6) {
    return { shape: 'ellipse', box: { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) } }
  }
  return null
}

/** The clean layout shape this stroke is, or null for anything else (freehand, arrows, text). */
export function shapeOf(points: Array<{ x: number; y: number }>): Omit<ShapeMark, 'strokeId'> | null {
  if (points.length < 2) return null
  const pts = resampleBySpacing(points as Point[], 6) as Array<{ x: number; y: number }>
  if (pts.length < 4) return null
  return asLine(pts) ?? asClosed(pts)
}

export const isShapeMark = (points: Array<{ x: number; y: number }>): boolean => shapeOf(points) !== null

/** The clean shape as an SVG path in coordinates relative to `origin`. */
export function cleanPath(m: Omit<ShapeMark, 'strokeId'>, origin: { x: number; y: number }): string {
  const X = (v: number) => r1(v - origin.x), Y = (v: number) => r1(v - origin.y)
  const { x, y, w, h } = m.box
  if (m.shape === 'line') return `M ${X(m.from!.x)} ${Y(m.from!.y)} L ${X(m.to!.x)} ${Y(m.to!.y)}`
  if (m.shape === 'box') return `M ${X(x)} ${Y(y)} H ${X(x + w)} V ${Y(y + h)} H ${X(x)} Z`
  const rx = r1(w / 2), ry = r1(h / 2)
  return `M ${X(x)} ${Y(y + h / 2)} A ${rx} ${ry} 0 1 0 ${X(x + w)} ${Y(y + h / 2)} A ${rx} ${ry} 0 1 0 ${X(x)} ${Y(y + h / 2)} Z`
}

export interface MarkVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
  /** Per drawn box/ring: where the built thing of that size landed. */
  marks?: Array<{ strokeId: string; drawn: BBox; built: BBox | null; dx: number | null; dy: number | null }>
}

interface SnapLike {
  truncated?: boolean
  nodes: Array<{ id: string; tag: string; rect: BBox }>
}

/**
 * Did each drawn box and ring land where it was drawn?
 *
 * The region check (verifyDesignPlacement) asks whether SOME new element is
 * near the action's whole region, generously: a settings page whose four
 * toggles and two buttons all slid 30-95px down passed it (n7 re-sketch of
 * r2 e3: layout 20%, "satisfied"). A drawn box is a far tighter promise: a
 * thing that size, at that spot. So each box or ring is matched to the built
 * element closest to it among those about its size, and one that is off by
 * more than a small slack is a failure that names how far and which way, which
 * is what a repair round can act on.
 */
export function verifyShapeMarks(marks: ShapeMark[], before: SnapLike, after: SnapLike): MarkVerdict {
  const boxes = marks.filter((m) => m.shape !== 'line' && m.box.w >= 12 && m.box.h >= 10)
  if (!boxes.length) return { satisfied: true, unverifiable: true, reason: 'no drawn boxes to check' }
  if (before.truncated || after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const key = (n: { tag: string; rect: BBox }) => `${n.tag}@${r1(n.rect.x)},${r1(n.rect.y)},${r1(n.rect.w)},${r1(n.rect.h)}`
  const old = new Set(before.nodes.map(key))
  const fresh = after.nodes.filter((n) => !old.has(key(n)) && n.rect.w > 0 && n.rect.h > 0)
  const claimed = new Set<string>()
  const out: NonNullable<MarkVerdict['marks']> = []
  const misses: string[] = []
  for (const m of boxes) {
    const b = m.box
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    let best: (typeof fresh)[number] | null = null, bestD = Infinity
    for (const n of fresh) {
      if (claimed.has(n.id)) continue
      if (Math.abs(n.rect.w - b.w) > Math.max(10, b.w * 0.35)) continue
      if (Math.abs(n.rect.h - b.h) > Math.max(8, b.h * 0.4)) continue
      const d = Math.hypot(n.rect.x + n.rect.w / 2 - cx, n.rect.y + n.rect.h / 2 - cy)
      if (d < bestD) { best = n; bestD = d }
    }
    const where = `the ${m.shape === 'ellipse' ? 'ring' : 'box'} drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    if (!best || bestD > 260) {
      out.push({ strokeId: m.strokeId, drawn: b, built: null, dx: null, dy: null })
      misses.push(`${where}: nothing about that size was built near it; build what it stands for at that size, there`)
      continue
    }
    claimed.add(best.id)
    const dx = r1(best.rect.x + best.rect.w / 2 - cx), dy = r1(best.rect.y + best.rect.h / 2 - cy)
    out.push({ strokeId: m.strokeId, drawn: b, built: { ...best.rect }, dx, dy })
    const slack = Math.max(12, Math.min(b.w, b.h) * 0.25)
    if (Math.abs(dx) > slack || Math.abs(dy) > slack) {
      const off = [
        Math.abs(dy) > slack ? `${Math.abs(dy)}px too ${dy > 0 ? 'low' : 'high'}` : '',
        Math.abs(dx) > slack ? `${Math.abs(dx)}px too far ${dx > 0 ? 'right' : 'left'}` : '',
      ].filter(Boolean).join(' and ')
      misses.push(`${where}: the <${best.tag}> built for it sits ${off}; move it, and what is laid out around it, so it sits where it was drawn (fix the spacing or padding that pushed it, keep its size)`)
    }
  }
  return misses.length
    ? { satisfied: false, reason: misses.join('; '), marks: out }
    : { satisfied: true, reason: `${boxes.length} drawn box${boxes.length > 1 ? 'es' : ''} built where drawn`, marks: out }
}

/**
 * Boxes drawn in an earlier run stay where they were drawn (n8).
 *
 * Round 5 e5 (hand, n7): the grid was drawn as one big box and built there;
 * the next run was only a note ("title small, menu on same line") and it
 * re-laid the page and pulled the grid 48px up, off its box. Nothing checked
 * it, because the landing check only looked at the marks of the run that drew
 * them. So every drawn box and ring that landed is remembered, and every later
 * run is told to keep it and checked against it, like a rule the user drew.
 *
 * Only marks that are on the page right now (something that size sits where
 * it was drawn in the snapshot the run starts from) are held: a block the user
 * deleted, moved on purpose or undid is not pinned back.
 */
export interface KeptMark { shape: ShapeKind; box: BBox; /** The element built for it, as found when a run starts. */ built?: BBox }

export const keptMarksPath = (root: string): string => join(root, '.sketch2code', 'marks.json')

export function loadKeptMarks(root: string): KeptMark[] {
  try {
    const raw = JSON.parse(readFileSync(keptMarksPath(root), 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter((m): m is KeptMark => {
      const b = (m as KeptMark)?.box
      return !!b && [b.x, b.y, b.w, b.h].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
        ((m as KeptMark).shape === 'box' || (m as KeptMark).shape === 'ellipse')
    })
  } catch {
    return []
  }
}

const overlapShare = (a: BBox, b: BBox): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (w <= 0 || h <= 0) return 0
  return (w * h) / Math.min(a.w * a.h, b.w * b.h)
}

/** Add this run's boxes; a new box drawn over an old one replaces it. */
export function mergeKeptMarks(kept: KeptMark[], fresh: ShapeMark[]): KeptMark[] {
  const add = fresh.filter((m) => m.shape !== 'line' && m.box.w >= 40 && m.box.h >= 24).map((m) => ({ shape: m.shape, box: { ...m.box } }))
  const old = kept.filter((k) => !add.some((a) => overlapShare(a.box, k.box) > 0.6))
  return [...old, ...add].slice(-40)
}

export function saveKeptMarks(root: string, marks: KeptMark[]): void {
  try {
    mkdirSync(join(root, '.sketch2code'), { recursive: true })
    writeFileSync(keptMarksPath(root), JSON.stringify(marks, null, 2))
  } catch { /* remembering is a nicety; never fail a run over it */ }
}

/** The element of about that size nearest the mark, and how far its centre is off. */
function nearestOfSize(b: BBox, snap: SnapLike, sizeTol: (v: number) => number): { n: SnapLike['nodes'][number]; dx: number; dy: number } | null {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2
  let best: { n: SnapLike['nodes'][number]; dx: number; dy: number } | null = null, bestD = Infinity
  for (const n of snap.nodes) {
    if (n.rect.w <= 0 || n.rect.h <= 0) continue
    const sw = Math.abs(n.rect.w - b.w), sh = Math.abs(n.rect.h - b.h)
    if (sw > sizeTol(b.w) || sh > sizeTol(b.h)) continue
    const dx = n.rect.x + n.rect.w / 2 - cx, dy = n.rect.y + n.rect.h / 2 - cy
    // the closest in place AND in size: a page wrapper 90px taller whose centre
    // happens to sit near the grid's must not stand in for the grid
    const d = Math.hypot(dx, dy) + sw + sh
    if (d < bestD) { best = { n, dx: r1(dx), dy: r1(dy) }; bestD = d }
  }
  return best && Math.hypot(best.dx, best.dy) <= 260 ? best : null
}

const keptSlack = (b: BBox) => Math.max(10, Math.min(24, Math.min(b.w, b.h) * 0.15))
const loose = (v: number) => Math.max(10, v * 0.2)
const tight = (v: number) => Math.max(6, v * 0.03)

/**
 * The kept marks that sit where they were drawn in this snapshot (the ones to
 * hold), each pinned to the exact element that stands for it now: later runs
 * are checked against that element's own box, so a wrapper of roughly the
 * same size can't pass for it.
 */
export function marksInPlace(marks: KeptMark[], snap: SnapLike): KeptMark[] {
  if (snap.truncated) return []
  const out: KeptMark[] = []
  for (const m of marks) {
    const hit = nearestOfSize(m.box, snap, loose)
    if (!hit || Math.abs(hit.dx) > keptSlack(m.box) || Math.abs(hit.dy) > keptSlack(m.box)) continue
    out.push({ ...m, built: { ...hit.n.rect } })
  }
  return out
}

export function keptMarksBrief(marks: KeptMark[]): string {
  if (!marks.length) return ''
  return `DRAWN EARLIER AND BUILT WHERE DRAWN (keep each exactly there and that size; a note about ` +
    `something else never moves them: fix spacing around them instead):\n` +
    marks.map((m) => { const r = m.built ?? m.box; return `- the block built for the ${m.shape === 'ellipse' ? 'ring' : 'box'} drawn at x ${m.box.x}, y ${m.box.y}: it is at x ${r1(r.x)}, y ${r1(r.y)}, ${r1(r.w)}x${r1(r.h)} now and must stay exactly there` }).join('\n') + '\n\n'
}

export function verifyKeptMarks(marks: KeptMark[], after: SnapLike): MarkVerdict {
  if (!marks.length) return { satisfied: true, unverifiable: true, reason: 'no boxes drawn earlier' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  for (const m of marks) {
    const b = m.box
    const ref = m.built ?? m.box
    const where = `the ${m.shape === 'ellipse' ? 'ring' : 'box'} drawn earlier at (${b.x},${b.y}) ${b.w}x${b.h}`
    const hit = nearestOfSize(ref, after, m.built ? tight : loose)
    if (!hit) { misses.push(`${where}: what was built there (${r1(ref.w)}x${r1(ref.h)}) is gone or changed size; put it back at that size, there`); continue }
    const s = m.built ? 10 : keptSlack(b)
    if (Math.abs(hit.dx) <= s && Math.abs(hit.dy) <= s) continue
    const off = [
      Math.abs(hit.dy) > s ? `${Math.abs(hit.dy)}px too ${hit.dy > 0 ? 'low' : 'high'}` : '',
      Math.abs(hit.dx) > s ? `${Math.abs(hit.dx)}px too far ${hit.dx > 0 ? 'right' : 'left'}` : '',
    ].filter(Boolean).join(' and ')
    misses.push(`${where}: this edit moved the <${hit.n.tag}> built for it ${off}; put it back where it was (change the spacing of what this edit touched, e.g. pad the header to keep its height, never the drawn block's position)`)
  }
  return misses.length
    ? { satisfied: false, reason: misses.join('; ') }
    : { satisfied: true, reason: `${marks.length} box${marks.length > 1 ? 'es' : ''} drawn earlier still where drawn` }
}

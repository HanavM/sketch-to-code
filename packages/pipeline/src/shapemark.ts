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
import type { BBox, PageFill, Point } from '@s2c/ink'
import { rdp, resampleBySpacing } from '@s2c/ink'
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
  /** n15: what the area holds: a big word (default) or bare rows. */
  areaOf?: 'rows'
  /**
   * box only (n54): a big box holding several other drawn marks and notes (a whole invoice, a usage panel)
   * is a card: a panel of its own colour (white unless tapped) on the page, at exactly the drawn edges.
   */
  card?: { fill: string | null }
  /** box only (n82): its notes give a number and its label: a stat card (kept as a card), value left, label under. */
  stat?: { value: string; label: string; labelAbove?: boolean }
  /** line only (n14): a slanted line running most of the page: the edge between two areas. */
  edge?: true
  /** box or ring (n15): its notes name a coloured plain thing ("lime badge"): one solid element in that colour. */
  solid?: { word: string; hex: string; noun: string; tol: number; tapped?: boolean }
  /** area box (n17): the big word or number typed on it ("09"), which must fill the box. */
  word?: string
  /** edge line (n17): a band or stripe noted on it, this many px wide, centred on the drawn line. */
  band?: { px: number; colour: string | null }
  /** area box (n16): its notes say the big word is outlined: hollow letters, a text stroke. */
  outlined?: { colour: string | null }
  /** level line (n21): the words typed on it, which sit on its side of the box around it. */
  words?: string
  /** n81: long level line with notes typed at its different ends (logo left, links right): each keeps its side. */
  ends?: Array<{ text: string; x: number; y: number; side: 'left' | 'centre' | 'right' }>
  /** n59: a line that is not level (a line on a turned ticket) with its own note: the words typed on it. */
  carries?: string
  /** big box (n21): notes typed at a spot inside it, page px. */
  typed?: Array<{ text: string; x: number; y: number }>
  /**
   * box only (n31): drawn turned. `box` is then the space it takes on the page (its upright bounds);
   * the box itself is w x h, centred at (cx, cy), turned `deg` degrees (CSS rotate: + is clockwise).
   */
  tilt?: { deg: number; w: number; h: number; cx: number; cy: number; weak?: true }
  /** n32: one of a group a note names ("3 cards, logo top left on each"): that note, and how many share it. */
  each?: { note: string; of: number }
  /** n32: box or ring whose note names a typed mark ("big yellow quote mark"): that glyph, no box. */
  glyph?: { char: string; name: string }
  /** n69: box or ring with its own note: the words typed for it (one item of a list of look-alike marks). */
  own?: string
  /** n119: the list note whose items were spread over this mark and its look-alikes, one each (its items are copy). */
  listNote?: string
  /** n130: one of a row (or column) drawn with fewer boxes than its list note's items: the whole row, and where it starts. */
  rowList?: { items: string[]; first: number; axis: 'row' | 'column'; pitch: number; start: number; size: { w: number; h: number } }
  /**
   * box only (n45): drawn wide with flat top and bottom and ends that bulge out (round or pointed,
   * the way a pill is drawn with a mouse): a pill, fully rounded ends.
   */
  pill?: true
  /**
   * box only (n51): a shape drawn as its outline (a triangle, a mountain; or the side of a box a curve
   * cuts off, a wave): `box` is its bounds, `points` its outline in page px. Built clipped to it (outline.ts).
   */
  outline?: { points: Array<{ x: number; y: number }>; corners?: number; cut?: { holder: string | null }; fill?: PageFill; /** n128: drawn in this pen colour, no tap: its fill */ pen?: string }
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

/** Area enclosed by a closed stroke (shoelace), px². */
const polyArea = (pts: Array<{ x: number; y: number }>) => {
  let a = 0
  for (let i = 0; i < pts.length; i++) { const p = pts[i]!, q = pts[(i + 1) % pts.length]!; a += p.x * q.y - q.x * p.y }
  return Math.abs(a) / 2
}

/** Fraction of points within `tol` of `near`. */
const share = (pts: Array<{ x: number; y: number }>, near: (p: { x: number; y: number }) => boolean) =>
  pts.filter(near).length / pts.length

function asClosed(pts: Array<{ x: number; y: number }>): Omit<ShapeMark, 'strokeId'> | null {
  const b = bbox(pts)
  // n119: a swatch drawn about 14px wide often comes out 13.8px after the hand's wobble: small boxes count from 10px
  if (b.w < 10 || b.h < 10) return null
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
  // n119: under 20px every point is near an edge and a corner, so a small box must also fill its square (a tiny ring fills ~79%)
  const fillsSquare = m >= 20 || polyArea(pts) / Math.max(1, b.w * b.h) >= 0.86
  if (b.w < 14 || b.h < 14) { if (!(m >= 10 && fillsSquare && gap <= 6 && Math.max(b.w, b.h) <= 3 * m)) return null }
  if (allCorners && fillsSquare && share(pts, onEdge) >= 0.92 && len <= perim * 1.6) {
    // n31: a box drawn turned a few degrees still passes upright; keep its angle when it fits much better
    const t = b.w >= 40 && b.h >= 30 ? asTilted(pts, b) : null
    if (t) return t
    return { shape: 'box', box: { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) } }
  }
  // n31: a TILTED BOX (round 31 c3: three cards drawn turned 3-7 degrees were read as a ring, or as
  // freehand, and built straight). Turn the ink upright at the angle that fits it tightest; if it is
  // then a box, and clearly tighter than upright, it is a box drawn at that angle.
  const t = asTilted(pts, b)
  if (t) return t
  // n128: a closed stroke of 5-7 straight sides joined at clear corners (a hexagon) is that polygon, not a
  // ring: round 39 c1's eight hexagons all sat inside the ring band and were built as ovals. Left to
  // outline.ts (polygonOutline), which builds it clipped to the drawn outline.
  if (polygonSides(pts) !== null) return null
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
  // n45: a PILL (round 32 c5: a button drawn wide with flat top and bottom and pointed ends, the
  // way a pill is drawn with a mouse, was read as freehand and built a hexagon). A wide ring
  // stays a ring (tested first). Flat along the top
  // and bottom over the middle, the four corners empty, and the ends bulging out to the far sides.
  const pill = asPill(pts, b, len)
  if (pill) return pill
  return null
}

/**
 * n128: how many sides a closed stroke has when it is a polygon of 5-7 straight sides with clear corners, else null.
 * Simplified at a tight tolerance (1.5% of the diagonal), a drawn ring keeps 10+ points with gentle turns; a
 * hexagon keeps its 6 corners, each a turn of 30-110 degrees, every side a real share of the outline, and the
 * ink stays within that tolerance of the straight sides all the way round.
 */
export function polygonSides(points: Array<{ x: number; y: number }>): number | null {
  if (points.length < 6) return null
  const b = bbox(points)
  // small closed shapes (an avatar, a play button) drawn with a few straight moves are rings; and a shape
  // much wider than tall with pointed ends is a pill (n45)
  if (Math.min(b.w, b.h) < 60 || Math.max(b.w, b.h) > 2 * Math.min(b.w, b.h)) return null
  const diag = Math.hypot(b.w, b.h)
  const eps = Math.max(3, diag * 0.015)
  const v = (rdp(points as Point[], eps) as Array<{ x: number; y: number }>).slice()
  if (v.length > 3 && Math.hypot(v[0]!.x - v.at(-1)!.x, v[0]!.y - v.at(-1)!.y) <= Math.max(12, diag * 0.06)) v.pop()
  // the pen often starts mid-side: a vertex whose turn is near straight is no corner
  const turnAt = (q: Array<{ x: number; y: number }>, i: number) => {
    const p = q[(i + q.length - 1) % q.length]!, c = q[i]!, n = q[(i + 1) % q.length]!
    let d = Math.abs(Math.atan2(n.y - c.y, n.x - c.x) - Math.atan2(c.y - p.y, c.x - p.x)) * 180 / Math.PI
    if (d > 180) d = 360 - d
    return d
  }
  // a corner drawn a little round simplifies to two points close together: one corner, at their middle
  const short = Math.max(14, diag * 0.07)
  for (let i = 0; i < v.length && v.length > 3;) {
    const a = v[i]!, c = v[(i + 1) % v.length]!
    if (Math.hypot(c.x - a.x, c.y - a.y) < short) { v.splice(i, 1, { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }); v.splice((i + 1) % (v.length), 1); i = 0 }
    else i++
  }
  for (let i = 0; i < v.length && v.length > 3;) { if (turnAt(v, i) < 15) { v.splice(i, 1); i = 0 } else i++ }
  const n = v.length
  // an 8-cornered closed stroke is how a ring is drawn with a mouse in eight moves (rounds 31-39 drew
  // dozens of rings that way): only 5-7 corners say polygon
  if (n < 5 || n > 7) return null
  let perim = 0
  for (let i = 0; i < n; i++) perim += Math.hypot(v[(i + 1) % n]!.x - v[i]!.x, v[(i + 1) % n]!.y - v[i]!.y)
  for (let i = 0; i < n; i++) {
    const t = turnAt(v, i)
    if (t < 30 || t > 110) return null
    const side = Math.hypot(v[(i + 1) % n]!.x - v[i]!.x, v[(i + 1) % n]!.y - v[i]!.y)
    if (side < perim / n * 0.4) return null
  }
  // straight sides: every ink point near one of them
  const segDist = (p: { x: number; y: number }, a: { x: number; y: number }, c: { x: number; y: number }) => {
    const dx = c.x - a.x, dy = c.y - a.y, L = dx * dx + dy * dy || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L))
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
  }
  const near = points.filter((p) => { let d = Infinity; for (let i = 0; i < n; i++) d = Math.min(d, segDist(p, v[i]!, v[(i + 1) % n]!)); return d <= eps * 1.5 }).length
  if (near / points.length < 0.95) return null
  return n
}

function asPill(pts: Array<{ x: number; y: number }>, b: BBox, len: number): Omit<ShapeMark, 'strokeId'> | null {
  if (b.w < 2 * b.h || b.h < 16 || b.h > 140) return null
  const tol = Math.max(5, b.h * 0.14)
  // the middle stretch (the ends' bulge aside) runs flat along the top and the bottom
  const mid = pts.filter((p) => p.x >= b.x + b.h * 0.6 && p.x <= b.x + b.w - b.h * 0.6)
  if (mid.length < 6) return null
  const flat = mid.filter((p) => p.y - b.y <= tol || b.y + b.h - p.y <= tol).length / mid.length
  if (flat < 0.9) return null
  const top = mid.some((p) => p.y - b.y <= tol), bottom = mid.some((p) => b.y + b.h - p.y <= tol)
  if (!top || !bottom) return null
  // corners empty: the ends come in from the corners towards the middle height
  const cornerR = b.h * 0.12
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as const
  if (corners.some(([cx, cy]) => pts.some((p) => Math.hypot(p.x - cx, p.y - cy) <= cornerR))) return null
  // each end reaches its far side near the middle height
  const reaches = (x: number) => pts.some((p) => Math.abs(p.x - x) <= tol && Math.abs(p.y - (b.y + b.h / 2)) <= b.h * 0.3)
  if (!reaches(b.x) || !reaches(b.x + b.w)) return null
  if (len > 2.2 * (b.w + b.h)) return null
  return { shape: 'box', pill: true, box: { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) } }
}

type P = { x: number; y: number }
const turn = (pts: P[], deg: number, c: P): P[] => {
  const r = deg * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r)
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin, y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos }))
}
/** Mean distance from each point to the nearest edge of its own bounding box. */
const edgeFit = (pts: P[]): number => {
  const b = bbox(pts)
  return pts.reduce((s, p) => s + Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y), 0) / pts.length
}
/** Is this (upright) closed ink a box: hugs its edges and reaches all four corners? */
function boxLike(pts: P[]): boolean {
  const b = bbox(pts)
  const m = Math.min(b.w, b.h)
  if (m < 14) return false
  const edgeTol = Math.max(6, m * 0.12)
  const cornerTol = Math.max(10, m * 0.2)
  const corners = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]] as const
  if (!corners.every(([cx, cy]) => pts.some((p) => Math.hypot(p.x - cx, p.y - cy) <= cornerTol))) return false
  const on = share(pts, (p) => Math.min(p.x - b.x, b.x + b.w - p.x, p.y - b.y, b.y + b.h - p.y) <= edgeTol)
  return on >= 0.92 && inkLength(pts) <= 2 * (b.w + b.h) * 1.6
}

/**
 * n31: the angle (degrees, CSS sense) a closed stroke was drawn turned at, when it is a box drawn
 * turned 2-40 degrees and fits that turned box clearly better than an upright one; else null.
 */
export function tiltOf(points: P[]): { deg: number; w: number; h: number; cx: number; cy: number; aabb: BBox } | null {
  const pts = points.length > 3 ? points : []
  if (!pts.length) return null
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length }
  let best = 0, bestFit = edgeFit(pts)
  const upright = bestFit
  for (let a = -40; a <= 40; a += 0.5) {
    if (a === 0) continue
    const f = edgeFit(turn(pts, -a, c))
    if (f < bestFit) { bestFit = f; best = a }
  }
  if (Math.abs(best) < 1.5 || bestFit > upright * 0.7) return null
  const up = turn(pts, -best, c)
  if (!boxLike(up)) return null
  const ub = bbox(up)
  const mid = turn([{ x: ub.x + ub.w / 2, y: ub.y + ub.h / 2 }], best, c)[0]!
  const corners = turn([{ x: ub.x, y: ub.y }, { x: ub.x + ub.w, y: ub.y }, { x: ub.x + ub.w, y: ub.y + ub.h }, { x: ub.x, y: ub.y + ub.h }], best, c)
  const ab = bbox(corners)
  return { deg: best, w: r1(ub.w), h: r1(ub.h), cx: r1(mid.x), cy: r1(mid.y), aabb: { x: r1(ab.x), y: r1(ab.y), w: r1(ab.w), h: r1(ab.h) } }
}

function asTilted(pts: P[], b: BBox): Omit<ShapeMark, 'strokeId'> | null {
  if (b.w < 40 || b.h < 30) return null
  const t = tiltOf(pts)
  if (!t) return null
  const { aabb, ...tilt } = t
  // under 3 degrees a hand box is often just drawn askew: kept only when it sits in a turned stack (settleTilts)
  return { shape: 'box', box: aabb, tilt: Math.abs(tilt.deg) < 3 ? { ...tilt, weak: true } : tilt }
}

/**
 * n31: a box drawn under 3 degrees off level is upright, unless it overlaps a box drawn clearly
 * turned (a fanned stack of cards, where every card's small angle is meant). Returns the shape to
 * keep: weak tilts that stand alone go back to their upright box.
 */
export function settleTilt<T extends Omit<ShapeMark, 'strokeId'>>(m: T, others: Array<Omit<ShapeMark, 'strokeId'> | null>, upright: () => BBox): T {
  if (!m.tilt?.weak) return m
  const ov = (a: BBox, b: BBox) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)
  if (others.some((o) => o && o !== m && o.tilt && !o.tilt.weak && ov(o.box, m.box))) {
    const { weak: _w, ...tilt } = m.tilt
    return { ...m, tilt }
  }
  const { tilt: _t, ...rest } = m
  return { ...rest, box: upright() } as T
}

/** The clean layout shape this stroke is, or null for anything else (freehand, arrows, text). */
export function shapeOf(points: Array<{ x: number; y: number }>, page?: Array<Array<{ x: number; y: number }>>): Omit<ShapeMark, 'strokeId'> | null {
  const m = rawShapeOf(points)
  if (!m?.tilt?.weak) return m
  // n31: a slight angle counts only beside a box drawn clearly turned
  const others = (page ?? []).filter((p) => p !== points).map((p) => (p.length > 8 ? rawShapeOf(p) : null))
  return settleTilt(m, others, () => {
    const b = bbox(points)
    return { x: r1(b.x), y: r1(b.y), w: r1(b.w), h: r1(b.h) }
  })
}

function rawShapeOf(points: Array<{ x: number; y: number }>): Omit<ShapeMark, 'strokeId'> | null {
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
  if (m.shape === 'box' && m.tilt) {
    const t = m.tilt, c = { x: t.cx, y: t.cy }
    const k = turn([{ x: t.cx - t.w / 2, y: t.cy - t.h / 2 }, { x: t.cx + t.w / 2, y: t.cy - t.h / 2 }, { x: t.cx + t.w / 2, y: t.cy + t.h / 2 }, { x: t.cx - t.w / 2, y: t.cy + t.h / 2 }], t.deg, c)
    return `M ${X(k[0]!.x)} ${Y(k[0]!.y)} L ${X(k[1]!.x)} ${Y(k[1]!.y)} L ${X(k[2]!.x)} ${Y(k[2]!.y)} L ${X(k[3]!.x)} ${Y(k[3]!.y)} Z`
  }
  if (m.shape === 'box' && m.pill) {
    const r = r1(h / 2)
    return `M ${X(x + r)} ${Y(y)} H ${X(x + w - r)} A ${r} ${r} 0 0 1 ${X(x + w - r)} ${Y(y + h)} H ${X(x + r)} A ${r} ${r} 0 0 1 ${X(x + r)} ${Y(y)} Z`
  }
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
/** n56: a whole row of drawn boxes off the same way by this much or more is a shift, even inside each box's slack. */
export const ROW_SHIFT_PX = 12
/** n54: each side of a box 300px or wider lands within this many px of its drawn side. */
export const BOX_EDGE_PX = 8

export function verifyShapeMarks(marks: ShapeMark[], before: SnapLike, after: SnapLike, page: ShapeMark[] = marks): MarkVerdict {
  // n32: a box noted as a quote mark is a glyph (checked by verifyGlyphs), not a box-sized element
  const isBox = (m: ShapeMark) => m.shape !== 'line' && !m.glyph && m.box.w >= 12 && m.box.h >= 10
  const mine = new Set(marks.filter(isBox).map((m) => m.strokeId))
  if (!mine.size) return { satisfied: true, unverifiable: true, reason: 'no drawn boxes to check' }
  // n22: every box on the page is matched (one action's field sits under
  // another action's field), but only this action's boxes are judged
  const boxes = [...marks.filter(isBox), ...page.filter((m) => isBox(m) && !mine.has(m.strokeId))]
    .filter((m, i, a) => a.findIndex((o) => o.strokeId === m.strokeId) === i)
  if (before.truncated || after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const key = (n: { tag: string; rect: BBox }) => `${n.tag}@${r1(n.rect.x)},${r1(n.rect.y)},${r1(n.rect.w)},${r1(n.rect.h)}`
  const old = new Set(before.nodes.map(key))
  const fresh = after.nodes.filter((n) => !old.has(key(n)) && n.rect.w > 0 && n.rect.h > 0)
  const claimed = new Set<string>()
  const out: NonNullable<MarkVerdict['marks']> = []
  const misses: string[] = []
  // per landed-or-off mark: what the message needs once the column is known
  const placed: Array<{ m: ShapeMark; tag: string; dx: number; dy: number; slack: number }> = []
  const lines: string[] = []
  const holds = (o: BBox, me: BBox) => o !== me && o.x <= me.x + 2 && o.y <= me.y + 2 && o.x + o.w >= me.x + me.w - 2 && o.y + o.h >= me.y + me.h - 2
  // n22 (login try 2): the card was built 90px low and the fields in it with
  // it, so the email box was matched to the password field and the heading.
  // Big boxes are matched first, and a box inside one that landed off is
  // looked for where that offset puts it.
  const order = boxes.map((m, i) => ({ m, i })).sort((a, b) => b.m.box.w * b.m.box.h - a.m.box.w * a.m.box.h || a.i - b.i)
  const rank = new Map(order.map((o) => [o.m.strokeId, o.i]))
  for (const { m } of order) {
    const b = m.box
    const holder = placed.filter((p) => holds(p.m.box, b)).sort((a, c) => a.m.box.w * a.m.box.h - c.m.box.w * c.m.box.h)[0]
    const cx = b.x + b.w / 2 + (holder?.dx ?? 0), cy = b.y + b.h / 2 + (holder?.dy ?? 0)
    let best: (typeof fresh)[number] | null = null, bestD = Infinity
    for (const n of fresh) {
      if (claimed.has(n.id)) continue
      if (Math.abs(n.rect.w - b.w) > Math.max(10, b.w * 0.35)) continue
      if (Math.abs(n.rect.h - b.h) > Math.max(8, b.h * 0.4)) continue
      const d = Math.hypot(n.rect.x + n.rect.w / 2 - cx, n.rect.y + n.rect.h / 2 - cy)
      if (d < bestD) { best = n; bestD = d }
    }
    const where = `the ${m.shape === 'ellipse' ? 'ring' : 'box'} drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    // n22 (login try 3): the sign-in card was built at the left edge, 429px off. "Nothing that size was
    // built near it" sent the repair to rebuild it; a big block of just that size anywhere is that block, off.
    if ((!best || bestD > 260) && b.w >= 160 && b.h >= 120) {
      for (const n of fresh) {
        if (claimed.has(n.id)) continue
        if (Math.abs(n.rect.w - b.w) > b.w * 0.06 || Math.abs(n.rect.h - b.h) > b.h * 0.1) continue
        const d = Math.hypot(n.rect.x + n.rect.w / 2 - cx, n.rect.y + n.rect.h / 2 - cy)
        if (!best || bestD > 260 || d < bestD) { best = n; bestD = 0 }
      }
    }
    if (!best || bestD > 260) {
      if (!mine.has(m.strokeId)) continue
      out.push({ strokeId: m.strokeId, drawn: b, built: null, dx: null, dy: null })
      lines.push(`${where}: nothing about that size was built near it; build what it stands for at that size, there`)
      continue
    }
    claimed.add(best.id)
    const dx = r1(best.rect.x + best.rect.w / 2 - (b.x + b.w / 2)), dy = r1(best.rect.y + best.rect.h / 2 - (b.y + b.h / 2))
    if (mine.has(m.strokeId)) out.push({ strokeId: m.strokeId, drawn: b, built: { ...best.rect }, dx, dy })
    // n20: the slack grows with the box but stops at 28px. A 422px sign-in
    // card built 90px below where it was drawn (centred on the screen) passed
    // under a quarter-of-the-box slack; a person sees 90px at once.
    const slack = Math.min(28, Math.max(12, Math.min(b.w, b.h) * 0.25))
    placed.push({ m, tag: best.tag, dx, dy, slack })
  }
  placed.sort((a, c) => rank.get(a.m.strokeId)! - rank.get(c.m.strokeId)!)
  out.sort((a, c) => rank.get(a.strokeId)! - rank.get(c.strokeId)!)
  // n22 (login, n20 try 3): the email field was 16px low and the password
  // field under it 15px low only BECAUSE of it. Each was told "move it 16px",
  // the repair shifted both, and the password field and button ended 16 and
  // 26px too high. So a box in a stack is judged by its own error (its offset
  // minus the offset of the box straight above it), and the repair is told
  // which boxes simply follow and which already-landed boxes will move too.
  const above = (i: number): (typeof placed)[number] | null => {
    const me = placed[i]!.m.box
    let pick: (typeof placed)[number] | null = null
    for (const o of placed) {
      if (o === placed[i]) continue
      const ob = o.m.box
      if (holds(ob, me) || holds(me, ob)) continue // a card round the field is not "above" it
      // n21 (bento): a button inside the CTA card hung on the quote card in the row above,
      // outside that card. A box in a card only follows boxes in the same card.
      const myCard = placed.filter((p) => holds(p.m.box, me)).sort((a, c) => a.m.box.w * a.m.box.h - c.m.box.w * c.m.box.h)[0]
      if (myCard && !holds(myCard.m.box, ob)) continue
      const overlap = Math.min(ob.x + ob.w, me.x + me.w) - Math.max(ob.x, me.x)
      if (overlap < 0.5 * Math.min(ob.w, me.w)) continue
      if (ob.y + ob.h > me.y + 4) continue
      if (!pick || ob.y > pick.m.box.y) pick = o
    }
    return pick
  }
  // what a box's position hangs on: the box straight above it, else the box it sits in
  const holderOf = (i: number) => placed.filter((p) => holds(p.m.box, placed[i]!.m.box))
    .sort((a, c) => a.m.box.w * a.m.box.h - c.m.box.w * c.m.box.h)[0] ?? null
  const ref = (i: number): { p: (typeof placed)[number]; rel: string } | null => {
    const a = above(i)
    if (a) return { p: a, rel: 'above it' }
    const h = holderOf(i)
    return h ? { p: h, rel: 'it sits in' } : null
  }
  const anyMoveAbove = (i: number): (typeof placed)[number] | null => {
    for (let a = ref(i)?.p ?? null; a; a = ref(placed.indexOf(a))?.p ?? null) {
      if (Math.abs(a.dy) > a.slack) return a
    }
    return null
  }
  const name = (p: (typeof placed)[number]) => `the <${p.tag}> drawn at (${p.m.box.x},${p.m.box.y})`
  const level = page.filter((m) => m.shape === 'line' && !m.edge && m.from && m.to && Math.abs(m.from.y - m.to.y) <= 2)
  // n25: where the page built a drawn level line (a tab bar's rule, a header's underline): the bar whose
  // width spans most of the line and whose bottom edge sits nearest it. Null when nothing like it was built.
  const builtLine = (l: ShapeMark): number | null => {
    const x0 = Math.min(l.from!.x, l.to!.x), x1 = Math.max(l.from!.x, l.to!.x), len = x1 - x0
    if (len < 120) return null
    let best: number | null = null
    for (const n of after.nodes) {
      const r = n.rect
      if (r.h <= 0 || r.h > 90 || r.w < len * 0.6 || r.w > len * 1.4) continue
      if (Math.min(r.x + r.w, x1) - Math.max(r.x, x0) < len * 0.6) continue
      const bottom = r.y + r.h
      if (Math.abs(bottom - l.from!.y) > 120) continue
      if (best === null || Math.abs(bottom - l.from!.y) < Math.abs(best - l.from!.y)) best = bottom
    }
    return best === null ? null : r1(best)
  }
  // n25: the drawn pitch of a column (top to top) against the built one, from the boxes riding on box i
  const pitchOf = (i: number): string => {
    const col = [placed[i]!, ...placed.filter((o, j) => j !== i && (() => {
      for (let a = ref(j)?.p ?? null, k = 0; a && k < 40; a = ref(placed.indexOf(a))?.p ?? null, k++) if (a === placed[i]) return true
      return false
    })())].sort((a, c) => a.m.box.y - c.m.box.y)
    if (col.length < 3) return ''
    const drawn = (col.at(-1)!.m.box.y - col[0]!.m.box.y) / (col.length - 1)
    const built = (col.at(-1)!.m.box.y + col.at(-1)!.dy - col[0]!.m.box.y - col[0]!.dy) / (col.length - 1)
    if (Math.abs(built - drawn) < 4) return ` The rows keep the drawn pitch (${r1(drawn)}px top to top): keep each row's height and gap as they are.`
    return ` The rows are also built ${r1(Math.abs(built - drawn))}px ${built > drawn ? 'taller' : 'shorter'} each than drawn: drawn, one row's top to the next is ${r1(drawn)}px; built, ${r1(built)}px. Make each row (its padding, line heights and the gap or divider under it) add up to ${r1(drawn)}px.`
  }
  const topDrift = (i: number): string => {
    const p = placed[i]!, b = p.m.box
    const hangsOn = (j: number): boolean => {
      for (let a = ref(j)?.p ?? null, k = 0; a && k < 40; a = ref(placed.indexOf(a))?.p ?? null, k++) if (a === p) return true
      return false
    }
    const followers = placed.filter((o, j) => j !== i && hangsOn(j) && Math.abs(o.dy - p.dy) <= Math.max(12, Math.abs(p.dy) * 0.5)).length
    // the nearest level line drawn above it (a rule, a tab underline, a heading's line)
    const line = level.filter((l) => l.from!.y <= b.y - 2).sort((a, c) => c.from!.y - a.from!.y)[0]
    const sign = p.dy > 0 ? 'low' : 'high'
    const n = Math.abs(p.dy)
    const whole = followers ? ` The ${followers} drawn box${followers > 1 ? 'es' : ''} below it ride${followers > 1 ? '' : 's'} on it, so the whole page from here down sits about ${n}px ${sign}.` : ''
    const pitch = followers >= 2 ? pitchOf(i) : ''
    const fix = p.dy > 0
      ? `take ${n}px OUT of the space above it (the heading's size or margin, the tab bar's padding or height, the list's top margin or gap). Never add space and never push it further down; do not use negative margins or relative offsets.`
      : `add ${n}px to the space above it (the list's top margin, or the gap under what sits above it). Never pull it further up.`
    if (!line) return `${whole} The cause is above it, at the top: ${fix}${pitch}`
    const ly = line.from!.y
    // n25 (r2 e3 settings, n24 try 2): the heading and tabs were built where drawn and the extra 77px sat
    // between the tabs line and the first row, but the repair was told "the heading's size or margin, the
    // tab bar" first and squeezed the header up. So find where the line was built: if it landed, the header
    // is held and the gap under it is named as the one place to take the drift out.
    const at = builtLine(line)
    const gapDrawn = r1(b.y - ly), gapBuilt = r1(b.y + p.dy - (at ?? ly))
    if (at !== null && Math.abs(at - ly) <= 12) {
      const gapFix = p.dy > 0
        ? `take ${r1(gapBuilt - gapDrawn)}px OUT of that gap only (the list's top margin or padding, the first row's top padding, a spacer or margin under the tab bar). Keep the heading and the tabs exactly as they are: do not shrink or move them. Never add space; no negative margins or relative offsets.`
        : `add ${r1(gapDrawn - gapBuilt)}px to that gap only (the list's top margin). Keep the heading and the tabs exactly as they are.`
      return `${whole} The line drawn at y=${ly} (the bar above it) is built where drawn (its bottom at y=${at}), so the header is right. The drift starts in the gap under that line: drawn, this box's top is ${gapDrawn}px below it; built, ${gapBuilt}px. So ${gapFix}${pitch}`
    }
    if (at !== null) {
      const lineOff = r1(at - ly)
      const rest = r1(gapBuilt - gapDrawn)
      return `${whole} The line drawn at y=${ly} is itself built ${Math.abs(lineOff)}px too ${lineOff > 0 ? 'low' : 'high'} (its bottom at y=${at}): that part of the drift is above the line (the heading's size or margin, the tab bar's padding or height): ${lineOff > 0 ? 'take' : 'add'} ${Math.abs(lineOff)}px there. ${Math.abs(rest) > 4 ? `The other ${Math.abs(rest)}px is in the gap under the line (drawn ${gapDrawn}px, built ${gapBuilt}px): ${rest > 0 ? 'take it out of' : 'add it to'} the list's top margin or the first row's padding.` : 'The gap under the line is right; keep it.'} Never push anything further ${p.dy > 0 ? 'down' : 'up'}; no negative margins or relative offsets.${pitch}`
    }
    return `${whole} The cause is above it, at the top: drawn, its top is ${gapDrawn}px below the line drawn at y=${ly}; built, it is ${r1(b.y + p.dy - ly)}px below that line's spot. So ${fix}${pitch}`
  }
  // the top box of each column that sits off on its own (nothing drawn above it to blame)
  const drifters = placed.filter((q, j) => !ref(j) && Math.abs(q.dy) > q.slack).sort((a, c) => a.m.box.y - c.m.box.y)
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i]!
    if (!mine.has(p.m.strokeId)) continue
    const b = p.m.box
    const where = `the ${p.m.shape === 'ellipse' ? 'ring' : 'box'} drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    const r = ref(i)
    const up = r?.p ?? null
    const ownDy = up ? r1(p.dy - up.dy) : p.dy
    const off = Math.abs(p.dy) > p.slack || Math.abs(p.dx) > p.slack
    if (!off) {
      // landed, but a box above it is about to move: it would move with it
      const mover = anyMoveAbove(i)
      if (mover && Math.abs(mover.dy) > p.slack) {
        misses.push(`${where}: the <${p.tag}> built for it lands now, but its place hangs on ${name(mover)}, which is ${Math.abs(mover.dy)}px too ${mover.dy > 0 ? 'low' : 'high'}. When that one moves this one moves with it, so keep this one at its drawn top (${r1(b.y)}px): change the gap above it by the same amount the other way.`)
      }
      continue
    }
    const dirs = [
      Math.abs(p.dy) > p.slack ? `${Math.abs(p.dy)}px too ${p.dy > 0 ? 'low' : 'high'}` : '',
      Math.abs(p.dx) > p.slack ? `${Math.abs(p.dx)}px too far ${p.dx > 0 ? 'right' : 'left'}` : '',
    ].filter(Boolean).join(' and ')
    // a big block off only vertically is almost always centred on the screen
    const centred = Math.abs(p.dy) > p.slack && Math.abs(p.dx) <= p.slack && b.w >= 160 && b.h >= 120
      ? ` It looks centred on the screen: drop the vertical centring (min-h-screen with items-center or justify-center, place-items-center, my-auto) and give it its drawn top, ${r1(b.y)}px from the top of the page.`
      : ''
    const ownDx = up ? r1(p.dx - up.dx) : p.dx
    const followsOnly = up && Math.abs(ownDy) <= Math.min(6, p.slack) && Math.abs(ownDx) <= Math.min(6, p.slack)
    if (followsOnly) {
      misses.push(`${where}: the <${p.tag}> built for it sits ${dirs}, but only because ${name(up)} ${r!.rel} is off by the same. The gap between them is right, so do not move this one on its own: it lands when that one is fixed.`)
      continue
    }
    const upOff = up && (Math.abs(up.dy) > up.slack || Math.abs(up.dx) > up.slack)
    const rest = [
      Math.abs(ownDy) > 2 ? `${Math.abs(ownDy)}px too ${ownDy > 0 ? 'low' : 'high'}` : '',
      Math.abs(ownDx) > 2 ? `${Math.abs(ownDx)}px too far ${ownDx > 0 ? 'right' : 'left'}` : '',
    ].filter(Boolean).join(' and ')
    const partial = upOff
      ? ` Part of that comes from ${name(up)} ${r!.rel}; once that one is fixed this one is still ${rest}, so change only the spacing between them by that much.`
      : ''
    // n24 (r2 e3 settings): every toggle sat 19-30px low because the heading and tabs above them came out
    // taller than drawn. The top toggle was told "move it, fix the spacing that pushed it"; the repair added
    // space and all four ended 37-48px low. When the top box of a column is off and the boxes below only
    // follow it, the cause is above it: say so, with the drawn line it hangs under and the gap to take out.
    // and a box elsewhere on the page that is off by the same amount (the buttons under the rows) rides the
    // same drift: it lands when the top is fixed, so it is not moved on its own (that would double the fix)
    const twin = !up && Math.abs(p.dy) > p.slack && Math.abs(p.dx) <= p.slack
      ? drifters.find((d) => d !== p && Math.abs(d.dy - p.dy) <= 10 && d.m.box.y + d.m.box.h <= b.y) : undefined
    if (twin) {
      misses.push(`${where}: the <${p.tag}> built for it sits ${dirs}, the same as ${name(twin)}: the whole page above it sits that much ${p.dy > 0 ? 'low' : 'high'}. Do not move this one on its own: it lands when the space at the top is fixed.`)
      continue
    }
    // n25 (r2 e3 settings, n24 try 2): the buttons under the rows were 112px low, the last toggle 102px low
    // (the first 77 plus taller rows). Told "take 112px out above it" on its own, the repair doubled the fix
    // and the buttons ended 15px high. A box with no box straight above it rides on the lowest drawn box
    // above it in any column: only the rest is its own.
    const rider = !up && Math.abs(p.dy) > p.slack && Math.abs(p.dx) <= p.slack
      ? placed.filter((o) => o !== p && o.m.box.y + o.m.box.h <= b.y + 2 && Math.abs(o.dy) > o.slack && Math.sign(o.dy) === Math.sign(p.dy))
        .sort((a, c) => (c.m.box.y + c.m.box.h) - (a.m.box.y + a.m.box.h))[0] : undefined
    if (rider) {
      const own = r1(p.dy - rider.dy)
      misses.push(`${where}: the <${p.tag}> built for it sits ${dirs}, and ${Math.abs(rider.dy)}px of that is ${name(rider)} above it, which sits ${Math.abs(rider.dy)}px too ${rider.dy > 0 ? 'low' : 'high'}: it moves with the rows above when those are fixed, so do not move it on its own for that part.${Math.abs(own) > p.slack ? ` The other ${Math.abs(own)}px is its own: change the gap between the last row and it by ${Math.abs(own)}px (${own > 0 ? 'less' : 'more'} space).` : ' The gap between them is about right; keep it.'}`)
      continue
    }
    const drift = !up && Math.abs(p.dy) > p.slack ? topDrift(i) : ''
    misses.push(`${where}: the <${p.tag}> built for it sits ${dirs}; move it, and what is laid out around it, so it sits where it was drawn (fix the spacing or padding that pushed it, keep its size).${partial}${centred}${drift}`)
  }
  // n25 (r2 e3 settings, n22 and n24): an on toggle was built with its knob past the track's right end.
  // A drawn box of toggle shape whose built element has a round knob poking out of it is a miss.
  for (const o of out) {
    const t = o.built
    if (!t || t.w < 24 || t.w > 90 || t.h < 12 || t.h > 44 || t.w < t.h * 1.3) continue
    const cy = t.y + t.h / 2
    for (const k of after.nodes) {
      const r = k.rect
      if (r.w < 6 || r.h < 6 || r.h > t.h + 4 || r.w > t.h + 6 || Math.abs(r.w - r.h) > 4) continue
      if (Math.abs(r.y + r.h / 2 - cy) > t.h / 2) continue
      if (r.x > t.x + t.w + 20 || r.x + r.w < t.x - 20) continue
      const outR = r1(r.x + r.w - (t.x + t.w)), outL = r1(t.x - r.x)
      if (outR <= 2 && outL <= 2) continue
      const inset = Math.max(1, r1((t.h - r.h) / 2))
      const travel = r1(t.w - r.w - 2 * inset)
      misses.push(`the box drawn at (${o.drawn.x},${o.drawn.y}) ${o.drawn.w}x${o.drawn.h}: its knob (a <${k.tag}> ${r1(r.w)}x${r1(r.h)}) sticks ${outR > 2 ? `${outR}px out past the track's right end` : `${outL}px out past its left end`}. The knob stays inside its ${r1(t.w)}x${r1(t.h)} track: ${inset}px in from the edge when off, and moved exactly ${travel}px right when on (translate-x-[${travel}px], or left ${r1(t.w - r.w - inset)}px), never more`)
      break
    }
  }
  // n31 (round 31 c2): three frames drawn 28px apart, "thick gold frames on all 3", were built with the
  // frame added outside each drawn box, so the frames touched and the row ran wider than drawn. Boxes
  // drawn side by side keep the gap drawn between them.
  for (const a of out) {
    for (const b of out) {
      if (a === b || !a.built || !b.built) continue
      const da = a.drawn, db = b.drawn
      const g = db.x - (da.x + da.w)
      if (g < 14 || g > 200) continue
      const vov = Math.min(da.y + da.h, db.y + db.h) - Math.max(da.y, db.y)
      if (vov < 0.6 * Math.min(da.h, db.h)) continue
      // only next-door neighbours: no drawn box between them
      if (out.some((c) => c !== a && c !== b && c.drawn.x >= da.x + da.w - 2 && c.drawn.x + c.drawn.w <= db.x + 2 &&
        Math.min(c.drawn.y + c.drawn.h, da.y + da.h) - Math.max(c.drawn.y, da.y) > 0)) continue
      const bg = r1(b.built.x - (a.built.x + a.built.w))
      if (bg >= g * 0.5 && bg <= g * 2 + 12) continue
      misses.push(`the boxes drawn at (${da.x},${da.y}) ${da.w}x${da.h} and (${db.x},${db.y}) ${db.w}x${db.h} stand ${g}px apart; built, ` +
        `${bg <= 0 ? 'they touch or overlap' : bg < g ? `only ${bg}px apart` : `${bg}px apart`}. Keep each at its drawn size, with any border or frame inside it ` +
        `(box-sizing: border-box, or a frame drawn as padding), and keep the ${g}px gap between them`)
    }
  }
  // n54 (round 33 e5 billing): two panels drawn 200-1080 were built 216-1063: centred, so inside the 28px
  // slack, but each side 16-17px in, which cost the page 14 points of layout. A wide box's sides are
  // promises of their own: each within BOX_EDGE_PX of where it was drawn (cards are checked by verifyCards).
  for (const o of out) {
    if (!o.built || o.drawn.w < 300) continue
    const m = boxes.find((q) => q.strokeId === o.strokeId)
    if (!m || m.card || m.area) continue
    const p = placed.find((q) => q.m.strokeId === o.strokeId)
    if (!p || Math.abs(p.dx) > p.slack || Math.abs(p.dy) > p.slack) continue // already told to move
    const dl = r1(o.built.x - o.drawn.x), dr = r1(o.built.x + o.built.w - o.drawn.x - o.drawn.w)
    if (Math.abs(dl) <= BOX_EDGE_PX && Math.abs(dr) <= BOX_EDGE_PX) continue
    misses.push(`the box drawn at (${o.drawn.x},${o.drawn.y}) ${o.drawn.w}x${o.drawn.h} spans x ${o.drawn.x} to ${o.drawn.x + o.drawn.w}; the <${p.tag}> built for it spans ` +
      `${r1(o.built.x)} to ${r1(o.built.x + o.built.w)}: make it exactly ${o.drawn.w}px wide from x ${o.drawn.x} (an exact px width with box-sizing: border-box, ` +
      `not a max-w class or page padding that rounds it), keeping what is inside it`)
  }
  // n56 (round 33 c4 herb farm): three circles drawn in a row were each built 24px high, inside the 28px slack a
  // lone box gets, so the row passed while the whole middle of the page sat visibly high. Three or more boxes
  // in a row all off the same way by about the same amount is one shift, not noise: a row moved as one.
  const rowShift = placed.filter((q) => Math.abs(q.dy) >= ROW_SHIFT_PX && Math.abs(q.dy) <= q.slack && Math.abs(q.dx) <= q.slack)
  for (const head of rowShift) {
    const cy = head.m.box.y + head.m.box.h / 2
    const row = rowShift.filter((q) => Math.abs(q.m.box.y + q.m.box.h / 2 - cy) <= 12 && Math.sign(q.dy) === Math.sign(head.dy))
    if (row.length < 3 || row.some((q) => q.m.box.x < head.m.box.x)) continue
    // every box drawn in that row must have moved, not just three of many
    const drawnRow = placed.filter((q) => Math.abs(q.m.box.y + q.m.box.h / 2 - cy) <= 12)
    if (drawnRow.length !== row.length || !mine.has(head.m.strokeId)) continue
    const dys = row.map((q) => q.dy)
    if (Math.max(...dys) - Math.min(...dys) > 6) continue
    const d = r1(dys.reduce((a, b) => a + b, 0) / dys.length)
    misses.push(`the row of ${row.length} ${row.every((q) => q.m.shape === 'ellipse') ? 'rings' : 'boxes'} drawn at y ${r1(head.m.box.y)} was built ${Math.abs(d)}px too ${d > 0 ? 'low' : 'high'}, all together ` +
      `(tops at y ${r1(head.m.box.y + d)}): the row moved as one, so one space above it is off by ${Math.abs(d)}px (the gap between the text above and the row, or that text's size or margin). ` +
      `${d < 0 ? 'Add' : 'Take out'} ${Math.abs(d)}px there so the row's tops land at y ${r1(head.m.box.y)}; keep the boxes' size and the gaps between them, and what is above the row where it is; no negative margins or relative offsets`)
  }
  // the "nothing built" misses first, in drawing order
  misses.unshift(...lines)
  return misses.length
    ? { satisfied: false, reason: misses.join('; '), marks: out }
    : { satisfied: true, reason: `${mine.size} drawn box${mine.size > 1 ? 'es' : ''} built where drawn`, marks: out }
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

interface TextSnap { truncated?: boolean; nodes: Array<{ id: string; tag: string; rect: BBox; text?: string; textBox?: BBox }> }

/**
 * No words sit on top of a form field (n20).
 *
 * Round 1 e1 (hand, n13): a repair round moving the inputs up to where they
 * were drawn squeezed the "Password" label onto the email field, and nothing
 * noticed: every check looked at where boxes went, none at what they now
 * cover. A label, heading or line of copy whose letters overlap an input,
 * textarea or select is broken whatever the layout score says. Only overlaps
 * that are new in this run count, so a page that already had one is not
 * blamed on the run.
 */
export function verifyTextClearOfFields(before: TextSnap, after: TextSnap): MarkVerdict {
  if (before.truncated || after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const FIELD = new Set(['input', 'textarea', 'select'])
  const hits = (snap: TextSnap) => {
    const fields = snap.nodes.filter((n) => FIELD.has(n.tag) && n.rect.w > 4 && n.rect.h > 4)
    const out: Array<{ text: string; field: BBox; key: string }> = []
    if (!fields.length) return out
    for (const t of snap.nodes) {
      const tb = t.textBox
      if (!t.text || !tb || tb.w <= 0 || tb.h <= 0 || FIELD.has(t.tag) || t.tag === 'option') continue
      for (const f of fields) {
        const ix = Math.min(tb.x + tb.w, f.rect.x + f.rect.w) - Math.max(tb.x, f.rect.x)
        const iy = Math.min(tb.y + tb.h, f.rect.y + f.rect.h) - Math.max(tb.y, f.rect.y)
        if (ix <= 0 || iy <= 0) continue
        // a third of the letters' height inside the field: on it, not just touching
        if (iy < tb.h / 3 || ix < Math.min(tb.w, 8)) continue
        out.push({ text: t.text.slice(0, 40), field: f.rect, key: `${t.text}@${r1(f.rect.x)},${r1(f.rect.y)}` })
      }
    }
    return out
  }
  const fields = after.nodes.some((n) => FIELD.has(n.tag))
  if (!fields) return { satisfied: true, unverifiable: true, reason: 'no form fields on the page' }
  const old = new Set(hits(before).map((h) => h.key))
  const fresh = hits(after).filter((h) => !old.has(h.key))
  if (!fresh.length) return { satisfied: true, reason: 'no words sit on a form field' }
  return {
    satisfied: false,
    reason: fresh.map((h) => `"${h.text}" sits on top of the field at (${r1(h.field.x)},${r1(h.field.y)}) ${r1(h.field.w)}x${r1(h.field.h)}`).join('; ') +
      '; keep each label in its own row just above its field (move the label with its field, never onto another one)',
  }
}

/**
 * How far the drawn boxes are off, in total, in a verify record (n24).
 *
 * A repair round on the settings page moved every toggle further from where it
 * was drawn (30px low to 48px low) and was kept, because "no improvement" only
 * stopped the next round. With this, the round that made the boxes worse is
 * known and its edits can be put back. A box with nothing built for it counts
 * as 200px off.
 */
export function marksMiss(detail: unknown): number | null {
  const seen: Array<{ built: unknown; dx: number | null; dy: number | null }> = []
  const walk = (v: unknown, depth: number): void => {
    if (!v || typeof v !== 'object' || depth > 6) return
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return }
    const o = v as Record<string, unknown>
    if (o.kind === 'marks' && o.verdict && typeof o.verdict === 'object') {
      const ms = (o.verdict as { marks?: unknown }).marks
      if (Array.isArray(ms)) for (const m of ms) if (m && typeof m === 'object') seen.push(m as { built: unknown; dx: number | null; dy: number | null })
      return
    }
    for (const x of Object.values(o)) walk(x, depth + 1)
  }
  walk(detail, 0)
  if (!seen.length) return null
  return seen.reduce((t, m) => t + (m.built == null || m.dx == null || m.dy == null ? 200 : Math.abs(m.dx) + Math.abs(m.dy)), 0)
}

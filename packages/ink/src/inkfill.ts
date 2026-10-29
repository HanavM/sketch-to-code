/**
 * Colour from ink (goal 2026-10-27, node n10).
 *
 * The hand baseline said every colour in words ("sunset gradient page, orange
 * top-left to purple bottom-right", "dark navy page, blurry pink and cyan
 * glows"), and word colours overshoot: "glows much brighter" turned the glows
 * white. A person with a set of markers says colour by colouring. So:
 *
 * - **A tap with a colour picked fills what it lands in.** Pick a colour, tap
 *   inside a drawn box, ring or closed blob: that block is that colour. Tap on
 *   bare page: the page is that colour. Two or more page taps in different
 *   colours make a gradient running from the first tap towards the last.
 * - **A mark drawn in a colour is that colour.** A box or ring drawn with a
 *   coloured pen is filled with it; a line or text squiggle drawn in colour
 *   sets that text's (or that rule's) colour.
 *
 * Shared by the overlay (to show the fill the moment the pen lifts) and the
 * pipeline (to tell codegen and check the page), so what you see is what is
 * built. Pure geometry, no DOM.
 */
import type { BBox, Point, Stroke } from './types.js'
import { bboxOf, pointInPolygon, polygonArea } from './geometry.js'
import { rdp } from './simplify.js'

/** A tap: a press that barely moved. Only a coloured one is a fill. */
export const FILL_DOT_PX = 8

export function isFillDot(s: Pick<Stroke, 'points' | 'color'>): boolean {
  if (!s.color || s.points.length === 0) return false
  const b = bboxOf(s.points)
  return b.w <= FILL_DOT_PX && b.h <= FILL_DOT_PX
}

/** Closes on itself and is big enough to hold something. */
function closedOutline(pts: Point[]): boolean {
  if (pts.length < 4) return false
  const b = bboxOf(pts)
  if (b.w < 20 || b.h < 20) return false
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  const a = pts[0]!, z = pts[pts.length - 1]!
  return Math.hypot(z.x - a.x, z.y - a.y) <= Math.max(28, len * 0.15)
}

export interface InkFill {
  /** The tap stroke. */
  dotId: string
  color: string
  at: { x: number; y: number }
  /** The closed mark it landed in (smallest that holds it), or null: the page. */
  target: string | null
  /** The target's bounding box, page px. */
  box?: BBox
  /**
   * n51: the target is a region a curve cut off (a wave across a panel, a hill along the page's
   * foot): the target id is the curve's, and this is the region's outline, page px.
   */
  region?: Array<{ x: number; y: number }>
}

type XY = { x: number; y: number }

/**
 * n51: a curve drawn across a closed box (or across the page) from one edge to another cuts it in
 * two. Round 33 c1: a wave drawn across the left panel, two sky taps above it and a pale tap below;
 * all three landed on the panel and the last one won, so the sky came out pale. The smaller side is
 * the shape the curve draws (the wave, the hill); its outline is the curve closed along the box's
 * edge. A straight line is a divider or an edge (areas.ts), never this: only a curve that bows away
 * from its chord counts.
 */
export interface SplitRegion { id: string; holder: string | null; points: XY[]; box: BBox }

export function splitRegions<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(strokes: S[], page?: { w: number; h: number }): SplitRegion[] {
  const outlines = strokes.filter((s) => !isFillDot(s) && closedOutline(s.points))
  const out: SplitRegion[] = []
  for (const c of strokes) {
    if (isFillDot(c) || c.points.length < 4 || closedOutline(c.points)) continue
    const a = c.points[0]!, z = c.points[c.points.length - 1]!
    const chord = Math.hypot(z.x - a.x, z.y - a.y)
    if (chord < 120) continue
    let len = 0, dev = 0
    for (let i = 1; i < c.points.length; i++) len += Math.hypot(c.points[i]!.x - c.points[i - 1]!.x, c.points[i]!.y - c.points[i - 1]!.y)
    for (const p of c.points) dev = Math.max(dev, Math.abs((p.x - a.x) * (z.y - a.y) - (p.y - a.y) * (z.x - a.x)) / chord)
    if (len / chord < 1.04 || dev < Math.max(16, chord * 0.06)) continue
    const cb = bboxOf(c.points)
    // the smallest closed box that holds the curve, with both ends on its edge; else the page
    const holders: Array<{ id: string | null; b: BBox }> = outlines
      .map((o) => ({ id: o.id as string | null, b: bboxOf(o.points) }))
      .filter((o) => o.b.x - 14 <= cb.x && o.b.y - 14 <= cb.y && o.b.x + o.b.w + 14 >= cb.x + cb.w && o.b.y + o.b.h + 14 >= cb.y + cb.h)
      .sort((p, q) => p.b.w * p.b.h - q.b.w * q.b.h)
    if (page) holders.push({ id: null, b: { x: 0, y: 0, w: page.w, h: page.h } })
    for (const h of holders) {
      const tol = Math.max(24, Math.min(h.b.w, h.b.h) * 0.04)
      const ta = perimT(a, h.b, tol), tz = perimT(z, h.b, tol)
      if (ta === null || tz === null) continue
      const P = 2 * (h.b.w + h.b.h)
      const fine = rdp(c.points as never, 2.5) as XY[]
      const curve = fine.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))
      // close the curve along the box's edge each way round; the smaller side is the shape
      const side = (dir: 1 | -1): XY[] => {
        const pts = [...curve]
        let t = tz
        const end = ta
        const span = dir === 1 ? ((end - t) % P + P) % P : ((t - end) % P + P) % P
        const corners = [0, h.b.w, h.b.w + h.b.h, 2 * h.b.w + h.b.h]
        const passed = corners
          .map((k) => ({ k, d: dir === 1 ? ((k - t) % P + P) % P : ((t - k) % P + P) % P }))
          .filter((o) => o.d > 0 && o.d < span)
          .sort((p, q) => p.d - q.d)
        for (const o of passed) pts.push(perimPoint(o.k, h.b))
        t = end
        return pts
      }
      const one = side(1), two = side(-1)
      const pick = Math.abs(polygonArea(one as never)) <= Math.abs(polygonArea(two as never)) ? one : two
      const b = bboxOf(pick as never)
      out.push({ id: c.id, holder: h.id, points: pick, box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) } })
      break
    }
  }
  return out
}

/** Where a point sits round a box's edge, clockwise from its top-left corner (px), or null when off the edge. */
function perimT(p: XY, b: BBox, tol: number): number | null {
  const dl = Math.abs(p.x - b.x), dr = Math.abs(b.x + b.w - p.x), dt = Math.abs(p.y - b.y), db = Math.abs(b.y + b.h - p.y)
  const m = Math.min(dl, dr, dt, db)
  if (m > tol) return null
  const cx = Math.min(Math.max(p.x, b.x), b.x + b.w), cy = Math.min(Math.max(p.y, b.y), b.y + b.h)
  if (m === dt) return cx - b.x
  if (m === dr) return b.w + (cy - b.y)
  if (m === db) return b.w + b.h + (b.x + b.w - cx)
  return 2 * b.w + b.h + (b.y + b.h - cy)
}
function perimPoint(t: number, b: BBox): XY {
  if (t <= b.w) return { x: Math.round(b.x + t), y: Math.round(b.y) }
  if (t <= b.w + b.h) return { x: Math.round(b.x + b.w), y: Math.round(b.y + t - b.w) }
  if (t <= 2 * b.w + b.h) return { x: Math.round(b.x + b.w - (t - b.w - b.h)), y: Math.round(b.y + b.h) }
  return { x: Math.round(b.x), y: Math.round(b.y + b.h - (t - 2 * b.w - b.h)) }
}

/** n51: two taps this close on one mark are a re-colouring (the later wins); further apart they make a fade. */
export const RECOLOUR_PX = 48

/**
 * What each coloured tap fills: the smallest closed outline it falls inside
 * (by its ink, not just its box, so a tap beside a ring is not in the ring),
 * or the page. A later tap on the same mark wins (a person re-colouring).
 */
export function inkFills<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(strokes: S[], page?: { w: number; h: number }): InkFill[] {
  const outlines = strokes.filter((s) => !isFillDot(s) && closedOutline(s.points))
  // n51: regions a curve cuts off a box (or the page) hold taps like any outline
  const cuts = splitRegions(strokes, page)
  const shapes: Array<{ id: string; pts: Array<{ x: number; y: number }>; box: BBox; region?: XY[] }> = [
    ...outlines.map((o) => ({ id: o.id, pts: o.points as XY[], box: bboxOf(o.points) })),
    ...cuts.map((c) => ({ id: c.id, pts: c.points, box: c.box, region: c.points })),
  ]
  const out: InkFill[] = []
  for (const d of strokes) {
    if (!isFillDot(d)) continue
    const b = bboxOf(d.points)
    const at = { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) }
    let best: (typeof shapes)[number] | null = null, bestA = Infinity
    for (const o of shapes) {
      const ob = o.box
      if (at.x < ob.x || at.x > ob.x + ob.w || at.y < ob.y || at.y > ob.y + ob.h) continue
      if (!pointInPolygon({ ...at, t: 0 }, o.pts as Point[])) continue
      const area = o.region ? Math.abs(polygonArea(o.region as never)) : ob.w * ob.h
      if (area < bestA) { best = o; bestA = area }
    }
    const fill: InkFill = { dotId: d.id, color: d.color!, at, target: best?.id ?? null }
    if (best) {
      const ob = best.box
      fill.box = { x: Math.round(ob.x), y: Math.round(ob.y), w: Math.round(ob.w), h: Math.round(ob.h) }
      if (best.region) fill.region = best.region
    }
    // a later tap close to an earlier one on the same mark re-colours it; far apart, both count (a fade, n51)
    if (fill.target) {
      const i = out.findIndex((f) => f.target === fill.target && Math.hypot(f.at.x - at.x, f.at.y - at.y) <= RECOLOUR_PX)
      if (i >= 0) out.splice(i, 1)
    }
    out.push(fill)
  }
  return out
}

/**
 * n51: what one mark is filled with from its taps: one colour, or a fade from the first tap towards
 * the last (two taps far apart on a banner, a sky). Null when nothing was tapped on it.
 */
export function markFill<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(fills: InkFill[], target: string, strokes?: S[]): PageFill | null {
  const mine = fills.filter((f) => f.target === target)
  if (!mine.length) return null
  // n59: a straight divider across the mark with a different colour tapped on each side is two fills
  if (strokes && mine.length >= 2) {
    const holder = strokes.find((s) => s.id === target)
    if (holder) {
      const split = dividerSplit(holder, mine, strokes)
      if (split) {
        const b = bboxOf(holder.points)
        const css = splitCss(split, { cx: b.x + b.w / 2, cy: b.y + b.h / 2, w: b.w, h: b.h, deg: 0 })
        return { colors: [...split.colors], css, split }
      }
    }
  }
  return fadeOf(mine)
}

/**
 * n59: a straight line drawn across a closed mark from edge to edge, with a tap in one colour on one
 * side and a tap in another colour on the other, is two solid fills meeting at that line, never one
 * fade. Round 33 c3 (gig ticket): a white tap on the ticket and a pink tap on its stub, either side of
 * the drawn tear line, were read as a white-to-pink fade over the whole ticket.
 */
export interface FillSplit {
  /** colour of the side tapped first, then the other side's */
  colors: [string, string]
  dividerId: string
  /** the divider as drawn (its two ends), page px */
  line: { a: XY; z: XY }
  /** the mark's outline cut along the divider: the side of colors[0], then the side of colors[1] */
  sides: [XY[], XY[]]
}

function distToSeg(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}
function distToOutline(p: XY, poly: XY[]): number {
  let d = Infinity
  for (let i = 0; i < poly.length; i++) d = Math.min(d, distToSeg(p, poly[i]!, poly[(i + 1) % poly.length]!))
  return d
}
/** The part of a polygon on one side of the line a→z (sign +1: left of a→z in screen terms, cross > 0). */
export function clipHalf(poly: XY[], a: XY, z: XY, sign: 1 | -1): XY[] {
  const side = (p: XY) => sign * ((z.x - a.x) * (p.y - a.y) - (z.y - a.y) * (p.x - a.x))
  const out: XY[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    const sp = side(p), sq = side(q)
    if (sp >= 0) out.push(p)
    if ((sp >= 0) !== (sq >= 0)) {
      const t = sp / (sp - sq)
      out.push({ x: Math.round(p.x + t * (q.x - p.x)), y: Math.round(p.y + t * (q.y - p.y)) })
    }
  }
  return out
}

export function dividerSplit<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(
  holder: S, taps: Array<Pick<InkFill, 'color' | 'at'>>, strokes: S[],
): FillSplit | null {
  const poly = (rdp(holder.points as never, 2) as XY[]).map((p) => ({ x: p.x, y: p.y }))
  if (poly.length < 3) return null
  const hb = bboxOf(holder.points)
  const tol = Math.max(24, Math.min(hb.w, hb.h) * 0.08)
  let best: FillSplit | null = null, bestLen = 0
  for (const c of strokes) {
    if (c.id === holder.id || isFillDot(c) || c.points.length < 2 || closedOutline(c.points)) continue
    const a = c.points[0]!, z = c.points[c.points.length - 1]!
    const chord = Math.hypot(z.x - a.x, z.y - a.y)
    if (chord < Math.max(60, Math.min(hb.w, hb.h) * 0.4)) continue
    let dev = 0
    for (const p of c.points) dev = Math.max(dev, Math.abs((p.x - a.x) * (z.y - a.y) - (p.y - a.y) * (z.x - a.x)) / chord)
    if (dev > Math.max(8, chord * 0.08)) continue
    // both ends on the mark's edge, its middle inside: it runs across the mark
    if (distToOutline(a, poly) > tol || distToOutline(z, poly) > tol) continue
    const mid = { x: (a.x + z.x) / 2, y: (a.y + z.y) / 2 }
    if (!pointInPolygon({ ...mid, t: 0 }, poly as Point[])) continue
    const sideOf = (p: XY) => Math.sign((z.x - a.x) * (p.y - a.y) - (z.y - a.y) * (p.x - a.x))
    // the later tap on a side wins (a person re-colouring that side)
    const pos = taps.filter((t) => sideOf(t.at) > 0), neg = taps.filter((t) => sideOf(t.at) < 0)
    if (!pos.length || !neg.length) continue
    const cp = pos[pos.length - 1]!.color, cn = neg[neg.length - 1]!.color
    if (cp.toLowerCase() === cn.toLowerCase()) continue
    const firstPos = taps.findIndex((t) => sideOf(t.at) > 0) < taps.findIndex((t) => sideOf(t.at) < 0)
    const P = { a: { x: Math.round(a.x), y: Math.round(a.y) }, z: { x: Math.round(z.x), y: Math.round(z.y) } }
    const sp = clipHalf(poly, P.a, P.z, 1), sn = clipHalf(poly, P.a, P.z, -1)
    if (sp.length < 3 || sn.length < 3) continue
    if (chord <= bestLen) continue
    bestLen = chord
    best = firstPos
      ? { colors: [cp, cn], dividerId: c.id, line: P, sides: [sp, sn] }
      : { colors: [cn, cp], dividerId: c.id, line: P, sides: [sn, sp] }
  }
  return best
}

/**
 * n59: the CSS for a split fill on an element with this frame (its centre, its own size before turning,
 * and its rotate() in CSS degrees): a linear-gradient at right angles to the divider with a hard stop
 * where the divider crosses, so each side is one solid colour.
 */
export function splitCss(split: Pick<FillSplit, 'colors' | 'line' | 'sides'>, frame: { cx: number; cy: number; w: number; h: number; deg: number }): string {
  const { a, z } = split.line
  const L0 = Math.hypot(z.x - a.x, z.y - a.y) || 1
  let nx = -(z.y - a.y) / L0, ny = (z.x - a.x) / L0
  // the normal points from the first colour's side towards the second's
  const c1 = split.sides[1].reduce((t, p) => ({ x: t.x + p.x / split.sides[1].length, y: t.y + p.y / split.sides[1].length }), { x: 0, y: 0 })
  if ((c1.x - a.x) * nx + (c1.y - a.y) * ny < 0) { nx = -nx; ny = -ny }
  // into the element's own (unturned) frame
  const th = (frame.deg * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th)
  const lx = nx * co + ny * si, ly = -nx * si + ny * co
  const dx0 = a.x - frame.cx, dy0 = a.y - frame.cy
  const px = dx0 * co + dy0 * si, py = -dx0 * si + dy0 * co
  const ang = Math.atan2(lx, -ly)
  const L = Math.abs(frame.w * Math.sin(ang)) + Math.abs(frame.h * Math.cos(ang))
  const at = Math.max(2, Math.min(98, Math.round((0.5 + (px * lx + py * ly) / (L || 1)) * 100)))
  const deg = Math.round(((ang * 180) / Math.PI + 360) % 360)
  const [p, q] = split.colors
  return `linear-gradient(${String(deg)}deg, ${p} 0%, ${p} ${String(at)}%, ${q} ${String(at)}%, ${q} 100%)`
}

function fadeOf(taps: Array<Pick<InkFill, 'color' | 'at'>>): PageFill {
  const colors = taps.map((f) => f.color)
  if (taps.length === 1 || colors.every((c) => c.toLowerCase() === colors[0]!.toLowerCase())) {
    return { colors: [colors[0]!], css: colors[0]! }
  }
  const a = taps[0]!.at, z = taps[taps.length - 1]!.at
  // CSS: 0deg points up, 90deg right; screen y grows downward
  const angle = Math.round(((Math.atan2(z.x - a.x, -(z.y - a.y)) * 180) / Math.PI + 360) % 360)
  return { colors, angle, css: `linear-gradient(${String(angle)}deg, ${colors.join(', ')})` }
}

/**
 * The page's colour from its bare-page taps: one colour, or a gradient from
 * the first tap towards the last (angle in CSS degrees: 0 = up, 90 = right).
 *
 * n33: a spotlight. One page tap with three or more page taps around it (they
 * surround it: no gap between them wider than a half turn, and it sits near
 * their middle) in another colour is a radial glow: the centre tap's colour at
 * that spot, fading out to the ring's colour by the ring's distance. Round 31
 * c5 had a purple glow in the middle of a near-black page and the only way to
 * say it was two taps, which built a top-to-bottom fade.
 */
export interface PageFill {
  colors: string[]
  angle?: number
  css: string
  /** n33: a centre glow: where (page px) and how far out (px) until the ring's colour. */
  radial?: { x: number; y: number; r: number }
  /** n59: two solid fills either side of a drawn divider, not a fade. */
  split?: FillSplit
}

export function spotlight(page: Array<Pick<InkFill, 'color' | 'at'>>): PageFill | null {
  if (page.length < 4) return null
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  for (const c of page) {
    const ring = page.filter((f) => f !== c)
    if (ring.some((f) => same(f.color, c.color))) continue
    const mx = ring.reduce((t, f) => t + f.at.x, 0) / ring.length
    const my = ring.reduce((t, f) => t + f.at.y, 0) / ring.length
    const ds = ring.map((f) => Math.hypot(f.at.x - c.at.x, f.at.y - c.at.y))
    const r = ds.reduce((t, d) => t + d, 0) / ds.length
    if (r < 60) continue
    if (Math.hypot(mx - c.at.x, my - c.at.y) > 0.6 * r) continue
    if (Math.min(...ds) < 0.35 * r) continue
    const angs = ring.map((f) => Math.atan2(f.at.y - c.at.y, f.at.x - c.at.x)).sort((a, b) => a - b)
    let gap = angs[0]! + 2 * Math.PI - angs[angs.length - 1]!
    for (let i = 1; i < angs.length; i++) gap = Math.max(gap, angs[i]! - angs[i - 1]!)
    if (gap > Math.PI) continue
    const outer: string[] = []
    for (const f of ring) if (!outer.some((o) => same(o, f.color))) outer.push(f.color)
    const colors = [c.color, ...outer]
    const R = Math.round(r), X = Math.round(c.at.x), Y = Math.round(c.at.y)
    const stops = [`${c.color} 0px`, ...outer.map((o, i) => `${o} ${String(Math.round(R * (i + 1) / outer.length))}px`)]
    return { colors, radial: { x: X, y: Y, r: R }, css: `radial-gradient(circle at ${String(X)}px ${String(Y)}px, ${stops.join(', ')})` }
  }
  return null
}

export function pageFill(fills: InkFill[]): PageFill | null {
  const page = fills.filter((f) => f.target === null)
  if (!page.length) return null
  const colors = page.map((f) => f.color)
  if (page.length === 1 || colors.every((c) => c.toLowerCase() === colors[0]!.toLowerCase())) {
    return { colors: [colors[0]!], css: colors[0]! }
  }
  const spot = spotlight(page)
  if (spot) return spot
  return fadeOf(page)
}

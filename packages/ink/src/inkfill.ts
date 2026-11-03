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

/**
 * n178: a small closed mark (a checkbox, a radio, a swatch) holds a tap too. Round 43 e4 (pet adoption): an
 * orange tap in an 18px checkbox was read as a page tap and, with the white page tap, made an orange-to-white
 * page fade. Under 20px the plain closing rule is too loose (a short tick would "close"), so a small mark must
 * really go round: ink at least about its perimeter and ends that meet.
 */
export const SMALL_HOLDER_PX = 10
function smallClosed(pts: Point[]): boolean {
  if (pts.length < 4) return false
  const b = bboxOf(pts)
  if (b.w < SMALL_HOLDER_PX || b.h < SMALL_HOLDER_PX || (b.w >= 20 && b.h >= 20)) return false
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  if (len < 1.5 * (b.w + b.h)) return false
  const a = pts[0]!, z = pts[pts.length - 1]!
  return Math.hypot(z.x - a.x, z.y - a.y) <= Math.max(6, len * 0.15)
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
  const all = allTaps(strokes, page)
  const dots = new Set(dotsOf(all, strokes).map((d) => d.dotId))
  return dots.size ? all.filter((f) => !dots.has(f.dotId)) : all
}

/**
 * n215: taps lined up inside a mark are small dots there, never a fill of it.
 *
 * Round 46 e2 (team roster): a table box with two ruled lines and a green, an amber and a grey tap down its status
 * column. A tap fills what it lands in, so the lines read as bands: the first row went bright green and the rest of
 * the table grey. A fill is one colour (or two, a fade or a split), tapped once: nobody fills a box with three
 * taps in a straight column. So: three or more taps in one mark, in a straight column or row, in at least two
 * colours, in a mark holding other drawn parts, are dots where they landed. Not when ruled lines give each tap its own
 * band: that is painted rows (n91). In 170 earlier sketches this is the only mark of that kind, and a single
 * off-colour tap (a pale fill in a darker outline, 175 of them) stays a fill.
 */
export interface TapDot { dotId: string; color: string; at: XY; target: string; box: BBox }
/** How far off a straight column or row a hand's taps may land, px. */
export const TAP_COLUMN_PX = 14

export function tapDots<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(strokes: S[], page?: { w: number; h: number }): TapDot[] {
  return dotsOf(allTaps(strokes, page), strokes)
}

function dotsOf<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(taps: InkFill[], strokes: S[]): TapDot[] {
  const out: TapDot[] = []
  const byMark = new Map<string, InkFill[]>()
  for (const f of taps) if (f.target && f.box && !f.region) byMark.set(f.target, [...(byMark.get(f.target) ?? []), f])
  for (const [target, mine] of byMark) {
    if (mine.length < 3 || new Set(mine.map((f) => f.color.toLowerCase())).size < 2) continue
    const xs = mine.map((f) => f.at.x), ys = mine.map((f) => f.at.y)
    const column = Math.max(...xs) - Math.min(...xs) <= TAP_COLUMN_PX
    const row = Math.max(...ys) - Math.min(...ys) <= TAP_COLUMN_PX
    if (!column && !row) continue
    const hb = mine[0]!.box!
    const parts = strokes.filter((s) => s.id !== target && !isFillDot(s) && s.points.length > 0 && (() => {
      const b = bboxOf(s.points)
      return b.x >= hb.x - 8 && b.y >= hb.y - 8 && b.x + b.w <= hb.x + hb.w + 8 && b.y + b.h <= hb.y + hb.h + 8
    })())
    if (!parts.length) continue
    // ruled lines between every tap and the next: each has its own band, painted rows (n91)
    const line = (s: S) => { const b = bboxOf(s.points); return column ? b.h <= 14 && b.w >= hb.w * 0.7 : b.w <= 14 && b.h >= hb.h * 0.7 }
    const cuts = parts.filter(line).map((s) => { const b = bboxOf(s.points); return column ? b.y + b.h / 2 : b.x + b.w / 2 })
    const along = (column ? ys : xs).slice().sort((p, q) => p - q)
    if (cuts.length && along.every((v, k) => k === 0 || cuts.some((c) => c > along[k - 1]! && c < v))) continue
    for (const f of mine) out.push({ dotId: f.dotId, color: f.color, at: f.at, target, box: hb })
  }
  return out
}

/** n245: how far off a mark's line a tap in the same pen still counts as on its ink, px (a hand's slip, a ring's body). */
export const TAP_ON_INK_PX = 14

function inkDistance(p: XY, pts: ReadonlyArray<{ x: number; y: number }>): number {
  let best = Infinity
  for (let k = 0; k < pts.length; k++) {
    const a = pts[k]!, z = pts[(k + 1) % pts.length]!
    const dx = z.x - a.x, dy = z.y - a.y, len = dx * dx + dy * dy
    const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

function allTaps<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(strokes: S[], page?: { w: number; h: number }): InkFill[] {
  const outlines = strokes.filter((s) => !isFillDot(s) && (closedOutline(s.points) || smallClosed(s.points)))
  // n51: regions a curve cuts off a box (or the page) hold taps like any outline
  const cuts = splitRegions(strokes, page)
  const shapes: Array<{ id: string; pts: Array<{ x: number; y: number }>; box: BBox; region?: XY[] }> = [
    ...outlines.map((o) => ({ id: o.id, pts: o.points as XY[], box: bboxOf(o.points) })),
    ...cuts.map((c) => ({ id: c.id, pts: c.points, box: c.box, region: c.points })),
  ]
  const out: InkFill[] = []
  const drawnAt = new Map(strokes.map((s, k) => [s.id, k]))
  for (const d of strokes) {
    if (!isFillDot(d)) continue
    const b = bboxOf(d.points)
    const at = { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) }
    const tapAt = drawnAt.get(d.id) ?? 0
    let best: (typeof shapes)[number] | null = null, bestA = Infinity
    for (const o of shapes) {
      const ob = o.box
      // n239: a tap fills what was there when it was made: a shape drawn over that spot later did not get it
      if (!o.region && (drawnAt.get(o.id) ?? 0) > tapAt) continue
      if (at.x < ob.x || at.x > ob.x + ob.w || at.y < ob.y || at.y > ob.y + ob.h) continue
      if (!pointInPolygon({ ...at, t: 0 }, o.pts as Point[])) continue
      const area = o.region ? Math.abs(polygonArea(o.region as never)) : ob.w * ob.h
      if (area < bestA) { best = o; bestA = area }
    }
    // n245: a tap on a mark's own ink, in its own pen, is that mark's, even a hair outside the line (never the page's)
    if (!best) {
      let nearest = TAP_ON_INK_PX + 1
      for (const o of shapes) {
        if (o.region || (drawnAt.get(o.id) ?? 0) > tapAt) continue
        const mark = strokes.find((s) => s.id === o.id)
        if (!mark?.color || mark.color.toLowerCase() !== d.color?.toLowerCase()) continue
        const dist = inkDistance(at, o.pts)
        if (dist < nearest) { best = o; nearest = dist }
      }
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
  // n245: a tap on a mark's own line in its own pen, with one other colour tapped well inside it, only touched the line:
  // the line stays that colour, the other tap fills inside. Never a fade across the mark.
  for (const f of [...out]) {
    if (!f.target || f.region) continue
    const mark = strokes.find((s) => s.id === f.target)
    if (!mark?.color || mark.color.toLowerCase() !== f.color.toLowerCase()) continue
    const mine = out.filter((o) => o.target === f.target)
    if (mine.length !== 2 || inkDistance(f.at, mark.points) > TAP_ON_INK_PX) continue
    const other = mine.find((o) => o !== f)!
    if (other.color.toLowerCase() === f.color.toLowerCase() || inkDistance(other.at, mark.points) <= TAP_ON_INK_PX) continue
    out.splice(out.indexOf(f), 1)
  }
  return out
}

/**
 * n51: what one mark is filled with from its taps: one colour, or a fade from the first tap towards
 * the last (two taps far apart on a banner, a sky). Null when nothing was tapped on it.
 */
export function markFill<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(fills: InkFill[], target: string, strokes?: S[], opts?: { noSlices?: boolean }): PageFill | null {
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
      // n226: three or more colours tapped round a ring are its slices, never a fade
      if (!opts?.noSlices) {
        const chart = sliceChart(holder, mine, strokes)
        if (chart) return { colors: chart.parts.map((x) => x.color), css: sliceCss(chart), slices: chart }
      }
    }
  }
  return fadeOf(mine)
}

/**
 * n226: a ring with several colours tapped round it is a slice chart. Round 47 e5 (budget, n222): four taps round a ring
 * made a square fade, in the preview and in the first build; only a fix note got a real donut. Fades are one colour
 * going into another, so three colours spread round the middle of a round mark say slices. From the ink alone: the
 * mark is round (a circle fills about 0.79 of its bounding box, a box all of it), at least three different colours,
 * each tap off the very middle, and no gap between neighbouring taps over 200 degrees (taps down one side, or in a
 * line through the middle, stay a fade). Each slice runs clockwise, half way to its neighbours' taps; the boundary
 * nearest 12 o'clock is turned to 12 when within 30 degrees, as people start a chart at the top. A round mark drawn
 * inside on the same centre is the hole.
 */
export interface SlicePart { color: string; startDeg: number; sweepDeg: number; tapOrder: number }
export interface SliceChart {
  cx: number
  cy: number
  d: number
  hole: { d: number; color: string | null } | null
  /** Clockwise, from the slice starting at parts[0].startDeg. */
  parts: SlicePart[]
}
export const SLICE_MAX_GAP_DEG = 200
const clock = (p: XY, cx: number, cy: number) => ((Math.atan2(p.x - cx, -(p.y - cy)) * 180) / Math.PI + 360) % 360
function roundMark(points: readonly XY[]): { cx: number; cy: number; d: number } | null {
  if (points.length < 5) return null
  const b = bboxOf(points as Point[])
  if (b.w < 40 || b.h < 40 || Math.max(b.w, b.h) > 1.3 * Math.min(b.w, b.h)) return null
  const a = points[0]!, z = points[points.length - 1]!
  if (Math.hypot(a.x - z.x, a.y - z.y) > 0.25 * Math.max(b.w, b.h)) return null
  let area = 0
  points.forEach((p, i) => { const q = points[(i + 1) % points.length]!; area += p.x * q.y - q.x * p.y })
  if (Math.abs(area) / 2 > 0.88 * b.w * b.h) return null
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, d: (b.w + b.h) / 2 }
}
export function sliceChart<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(holder: S, taps: ReadonlyArray<Pick<InkFill, 'color' | 'at'>>, strokes: readonly S[]): SliceChart | null {
  if (taps.length < 3 || new Set(taps.map((t) => t.color.toLowerCase())).size < 3) return null
  const ring = roundMark(holder.points)
  if (!ring) return null
  if (taps.some((t) => Math.hypot(t.at.x - ring.cx, t.at.y - ring.cy) < 0.1 * ring.d)) return null
  const sorted = taps.map((t, tapOrder) => ({ color: t.color, tapOrder, deg: clock(t.at, ring.cx, ring.cy) })).sort((a, b) => a.deg - b.deg)
  const gap = (k: number) => (sorted[(k + 1) % sorted.length]!.deg - sorted[k]!.deg + 360) % 360
  if (sorted.some((_, k) => gap(k) > SLICE_MAX_GAP_DEG)) return null
  // the boundary before each slice is half way back to the slice before it
  const starts = sorted.map((_, k) => (sorted[k]!.deg - gap((k + sorted.length - 1) % sorted.length) / 2 + 360) % 360)
  const nearest = starts.reduce((best, x) => { const o = x > 180 ? x - 360 : x; return Math.abs(o) < Math.abs(best) ? o : best }, 360)
  const turn = Math.abs(nearest) <= 30 ? nearest : 0
  const parts = sorted.map((t, k) => ({ color: t.color, tapOrder: t.tapOrder, startDeg: Math.round((starts[k]! - turn + 360) % 360), sweepDeg: Math.round((gap(k) + gap((k + sorted.length - 1) % sorted.length)) / 2) }))
  const low = parts.reduce((m, x, k) => (x.startDeg < parts[m]!.startDeg ? k : m), 0)
  const ordered = [...parts.slice(low), ...parts.slice(0, low)]
  ordered[ordered.length - 1]!.sweepDeg += 360 - ordered.reduce((a, x) => a + x.sweepDeg, 0)
  let hole: SliceChart['hole'] = null
  for (const s of strokes) {
    if (s.id === holder.id) continue
    const m = roundMark(s.points)
    if (!m || m.d < 0.2 * ring.d || m.d > 0.85 * ring.d || Math.hypot(m.cx - ring.cx, m.cy - ring.cy) > 0.12 * ring.d) continue
    if (!hole || m.d > hole.d) hole = { d: Math.round(m.d), color: s.color ?? null }
  }
  return { cx: Math.round(ring.cx), cy: Math.round(ring.cy), d: Math.round(ring.d), hole, parts: ordered }
}
/** n226: the chart with typed shares (in parts order): from 12 o'clock, each slice its share of the turn. */
export function sliceShares(chart: SliceChart, shares: readonly number[]): SliceChart {
  if (shares.length !== chart.parts.length) return chart
  const sum = shares.reduce((a, b) => a + b, 0) || 1
  // the parts in clock order from 12: the tap first clockwise of 12 is the first slice; parts are already clockwise
  let at = 0
  const parts = chart.parts.map((x, k) => { const sweepDeg = Math.round((shares[k]! / sum) * 360); const o = { ...x, startDeg: at, sweepDeg }; at += sweepDeg; return o })
  parts[parts.length - 1]!.sweepDeg += 360 - at
  return { ...chart, parts }
}
export function sliceCss(chart: Pick<SliceChart, 'parts'>): string {
  const from = chart.parts[0]!.startDeg
  let at = 0
  const stops = chart.parts.map((x) => { const o = `${x.color} ${String(at)}deg ${String(at + x.sweepDeg)}deg`; at += x.sweepDeg; return o })
  return `conic-gradient(${from ? `from ${String(from)}deg, ` : ''}${stops.join(', ')})`
}
/** n226: one flat band per slice, for the sketch's own preview: what is shown is what will be built. */
export function sliceWedges(chart: SliceChart): Array<{ color: string; d: string }> {
  const R = chart.d / 2, r = (chart.hole?.d ?? 0) / 2
  const pt = (rad: number, deg: number) => `${(chart.cx + rad * Math.sin((deg * Math.PI) / 180)).toFixed(1)} ${(chart.cy - rad * Math.cos((deg * Math.PI) / 180)).toFixed(1)}`
  return chart.parts.map((x) => {
    const steps = Math.max(2, Math.ceil(x.sweepDeg / 6)), out: string[] = [], back: string[] = []
    for (let k = 0; k <= steps; k++) {
      const a = x.startDeg + (x.sweepDeg * k) / steps
      out.push(pt(R, a))
      back.unshift(pt(r, a))
    }
    return { color: x.color, d: `M ${out.join(' L ')} L ${back.join(' L ')} Z` }
  })
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
  /** n226: three or more colours tapped round a ring: flat slices. */
  slices?: SliceChart
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

/**
 * n91: taps in the bands that straight lines cut across a box fill only those bands.
 *
 * Round 36 e3 (timesheet, n87 and n91): a table box with a line under its header row and a line over its
 * total row, the same pale grey tapped once in the header band and once in the total band. markFill read two
 * same-colour taps as one solid colour on the whole box, so the whole table was built grey and a fix note
 * ("rows white; grey only header and Total rows") was needed every time. A person who rules a band off and
 * taps inside it means that band. Here: the near-horizontal lines that run across the box (both ends near its
 * sides) cut it into bands, top to bottom; each tap colours the band it sits in (a later tap in a band wins);
 * bands with no tap are left unfilled. Only when at least one band is tapped and at least one is not (a tap in
 * every band is a split or a fade, handled above). Page px; the box is the holder's bbox.
 */
export interface TapBands {
  box: BBox
  /** every band top to bottom; color null = no tap there (left as it is) */
  bands: Array<{ y0: number; y1: number; color: string | null }>
}
export function tapBands<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(
  holder: S, taps: Array<Pick<InkFill, 'color' | 'at'>>, strokes: S[],
): TapBands | null {
  if (!taps.length || !closedOutline(holder.points)) return null
  const hb = bboxOf(holder.points)
  if (hb.w < 120 || hb.h < 60) return null
  const tol = Math.max(24, hb.w * 0.06)
  const ys: number[] = []
  for (const c of strokes) {
    if (c.id === holder.id || isFillDot(c) || c.points.length < 2 || closedOutline(c.points)) continue
    const b = bboxOf(c.points)
    if (b.h > 14 || b.w < hb.w * 0.7) continue
    if (Math.abs(b.x - hb.x) > tol || Math.abs(b.x + b.w - (hb.x + hb.w)) > tol) continue
    const y = b.y + b.h / 2
    if (y <= hb.y + 8 || y >= hb.y + hb.h - 8) continue
    if (!ys.some((o) => Math.abs(o - y) < 12)) ys.push(y)
  }
  if (!ys.length) return null
  ys.sort((a, b) => a - b)
  const edges = [hb.y, ...ys, hb.y + hb.h].map(Math.round)
  const bands: TapBands['bands'] = edges.slice(1).map((y1, k) => ({ y0: edges[k]!, y1, color: null }))
  for (const t of taps) {
    if (t.at.x < hb.x - 6 || t.at.x > hb.x + hb.w + 6) return null
    const band = bands.find((b) => t.at.y >= b.y0 && t.at.y <= b.y1)
    if (!band) return null
    band.color = t.color
  }
  const tapped = bands.filter((b) => b.color).length
  if (!tapped || tapped === bands.length) return null
  return { box: { x: Math.round(hb.x), y: Math.round(hb.y), w: Math.round(hb.w), h: Math.round(hb.h) }, bands }
}

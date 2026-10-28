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
import { bboxOf, pointInPolygon } from './geometry.js'

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
}

/**
 * What each coloured tap fills: the smallest closed outline it falls inside
 * (by its ink, not just its box, so a tap beside a ring is not in the ring),
 * or the page. A later tap on the same mark wins (a person re-colouring).
 */
export function inkFills<S extends Pick<Stroke, 'id' | 'points' | 'color'>>(strokes: S[]): InkFill[] {
  const outlines = strokes.filter((s) => !isFillDot(s) && closedOutline(s.points))
  const out: InkFill[] = []
  for (const d of strokes) {
    if (!isFillDot(d)) continue
    const b = bboxOf(d.points)
    const at = { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) }
    let best: S | null = null, bestA = Infinity
    for (const o of outlines) {
      const ob = bboxOf(o.points)
      if (at.x < ob.x || at.x > ob.x + ob.w || at.y < ob.y || at.y > ob.y + ob.h) continue
      if (!pointInPolygon({ ...at, t: 0 }, o.points as Point[])) continue
      const area = ob.w * ob.h
      if (area < bestA) { best = o; bestA = area }
    }
    const fill: InkFill = { dotId: d.id, color: d.color!, at, target: best?.id ?? null }
    if (best) { const ob = bboxOf(best.points); fill.box = { x: Math.round(ob.x), y: Math.round(ob.y), w: Math.round(ob.w), h: Math.round(ob.h) } }
    // a later tap on the same mark replaces the earlier one; page taps all count
    if (fill.target) {
      const i = out.findIndex((f) => f.target === fill.target)
      if (i >= 0) out.splice(i, 1)
    }
    out.push(fill)
  }
  return out
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
  const a = page[0]!.at, z = page[page.length - 1]!.at
  // CSS: 0deg points up, 90deg right; screen y grows downward
  const angle = Math.round(((Math.atan2(z.x - a.x, -(z.y - a.y)) * 180) / Math.PI + 360) % 360)
  return { colors, angle, css: `linear-gradient(${String(angle)}deg, ${colors.join(', ')})` }
}

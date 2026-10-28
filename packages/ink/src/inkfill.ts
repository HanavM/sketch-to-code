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
 */
export function pageFill(fills: InkFill[]): { colors: string[]; angle?: number; css: string } | null {
  const page = fills.filter((f) => f.target === null)
  if (!page.length) return null
  const colors = page.map((f) => f.color)
  if (page.length === 1 || colors.every((c) => c.toLowerCase() === colors[0]!.toLowerCase())) {
    return { colors: [colors[0]!], css: colors[0]! }
  }
  const a = page[0]!.at, z = page[page.length - 1]!.at
  // CSS: 0deg points up, 90deg right; screen y grows downward
  const angle = Math.round(((Math.atan2(z.x - a.x, -(z.y - a.y)) * 180) / Math.PI + 360) % 360)
  return { colors, angle, css: `linear-gradient(${String(angle)}deg, ${colors.join(', ')})` }
}

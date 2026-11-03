/**
 * n151: a lone SLANTED pen line is a thin line, never a filled box.
 *
 * Round 41 c1 (kite club): each kite's string, one slanted navy stroke, came out a wide navy rectangle (the
 * line's bounding box filled); a fix note "thin slanted lines, not bars" made them right. Round 45 c4 (bike repair):
 * the crossbar between the two wheels, one slanted black stroke, was built as a black box round it in both n204
 * tries. Inside a depicted picture a stroke is no shape mark, so its ink fell through to "the outline drawn there is
 * filled with the pen colour", and its box is the line's bounding box: the tool asked for the slab.
 *
 * Here: an open straight stroke, not level and not plumb, drawn in a pen with no tap, is told as a line from its start
 * to its end (a rotated thin div or an SVG <line>), and the page is checked for an unrotated pen-coloured block filling
 * its bounding box. Page-spanning slanted lines are colour edges (areas.ts) and route lines are routes: not these.
 * Zero tokens.
 */
import type { DomNode } from '@s2c/dom'
import { deltaE, parseCssColor } from './palette.js'

export interface XY { x: number; y: number }

/** A straight slanted stroke from..to, or null. Level (within 10deg) and plumb lines are rules, not these. */
export function slantOf(points: readonly XY[]): { from: XY; to: XY; length: number; deg: number } | null {
  if (points.length < 2) return null
  const a = points[0]!, b = points[points.length - 1]!
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy)
  if (length < 40) return null
  // straight: every point within 6% of the length (and 12px) of the chord
  const tol = Math.max(6, Math.min(12, length * 0.06))
  for (const p of points) {
    const d = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / length
    if (d > tol) return null
  }
  const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180
  const tilt = Math.min(ang, 180 - ang) // 0 = level, 90 = plumb
  if (tilt < 10 || tilt > 80) return null
  // left-to-right always, so the rotation reads the same however it was drawn
  const [from, to] = a.x <= b.x ? [a, b] : [b, a]
  const deg = Math.round(Math.atan2(to.y - from.y, to.x - from.x) * 1800 / Math.PI) / 10
  return { from: { x: Math.round(from.x), y: Math.round(from.y) }, to: { x: Math.round(to.x), y: Math.round(to.y) }, length: Math.round(length), deg }
}

/** The line's thickness: a ring it touches sets it (a bike's frame matches its wheels), "thick"/"thin" words scale it. */
export function slantThickness(own: readonly string[], ringThickness: number | null): number {
  const t = own.join(' ')
  if (/\b(?:thin|hairline|fine)\b/i.test(t)) return 2
  if (ringThickness) return ringThickness
  if (/\b(?:thick|heavy)\b/i.test(t)) return 10
  return 3
}

export function slantBrief(i: number, color: string, s: { from: XY; to: XY; length: number; deg: number; thickness: number }, box: { w: number; h: number }): string {
  return `- action ${String(i)}, the SLANTED LINE drawn from (${String(s.from.x)},${String(s.from.y)}) to (${String(s.to.x)},${String(s.to.y)}) in ${color} (no colour tapped): ` +
    `a THIN STRAIGHT LINE, ${String(s.length)}px long and about ${String(s.thickness)}px thick, in ${color}, running exactly from that start to that end at ${String(s.deg)}deg: ` +
    `build it as an absolutely placed div (left ${String(s.from.x)}px, top ${String(Math.round(s.from.y - s.thickness / 2))}px, width ${String(s.length)}px, height ${String(s.thickness)}px, background ${color}, ` +
    `transform-origin 0 50%, transform rotate(${String(s.deg)}deg), round ends) or an SVG <line> with stroke ${color} and stroke-width ${String(s.thickness)} in an svg big enough to hold it. ` +
    `NEVER a filled box, bar or rectangle covering the line's ${String(box.w)}x${String(box.h)} bounding box, and never level: it keeps its slant (checked on the page)`
}

function alpha(css: string): number {
  const m = /rgba?\(([^)]*)\)/i.exec(css)
  if (!m) return css && css !== 'transparent' ? 1 : 0
  const parts = m[1]!.split(/[,\s/]+/).filter(Boolean)
  return parts.length >= 4 ? Number(parts[3]) : 1
}

/**
 * The slab check: an unrotated block (or svg rect / polygon) filled in the pen colour that covers most of the slanted
 * line's bounding box fails. A rotated thin div's bounding rect also spans the box, so a node with a transform passes.
 */
export function slantBuilt(c: { box: { x: number; y: number; w: number; h: number }; color: string }, nodes: readonly DomNode[]): { ok: boolean; why: string } {
  const pen = parseCssColor(c.color)
  if (!pen) return { ok: true, why: '' }
  const b = c.box
  if (b.w < 24 || b.h < 24) return { ok: true, why: '' }
  for (const n of nodes) {
    if (n.style.transform) continue
    const fill = n.tag === 'rect' || n.tag === 'polygon' ? n.style.svgFill ?? '' : n.style.backgroundColor
    const g = parseCssColor(fill ?? '')
    if (!g || alpha(fill ?? '') < 0.6 || deltaE(pen, g) > 25) continue
    const r = n.rect
    const ix = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)), iy = Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y))
    // covers most of the box, and is not a much bigger panel the line merely sits on
    if (ix * iy >= 0.45 * b.w * b.h && r.w * r.h <= 2.5 * b.w * b.h && r.h >= Math.min(b.h * 0.45, 40)) {
      return { ok: false, why: `a ${String(Math.round(r.w))}x${String(Math.round(r.h))} block filled with the pen colour covers its bounding box (a slab, not a line)` }
    }
  }
  return { ok: true, why: '' }
}

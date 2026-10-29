/**
 * A shape drawn as its outline is built as that outline (n51).
 *
 * Round 33 (hand, n49): two mountains drawn as closed triangles came out as two
 * rectangles (c5, cabins 53.6), and a wave drawn across the left panel came out
 * as a fade the wrong way round with the sky and the sea swapped (c1, surf 58.0).
 * The outline is in the ink, so it is read there and told to codegen exactly:
 *
 * - **A closed outline with sharp corners and few sides** (a triangle, a mountain,
 *   a ridge, a slanted block) is one element of its own size, at its drawn
 *   spot, clipped to its outline (clip-path: polygon, points measured from the
 *   ink). Smooth blobs (glows, the glass page) are not this: they keep their
 *   soft treatment.
 * - **A curve drawn across a box from edge to edge** (a wave, a hill) cuts the
 *   box in two; the smaller side is the shape it draws, closed along the box's
 *   edge (@s2c/ink splitRegions). Taps on each side colour that side.
 *
 * Checked on the page: an element about the shape's size, near where it was
 * drawn, whose clip-path (or SVG) covers the drawn outline (overlap ≥ 70%).
 * A box in its place is a failure the repair round can act on. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { rdp } from '@s2c/ink'
import { clipPolygon } from './areas.js'
import type { ShapeMark } from './shapemark.js'

type XY = { x: number; y: number }
const r0 = (v: number) => Math.round(v)

function bboxOf(pts: XY[]): BBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x: r0(x0), y: r0(y0), w: r0(x1 - x0), h: r0(y1 - y0) }
}
function area(poly: XY[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) { const a = poly[i]!, b = poly[(i + 1) % poly.length]!; s += a.x * b.y - b.x * a.y }
  return Math.abs(s) / 2
}
const inkLength = (pts: XY[]) => pts.reduce((t, p, i) => (i ? t + Math.hypot(p.x - pts[i - 1]!.x, p.y - pts[i - 1]!.y) : 0), 0)

/** The outline as a polygon of at most `cap` points, kept within a few px of the ink. */
export function finePolygon(points: XY[], cap = 48): XY[] {
  let eps = 2.5
  let out = rdp(points as never, eps) as XY[]
  while (out.length > cap && eps < 40) { eps *= 1.5; out = rdp(points as never, eps) as XY[] }
  const pts = out.map((p) => ({ x: r0(p.x), y: r0(p.y) }))
  // the pen ends where it started: drop the closing point
  if (pts.length > 3 && Math.hypot(pts[0]!.x - pts.at(-1)!.x, pts[0]!.y - pts.at(-1)!.y) <= 30) pts.pop()
  return pts
}

/**
 * A closed stroke that is a plain polygon with sharp corners (3-8 sides): its outline, or null.
 * Call only for strokes that are not a box, a ring or a pill (shapeOf returned null).
 */
export function polygonOutline(points: XY[]): { points: XY[]; corners: number } | null {
  if (points.length < 4) return null
  const b = bboxOf(points)
  if (b.w < 40 || b.h < 30) return null
  const len = inkLength(points)
  const a = points[0]!, z = points.at(-1)!
  if (Math.hypot(z.x - a.x, z.y - a.y) > Math.max(28, len * 0.15)) return null
  const diag = Math.hypot(b.w, b.h)
  const coarse = (rdp(points as never, Math.max(8, diag * 0.03)) as XY[]).slice()
  if (coarse.length > 3 && Math.hypot(coarse[0]!.x - coarse.at(-1)!.x, coarse[0]!.y - coarse.at(-1)!.y) <= Math.max(28, len * 0.15)) coarse.pop()
  if (coarse.length < 3 || coarse.length > 8) return null
  // sharp corners: a smooth blob simplifies to many gentle turns; a triangle or mountain to a few hard ones
  let sharp = 0
  for (let i = 0; i < coarse.length; i++) {
    const p = coarse[(i + coarse.length - 1) % coarse.length]!, c = coarse[i]!, n = coarse[(i + 1) % coarse.length]!
    const u = Math.atan2(c.y - p.y, c.x - p.x), v = Math.atan2(n.y - c.y, n.x - c.x)
    let d = Math.abs(v - u) * 180 / Math.PI
    if (d > 180) d = 360 - d
    if (d >= 60) sharp++
  }
  if (sharp < 2) return null
  const fine = finePolygon(points)
  if (area(fine) < 0.15 * b.w * b.h) return null
  return { points: fine, corners: coarse.length }
}

/** The outline mark for a cited stroke, or null. `cut` is the region this curve cuts off a box (ink splitRegions). */
export function outlineMark(strokeId: string, points: XY[], cut?: { points: XY[]; box: BBox; holder: string | null }): ShapeMark | null {
  if (cut) {
    const pts = cut.points.map((p) => ({ x: r0(p.x), y: r0(p.y) }))
    return { strokeId, shape: 'box', box: { ...cut.box }, outline: { points: pts, cut: { holder: cut.holder } } }
  }
  const o = polygonOutline(points)
  if (!o) return null
  return { strokeId, shape: 'box', box: bboxOf(o.points), outline: { points: o.points, corners: o.corners } }
}

/** clip-path: polygon(...) for the outline, in px relative to its own box. */
export function clipOf(m: Pick<ShapeMark, 'box' | 'outline'>): string {
  const b = m.box
  return `polygon(${m.outline!.points.map((p) => `${r0(p.x - b.x)}px ${r0(p.y - b.y)}px`).join(', ')})`
}

const what = (m: ShapeMark) => {
  const o = m.outline!
  if (o.cut) return 'shape a curve cuts off'
  return o.corners === 3 ? 'triangle' : 'closed outline'
}

export function outlineBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const lines: string[] = []
  let order = 0
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (!m.outline) continue
      order++
      const b = m.box
      const fill = m.outline.fill
      const paint = fill
        ? fill.colors.length > 1
          ? `background ${fill.css} (the fade runs the way it was tapped: ${fill.colors[0]} first)`
          : `background ${fill.css}`
        : 'filled with the colour its notes give it'
      const cut = m.outline.cut
        ? ` It is the part of ${m.outline.cut.holder ? 'the box' : 'the page'} on the far side of the curve, closed along ${m.outline.cut.holder ? 'the box' : 'the page'}'s edge; the rest of ${m.outline.cut.holder ? 'the box' : 'the page'} keeps its own colour.`
        : ''
      lines.push(
        `- action ${i}: the ${what(m)} drawn at (${b.x},${b.y}) ${b.w}x${b.h} is ONE element exactly that size at that spot ` +
        `(position absolute, left ${b.x}px, top ${b.y}px in page px: inside a positioned parent subtract its offset), ` +
        `clip-path: ${clipOf(m)}, ${paint}.${cut} Never a rectangle, a circle or a rounded card, no border and no shadow; ` +
        `shapes drawn later sit on top (z-index ${order}), and words drawn over it stay above it.`,
      )
    }
  })
  return lines.length
    ? `SHAPES DRAWN AS OUTLINES (deterministic, the outline measured from the ink; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

interface NodeLike { id: string; tag: string; rect: BBox; style: { clipPath?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

function inside(p: XY, poly: XY[]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c
  }
  return c
}

/** Overlap (intersection over union) of two polygons, sampled on a grid. */
export function polyIoU(a: XY[], b: XY[]): number {
  const ba = bboxOf(a), bb = bboxOf(b)
  const x0 = Math.min(ba.x, bb.x), y0 = Math.min(ba.y, bb.y)
  const x1 = Math.max(ba.x + ba.w, bb.x + bb.w), y1 = Math.max(ba.y + ba.h, bb.y + bb.h)
  const step = Math.max(3, Math.max(x1 - x0, y1 - y0) / 90)
  let both = 0, either = 0
  for (let y = y0 + step / 2; y < y1; y += step) {
    for (let x = x0 + step / 2; x < x1; x += step) {
      const p = { x, y }
      const ia = inside(p, a), ib = inside(p, b)
      if (ia || ib) either++
      if (ia && ib) both++
    }
  }
  return either ? both / either : 0
}

const SVG = new Set(['svg', 'path', 'polygon', 'polyline'])

export function verifyOutlines(marks: ShapeMark[], after: Snap): { satisfied: boolean; unverifiable?: boolean; reason: string } {
  const shapes = marks.filter((m) => m.outline)
  if (!shapes.length) return { satisfied: true, unverifiable: true, reason: 'no shapes drawn as outlines' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const used = new Set<string>()
  for (const m of shapes) {
    const b = m.box, poly = m.outline!.points
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2
    const near = after.nodes.filter((n) => !used.has(n.id) &&
      Math.abs(n.rect.w - b.w) <= Math.max(24, b.w * 0.3) && Math.abs(n.rect.h - b.h) <= Math.max(24, b.h * 0.3) &&
      Math.hypot(n.rect.x + n.rect.w / 2 - cx, n.rect.y + n.rect.h / 2 - cy) <= Math.max(60, Math.min(b.w, b.h) * 0.4))
    let best: { n: NodeLike; iou: number } | null = null
    for (const n of near) {
      const clip = n.style.clipPath ? clipPolygon(n.style.clipPath, n.rect) : null
      if (!clip) continue
      const iou = polyIoU(clip, poly)
      if (!best || iou > best.iou) best = { n, iou }
    }
    const name = `the ${what(m)} drawn at (${b.x},${b.y}) ${b.w}x${b.h}`
    if (best && best.iou >= 0.7) { used.add(best.n.id); continue }
    // an inline SVG shape of that size stands for it too (its points are not in the snapshot)
    const svg = near.find((n) => SVG.has(n.tag) && Math.abs(n.rect.w - b.w) <= b.w * 0.15 && Math.abs(n.rect.h - b.h) <= b.h * 0.15)
    if (svg) { used.add(svg.id); continue }
    if (best) {
      faults.push(`${name} is built clipped, but its outline covers only ${Math.round(best.iou * 100)}% of the drawn one: set the <${best.n.tag}>'s clip-path to ${clipOf(m)} at ${b.w}x${b.h}, left ${b.x}px, top ${b.y}px; change nothing else`)
      continue
    }
    const plain = near.sort((p, q) => Math.hypot(p.rect.x - b.x, p.rect.y - b.y) - Math.hypot(q.rect.x - b.x, q.rect.y - b.y))[0]
    faults.push(plain
      ? `${name} was built as a plain <${plain.tag}> box ${r0(plain.rect.w)}x${r0(plain.rect.h)} with no outline: give it clip-path: ${clipOf(m)} (size ${b.w}x${b.h}, left ${b.x}px, top ${b.y}px) so it is the drawn shape, not a rectangle`
      : `${name}: nothing of that size was built there; build ONE element ${b.w}x${b.h} at left ${b.x}px, top ${b.y}px with clip-path: ${clipOf(m)}`)
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${shapes.length} shape${shapes.length > 1 ? 's' : ''} built to the drawn outline` }
}

import type { BBox, Point } from './types.js'

export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export function pathLength(pts: Point[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1]!, pts[i]!)
  return L
}

export function bboxOf(pts: Point[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x, y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

export function bboxCenter(b: BBox): Point {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, t: 0 }
}

/** Gap between two boxes (0 when overlapping). */
export function bboxGap(a: BBox, b: BBox): number {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)))
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)))
  return Math.hypot(dx, dy)
}

export function bboxContains(outer: BBox, inner: BBox, slackPx = 0): boolean {
  return (
    inner.x >= outer.x - slackPx &&
    inner.y >= outer.y - slackPx &&
    inner.x + inner.w <= outer.x + outer.w + slackPx &&
    inner.y + inner.h <= outer.y + outer.h + slackPx
  )
}

/** Cross product of (b-a) x (c-a). */
const cross = (a: Point, b: Point, c: Point): number =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

/** Convex hull, Andrew monotone chain. Returns CCW vertices, no repeated endpoint. */
export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  // dedupe identical coords to keep the hull well-formed
  const uniq: Point[] = []
  for (const p of pts) {
    const last = uniq[uniq.length - 1]
    if (!last || last.x !== p.x || last.y !== p.y) uniq.push(p)
  }
  if (uniq.length <= 2) return uniq
  const lower: Point[] = []
  for (const p of uniq) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = uniq.length - 1; i >= 0; i--) {
    const p = uniq[i]!
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

/** Shoelace area of a polygon (positive for CCW). */
export function polygonArea(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    s += a.x * b.y - b.x * a.y
  }
  return Math.abs(s) / 2
}

export function polygonPerimeter(poly: Point[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) s += dist(poly[i]!, poly[(i + 1) % poly.length]!)
  return s
}

export interface EnclosingRect {
  area: number
  short: number
  long: number
  angle: number
}

/** Min-area enclosing rectangle of a convex polygon (rotating calipers over edges). */
export function minAreaRect(hull: Point[]): EnclosingRect {
  if (hull.length === 0) return { area: 0, short: 0, long: 0, angle: 0 }
  if (hull.length === 1) return { area: 0, short: 0, long: 0, angle: 0 }
  let best: EnclosingRect = { area: Infinity, short: 0, long: 0, angle: 0 }
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]!, b = hull[(i + 1) % hull.length]!
    const ex = b.x - a.x, ey = b.y - a.y
    const len = Math.hypot(ex, ey)
    if (len === 0) continue
    const ux = ex / len, uy = ey / len // edge dir
    // project all points on (u, n)
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
    for (const p of hull) {
      const u = p.x * ux + p.y * uy
      const v = -p.x * uy + p.y * ux
      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }
    const w = maxU - minU, h = maxV - minV
    const area = w * h
    if (area < best.area) {
      best = { area, short: Math.min(w, h), long: Math.max(w, h), angle: Math.atan2(uy, ux) }
    }
  }
  if (!isFinite(best.area)) return { area: 0, short: 0, long: 0, angle: 0 }
  return best
}

const triArea = (a: Point, b: Point, c: Point): number => Math.abs(cross(a, b, c)) / 2

/** Largest-area triangle inscribed in a convex polygon. O(n^3), hull is small. */
export function largestTriangle(hull: Point[]): { area: number; perimeter: number } {
  const n = hull.length
  if (n < 3) return { area: 0, perimeter: 0 }
  let bestA = 0
  let best: [Point, Point, Point] | null = null
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        const A = triArea(hull[i]!, hull[j]!, hull[k]!)
        if (A > bestA) {
          bestA = A
          best = [hull[i]!, hull[j]!, hull[k]!]
        }
      }
  if (!best) return { area: 0, perimeter: 0 }
  const [a, b, c] = best
  return { area: bestA, perimeter: dist(a, b) + dist(b, c) + dist(c, a) }
}

/**
 * Largest-area quadrilateral inscribed in a convex polygon.
 * For each diagonal (i,j), take the max-area triangle on each side. O(n^3).
 */
export function largestQuad(hull: Point[]): { area: number } {
  const n = hull.length
  if (n < 4) return { area: largestTriangle(hull).area }
  let best = 0
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue // adjacent around the wrap
      let side1 = 0, side2 = 0
      for (let k = i + 1; k < j; k++) side1 = Math.max(side1, triArea(hull[i]!, hull[k]!, hull[j]!))
      for (let k = (j + 1) % n; k !== i; k = (k + 1) % n) side2 = Math.max(side2, triArea(hull[i]!, hull[k]!, hull[j]!))
      best = Math.max(best, side1 + side2)
    }
  return { area: best }
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!, b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Signed turning angle at b between segments a→b and b→c, in radians (-π, π]. */
export function turnAngle(a: Point, b: Point, c: Point): number {
  const a1 = Math.atan2(b.y - a.y, b.x - a.x)
  const a2 = Math.atan2(c.y - b.y, c.x - b.x)
  let d = a2 - a1
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/** Minimum distance from point p to segment ab. */
export function pointSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const l2 = dx * dx + dy * dy
  if (l2 === 0) return dist(p, a)
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

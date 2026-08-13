/**
 * Error-bounded cubic bezier fitting of digitized strokes.
 * Philip J. Schneider, "An Algorithm for Automatically Fitting Digitized
 * Curves", Graphics Gems (1990). Direct implementation, no deps.
 */
import type { Point } from './types.js'

type Vec = { x: number; y: number }

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y })
const scale = (v: Vec, s: number): Vec => ({ x: v.x * s, y: v.y * s })
const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
const norm = (v: Vec): number => Math.hypot(v.x, v.y)
const normalize = (v: Vec): Vec => {
  const n = norm(v)
  return n > 1e-12 ? scale(v, 1 / n) : { x: 0, y: 0 }
}

export type CubicBezier = [Vec, Vec, Vec, Vec]

function bezierPoint(b: CubicBezier, t: number): Vec {
  const u = 1 - t
  return {
    x: u * u * u * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t * t * t * b[3].x,
    y: u * u * u * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t * t * t * b[3].y,
  }
}

function chordLengthParameterize(pts: Vec[]): number[] {
  const u = [0]
  for (let i = 1; i < pts.length; i++) {
    u.push(u[i - 1]! + norm(sub(pts[i]!, pts[i - 1]!)))
  }
  const total = u[u.length - 1]!
  return total > 0 ? u.map((v) => v / total) : u
}

/** Least-squares fit of one cubic with fixed endpoints and tangent directions. */
function generateBezier(pts: Vec[], u: number[], tHat1: Vec, tHat2: Vec): CubicBezier {
  const n = pts.length
  const first = pts[0]!
  const last = pts[n - 1]!
  let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0

  for (let i = 0; i < n; i++) {
    const t = u[i]!
    const b0 = (1 - t) ** 3
    const b1 = 3 * t * (1 - t) ** 2
    const b2 = 3 * t * t * (1 - t)
    const b3 = t ** 3
    const a0 = scale(tHat1, b1)
    const a1 = scale(tHat2, b2)
    c00 += dot(a0, a0)
    c01 += dot(a0, a1)
    c11 += dot(a1, a1)
    const tmp = sub(pts[i]!, add(scale(first, b0 + b1), scale(last, b2 + b3)))
    x0 += dot(a0, tmp)
    x1 += dot(a1, tmp)
  }

  const det = c00 * c11 - c01 * c01
  let alphaL = 0
  let alphaR = 0
  if (Math.abs(det) > 1e-12) {
    alphaL = (c11 * x0 - c01 * x1) / det
    alphaR = (c00 * x1 - c01 * x0) / det
  }
  const segLen = norm(sub(last, first))
  const eps = 1e-6 * segLen
  if (alphaL < eps || alphaR < eps) {
    // Wu/Barsky heuristic fallback
    alphaL = alphaR = segLen / 3
  }
  return [first, add(first, scale(tHat1, alphaL)), add(last, scale(tHat2, alphaR)), last]
}

function maxError(pts: Vec[], bez: CubicBezier, u: number[]): { err: number; index: number } {
  let err = 0
  let index = Math.floor(pts.length / 2)
  for (let i = 1; i < pts.length - 1; i++) {
    const d = norm(sub(bezierPoint(bez, u[i]!), pts[i]!))
    if (d > err) {
      err = d
      index = i
    }
  }
  return { err, index }
}

/** One Newton-Raphson step improving each parameter value. */
function reparameterize(pts: Vec[], u: number[], bez: CubicBezier): number[] {
  return u.map((t, i) => {
    const p = pts[i]!
    const q = bezierPoint(bez, t)
    // derivatives
    const q1: Vec = {
      x: 3 * ((1 - t) ** 2 * (bez[1].x - bez[0].x) + 2 * (1 - t) * t * (bez[2].x - bez[1].x) + t * t * (bez[3].x - bez[2].x)),
      y: 3 * ((1 - t) ** 2 * (bez[1].y - bez[0].y) + 2 * (1 - t) * t * (bez[2].y - bez[1].y) + t * t * (bez[3].y - bez[2].y)),
    }
    const q2: Vec = {
      x: 6 * ((1 - t) * (bez[2].x - 2 * bez[1].x + bez[0].x) + t * (bez[3].x - 2 * bez[2].x + bez[1].x)),
      y: 6 * ((1 - t) * (bez[2].y - 2 * bez[1].y + bez[0].y) + t * (bez[3].y - 2 * bez[2].y + bez[1].y)),
    }
    const diff = sub(q, p)
    const num = dot(diff, q1)
    const den = dot(q1, q1) + dot(diff, q2)
    if (Math.abs(den) < 1e-12) return t
    return Math.min(1, Math.max(0, t - num / den))
  })
}

function fitCubic(pts: Vec[], tHat1: Vec, tHat2: Vec, tol: number, out: CubicBezier[]): void {
  if (pts.length === 2) {
    const d = norm(sub(pts[1]!, pts[0]!)) / 3
    out.push([pts[0]!, add(pts[0]!, scale(tHat1, d)), add(pts[1]!, scale(tHat2, d)), pts[1]!])
    return
  }

  let u = chordLengthParameterize(pts)
  let bez = generateBezier(pts, u, tHat1, tHat2)
  let { err, index } = maxError(pts, bez, u)
  if (err < tol) {
    out.push(bez)
    return
  }

  // try reparameterization a few times before splitting
  if (err < tol * tol) {
    for (let i = 0; i < 4; i++) {
      u = reparameterize(pts, u, bez)
      bez = generateBezier(pts, u, tHat1, tHat2)
      ;({ err, index } = maxError(pts, bez, u))
      if (err < tol) {
        out.push(bez)
        return
      }
    }
  }

  // split at point of max error and fit both halves
  const center = pts[index]!
  const before = pts[index - 1]!
  const after = pts[index + 1]!
  let tHatCenter = normalize(sub(before, after))
  if (norm(tHatCenter) === 0) tHatCenter = normalize(sub(before, center))
  fitCubic(pts.slice(0, index + 1), tHat1, tHatCenter, tol, out)
  fitCubic(pts.slice(index), scale(tHatCenter, -1), tHat2, tol, out)
}

/** Fit a point sequence to error-bounded cubic beziers. */
export function fitCurve(points: Point[], tolerance: number): CubicBezier[] {
  // drop consecutive duplicates
  const pts: Vec[] = []
  for (const p of points) {
    const last = pts[pts.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1e-9) pts.push({ x: p.x, y: p.y })
  }
  if (pts.length < 2) return []
  const out: CubicBezier[] = []
  const tHat1 = normalize(sub(pts[1]!, pts[0]!))
  const tHat2 = normalize(sub(pts[pts.length - 2]!, pts[pts.length - 1]!))
  fitCubic(pts, tHat1, tHat2, tolerance, out)
  return out
}

export interface SvgPathResult {
  /** SVG path data in the chosen coordinate space. */
  d: string
  /** Number of cubic segments. */
  segments: number
}

const fmt = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * Stroke → SVG path `d`. Coordinates are emitted in the stroke's own bbox
 * space (origin at bbox top-left, page-pixel units) — scale lives in the
 * accompanying bbox, so the path is drop-in for an SVG sized to the bbox.
 */
export function toSvgPath(
  points: Point[],
  opts: { tolerance?: number; origin?: { x: number; y: number } } = {},
): SvgPathResult | null {
  if (points.length < 2) return null
  let minX = Infinity, minY = Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
  }
  const ox = opts.origin?.x ?? minX
  const oy = opts.origin?.y ?? minY
  const local = points.map((p) => ({ x: p.x - ox, y: p.y - oy, t: p.t }))
  const beziers = fitCurve(local, opts.tolerance ?? 2)
  if (beziers.length === 0) return null
  let d = `M${fmt(beziers[0]![0].x)},${fmt(beziers[0]![0].y)}`
  for (const b of beziers) {
    d += ` C${fmt(b[1].x)},${fmt(b[1].y)} ${fmt(b[2].x)},${fmt(b[2].y)} ${fmt(b[3].x)},${fmt(b[3].y)}`
  }
  return { d, segments: beziers.length }
}

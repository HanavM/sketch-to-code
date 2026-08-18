/**
 * Motion-by-drawing: a stroke's velocity profile IS the easing curve.
 * Distance-vs-time, normalized to [0,1]², fitted to a single cubic bezier →
 * css cubic-bezier(x1,y1,x2,y2). Draw slow-then-whip = ease-in; overshoot
 * past the target and settle = a spring (stiffness/damping derived instead).
 */
import { fitCurve } from './fitcurve.js'
import type { Point } from './types.js'

export type Easing =
  | { type: 'bezier'; x1: number; y1: number; x2: number; y2: number; css: string }
  | { type: 'spring'; overshoot: number; oscillations: number; stiffness: number; damping: number; css: string }
  | null

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

export function strokeToEasing(points: Point[]): Easing {
  if (points.length < 8) return null
  const t0 = points[0]!.t
  const t1 = points[points.length - 1]!.t
  const T = t1 - t0
  if (T <= 0) return null

  // axial progress along start→end lets overshoot exceed 1 and come back
  const a = points[0]!
  const b = points[points.length - 1]!
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  const useAxial = chord > 8
  const ux = useAxial ? (b.x - a.x) / chord : 0
  const uy = useAxial ? (b.y - a.y) / chord : 0

  let arc = 0
  const arcs: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    arc += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
    arcs.push(arc)
  }
  if (arc < 12) return null

  const samples = points.map((p, i) => ({
    t: (p.t - t0) / T,
    p: useAxial
      ? (((p.x - a.x) * ux + (p.y - a.y) * uy) / chord)
      : arcs[i]! / arc,
  }))

  // overshoot: axial progress exceeds 1 then returns
  let overshoot = 0
  let oscillations = 0
  let above = false
  for (const s of samples) {
    if (s.p > 1.02) {
      overshoot = Math.max(overshoot, s.p - 1)
      if (!above) oscillations++
      above = true
    } else if (s.p < 0.98) above = false
  }
  if (overshoot > 0.04) {
    // heuristic spring mapping: more overshoot → less damping; more
    // oscillations → stiffer. Tuned to feel right, documented as heuristic.
    const damping = clamp01(1 - overshoot * 2) * 30 + 8
    const stiffness = 120 + oscillations * 140
    return {
      type: 'spring', overshoot: Math.round(overshoot * 100) / 100, oscillations,
      stiffness: Math.round(stiffness), damping: Math.round(damping),
      css: `linear(${springSamples(stiffness, damping).join(', ')})`,
    }
  }

  // monotone case: fit one cubic to (t, progress); endpoints pinned by data
  const fitted = fitCurve(samples.map((s) => ({ x: s.t, y: clamp01(s.p), t: 0 })), 0.035)
  if (fitted.length === 0) return null
  // use the first segment's shape; multi-segment = wobbly hand, still take overall
  const seg = fitted[0]!
  const last = fitted[fitted.length - 1]!
  const span = last[3].x - seg[0].x || 1
  const x1 = clamp01((seg[1].x - seg[0].x) / span)
  const y1 = (seg[1].y - seg[0].y) / (last[3].y - seg[0].y || 1)
  const x2 = clamp01((last[2].x - seg[0].x) / span)
  const y2 = (last[2].y - seg[0].y) / (last[3].y - seg[0].y || 1)
  const r = (v: number) => Math.round(v * 100) / 100
  return { type: 'bezier', x1: r(x1), y1: r(y1), x2: r(x2), y2: r(y2), css: `cubic-bezier(${r(x1)}, ${r(y1)}, ${r(x2)}, ${r(y2)})` }
}

/** Damped-spring position samples for CSS linear() easing (16 steps). */
function springSamples(stiffness: number, damping: number): string[] {
  const m = 1
  const w0 = Math.sqrt(stiffness / m)
  const zeta = damping / (2 * Math.sqrt(stiffness * m))
  const out: string[] = []
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * 1.2
    let x: number
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta)
      x = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t))
    } else {
      x = 1 - Math.exp(-w0 * t) * (1 + w0 * t)
    }
    out.push(String(Math.round(x * 1000) / 1000))
  }
  return out
}

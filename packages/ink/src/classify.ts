import { computeFeatures } from './features.js'
import { BIG, trapezoid } from './fuzzy.js'
import { bboxOf, dist, turnAngle } from './geometry.js'
import type { Point, ShapeCandidate, Stroke, StrokeFeatures } from './types.js'

/**
 * Single-stroke shape classification.
 *
 * Backbone: CALI's fuzzy trapezoids over convex-hull ratio features
 * (Fonseca & Jorge, PRL 2001 — published thresholds, our implementation),
 * augmented with PaleoSketch's closedness test and NDDE/DCR curvature features
 * (Paulson & Hammond, IUI'08: closed = endpointDist/len < 0.16 && revolutions > 0.75;
 * NDDE high ≥ 0.8, DCR high ≥ 6.0).
 */
export function classifyStroke(stroke: Stroke): { features: StrokeFeatures; candidates: ShapeCandidate[] } {
  const f = computeFeatures(stroke)
  const candidates: ShapeCandidate[] = []
  const push = (kind: ShapeCandidate['kind'], confidence: number) => {
    if (confidence > 0.05) candidates.push({ kind, confidence: Math.min(1, confidence) })
  }

  // degenerate tap / dot
  if (f.length < 6 || f.resampled.length < 4) {
    return { features: f, candidates: [{ kind: 'ink', confidence: 0.6 }] }
  }

  // ---- ratio features (guard zero denominators) ----
  const Ach = f.hullArea, Pch = f.hullPerimeter
  const Alt = f.triArea, Alq = f.quadArea, Plt = f.triPerimeter
  const Tl = f.length
  const thin = f.erLong > 0 ? f.erShort / f.erLong : 0 // CALI Her_Wer (min-area rect: rotation-invariant line test)
  // Deviation from CALI: enclosing rect for Ach_Aer / Alq_Aer is the AXIS-ALIGNED
  // box, not the min-area rect. In UI sketching orientation is meaningful — a
  // diamond is a deliberately rotated square, and the min-area rect of a diamond
  // is the diamond itself, which would make it indistinguishable from a rect.
  const Aer = f.bbox.w * f.bbox.h
  const Pch2_Ach = Ach > 0 ? (Pch * Pch) / Ach : BIG
  const Alq_Ach = Ach > 0 ? Alq / Ach : 0
  const Ach_Aer = Aer > 0 ? Ach / Aer : 0
  const Alq_Aer = Aer > 0 ? Alq / Aer : 0
  const Alt_Ach = Ach > 0 ? Alt / Ach : 0
  const Alt_Alq = Alq > 0 ? Alt / Alq : 0
  const Plt_Pch = Pch > 0 ? Plt / Pch : 0
  const Tl_Pch = Pch > 0 ? Tl / Pch : BIG

  // Closed = endpoints meet AND the stroke actually encircles area: either the
  // direction swept most of a revolution, or the hull is fat relative to its
  // perimeter (Pch²/Ach small — a retraced line would be enormous). The second
  // disjunct covers seam-turn sign cancellation on noisy closures.
  const closed = f.closedness < 0.16 && (f.revolutions > 0.6 || Pch2_Ach < 35)
  const nCorners = f.corners.length

  // Overdrawn loop: a person circling something often goes round 1.15–1.5
  // times, so the pen ends a quarter-turn past where it started and the
  // endpoint test calls it open (then a line or polyline: s2c-053 found 137
  // of 200 such rings misread). Read the first full lap as the shape, but only
  // when the overshoot retraces that lap, so a ring with a tail, a spiral or a
  // many-lap scribble stays what it is.
  if (!closed) {
    const lap = firstLap(f.resampled)
    if (lap) {
      const inner = classifyStroke({ ...stroke, points: lap })
      const top = inner.candidates[0]
      if (top && CLOSED_KINDS.has(top.kind)) return { features: f, candidates: inner.candidates }
    }
  }

  // ---- open strokes ----
  if (!closed) {
    // line: thin enclosing rect (CALI) or near-straight chord
    const lineByThin = trapezoid(thin, 0, 0, 0.06, 0.09)
    const lineByStraight = f.straightness > 0.97 ? (f.straightness - 0.97) / 0.03 : 0
    push('line', Math.max(lineByThin, lineByStraight))

    // scribble: dense ink retracing itself (CALI: thin fails, Tl/Pch high)
    const scribble =
      Math.min(trapezoid(thin, 0.06, 0.09, 1, BIG), trapezoid(Tl_Pch, 1.5, 1.9, BIG, BIG))
    push('scribble', scribble)

    // arc: smooth curve — high NDDE, low DCR, meaningful curvature
    if (f.straightness < 0.97 && f.revolutions < 0.9) {
      const smooth = f.ndde >= 0.8 && f.dcr < 4.5
      if (smooth && nCorners === 0) push('arc', 0.7)
    }

    // polyline / caret: straight segments joined at sharp corners.
    // Confidence decays with corner count — many reversals reads as scribble.
    if (nCorners >= 1 && f.dcr >= 4.5) {
      if (nCorners === 1) {
        // caret candidate: two straight legs, sharp apex, apex above endpoints
        const apex = f.resampled[f.corners[0]!]!
        const a = f.resampled[0]!
        const b = f.resampled[f.resampled.length - 1]!
        const angle = Math.abs(turnAngle(a, apex, b))
        const apexAbove = apex.y < Math.min(a.y, b.y)
        if (angle > (110 * Math.PI) / 180 && apexAbove) push('caret', 0.8)
        push('polyline', 0.6)
      } else {
        push('polyline', Math.max(0.4, 0.7 - 0.06 * (nCorners - 2)))
      }
    }
    // zigzag scribble (delete gesture): elongated few-corner slash…
    if (nCorners >= 3 && thin < 0.45) push('scribble', 0.5 + Math.min(0.4, nCorners * 0.05))
    // …or a many-reversal zigzag of any aspect that retraces its hull
    if (nCorners >= 4 && Tl_Pch > 1.05) {
      push('scribble', 0.55 + Math.min(0.35, (nCorners - 4) * 0.06))
    }
  }

  // ---- closed strokes (CALI trapezoids, published thresholds) ----
  if (closed || f.closedness < 0.25) {
    const closable = closed ? 1 : 0.6 // soft penalty for nearly-closed

    // circle: Pch²/Ach ≈ 4π
    push('circle', closable * trapezoid(Pch2_Ach, 12.0, 12.3, 13.2, 13.8))
    // ellipse
    push(
      'ellipse',
      closable *
        Math.min(trapezoid(Pch2_Ach, 13.2, 13.5, 19, 30), trapezoid(Alq_Ach, 0.6, 0.65, 0.71, 0.82)),
    )
    // rectangle
    const rectF = Math.min(trapezoid(Ach_Aer, 0.75, 0.85, 1, 1.01), trapezoid(Alq_Aer, 0.72, 0.78, 1, 1.01))
    // diamond — Alq_Aer lower bound widened from CALI's published 0.52:
    // real hand-drawn diamonds bulge outward; ideal ones sit exactly at 0.5.
    const diamondF = Math.min(
      trapezoid(Alq_Ach, 0.78, 0.85, 1, 1.01),
      trapezoid(Alq_Aer, 0.42, 0.48, 0.72, 0.78),
      trapezoid(Alt_Alq, 0.5, 0.53, 0.62, 0.7),
    )
    // triangle
    const triangleF = Math.min(
      trapezoid(Alt_Ach, 0.67, 0.77, 1, 1.01),
      trapezoid(Plt_Pch, 0.9, 0.95, 1, 1.01),
      trapezoid(Alt_Alq, 0.81, 0.87, 1, 1.01),
    )
    push('triangle', closable * triangleF)
    push('diamond', closable * diamondF)

    if (rectF > 0) {
      // rect vs rounded-rect: sharp corners vs smoothed ones.
      // 4 detected corners + high DCR → hard rect; fewer/softer → rounded.
      const sharp = nCorners >= 4 || f.dcr >= 5
      if (sharp) {
        push('rect', closable * rectF)
        push('rounded-rect', closable * rectF * 0.4)
      } else {
        push('rounded-rect', closable * rectF * 0.9)
        push('rect', closable * rectF * 0.5)
      }
    }
  }

  // fallback: unresolved ink
  if (candidates.length === 0) push('ink', 0.5)

  candidates.sort((a, b) => b.confidence - a.confidence)
  return { features: f, candidates }
}

const CLOSED_KINDS = new Set<ShapeCandidate['kind']>(['circle', 'ellipse', 'rect', 'rounded-rect', 'diamond', 'triangle'])

/** Most laps an overdrawn ring may sweep in all; more reads as a loopy scratch-out. */
const MAX_OVERDRAW_REVOLUTIONS = 1.75

/**
 * The points of the first full lap of an overdrawn loop, or null.
 *
 * Walks the stroke, summing signed turning, and looks for where the pen comes
 * back closest to its start once it has turned 0.75–1.25 laps. That point must
 * be close (gap < 0.16 of the lap's length, PaleoSketch's closedness bound),
 * the turning must be one-way (a zigzag cancels itself out), and every point
 * after it must lie near the lap already drawn: the overshoot retraces, it
 * does not head off somewhere (a ring with a tail is a ring plus an arrow).
 */
function firstLap(pts: Point[]): Point[] | null {
  const n = pts.length
  if (n < 12) return null
  // Turning along the pen's own path. Not features.revolutions: that one
  // bridges the seam between the ends as if the shape were closed, which on an
  // overshoot adds a phantom U-turn (a 1.3-lap ring measured 2.0).
  let total = 0
  for (let i = 2; i < n; i++) total += turnAngle(pts[i - 2]!, pts[i - 1]!, pts[i]!)
  const laps = Math.abs(total) / (2 * Math.PI)
  if (laps < 0.9 || laps > MAX_OVERDRAW_REVOLUTIONS) return null
  let rot = 0
  let len = 0
  let best = -1
  let bestGap = Infinity
  const lens: number[] = [0, dist(pts[0]!, pts[1]!)]
  for (let i = 2; i < n; i++) {
    rot += turnAngle(pts[i - 2]!, pts[i - 1]!, pts[i]!)
    len = lens[i - 1]! + dist(pts[i - 1]!, pts[i]!)
    lens.push(len)
    const laps = Math.abs(rot) / (2 * Math.PI)
    if (laps < 0.75) continue
    if (laps > 1.25) break
    const gap = dist(pts[i]!, pts[0]!)
    if (gap < bestGap) { bestGap = gap; best = i }
  }
  if (best < 0 || bestGap >= 0.16 * lens[best]!) return null
  const lap = pts.slice(0, best + 1)
  const box = bboxOf(lap)
  const near = Math.max(6, 0.15 * Math.min(box.w, box.h))
  for (let i = best + 1; i < n; i++) {
    let d = Infinity
    for (const q of lap) d = Math.min(d, dist(pts[i]!, q))
    if (d > near) return null
  }
  return lap
}

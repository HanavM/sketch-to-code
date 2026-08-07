import { computeFeatures } from './features.js'
import { BIG, trapezoid } from './fuzzy.js'
import { turnAngle } from './geometry.js'
import type { ShapeCandidate, Stroke, StrokeFeatures } from './types.js'

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

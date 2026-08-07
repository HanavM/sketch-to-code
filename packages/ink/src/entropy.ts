import { pathLength, turnAngle } from './geometry.js'
import { resampleBySpacing } from './resample.js'
import type { Stroke } from './types.js'

/**
 * Text-vs-shape discrimination, after Bhat & Hammond,
 * "Using Entropy to Distinguish Shape Versus Text in Hand-Drawn Diagrams" (IJCAI-09):
 * resample to 4px, map each point's turning angle into a 7-symbol alphabet
 * (6 angle ranges A–F + X at stroke endpoints), take zero-order Shannon entropy.
 *
 * NOTE: the paper's 3.55 is the midpoint parameter of an arctan *confidence*
 * curve (entropy where P(text)=0.5), not a hard threshold, and its entropy
 * scaling isn't fully specified. We therefore combine per-symbol entropy with
 * density features and fit our cutoffs on fixtures (see tests).
 */

export interface TextShapeFeatures {
  /** Zero-order entropy of the angle-symbol distribution, bits (0..log2 7). */
  symbolEntropy: number
  /** Turning per pixel of ink, radians/px. */
  angularDensity: number
  /** Ink length relative to bbox diagonal — text packs much more ink per area. */
  inkDensity: number
  strokeCount: number
  bboxH: number
}

export function textShapeFeatures(strokes: Stroke[]): TextShapeFeatures {
  let counts = new Map<string, number>()
  let total = 0
  let totalTurn = 0
  let totalLen = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  for (const s of strokes) {
    const pts = resampleBySpacing(s.points, 4)
    for (const p of pts) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    totalLen += pathLength(pts)
    const bump = (sym: string) => {
      counts.set(sym, (counts.get(sym) ?? 0) + 1)
      total++
    }
    if (pts.length < 3) {
      bump('X')
      continue
    }
    bump('X')
    for (let i = 1; i < pts.length - 1; i++) {
      const a = turnAngle(pts[i - 1]!, pts[i]!, pts[i + 1]!)
      totalTurn += Math.abs(a)
      // |angle| in [0, π] → 6 buckets of π/6... π covers 6 buckets of π/6? π/(π/6)=6. good.
      const bucket = Math.min(5, Math.floor(Math.abs(a) / (Math.PI / 6)))
      bump(String.fromCharCode(65 + bucket)) // A..F
    }
    bump('X')
  }

  let H = 0
  for (const c of counts.values()) {
    const p = c / total
    H -= p * Math.log2(p)
  }
  const diag = isFinite(minX) ? Math.hypot(maxX - minX, maxY - minY) : 0
  return {
    symbolEntropy: total > 0 ? H : 0,
    angularDensity: totalLen > 0 ? totalTurn / totalLen : 0,
    inkDensity: diag > 0 ? totalLen / diag : 0,
    strokeCount: strokes.length,
    bboxH: isFinite(minY) ? maxY - minY : 0,
  }
}

/**
 * P(text) for a stroke group. Arctan confidence shape after Bhat & Hammond,
 * over a composite score fit on our fixtures.
 */
export function textProbability(strokes: Stroke[]): number {
  const f = textShapeFeatures(strokes)
  // Composite: entropy says "irregular", angular density says "wiggly per px",
  // ink density says "lots of ink in a small box", stroke count says "many small marks".
  const score =
    f.symbolEntropy * 1.6 +
    f.angularDensity * 14 +
    Math.min(4, f.inkDensity) * 0.55 +
    Math.min(6, f.strokeCount) * 0.28
  const midpoint = 5.4 // fit on fixtures; plays the role of the paper's b=3.55
  return 0.5 + Math.atan(score - midpoint) / Math.PI
}

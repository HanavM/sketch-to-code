import { dist, pathLength, turnAngle } from './geometry.js'
import type { Point, StrokeFeatures } from './types.js'

export interface ArrowDetection {
  /** Tail (source) endpoint. */
  from: Point
  /** Head (target) endpoint — where the arrowhead is. */
  to: Point
  confidence: number
}

/**
 * Single-stroke arrow: a long shaft ending in a V-shaped head drawn without
 * lifting (tail → tip → head-wing(s)). Detected from RDP-level vertices:
 * a dominant straight run followed by 1–3 short reversing segments at one end.
 */
export function detectSingleStrokeArrow(
  f: StrokeFeatures,
  vertices: Point[],
): ArrowDetection | null {
  if (vertices.length < 3) return null
  const total = pathLength(vertices)
  if (total < 24) return null

  const trySide = (verts: Point[]): ArrowDetection | null => {
    // shaft = prefix of vertices; head = suffix of short segments with sharp turns
    const segs: number[] = []
    for (let i = 1; i < verts.length; i++) segs.push(dist(verts[i - 1]!, verts[i]!))
    // find the split: last long segment
    let shaftEnd = -1
    for (let i = 0; i < segs.length; i++) {
      if (segs[i]! > total * 0.35) shaftEnd = i + 1
    }
    if (shaftEnd < 1 || shaftEnd >= verts.length) return null
    const headSegs = segs.slice(shaftEnd)
    if (headSegs.length < 1 || headSegs.length > 4) return null
    const headLen = headSegs.reduce((a, b) => a + b, 0)
    const shaftLen = segs.slice(0, shaftEnd).reduce((a, b) => a + b, 0)
    if (headLen === 0 || headLen > shaftLen * 0.7) return null
    // head segments must turn sharply relative to shaft direction
    const tip = verts[shaftEnd]!
    const beforeTip = verts[shaftEnd - 1]!
    let sharpTurns = 0
    for (let i = shaftEnd + 1; i < verts.length; i++) {
      const ang = Math.abs(turnAngle(beforeTip, tip, verts[i]!))
      // wing points back alongside the shaft: angle at tip well off straight-through
      if (ang > (95 * Math.PI) / 180) sharpTurns++
    }
    if (sharpTurns === 0) return null
    // wings should stay near the tip
    for (let i = shaftEnd + 1; i < verts.length; i++) {
      if (dist(tip, verts[i]!) > headLen * 1.6 + 2) return null
    }
    const conf = Math.min(1, 0.55 + 0.2 * sharpTurns + (headLen < shaftLen * 0.45 ? 0.15 : 0))
    return { from: verts[0]!, to: tip, confidence: conf }
  }

  return trySide(vertices) ?? trySide([...vertices].reverse())
}

/**
 * Two-stroke arrow: a line/polyline shaft plus a separate short V-shaped head
 * stroke whose apex lands near one of the shaft's endpoints (Bresler-style
 * shaft+head pairing, threshold-matched rather than learned).
 */
export function detectTwoStrokeArrow(
  shaftVerts: Point[],
  shaftLen: number,
  headVerts: Point[],
  headLen: number,
): ArrowDetection | null {
  if (shaftVerts.length < 2 || headVerts.length < 3) return null
  if (headLen > shaftLen * 0.8 || headLen < 6) return null
  // head must be a V: exactly one interior sharp corner
  if (headVerts.length > 4) return null
  const apex = headVerts.length === 3 ? headVerts[1]! : headVerts[Math.floor(headVerts.length / 2)]!
  const wingAngle = Math.abs(turnAngle(headVerts[0]!, apex, headVerts[headVerts.length - 1]!))
  // wings fold back: interior angle between 20° and 140°
  if (wingAngle < (20 * Math.PI) / 180 || wingAngle > (140 * Math.PI) / 180) return null

  const a = shaftVerts[0]!
  const b = shaftVerts[shaftVerts.length - 1]!
  const tol = Math.max(14, headLen * 0.9)
  const dA = dist(apex, a)
  const dB = dist(apex, b)
  if (Math.min(dA, dB) > tol) return null
  const headAtB = dB <= dA
  return {
    from: headAtB ? a : b,
    to: headAtB ? b : a,
    confidence: 0.75,
  }
}

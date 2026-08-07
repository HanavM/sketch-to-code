import { dist } from './geometry.js'
import type { Point } from './types.js'

/**
 * IPAN99-style corner detection (Chetverikov & Szabó).
 * For each point p, admit triangles (p-, p, p+) with legs in [dMin, dMax];
 * sharpness = π − opening angle at p. A corner is a local maximum of sharpness
 * above alphaMax. Works on resampled points; needs no timestamps.
 */
export function detectCorners(
  pts: Point[],
  opts: { dMin?: number; dMax?: number; alphaMaxDeg?: number } = {},
): number[] {
  const n = pts.length
  if (n < 5) return []
  const dMin = opts.dMin ?? 7
  const dMax = opts.dMax ?? 30
  // opening angles sharper (smaller) than this are corner candidates
  const alphaMax = ((opts.alphaMaxDeg ?? 150) * Math.PI) / 180

  const sharp = new Array<number>(n).fill(0)
  for (let i = 0; i < n; i++) {
    let best = 0
    // walk backward to find admissible predecessor legs
    for (let a = i - 1; a >= 0; a--) {
      const dA = dist(pts[a]!, pts[i]!)
      if (dA < dMin) continue
      if (dA > dMax) break
      for (let b = i + 1; b < n; b++) {
        const dB = dist(pts[b]!, pts[i]!)
        if (dB < dMin) continue
        if (dB > dMax) break
        const c = dist(pts[a]!, pts[b]!)
        // law of cosines: opening angle at p
        const cosA = (dA * dA + dB * dB - c * c) / (2 * dA * dB)
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosA)))
        if (alpha < alphaMax) best = Math.max(best, Math.PI - alpha)
      }
    }
    sharp[i] = best
  }

  // non-maximum suppression within dMin radius
  const corners: number[] = []
  for (let i = 0; i < n; i++) {
    if (sharp[i]! <= 0) continue
    let isMax = true
    for (let j = 0; j < n && isMax; j++) {
      if (j === i) continue
      if (dist(pts[i]!, pts[j]!) < dMin && sharp[j]! > sharp[i]!) isMax = false
    }
    if (isMax) corners.push(i)
  }
  // collapse adjacent survivors (plateaus)
  const out: number[] = []
  for (const c of corners) {
    const last = out[out.length - 1]
    if (last !== undefined && dist(pts[last]!, pts[c]!) < dMin) continue
    out.push(c)
  }
  return out
}

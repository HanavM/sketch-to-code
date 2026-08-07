import { dist, pathLength } from './geometry.js'
import type { Point } from './types.js'

/** Drop points closer than minGap px to their predecessor (Rubine preprocessing). */
export function dedupe(pts: Point[], minGap = 3): Point[] {
  if (pts.length === 0) return []
  const out: Point[] = [pts[0]!]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!
    if (dist(out[out.length - 1]!, p) >= minGap) out.push(p)
  }
  // always keep the true endpoint
  const last = pts[pts.length - 1]!
  const tail = out[out.length - 1]!
  if (tail.x !== last.x || tail.y !== last.y) out.push(last)
  return out
}

/** Resample to points equidistant along the path ($1 step 1, but by spacing). */
export function resampleBySpacing(pts: Point[], spacing: number): Point[] {
  if (pts.length < 2 || spacing <= 0) return [...pts]
  const out: Point[] = [pts[0]!]
  let acc = 0
  let prev = pts[0]!
  for (let i = 1; i < pts.length; i++) {
    let cur = pts[i]!
    let d = dist(prev, cur)
    while (acc + d >= spacing && d > 0) {
      const t = (spacing - acc) / d
      const np: Point = {
        x: prev.x + t * (cur.x - prev.x),
        y: prev.y + t * (cur.y - prev.y),
        t: prev.t + t * (cur.t - prev.t),
      }
      out.push(np)
      prev = np
      d = dist(prev, cur)
      acc = 0
    }
    acc += d
    prev = cur
  }
  const last = pts[pts.length - 1]!
  const tail = out[out.length - 1]!
  if (tail.x !== last.x || tail.y !== last.y) out.push(last)
  return out
}

/** Resample to exactly n equidistant points ($1 Recognizer, N=64). */
export function resampleToCount(pts: Point[], n = 64): Point[] {
  if (pts.length === 0) return []
  if (pts.length === 1) return Array.from({ length: n }, () => ({ ...pts[0]! }))
  const L = pathLength(pts) / (n - 1)
  if (L === 0) return Array.from({ length: n }, () => ({ ...pts[0]! }))
  const out: Point[] = [pts[0]!]
  let acc = 0
  const work = [...pts]
  for (let i = 1; i < work.length; i++) {
    const prev = work[i - 1]!
    const cur = work[i]!
    const d = dist(prev, cur)
    if (acc + d >= L && d > 0) {
      const t = (L - acc) / d
      const np: Point = {
        x: prev.x + t * (cur.x - prev.x),
        y: prev.y + t * (cur.y - prev.y),
        t: prev.t + t * (cur.t - prev.t),
      }
      out.push(np)
      work.splice(i, 0, np)
      acc = 0
    } else {
      acc += d
    }
  }
  while (out.length < n) out.push({ ...pts[pts.length - 1]! })
  return out.slice(0, n)
}

import { pointSegDist } from './geometry.js'
import type { Point } from './types.js'

/** Ramer–Douglas–Peucker. Returns a subset of the input points. */
export function rdp(pts: Point[], epsilon: number): Point[] {
  if (pts.length <= 2) return [...pts]
  const keep = new Array<boolean>(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let maxD = 0
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = pointSegDist(pts[i]!, pts[s]!, pts[e]!)
      if (d > maxD) {
        maxD = d
        idx = i
      }
    }
    if (maxD > epsilon && idx !== -1) {
      keep[idx] = true
      stack.push([s, idx], [idx, e])
    }
  }
  return pts.filter((_, i) => keep[i])
}

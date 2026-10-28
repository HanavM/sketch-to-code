import { describe, expect, it } from 'vitest'
import { noteFocus } from '../src/notefocus.js'
import type { Stroke } from '../src/types.js'

// walk a polyline at ~6px so it looks like captured ink
const walk = (id: string, way: number[][]): Stroke => {
  const points: Stroke['points'] = []
  let t = 0
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) points.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: t++ })
  }
  points.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]!, t })
  return { id, points }
}
const ring = (id: string, cx: number, cy: number, r: number): Stroke =>
  walk(id, Array.from({ length: 17 }, (_, i) => [cx + r * Math.cos((i / 16) * 2 * Math.PI), cy + r * Math.sin((i / 16) * 2 * Math.PI)]))

// round 12 c4 (n8): a big box, a badge ring beside it, a card box under it, a diagonal line
const S = [
  walk('diag', [[805, 0], [500, 900]]),
  walk('big', [[400, 140], [910, 140], [910, 515], [400, 515], [400, 140]]),
  ring('badge', 1135, 215, 75),
  walk('card', [[900, 520], [1220, 520], [1220, 652], [900, 652], [900, 520]]),
]
const ids = S.map((s) => s.id)

describe('noteFocus (moved to ink so the overlay can show it, n9)', () => {
  it('a note typed inside the ring is about the ring alone', () => {
    expect(noteFocus(ids, undefined, { x: 1135, y: 215 }, S)).toEqual(['badge'])
  })
  it('a note typed on the big box edge is about the big box (what the thread shows)', () => {
    expect(noteFocus(ids, undefined, { x: 900, y: 340 }, S)).toEqual(['big'])
  })
  it('a given focus wins, so the overlay and the build agree', () => {
    expect(noteFocus(ids, ['card'], { x: 1135, y: 215 }, S)).toEqual(['card'])
  })
})

describe('a diagonal covers its ink, not its box (n9)', () => {
  it('a note typed in the big box, away from the band, is about the box alone', () => {
    expect(noteFocus(ids, undefined, { x: 560, y: 420 }, S)).toEqual(['big'])
  })
  it('a note typed on the band itself is still about the band', () => {
    expect(noteFocus(ids, undefined, { x: 520, y: 845 }, S)).toEqual(['diag'])
  })
})

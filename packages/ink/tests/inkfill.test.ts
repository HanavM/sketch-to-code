import { describe, expect, it } from 'vitest'
import { inkFills, isFillDot, pageFill } from '../src/inkfill.js'
import type { Stroke } from '../src/types.js'

const walk = (id: string, way: number[][], color?: string): Stroke => {
  const points: Stroke['points'] = []
  let t = 0
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) points.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: t++ })
  }
  points.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]!, t })
  return { id, points, ...(color ? { color } : {}) }
}
const tap = (id: string, x: number, y: number, color?: string): Stroke =>
  ({ id, points: [{ x, y, t: 0 }, { x: x + 1, y, t: 1 }, { x: x + 1, y: y + 1, t: 2 }], ...(color ? { color } : {}) })
const ring = (id: string, cx: number, cy: number, r: number): Stroke =>
  walk(id, Array.from({ length: 17 }, (_, i) => [cx + r * Math.cos((i / 16) * 2 * Math.PI), cy + r * Math.sin((i / 16) * 2 * Math.PI)]))

// glass blobs (r2 c3): two blobs, a card box overlapping the first blob's box
const blob1 = walk('b1', [[330, 80], [460, 110], [540, 220], [530, 380], [420, 500], [280, 510], [160, 420], [120, 280], [180, 140], [330, 80]])
const card = walk('card', [[291, 181], [989, 181], [989, 699], [291, 699], [291, 181]])
const btn = walk('btn', [[348, 538], [481, 538], [481, 588], [348, 588], [348, 538]])

describe('colour from ink: taps fill what they land in (n10)', () => {
  it('only a coloured tap is a fill', () => {
    expect(isFillDot(tap('t', 10, 10, '#ff0000'))).toBe(true)
    expect(isFillDot(tap('t', 10, 10))).toBe(false)
    expect(isFillDot(walk('l', [[0, 0], [40, 0]], '#ff0000'))).toBe(false)
  })
  it('a tap fills the smallest closed outline holding it, by the ink not the box', () => {
    const f = inkFills([blob1, card, btn, tap('t1', 200, 300, '#ec4899'), tap('t2', 400, 560, '#ffffff'), tap('t3', 700, 400, '#ffffff')])
    expect(f.map((x) => x.target)).toEqual(['b1', 'btn', 'card'])
    // inside the blob's bounding box but outside its ink: the card (or page)
    const corner = inkFills([blob1, card, tap('t', 520, 470, '#000000')])
    expect(corner[0]!.target).toBe('card')
  })
  it('a tap on bare page colours the page; two colours make a gradient from the first to the last', () => {
    const one = inkFills([card, tap('p', 60, 60, '#0b1026')])
    expect(one[0]!.target).toBeNull()
    expect(pageFill(one)).toEqual({ colors: ['#0b1026'], css: '#0b1026' })
    const two = inkFills([card, tap('a', 40, 40, '#ff8a00'), tap('b', 1240, 860, '#6b21a8')])
    const g = pageFill(two)!
    expect(g.colors).toEqual(['#ff8a00', '#6b21a8'])
    expect(g.angle).toBeGreaterThan(110)
    expect(g.angle).toBeLessThan(140)
    expect(g.css).toMatch(/^linear-gradient\(\d+deg, #ff8a00, #6b21a8\)$/)
  })
  it('a later tap on the same mark re-colours it', () => {
    const f = inkFills([ring('r', 500, 500, 60), tap('a', 500, 500, '#ff0000'), tap('b', 505, 505, '#00ff00')])
    expect(f).toHaveLength(1)
    expect(f[0]!.color).toBe('#00ff00')
  })
})

describe('a spotlight from taps (n33)', () => {
  it('a page tap with three or more taps round it in another colour is a radial glow at that tap', () => {
    const f = inkFills([tap('c', 640, 360, '#3a2a6e'), tap('n', 640, 80, '#14111f'), tap('e', 1180, 400, '#14111f'), tap('s', 620, 760, '#14111f'), tap('w', 90, 380, '#14111f')])
    const g = pageFill(f)!
    expect(g.radial).toBeDefined()
    expect(Math.abs(g.radial!.x - 640)).toBeLessThanOrEqual(2)
    expect(Math.abs(g.radial!.y - 360)).toBeLessThanOrEqual(2)
    expect(g.radial!.r).toBeGreaterThan(300)
    expect(g.colors).toEqual(['#3a2a6e', '#14111f'])
    expect(g.css).toMatch(/^radial-gradient\(circle at 64\dpx 36\dpx, #3a2a6e 0px, #14111f \d+px\)$/)
  })
  it('the centre tap may come last', () => {
    const f = inkFills([tap('n', 640, 80, '#000000'), tap('e', 1180, 400, '#000000'), tap('s', 620, 760, '#000000'), tap('c', 640, 360, '#ff0000')])
    expect(Math.abs(pageFill(f)!.radial!.x - 640)).toBeLessThanOrEqual(2)
  })
  it('taps all on one side, or only two, stay a linear fade', () => {
    const side = inkFills([tap('c', 640, 360, '#3a2a6e'), tap('a', 900, 100, '#14111f'), tap('b', 1000, 360, '#14111f'), tap('d', 900, 620, '#14111f')])
    expect(pageFill(side)!.radial).toBeUndefined()
    const two = inkFills([tap('a', 640, 250, '#3a2a6e'), tap('b', 640, 820, '#14111f')])
    expect(pageFill(two)!.css).toMatch(/^linear-gradient/)
  })
})

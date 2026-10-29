import { describe, expect, it } from 'vitest'
import { inkFills, markFill, splitRegions } from '../src/inkfill.js'
import { pointInPolygon } from '../src/geometry.js'
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
const tap = (id: string, x: number, y: number, color: string): Stroke =>
  ({ id, points: [{ x, y, t: 0 }, { x: x + 1, y, t: 1 }, { x: x + 1, y: y + 1, t: 2 }], color })

// round 33 c1 surf school (n49), as drawn: the left panel, the sun, the wave across the panel, then taps
const panel = walk('panel', [[2, 2], [640, 2], [640, 898], [2, 898], [2, 4]])
const wave = walk('wave', [[2, 700], [60, 640], [200, 585], [380, 560], [500, 580], [590, 650], [638, 760]])
const surf = [panel, wave, tap('t1', 100, 80, '#38bdf8'), tap('t2', 40, 540, '#1580bd'), tap('t3', 300, 800, '#e0f2fe')]

describe('a curve across a box cuts it in two (n51)', () => {
  it('the wave across the panel is a region: the curve closed along the panel foot', () => {
    const cuts = splitRegions(surf)
    expect(cuts).toHaveLength(1)
    const c = cuts[0]!
    expect(c.id).toBe('wave')
    expect(c.holder).toBe('panel')
    expect(c.box.y).toBeGreaterThan(540)
    expect(c.box.y + c.box.h).toBeGreaterThanOrEqual(896)
    expect(pointInPolygon({ x: 300, y: 800, t: 0 }, c.points as never)).toBe(true)
    expect(pointInPolygon({ x: 100, y: 300, t: 0 }, c.points as never)).toBe(false)
  })
  it('taps go to the side they sit on; two far-apart taps make a fade the way they run', () => {
    const fills = inkFills(surf)
    expect(fills.find((f) => f.dotId === 't3')!.target).toBe('wave')
    expect(fills.find((f) => f.dotId === 't3')!.region).toBeDefined()
    expect(fills.filter((f) => f.target === 'panel').map((f) => f.dotId)).toEqual(['t1', 't2'])
    const sky = markFill(fills, 'panel')!
    expect(sky.colors).toEqual(['#38bdf8', '#1580bd'])
    // light at the top, darker going down
    expect(sky.angle).toBeGreaterThan(150)
    expect(sky.angle).toBeLessThan(210)
    expect(markFill(fills, 'wave')!.css).toBe('#e0f2fe')
  })
  it('a second tap close to the first re-colours, never a fade', () => {
    const fills = inkFills([panel, tap('a', 100, 100, '#ff0000'), tap('b', 120, 110, '#00ff00')])
    expect(fills.filter((f) => f.target === 'panel').map((f) => f.color)).toEqual(['#00ff00'])
  })
  it('a straight line across a box is not a cut', () => {
    expect(splitRegions([panel, walk('rule', [[2, 400], [640, 400]])])).toHaveLength(0)
  })
  it('a hill along the page foot cuts the page when no box holds it', () => {
    const hill = walk('hill', [[0, 820], [300, 600], [700, 640], [1280, 860]])
    expect(splitRegions([hill])).toHaveLength(0)
    const cuts = splitRegions([hill, tap('t', 600, 800, '#166534')], { w: 1280, h: 900 })
    expect(cuts).toHaveLength(1)
    expect(cuts[0]!.holder).toBeNull()
    expect(cuts[0]!.box.y + cuts[0]!.box.h).toBe(900)
    expect(inkFills([hill, tap('t', 600, 800, '#166534')], { w: 1280, h: 900 })[0]!.target).toBe('hill')
  })
})

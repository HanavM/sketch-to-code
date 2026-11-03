import { describe, expect, it } from 'vitest'
import { resampleBySpacing } from '@s2c/ink'
import { polygonSides, shapeOf } from '../src/shapemark.js'
import { outlineBrief, outlineMark } from '../src/outline.js'

const P = (w: number[][]) => w.map(([x, y]) => ({ x: x!, y: y! }))
const R = (w: number[][]) => resampleBySpacing(P(w) as never, 6) as Array<{ x: number; y: number }>
// round 39 c1 honey co.: one of eight hexagons, drawn in seven moves
const hex = [[750, 150], [840, 202], [840, 306], [750, 358], [660, 306], [660, 202], [749, 152]]
// how rings have been drawn with a mouse in rounds 31-39: eight moves round, or more
const ring8 = [[595, 120], [648, 142], [670, 195], [648, 248], [595, 270], [542, 248], [520, 195], [542, 142], [595, 120]]
const ringSmooth = Array.from({ length: 33 }, (_, i) => [400 + 80 * Math.cos(i / 32 * 2 * Math.PI), 300 + 80 * Math.sin(i / 32 * 2 * Math.PI)])
// round 32 c5: a button drawn wide with pointed ends (a pill, n45); round 32 e3: a small avatar drawn in six moves
const pointedPill = [[550, 419], [730, 419], [755, 447], [730, 476], [550, 476], [525, 447], [550, 419]]
const smallHex = [[396, 88], [416, 98], [416, 118], [396, 128], [376, 118], [376, 98], [394, 88]]
const pent = [[300, 100], [395, 169], [359, 281], [241, 281], [205, 169], [299, 101]]

describe('n128 a closed stroke with 5-7 clear corners is that polygon, not a ring', () => {
  it('reads the honey hexagon as 6 sides and not as a ring; a pentagon as 5', () => {
    expect(polygonSides(R(hex))).toBe(6)
    expect(shapeOf(P(hex))).toBeNull()
    expect(polygonSides(R(pent))).toBe(5)
  })
  it('a corner drawn a little round (two points close together) is still one corner', () => {
    const roundCorners = [[750, 150], [835, 199], [840, 208], [840, 300], [834, 309], [750, 358], [666, 310], [660, 301], [660, 208], [665, 199], [749, 152]]
    expect(polygonSides(R(roundCorners))).toBe(6)
  })
  it('builds it as a hexagon outline (clip-path), named a hexagon', () => {
    const m = outlineMark('h1', P(hex))
    expect(m?.outline?.corners).toBe(6)
    const brief = outlineBrief([{ shapeMarks: [m!] }])
    expect(brief).toContain('hexagon')
    expect(brief).toContain('clip-path: polygon(')
  })
  it('keeps rings rings: eight-move rings, smooth rings, small six-move avatars, pointed pills', () => {
    expect(polygonSides(R(ring8))).toBeNull()
    expect(shapeOf(P(ring8))?.shape).toBe('ellipse')
    expect(polygonSides(R(ringSmooth))).toBeNull()
    expect(shapeOf(P(ringSmooth))?.shape).toBe('ellipse')
    expect(polygonSides(R(smallHex))).toBeNull()
    expect(polygonSides(R(pointedPill))).toBeNull()
    expect(shapeOf(P(pointedPill))?.pill).toBe(true)
  })
  it('a polygon drawn in a coloured pen with no tap is told filled in exactly that pen colour', () => {
    const m = outlineMark('h1', P(hex))!
    m.outline!.pen = '#fbbf24'
    const brief = outlineBrief([{ shapeMarks: [m] }])
    expect(brief).toContain('background #fbbf24')
    expect(brief).toContain('never black')
  })
})

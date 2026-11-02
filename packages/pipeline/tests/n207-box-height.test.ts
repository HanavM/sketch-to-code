import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { verifyShapeMarks } from '../src/shapemark.js'

// round 45 c4 bike repair, n151 try 2: three service cards drawn 222px tall, built 168px tall and 33px low
const card = (id: string, x: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y: 619, w: 361, h: 222 } })
const marks = [card('s12', 69), card('s13', 459), card('s14', 849)]
const node = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, tag: 'div', parent: 'page', rect: { x, y, w, h }, style: { border: '1px solid rgb(17, 17, 17)' } })
const before = { nodes: [] }

describe('a drawn box keeps its drawn height (n207)', () => {
  it('fails cards built short even when their centres land, telling the height and top once for the row', () => {
    const after = { nodes: [node('a', 70, 651.5, 361, 168), node('b', 459, 651.5, 361, 168), node('c', 849, 651.5, 361, 168)] }
    const v = verifyShapeMarks(marks, before, after)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/is 168px tall \(54px short\)/)
    expect(v.reason).toMatch(/exact height of 222px/)
    expect(v.reason).toMatch(/take 33px out of the gap above it/)
    expect(v.reason).toMatch(/2 look-alike boxes beside it/)
    expect(v.reason.match(/exact height/g)).toHaveLength(1)
  })
  it('passes cards built at their drawn height', () => {
    const after = { nodes: [node('a', 70, 620, 361, 220), node('b', 459, 620, 361, 220), node('c', 849, 620, 361, 220)] }
    expect(verifyShapeMarks(marks, before, after).satisfied).toBe(true)
  })
  it('leaves short boxes and rings alone', () => {
    const field: ShapeMark = { strokeId: 'f', shape: 'box', box: { x: 100, y: 100, w: 300, h: 44 } }
    const ring: ShapeMark = { strokeId: 'r', shape: 'ellipse', box: { x: 600, y: 100, w: 259, h: 259 } }
    const after = { nodes: [node('f', 100, 104, 300, 36), node('r', 610, 110, 230, 230)] }
    const v = verifyShapeMarks([field, ring], before, after)
    expect(v.reason).not.toMatch(/exact height/)
  })
})

import { describe, expect, it } from 'vitest'
import { clipPolygon, isAreaNote, markAreasAndEdges, verifyAreaMarks, verifyEdges, areasBrief } from '../src/areas.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const st = (o: Partial<{ backgroundColor: string; backgroundImage: string; clipPath: string; border: string; boxShadow: string }> = {}) =>
  ({ backgroundColor: 'rgba(0, 0, 0, 0)', ...o })
const node = (id: string, parent: string | null, rect: { x: number; y: number; w: number; h: number }, style = st(), tag = 'div') =>
  ({ id, tag, parent, rect, style })

describe('isAreaNote', () => {
  it('reads a big word or number as an area', () => {
    expect(isAreaNote('huge outlined 09, white')).toBe(true)
    expect(isAreaNote('big bold headline')).toBe(true)
    expect(isAreaNote('giant SALE')).toBe(true)
  })
  it('a card, button or picture is a thing, not an area', () => {
    expect(isAreaNote('big card with 09')).toBe(false)
    expect(isAreaNote('huge photo')).toBe(false)
    expect(isAreaNote('big number in a black panel')).toBe(false)
    expect(isAreaNote('3 rows: Route, Start, Groups')).toBe(false)
    expect(isAreaNote('lime badge FREE COFFEE AFTER, tilted')).toBe(false)
  })
})

describe('markAreasAndEdges', () => {
  it('flags the box under a big-number note and a page-tall slanted line', () => {
    const marks: ShapeMark[] = [
      { strokeId: 's9', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 } },
      { strokeId: 's1', shape: 'line', box: { x: 500, y: 0, w: 305, h: 900 }, from: { x: 805, y: 0 }, to: { x: 500, y: 900 } },
      { strokeId: 's2', shape: 'line', box: { x: 56, y: 192, w: 410, h: 0 }, from: { x: 56, y: 192 }, to: { x: 466, y: 192 } },
    ]
    markAreasAndEdges(marks, [{ text: 'huge outlined 09, white', focus: ['s9'] }], vp)
    expect(marks[0]!.area).toBe(true)
    expect(marks[1]!.edge).toBe(true)
    expect(marks[2]!.edge).toBeUndefined()
    expect(areasBrief([{ shapeMarks: marks }], vp)).toMatch(/clip-path: polygon\(0 0, 805px 0, 500px 900px, 0 900px\)/)
  })
  it('a box whose own note says card stays a card', () => {
    const marks: ShapeMark[] = [{ strokeId: 'b', shape: 'box', box: { x: 0, y: 0, w: 300, h: 200 } }]
    markAreasAndEdges(marks, [{ text: 'big 09 on a black card', focus: ['b'] }], vp)
    expect(marks[0]!.area).toBeUndefined()
  })
  it('with two boxes, an unfocused note decides neither', () => {
    const marks: ShapeMark[] = [
      { strokeId: 'a', shape: 'box', box: { x: 0, y: 0, w: 300, h: 200 } },
      { strokeId: 'b', shape: 'box', box: { x: 400, y: 0, w: 300, h: 200 } },
    ]
    markAreasAndEdges(marks, [{ text: 'huge 09' }], vp)
    expect(marks.some((m) => m.area)).toBe(false)
  })
})

describe('verifyAreaMarks', () => {
  const area: ShapeMark = { strokeId: 's9', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 }, area: true }
  const page = node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, st({ backgroundColor: 'rgb(200, 255, 0)' }))
  it('fails the black card behind the 09 (round 12 c4, n11)', () => {
    const v = verifyAreaMarks([area], { viewport: vp, nodes: [page, node('c', 'p', { x: 405, y: 150, w: 500, h: 360 }, st({ backgroundColor: 'rgb(10, 10, 10)' }))] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/#0a0a0a fill/)
  })
  it('fails a framed box', () => {
    const v = verifyAreaMarks([area], { viewport: vp, nodes: [page, node('c', 'p', { x: 405, y: 150, w: 500, h: 360 }, st({ border: '2px rgb(255, 255, 255)' }))] })
    expect(v.satisfied).toBe(false)
  })
  it('passes transparent big type, and ignores the page wrapper', () => {
    const v = verifyAreaMarks([area], { viewport: vp, nodes: [page, node('c', 'p', { x: 405, y: 150, w: 500, h: 360 }), node('t', 'c', { x: 420, y: 160, w: 470, h: 340 }, st(), 'span')] })
    expect(v.satisfied).toBe(true)
  })
})

describe('verifyEdges', () => {
  const edge: ShapeMark = { strokeId: 's1', shape: 'line', box: { x: 500, y: 0, w: 305, h: 900 }, from: { x: 805, y: 0 }, to: { x: 500, y: 900 }, edge: true }
  it('passes a clipped layer whose slanted side is the drawn line', () => {
    const v = verifyEdges([edge], { viewport: vp, nodes: [node('l', null, { x: 0, y: 0, w: 1280, h: 900 }, st({ clipPath: 'polygon(0px 0px, 812px 0px, 495px 900px, 0px 900px)' }))] })
    expect(v.satisfied).toBe(true)
  })
  it('reads percent polygons', () => {
    expect(clipPolygon('polygon(0% 0%, 62.5% 0%, 40% 100%, 0% 100%)', { x: 0, y: 0, w: 1280, h: 900 })).toEqual([
      { x: 0, y: 0 }, { x: 800, y: 0 }, { x: 512, y: 900 }, { x: 0, y: 900 },
    ])
  })
  it('fails a vertical split with a band laid over it (round 12 c4, n11)', () => {
    const v = verifyEdges([edge], {
      viewport: vp,
      nodes: [
        node('l', null, { x: 0, y: 0, w: 1000, h: 900 }, st({ backgroundColor: 'rgb(150, 230, 0)' })),
        node('b', null, { x: 600, y: 0, w: 120, h: 900 }, st({ backgroundColor: 'rgb(0, 0, 0)', clipPath: 'polygon(0px 0px, 40px 0px, 120px 900px, 80px 900px)' })),
      ],
    })
    expect(v.satisfied).toBe(false)
  })
})

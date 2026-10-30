import { describe, expect, it } from 'vitest'
import { topBands, topBandsBrief, verifyTopBands } from '../src/topbands.js'
import type { ShapeMark } from '../src/shapemark.js'

const page = { w: 1280, h: 800 }
const line = (x: number, y: number, w: number): ShapeMark => ({ strokeId: `l${y}`, shape: 'line', box: { x, y: y - 2, w, h: 4 }, from: { x, y }, to: { x: x + w, y } })
const box = (x: number, y: number, w: number, h: number, id = `b${y}`): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })
// hotel booking (round 38 e1): rule under the top bar, a wide search bar, then cards and a calendar panel
const hotel = [line(0, 60, 1270), box(56, 148, 1168, 76), box(56, 290, 712, 186), box(56, 498, 712, 186), box(806, 290, 400, 590)]
const node = (x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}) => ({ id: `${x}-${y}`, rect: { x, y, w, h }, text: '', ...extra })

describe('n116 top bands', () => {
  it('reads a page-wide rule and a wide flat box near the top as bands; cards and tall panels are not', () => {
    const b = topBands(hotel, page)
    expect(b).toEqual([
      { kind: 'rule', top: 0, bottom: 60, x: 0, w: 1270 },
      { kind: 'bar', top: 148, bottom: 224, x: 56, w: 1168 },
    ])
  })
  it('tells the build each band height in px', () => {
    const s = topBandsBrief(hotel, page)
    expect(s).toContain('TOP BANDS')
    expect(s).toContain('y=60px')
    expect(s).toContain('height: 76px')
  })
  it('a short line or a line low on the page is no band', () => {
    expect(topBands([line(40, 60, 300), line(0, 700, 1270)], page)).toEqual([])
  })
  it('passes a page built at the drawn band heights', () => {
    const v = verifyTopBands(hotel, { viewport: page, nodes: [node(0, 0, 1280, 60), node(56, 150, 1168, 74)] })
    expect(v.satisfied).toBe(true)
  })
  it('names a top bar built taller than drawn, with the height to set', () => {
    const v = verifyTopBands(hotel, { viewport: page, nodes: [node(0, 0, 1280, 84), node(56, 172, 1168, 88)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('24px too tall')
    expect(v.reason).toContain('set its height to 60px')
    expect(v.reason).toContain('built at y=172-260px')
  })
  it('a bottom border at the rule counts as the band edge', () => {
    const v = verifyTopBands([line(0, 60, 1270)], { viewport: page, nodes: [node(0, 0, 1280, 61, { style: { borderBottom: '1px rgb(0,0,0)' } })] })
    expect(v.satisfied).toBe(true)
  })
  it('no bands drawn: unverifiable', () => {
    expect(verifyTopBands([box(56, 290, 712, 186)], { viewport: page, nodes: [] }).unverifiable).toBe(true)
  })
})

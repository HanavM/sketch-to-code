import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { barBuilt, barPitchBrief, barRowsHint, barsOf } from '../src/barlabels.js'
import { ringStrokeIds } from '../src/drawnring.js'
import { verifyPageDrift } from '../src/drift.js'
import { inkColoursBrief, verifyInkColours } from '../src/inkcolour.js'
import type { GroundedAction } from '../src/intent2.js'

let id = 0
const node = (rect: DomNode['rect'], style: Partial<DomNode['style']> = {}, text = ''): DomNode => ({
  id: `n${id++}`, tag: text ? 'span' : 'div', srcLoc: null, rect, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(28, 25, 23)', fontSize: '13px', fontWeight: '400', borderRadius: '0', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })
const rgb = (h: string) => `rgb(${String(parseInt(h.slice(1, 3), 16))}, ${String(parseInt(h.slice(3, 5), 16))}, ${String(parseInt(h.slice(5, 7), 16))})`
const walk = (way: number[][]) => {
  const pts: { x: number; y: number }[] = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) pts.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n })
  }
  pts.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]! })
  return pts
}
// round 38 e3 budget (n108): the donut as four coloured arcs, read by the ink pass as four filled outlines
const ARCS = [
  { id: 'o', color: '#f97316', points: walk([[270, 275], [303, 279], [333, 291], [350, 320], [360, 370], [362, 420], [357, 513]]), box: { x: 270, y: 275, w: 134, h: 238 } },
  { id: 't', color: '#0d9488', points: walk([[357, 513], [330, 531], [300, 542], [250, 545], [200, 530], [159, 487]]), box: { x: 159, y: 487, w: 198, h: 58 } },
  { id: 'i', color: '#6366f1', points: walk([[159, 487], [144, 458], [136, 426], [140, 380], [159, 333]]), box: { x: 136, y: 333, w: 23, h: 154 } },
  { id: 'g', color: '#e7e5e4', points: walk([[159, 333], [181, 309], [208, 290], [240, 278], [270, 275]]), box: { x: 159, y: 275, w: 111, h: 58 } },
]
const ringAct = { kind: 'design', targets: [], instruction: 'donut', rejected: [],
  inkColours: ARCS.map((a) => ({ strokeId: a.id, mark: 'outline', paint: 'background', color: a.color, box: a.box, how: 'pen' })) } as unknown as GroundedAction
// the Categories panel: six bars drawn 70px apart
const BARS: Array<[string, string, number, number]> = [['b1', '#f97316', 231, 592], ['b2', '#0d9488', 301, 515], ['b3', '#dc2626', 371, 592], ['b4', '#6366f1', 441, 545], ['b5', '#a8a29e', 511, 491]]
const barAct = { kind: 'design', targets: [], instruction: 'Categories', rejected: [],
  shapeMarks: BARS.map(([strokeId, , y, w]) => ({ strokeId, shape: 'line', box: { x: 594, y, w, h: 0 }, from: { x: 594, y }, to: { x: 594 + w, y } })),
  inkColours: BARS.map(([strokeId, color, y, w]) => ({ strokeId, mark: 'line', paint: 'text', color, box: { x: 594, y, w, h: 0 }, how: 'pen' })) } as unknown as GroundedAction
const barsAt = (off: (k: number) => number) => snap(BARS.map(([, c, y, w], k) => node({ x: 594, y: y + off(k) - 4, w: w - 30, h: 8 }, { backgroundColor: rgb(c) })))

describe('n122: a drawn ring chart is checked as the chart; bar rows keep their drawn pitch', () => {
  it('the ring arcs are known by stroke id', () => {
    expect([...ringStrokeIds(ARCS)].sort()).toEqual(['g', 'i', 'o', 't'])
    expect(ringStrokeIds(undefined).size).toBe(0)
  })
  it('the ink pass no longer tells or checks one filled block per arc', () => {
    const skip = ringStrokeIds(ARCS)
    expect(inkColoursBrief({ actions: [ringAct], pageFill: null } as never)).toMatch(/outline drawn at x 270/)
    expect(inkColoursBrief({ actions: [ringAct], pageFill: null } as never, skip)).toBe('')
    const conic = snap([node({ x: 136, y: 275, w: 226, h: 226 }, { backgroundColor: 'rgba(0, 0, 0, 0)', borderRadius: '50%' })])
    const before = verifyInkColours([ringAct], null as never, conic)
    expect(before.satisfied).toBe(false)
    expect(before.reason).toMatch(/outline drawn at \(270,275\) 134x238 was coloured #f97316/)
    expect(verifyInkColours([ringAct], null as never, conic, skip).unverifiable).toBe(true)
  })
  it('tells a column of bars as rows at the drawn pitch', () => {
    const [line] = barPitchBrief([barAct])
    expect(line).toMatch(/5 bars drawn from x 594 are ROWS OF ONE LIST at the drawn pitch of about 70px/)
    expect(line).toMatch(/y 231, 301, 371, 441, 511/)
    expect(inkColoursBrief({ actions: [barAct], pageFill: null } as never)).toContain('ROWS OF ONE LIST')
    expect(barPitchBrief([{ ...barAct, inkColours: barAct.inkColours!.slice(0, 2) } as GroundedAction])).toEqual([])
  })
  it('a bar built off its line is named with its offset, not as a missing bar', () => {
    const bars = barsOf([barAct])
    expect(barBuilt(bars[0]!, barsAt(() => 0).nodes).ok).toBe(true)
    const low = barBuilt(bars[0]!, barsAt(() => 26).nodes)
    expect(low.ok).toBe(false)
    expect(low.offBy).toBe(26)
    expect(barBuilt(bars[0]!, barsAt(() => 120).nodes).offBy).toBeUndefined()
  })
  it('says whether the whole list starts low or the rows are at the wrong pitch (n121 try 2)', () => {
    const bars = barsOf([barAct])
    expect(barRowsHint(bars, barsAt(() => 24).nodes)).toMatch(/all 5 bar rows are about 24px low .* take 24px out of the space above the first row/)
    expect(barRowsHint(bars, barsAt((k) => 6 + k * 8).nodes)).toMatch(/built at a pitch of about 78px, drawn 70px/)
    expect(barRowsHint(bars, barsAt(() => 0).nodes)).toBeNull()
    const v = verifyInkColours([barAct], null as never, barsAt(() => 24))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/it was built 24px below its drawn line .* all 5 bar rows are about 24px low/)
    expect(v.reason).not.toMatch(/no thin block was built/)
  })
  it('a region drawn inside a big panel (the bar rows) is not checked as a panel of its own (n122 tries 1-2)', () => {
    const panel = { x: 560, y: 111, w: 660, h: 739 }, rows = { x: 594, y: 231, w: 592, h: 350 }
    const placed = [{ x: 56, y: 70, w: 70, h: 16 }, { x: 136, y: 275, w: 226, h: 270 }, panel, rows].map((region, index) => ({ index, region }))
    const at = (x: number, y: number, w: number, h: number) => node({ x, y, w, h })
    const built = snap([at(56, 72, 70, 16), at(136, 280, 226, 266), at(560, 111, 660, 739), at(594, 120, 592, 700)])
    const v = verifyPageDrift(snap([]), built, placed)
    expect(v.satisfied).toBe(true)
    const low = snap([at(56, 72, 70, 16), at(136, 280, 226, 266), at(560, 260, 660, 600), at(594, 380, 592, 340)])
    expect(verifyPageDrift(snap([]), low, placed).reason).toMatch(/action 2 \(a big drawn panel\) top at 260px, drawn at 111px/)
  })
  it('a page-wide region round everything never hides the panel inside it', () => {
    const panel = { x: 560, y: 111, w: 660, h: 739 }
    const placed = [{ x: 40, y: 30, w: 1200, h: 830 }, { x: 56, y: 70, w: 70, h: 16 }, panel].map((region, index) => ({ index, region }))
    const at = (x: number, y: number, w: number, h: number) => node({ x, y, w, h })
    const v = verifyPageDrift(snap([]), snap([at(40, 30, 1200, 830), at(56, 72, 70, 16), at(560, 234, 662, 741)]), placed)
    expect(v.reason).toMatch(/action 2 \(a big drawn panel\) top at 234px, drawn at 111px/)
  })
})

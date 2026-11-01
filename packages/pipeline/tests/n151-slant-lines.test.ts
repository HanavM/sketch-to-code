import { describe, expect, it } from 'vitest'
import type { DomNode } from '@s2c/dom'
import { slantBrief, slantBuilt, slantOf, slantThickness } from '../src/slantline.js'
import { inkColoursBrief } from '../src/inkcolour.js'
import type { GroundedAction } from '../src/intent2.js'

const P = (a: number[][]) => a.map(([x, y]) => ({ x: x!, y: y! }))
let id = 0
const node = (tag: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}): DomNode => ({
  id: `n${id++}`, tag, srcLoc: null, rect, text: '', classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...style },
} as DomNode)

describe('n151: a lone slanted pen line is a thin line, never a filled box', () => {
  it('reads the bike crossbar and kite strings as slanted lines; level, plumb, short and bent strokes not', () => {
    const bar = slantOf(P([[852, 267], [1088, 345]]))!
    expect(bar.from).toEqual({ x: 852, y: 267 })
    expect(bar.length).toBe(249)
    expect(bar.deg).toBeCloseTo(18.3, 0)
    expect(slantOf(P([[933, 603], [880, 392]]))!.from).toEqual({ x: 880, y: 392 })
    expect(slantOf(P([[1075, 447], [1101, 592]]))).not.toBeNull()
    expect(slantOf(P([[70, 185], [585, 185]]))).toBeNull()
    expect(slantOf(P([[70, 185], [585, 200]]))).toBeNull()
    expect(slantOf(P([[100, 100], [104, 300]]))).toBeNull()
    expect(slantOf(P([[0, 0], [20, 20]]))).toBeNull()
    expect(slantOf(P([[0, 0], [100, 100], [200, 0]]))).toBeNull()
  })
  it('takes its thickness from a ring it touches, or thin / thick words', () => {
    expect(slantThickness([], 16)).toBe(16)
    expect(slantThickness(['strings thin'], 16)).toBe(2)
    expect(slantThickness(['thick line'], null)).toBe(10)
    expect(slantThickness([], null)).toBe(3)
  })
  it('tells a rotated line from start to end, never a box', () => {
    const s = { ...slantOf(P([[852, 267], [1088, 345]]))!, thickness: 16 }
    expect(slantBrief(3, '#111111', s, { w: 236, h: 78 })).toMatch(/rotate\(18\.3deg\)/)
    const a = { kind: 'design', targets: [], instruction: 'hero', rejected: [],
      inkColours: [{ strokeId: 's9', mark: 'line', paint: 'border', color: '#111111', box: { x: 852, y: 267, w: 236, h: 78 }, how: 'pen', slant: s }] } as unknown as GroundedAction
    const b = inkColoursBrief({ actions: [a], pageFill: null } as never)
    expect(b).toContain('SLANTED LINE')
    expect(b).toContain('NEVER a filled box')
    expect(b).not.toContain('is filled with')
  })
  it('fails a pen-coloured slab over the box, passes a rotated div and a big panel it sits on', () => {
    const c = { box: { x: 852, y: 267, w: 236, h: 78 }, color: '#111111' }
    expect(slantBuilt(c, [node('div', { x: 860, y: 270, w: 220, h: 70 }, { backgroundColor: 'rgb(17, 17, 17)' })]).ok).toBe(false)
    expect(slantBuilt(c, [node('div', { x: 852, y: 267, w: 236, h: 78 }, { backgroundColor: 'rgb(17, 17, 17)', transform: 'matrix(0.95, 0.31, -0.31, 0.95, 0, 0)' })]).ok).toBe(true)
    expect(slantBuilt(c, [node('div', { x: 0, y: 0, w: 1280, h: 600 }, { backgroundColor: 'rgb(17, 17, 17)' })]).ok).toBe(true)
    expect(slantBuilt(c, [node('div', { x: 860, y: 270, w: 220, h: 70 }, { backgroundColor: 'rgb(255, 212, 64)' })]).ok).toBe(true)
  })
})

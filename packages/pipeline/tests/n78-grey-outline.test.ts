import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { hasFrame, inkColoursBrief, inkGreyOutline, verifyInkColours } from '../src/inkcolour.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'

const node = (id: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}): DomNode => ({
  id, tag: 'div', srcLoc: null, rect, text: '', classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })
// round 38 e1 hotel booking: the search panel drawn in a light grey pen, no tap
const frame: InkColour = { strokeId: 's', mark: 'box', paint: 'border', color: '#d1d5db', box: { x: 57, y: 101, w: 1166, h: 74 }, how: 'pen', frame: true }
const act = (c: InkColour[]): GroundedAction => ({ kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours: c, notes: [] } as unknown as GroundedAction)

describe('n78 a box in a light grey pen with no tap is an outline', () => {
  it('light neutral greys frame; coloured pens, dark ink and the palest grey do not', () => {
    expect(inkGreyOutline('#d1d5db', { w: 1166, h: 74 })).toBe(true)
    expect(inkGreyOutline('#e5e7eb', { w: 300, h: 200 })).toBe(true)
    expect(inkGreyOutline('#9ca3af', { w: 120, h: 40 })).toBe(true)
    expect(inkGreyOutline('#be185d', { w: 150, h: 56 })).toBe(false) // magenta Search button: a fill
    expect(inkGreyOutline('#f9cfe6', { w: 150, h: 100 })).toBe(false) // pale pink photo: a fill
    expect(inkGreyOutline('#111827', { w: 300, h: 200 })).toBe(false)
    expect(inkGreyOutline('#f3f4f6', { w: 300, h: 600 })).toBe(false) // a pale grey sidebar: a fill
    expect(inkGreyOutline('#d1d5db', { w: 10, h: 10 })).toBe(false)
    expect(inkGreyOutline(null, { w: 300, h: 200 })).toBe(false)
  })
  it('the brief asks for a thin grey border and never a grey fill', () => {
    const b = inkColoursBrief({ actions: [act([frame])] })
    expect(b).toContain('OUTLINED block')
    expect(b).toContain('1px border in #d1d5db')
    expect(b).toContain('NEVER filled #d1d5db')
    expect(b).not.toContain('OUTLINED small control')
  })
  it('the page check fails a grey-filled block and passes a white one with a grey border', () => {
    const filled = snap([node('p', { x: 56, y: 100, w: 1168, h: 76 }, { backgroundColor: 'rgb(209, 213, 219)' })])
    const v = verifyInkColours([act([frame])], undefined, filled)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('built filled #d1d5db')
    const bare = snap([node('p', { x: 56, y: 100, w: 1168, h: 76 }, { backgroundColor: 'rgb(255, 255, 255)' })])
    expect(verifyInkColours([act([frame])], undefined, bare).reason).toContain('nothing that size with a border')
    const good = snap([node('p', { x: 56, y: 100, w: 1168, h: 76 }, { backgroundColor: 'rgb(255, 255, 255)', border: '1px rgb(209, 213, 219)' })])
    expect(verifyInkColours([act([frame])], undefined, good).satisfied).toBe(true)
  })
  it('a ring shadow counts as a frame; none / 0px do not', () => {
    expect(hasFrame(node('a', { x: 0, y: 0, w: 1, h: 1 }, { boxShadow: 'rgb(209, 213, 219) 0px 0px 0px 1px' }))).toBe(true)
    expect(hasFrame(node('a', { x: 0, y: 0, w: 1, h: 1 }, { border: '0px none' }))).toBe(false)
    expect(hasFrame(node('a', { x: 0, y: 0, w: 1, h: 1 }))).toBe(false)
  })
})

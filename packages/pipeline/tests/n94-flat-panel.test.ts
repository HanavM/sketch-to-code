import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { inkColoursBrief, notFlat, plainPanel, verifyInkColours } from '../src/inkcolour.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'

const node = (id: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}): DomNode => ({
  id, tag: 'div', srcLoc: null, rect, text: '', classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })
// round 36 c4 florist: a pale pink panel drawn with square corners down the left half, one tap inside
const panel: InkColour = { strokeId: 'p', mark: 'box', paint: 'background', color: '#f5d6e2', box: { x: 2, y: 110, w: 638, h: 788 }, how: 'tap' }
const act = (c: InkColour[], notes: string[] = []): GroundedAction => ({ kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours: c, notes } as unknown as GroundedAction)

describe('a plain drawn panel is built flat (n94)', () => {
  it('a big tapped box with no words asking for a card is a flat panel; small boxes and asked-for cards are not', () => {
    expect(plainPanel(panel, act([panel]))).toBe(true)
    expect(plainPanel(panel, act([panel], ['white rounded card with a soft shadow']))).toBe(false)
    const button = { ...panel, box: { x: 722, y: 560, w: 220, h: 56 } }
    expect(plainPanel(button, act([button]))).toBe(false)
    const fade = { ...panel, fade: { colors: ['#fff', '#000'], css: 'x' } }
    expect(plainPanel(fade, act([fade]))).toBe(false)
  })
  it('the brief says square corners, no shadow, one solid colour', () => {
    const b = inkColoursBrief({ actions: [act([panel])] })
    expect(b).toContain('PLAIN FLAT PANEL')
    expect(b).toContain('border-radius 0')
    expect(b).toContain('no box-shadow')
    expect(b).toContain('#f5d6e2')
    expect(inkColoursBrief({ actions: [act([panel], ['rounded card'])] })).not.toContain('PLAIN FLAT PANEL')
  })
  it('the page check fails a rounded, shadowed panel and passes a flat one', () => {
    const flat = snap([node('l', { x: 0, y: 108, w: 640, h: 792 }, { backgroundColor: 'rgb(245, 214, 226)' })])
    expect(verifyInkColours([act([panel])], undefined, flat).satisfied).toBe(true)
    const card = snap([node('l', { x: 0, y: 108, w: 640, h: 792 }, { backgroundColor: 'rgb(245, 214, 226)', borderRadius: '24px', boxShadow: 'rgba(0, 0, 0, 0.1) 0px 10px 30px 0px' })])
    const v = verifyInkColours([act([panel])], undefined, card)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('corners rounded 24px')
    expect(v.reason).toContain('a drop shadow')
    // a card asked for in words is left alone
    expect(verifyInkColours([act([panel], ['rounded card'])], undefined, card).satisfied).toBe(true)
  })
  it('a no-op shadow or tiny radius is still flat', () => {
    expect(notFlat(node('a', { x: 0, y: 0, w: 1, h: 1 }, { borderRadius: '4px', boxShadow: 'rgba(0, 0, 0, 0) 0px 0px 0px 0px' }))).toBe('')
  })
})

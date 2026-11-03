import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { inkColoursBrief, verifyInkColours } from '../src/inkcolour.js'
import { ringNoted, ringShare, ringThickness, trackColour } from '../src/hollowring.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'

const node = (id: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}, tag = 'div'): DomNode => ({
  id, tag, srcLoc: null, rect, text: '', classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })
// round 39 e3 focus timer: the timer ring drawn in a red pen, no tap, "red arc 3/4 on pink track"
const timerNotes = ['17:30 huge, Session 2 of 4; red arc 3/4 on pink track']
const ring: InkColour = { strokeId: 's5', mark: 'ring', paint: 'border', color: '#e11d48', box: { x: 170, y: 170, w: 400, h: 400 }, how: 'pen',
  hollow: { thickness: ringThickness(400), share: ringShare(timerNotes), track: trackColour(timerNotes) } }
const act = (c: InkColour[]): GroundedAction => ({ kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours: c, notes: [] } as unknown as GroundedAction)

describe('n129 a ring noted as an arc, track or progress is hollow', () => {
  it('reads the ring words, share and track from the round 39 notes', () => {
    expect(ringNoted(timerNotes)).toBe(true)
    expect(ringNoted(['22° Heating, orange arc over grey track'])).toBe(true)
    expect(ringNoted(['lime badge NEW'])).toBe(false)
    expect(ringNoted(['orange sun, solid'])).toBe(false)
    expect(ringNoted(['avatar ring'])).toBe(false)
    expect(ringNoted(['17:30 huge'])).toBe(false)
    expect(ringShare(timerNotes)).toBe(0.75)
    expect(ringShare(['22° Heating, orange arc over grey track'])).toBeNull()
    expect(ringShare(['progress ring 60%'])).toBe(0.6)
    expect(trackColour(timerNotes)).toBe('pink')
    expect(trackColour(['22° Heating, orange arc over grey track'])).toBe('grey')
    expect(ringThickness(400)).toBe(24)
    expect(ringThickness(300)).toBe(18)
    expect(ringThickness(80)).toBe(8)
  })
  it('the brief asks for a hollow ring, never a filled disc', () => {
    const b = inkColoursBrief({ actions: [act([ring])] })
    expect(b).toContain('HOLLOW RING')
    expect(b).toContain('NEVER filled #e11d48')
    expect(b).toContain('75% of the ring')
    expect(b).toContain('in pink')
    expect(b).toContain('stroke-width 24')
    expect(b).not.toContain('is filled with #e11d48')
  })
  it('the page check fails the n127 solid disc and passes an SVG ring or a disc with a hole', () => {
    const disc = snap([node('d', { x: 170, y: 169, w: 399, h: 399 }, { backgroundColor: 'rgb(225, 29, 72)', borderRadius: '50%' })])
    const v = verifyInkColours([act([ring])], undefined, disc)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('solid #e11d48 disc')
    const conic = snap([node('d', { x: 170, y: 169, w: 399, h: 399 }, { backgroundImage: 'conic-gradient(rgb(225, 29, 72) 0deg 270deg, rgb(253, 226, 230) 270deg)', borderRadius: '50%' })])
    expect(verifyInkColours([act([ring])], undefined, conic).satisfied).toBe(false)
    const holed = snap([
      node('d', { x: 170, y: 169, w: 399, h: 399 }, { backgroundImage: 'conic-gradient(rgb(225, 29, 72) 0deg 270deg, rgb(253, 226, 230) 270deg)', borderRadius: '50%' }),
      node('h', { x: 194, y: 193, w: 351, h: 351 }, { backgroundColor: 'rgb(255, 240, 241)', borderRadius: '50%' }),
    ])
    expect(verifyInkColours([act([ring])], undefined, holed).satisfied).toBe(true)
    const svg = snap([node('s', { x: 170, y: 170, w: 400, h: 400 }, {}, 'svg'), node('c', { x: 182, y: 182, w: 376, h: 376 }, {}, 'circle')])
    expect(verifyInkColours([act([ring])], undefined, svg).satisfied).toBe(true)
    expect(verifyInkColours([act([ring])], undefined, snap([])).reason).toContain('nothing about 400px across')
  })
})

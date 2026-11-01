import { describe, expect, it } from 'vitest'
import type { DomNode } from '@s2c/dom'
import { neutralPen, outlineRingPen, outlineRingThickness } from '../src/hollowring.js'
import { inkColoursBrief, outlineRingBuilt } from '../src/inkcolour.js'
import { shapeOf } from '../src/shapemark.js'
import type { GroundedAction } from '../src/intent2.js'

// round 45 c4 bike repair: a wheel drawn as a hand ring in the black pen, untapped
const WHEEL = [[820, 200], [912, 238], [950, 330], [912, 422], [820, 460], [728, 422], [690, 330], [728, 238], [820, 200]].map(([x, y]) => ({ x: x!, y: y! }))
const BOX = { x: 690, y: 200, w: 260, h: 260 }
let id = 0
const node = (tag: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}, parent: string | null = null): DomNode => ({
  id: `n${id++}`, tag, srcLoc: null, rect, text: '', classes: [], parent, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...style },
} as DomNode)

describe('n204: a big ring in a neutral pen with no tap is an outline ring', () => {
  it('reads black, grey and white pens as neutral, hues and tinted pale pens not', () => {
    expect(neutralPen('#111111')).toBe(true)
    expect(neutralPen('#4b5563')).toBe(true)
    expect(neutralPen('#ffffff')).toBe(true)
    expect(neutralPen('#ffd440')).toBe(false)
    expect(neutralPen('#efe0d0')).toBe(false)
  })
  it('takes the bike wheel and a mixer knob, not an avatar, a dot or a long pill', () => {
    expect(shapeOf(WHEEL)?.shape).toBe('ellipse')
    expect(outlineRingPen('#111111', BOX)).toBe(true)
    expect(outlineRingPen('#111111', BOX, ['wheels thick black outline rings only, no fill or spokes'])).toBe(true)
    expect(outlineRingPen('#4b5563', { w: 60, h: 60 })).toBe(true)
    expect(outlineRingPen('#111111', BOX, ['avatar photo'])).toBe(false)
    expect(outlineRingPen('#111111', BOX, ['solid black dot'])).toBe(false)
    expect(outlineRingPen('#111111', { w: 30, h: 30 })).toBe(false)
    expect(outlineRingPen('#ffffff', { w: 220, h: 70 })).toBe(false)
    expect(outlineRingPen('#c63a2e', BOX)).toBe(false)
    expect(outlineRingThickness(260)).toBe(16)
    expect(outlineRingThickness(60)).toBe(4)
  })
  it('tells the build a whole ring, nothing inside, never clipped', () => {
    const a = { kind: 'design', targets: [], instruction: 'hero', rejected: [],
      inkColours: [{ strokeId: 's9', mark: 'ring', paint: 'border', color: '#111111', box: BOX, how: 'pen', outlineRing: { thickness: 16 } }] } as unknown as GroundedAction
    const b = inkColoursBrief({ actions: [a], pageFill: null } as never)
    expect(b).toContain('an OUTLINE RING')
    expect(b).toContain('no spokes')
    expect(b).toContain('never clipped')
    expect(b).not.toContain('filled with')
  })
  it('fails a filled disc, an svg ring spilling past its svg, passes a bordered round div', () => {
    const c = { box: BOX, color: '#111111' }
    expect(outlineRingBuilt(c, [node('div', BOX, { backgroundColor: 'rgb(17, 17, 17)', borderRadius: '50%' })]).ok).toBe(false)
    const svg = node('svg', { x: 690, y: 210, w: 260, h: 240 })
    const v = outlineRingBuilt(c, [svg, node('circle', BOX, { svgStroke: 'rgb(17, 17, 17)', svgFill: 'none' }, svg.id)])
    expect(v.ok).toBe(false)
    expect(v.why).toMatch(/cut flat/)
    const svg2 = node('svg', BOX)
    expect(outlineRingBuilt(c, [svg2, node('circle', { x: 698, y: 208, w: 244, h: 244 }, { svgStroke: 'rgb(17, 17, 17)', svgFill: 'none' }, svg2.id)]).ok).toBe(true)
    expect(outlineRingBuilt(c, [node('div', BOX, { border: '16px rgb(17, 17, 17)', borderRadius: '50%' })]).ok).toBe(true)
    expect(outlineRingBuilt(c, []).ok).toBe(false)
  })
})

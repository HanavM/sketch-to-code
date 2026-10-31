import { describe, expect, it } from 'vitest'
import { inkColoursBrief, inkLightOutline, surfaceBehind } from '../src/inkcolour.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'

const rect = (id: string, x: number, y: number, w: number, h: number, color: string | null = null) => ({
  id, color, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + 2, y: y + 2 }],
})
const act = (c: InkColour[]): GroundedAction => ({ kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours: c, notes: [] } as unknown as GroundedAction)

describe('n131 a light coloured pen box with no tap on a light surface is an outline', () => {
  it('light tinted pens on white or pale surfaces outline', () => {
    expect(inkLightOutline('#cbd5e1', { w: 316, h: 52 }, '#ffffff')).toBe(true) // e1 slate inputs
    expect(inkLightOutline('#bbf7d0', { w: 740, h: 186 }, '#effcf3')).toBe(true) // e4 mint slot area on mint page
    expect(inkLightOutline('#bbf7d0', { w: 150, h: 64 }, '#effcf3')).toBe(true) // e4 Luna pill
    expect(inkLightOutline('#fbcfe8', { w: 436, h: 51 }, '#ffffff')).toBe(true) // e3 dashed add box
  })
  it('strong, dark and the palest pens, tiny boxes, dark surfaces and fill notes keep the fill', () => {
    expect(inkLightOutline('#16a34a', { w: 150, h: 64 }, '#effcf3')).toBe(false) // mid green pill
    expect(inkLightOutline('#f97316', { w: 150, h: 52 }, '#ffffff')).toBe(false) // orange button
    expect(inkLightOutline('#111827', { w: 300, h: 200 }, '#ffffff')).toBe(false)
    expect(inkLightOutline('#f0fdf4', { w: 300, h: 600 }, '#ffffff')).toBe(false) // palest tint: a pale panel
    expect(inkLightOutline('#bbf7d0', { w: 10, h: 10 }, '#ffffff')).toBe(false)
    expect(inkLightOutline('#bbf7d0', { w: 300, h: 200 }, '#0f172a')).toBe(false) // light card on a dark page
    expect(inkLightOutline('#bbf7d0', { w: 300, h: 200 }, '#ffffff', ['mint filled panel'])).toBe(false)
    expect(inkLightOutline(null, { w: 300, h: 200 }, '#ffffff')).toBe(false)
  })
  it('the surface behind is the nearest filled holder, looked through light-pen holders, else the page tap, else white', () => {
    const bar = rect('bar', 60, 110, 1160, 76, '#ffffff')
    const input = rect('in', 72, 122, 316, 52, '#cbd5e1')
    const page = { target: null, color: '#1e3a8a', dotId: 'd0' }
    expect(surfaceBehind(input, [bar, input], [page, { target: 'bar', color: '#ffffff', dotId: 'd1' }])).toBe('#ffffff')
    // the white bar untapped still counts by its white pen
    expect(surfaceBehind(input, [bar, input], [page])).toBe('#ffffff')
    // no holder: the page tap
    const slots = rect('sl', 60, 410, 740, 186, '#bbf7d0')
    expect(surfaceBehind(slots, [slots], [{ target: null, color: '#effcf3', dotId: 'd' }])).toBe('#effcf3')
    expect(surfaceBehind(slots, [slots], [])).toBe('#ffffff')
    // a light-pen holder is itself an outline, so it is looked through to the dark page
    const frame = rect('fr', 40, 390, 800, 240, '#cbd5e1')
    expect(surfaceBehind(slots, [frame, slots], [{ target: null, color: '#0f172a', dotId: 'd' }])).toBe('#0f172a')
    // a dark-pen holder fills
    const dark = rect('dk', 40, 390, 800, 240, '#1f2937')
    expect(surfaceBehind(slots, [dark, slots], [])).toBe('#1f2937')
  })
  it('the brief says light pen outline in the pen colour, dashed when noted, never a tint', () => {
    const c: InkColour = { strokeId: 's', mark: 'box', paint: 'border', color: '#bbf7d0', box: { x: 60, y: 410, w: 740, h: 186 }, how: 'pen', frame: true }
    const b = inkColoursBrief({ actions: [act([c])] })
    expect(b).toContain('in a light pen (no colour tapped)')
    expect(b).toContain('1px border in #bbf7d0 (dashed if a note says dashed)')
    expect(b).toContain('NEVER filled #bbf7d0')
  })
})

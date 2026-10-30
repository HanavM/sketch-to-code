import { describe, expect, it } from 'vitest'
import { panelFeet, panelFootBrief, verifyPanelFeet } from '../src/panelfoot.js'
import { topBandsBrief } from '../src/topbands.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (x: number, y: number, w: number, h: number, id = `b${x}-${y}`): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })
const line = (x: number, y: number, w: number): ShapeMark => ({ strokeId: `l${y}`, shape: 'line', box: { x, y: y - 2, w, h: 4 }, from: { x, y }, to: { x: x + w, y } })
// hotel booking (round 38 e1, as drawn in n108): cards on the left, a tall calendar panel with the Reserve button at its bottom
const panel = box(817, 251, 406, 598)
const button = box(843, 767, 356, 56)
const hotel = [line(2, 72, 1276), box(57, 101, 1166, 74), box(1063, 110, 150, 56), line(56, 221, 168), box(57, 251, 718, 188), box(57, 461, 718, 188), panel, button]
const n = (x: number, y: number, w: number, h: number, text = '') => ({ rect: { x, y, w, h }, text })
// a month grid: 5 rows of 7 numbers from y0 with a row pitch
const grid = (y0: number, pitch: number) => Array.from({ length: 30 }, (_, i) => n(840 + (i % 7) * 50, y0 + Math.floor(i / 7) * pitch, 20, 16, String(i + 1)))

describe('n117 panel feet', () => {
  it('reads a smaller box drawn at the bottom of a tall box as its foot', () => {
    expect(panelFeet(hotel)).toEqual([{ panel: { x: 817, y: 251, w: 406, h: 598 }, foot: { x: 843, y: 767, w: 356, h: 56 } }])
  })
  it('a box in the middle of a panel, or a panel whose lower part is drawn full, has no foot', () => {
    expect(panelFeet([panel, box(843, 450, 356, 56)])).toEqual([])
    expect(panelFeet([panel, button, box(843, 640, 356, 100)])).toEqual([])
    expect(panelFeet([box(57, 251, 718, 188), box(80, 400, 400, 30)])).toEqual([]) // a card is under 200px tall
  })
  it('tells the build the foot is pinned and the grid keeps natural rows', () => {
    const s = panelFootBrief(hotel)
    expect(s).toContain('PANEL FEET')
    expect(s).toContain('y=767px')
    expect(s).toContain('does NOT stretch')
  })
  it('passes a natural calendar with the button at its drawn place', () => {
    const v = verifyPanelFeet(hotel, { nodes: [n(817, 251, 406, 598), ...grid(330, 46), n(843, 770, 356, 56, 'Reserve · 4 nights')] })
    expect(v.satisfied).toBe(true)
  })
  it('names a stretched grid and a button pushed low (n116 try 2)', () => {
    const v = verifyPanelFeet(hotel, { nodes: [n(817, 251, 406, 598), ...grid(400, 58), n(843, 798, 356, 56, 'Reserve · 4 nights')] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('31px low')
    expect(v.reason).toContain('rows are 58px apart')
  })
  it('no foot drawn: unverifiable', () => {
    expect(verifyPanelFeet([panel], { nodes: [] }).unverifiable).toBe(true)
  })
  it('top bands tell the gap to the first thing drawn under the last band', () => {
    const s = topBandsBrief(hotel, { w: 1280, h: 870 })
    expect(s).toContain('first thing drawn starts at y=219px')
    expect(s).toContain('leave exactly 44px')
  })
})

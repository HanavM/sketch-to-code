import { describe, expect, it } from 'vitest'
import { holdsBoxes, inkColoursBrief, inkDarkOutline, penFrameBox, selectedChip } from '../src/inkcolour.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'

const rect = (id: string, x: number, y: number, w: number, h: number, color: string) =>
  ({ id, color, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + 1, y: y + 1 }] })

describe('n141: a pale or grey pen box with no tap on a dark surface is an outline', () => {
  it('observatory: white pen button on a navy page is an outline', () => {
    expect(inkDarkOutline('#ffffff', { w: 220, h: 56 }, '#0f172a')).toBe(true)
  })
  it('music player: #555 grey list box on a near-black page is an outline', () => {
    expect(inkDarkOutline('#555555', { w: 900, h: 324 }, '#121212')).toBe(true)
  })
  it('video call: a #3f3f46 tile close to the page stays filled', () => {
    expect(inkDarkOutline('#3f3f46', { w: 420, h: 340 }, '#18181b')).toBe(false)
  })
  it('a strong hue on a dark page stays a block (red pass button)', () => {
    expect(inkDarkOutline('#e11d48', { w: 100, h: 30 }, '#0a0a0a')).toBe(false)
  })
  it('a white pen box on a light page is not touched (white cards stay white)', () => {
    expect(inkDarkOutline('#ffffff', { w: 300, h: 100 }, '#f1f5f9')).toBe(false)
  })
  it('a note asking for a solid fill keeps the fill; a pale fill does not', () => {
    expect(inkDarkOutline('#ffffff', { w: 220, h: 56 }, '#0f172a', ['solid white button'])).toBe(false)
    expect(inkDarkOutline('#ffffff', { w: 220, h: 56 }, '#0f172a', ['pale fill'])).toBe(true)
  })
  it('a white pen bar holding inputs on a blue hero stays a bar (it holds drawn boxes)', () => {
    const bar = rect('bar', 60, 110, 1160, 76, '#ffffff'), input = rect('in', 72, 122, 316, 52, '#cbd5e1')
    const page = { target: null, color: '#1e3a8a' }
    expect(holdsBoxes(bar, [bar, input])).toBe(true)
    expect(penFrameBox(bar, [bar, input], [page], [], { w: 1160, h: 76 })).toBe(false)
    expect(holdsBoxes(input, [bar, input])).toBe(false)
  })
  it('a pale mint pen box on a dark page stays a card (only whites and greys)', () => {
    expect(inkDarkOutline('#bbf7d0', { w: 150, h: 64 }, '#0f172a')).toBe(false)
  })
  it('penFrameBox: a white pen button on a dark tapped page is a frame, tapped it is not', () => {
    const b = rect('b', 90, 490, 220, 56, '#ffffff')
    expect(penFrameBox(b, [b], [{ target: null, color: '#0f172a' }], [], { w: 220, h: 56 })).toBe(true)
    expect(penFrameBox(b, [b], [{ target: null, color: '#0f172a' }, { target: 'b', color: '#ffffff' }], [], { w: 220, h: 56 })).toBe(false)
  })
})

describe('n141: a strong pen card noted picked or pale fill is a selected card, not a solid block', () => {
  it('wizard Team card: "Team picked, pale fill" on a 224x240 purple card', () => {
    const s = selectedChip('#7c3aed', { w: 224, h: 240 }, ['3 plans: ... Team picked, pale fill'])
    expect(s).not.toBeNull()
    expect(s!.tint).toMatch(/^#e/i)
  })
  it('"pale fill" alone is enough; "solid fill" is not', () => {
    expect(selectedChip('#7c3aed', { w: 224, h: 240 }, ['pale fill'])).not.toBeNull()
    expect(selectedChip('#7c3aed', { w: 224, h: 240 }, ['solid fill'])).toBeNull()
    expect(selectedChip('#7c3aed', { w: 224, h: 240 }, ['Team plan'])).toBeNull()
  })
  it('a page-sized band is never a chip', () => {
    expect(selectedChip('#be3a8a', { w: 1276, h: 336 }, ['active'])).toBeNull()
  })
})

describe('n141: the brief tells a dark-surface frame to be see-through', () => {
  it('says transparent, never white', () => {
    const ink: InkColour = { strokeId: 'b', mark: 'box', paint: 'border', color: '#ffffff', box: { x: 90, y: 490, w: 220, h: 56 }, how: 'pen', frame: true, frameOn: '#0f172a' }
    const a = { kind: 'add', inkColours: [ink] } as unknown as GroundedAction
    const brief = inkColoursBrief({ actions: [a] } as never)
    expect(brief).toMatch(/TRANSPARENT/)
    expect(brief).toMatch(/#0f172a/)
  })
})

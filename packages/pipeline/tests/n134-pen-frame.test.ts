import { describe, expect, it } from 'vitest'
import { penFrameBox } from '../src/inkcolour.js'

const rect = (id: string, x: number, y: number, w: number, h: number, color: string | null = null) => ({
  id, color, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + 2, y: y + 2 }],
})
const page = { target: null, color: '#effcf3', dotId: 'd0' }

describe('n134 a light pen box with no tap is a frame even inside a depicted group', () => {
  it('the Luna pill (light mint pen on a mint page) and a grey pen box are frames', () => {
    const luna = rect('luna', 226, 170, 150, 64, '#bbf7d0')
    expect(penFrameBox(luna, [luna], [page], ['Luna'], { w: 150, h: 64 })).toBe(true)
    const grey = rect('g', 60, 60, 200, 40, '#d1d5db')
    expect(penFrameBox(grey, [grey], [], [], { w: 200, h: 40 })).toBe(true)
  })
  it('tapped boxes, strong pens, fill notes, no pen and dark surfaces are not', () => {
    const luna = rect('luna', 226, 170, 150, 64, '#bbf7d0')
    expect(penFrameBox(luna, [luna], [page, { target: 'luna', color: '#bbf7d0', dotId: 'd1' }], [], { w: 150, h: 64 })).toBe(false)
    const bis = rect('bis', 60, 170, 150, 64, '#16a34a')
    expect(penFrameBox(bis, [bis], [page], ['Biscuit selected'], { w: 150, h: 64 })).toBe(false)
    expect(penFrameBox(luna, [luna], [page], ['Luna, filled mint'], { w: 150, h: 64 })).toBe(false)
    const grey = rect('g', 60, 60, 200, 40, '#d1d5db')
    expect(penFrameBox(grey, [grey], [], ['solid grey bar'], { w: 200, h: 40 })).toBe(false)
    expect(penFrameBox(rect('n', 0, 0, 100, 50, null), [], [], [], { w: 100, h: 50 })).toBe(false)
    expect(penFrameBox(luna, [luna], [{ target: null, color: '#0f172a', dotId: 'd' }], [], { w: 150, h: 64 })).toBe(false)
  })
})

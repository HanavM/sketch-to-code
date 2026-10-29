import { describe, expect, it } from 'vitest'
import { endSide, lineEnds, lineEndsBrief, verifyLineEnds } from '../src/lineends.js'
import { markTextPlaces, textPlaceBrief } from '../src/textplace.js'
import type { ShapeMark } from '../src/shapemark.js'

// round 35 e4 (pharmacy): one rule across the page at y 75, logo typed over its left end, links over its right
const header = (): ShapeMark => ({ strokeId: 's1', shape: 'line', box: { x: 2, y: 75, w: 1276, h: 0 }, from: { x: 2, y: 75 }, to: { x: 1278, y: 75 } } as ShapeMark)
const logo = { text: 'wellcare, teal bold', at: { x: 107, y: 38 }, focus: ['s1'] }
const links = { text: 'Prescriptions  Orders  Help, grey', at: { x: 1100, y: 38 }, focus: ['s1'] }

let k = 0
const leaf = (text: string, x: number, w: number, y = 30) => ({ id: `n${String(k++)}`, tag: 'span', text, rect: { x, y, w, h: 20 }, textBox: { x, y, w, h: 20 } })

describe('words at the ends of a long line keep their sides (n81)', () => {
  it('reads each note\'s side from where it was typed along the line', () => {
    expect(endSide(107, 2, 1278)).toBe('left')
    expect(endSide(640, 2, 1278)).toBe('centre')
    expect(endSide(1100, 2, 1278)).toBe('right')
    const ends = lineEnds(header(), [links, logo], 1280)!
    expect(ends.map((e) => e.side)).toEqual(['left', 'right'])
    expect(ends[0]!.text).toBe('wellcare, teal bold')
  })
  it('keeps both notes, not only the first, and never tells the line to centre them', () => {
    const m = header()
    markTextPlaces([m], [logo, links], 1280)
    expect(m.ends?.length).toBe(2)
    expect(m.words).toBeUndefined()
    expect(textPlaceBrief([{ shapeMarks: [m] }], { w: 1280, h: 900 })).not.toContain('centre the words on x 640')
    const brief = lineEndsBrief([{ shapeMarks: [m] }])
    expect(brief).toContain('"wellcare, teal bold" typed at its LEFT end')
    expect(brief).toContain('"Prescriptions  Orders  Help, grey" typed at its RIGHT end')
    expect(brief).toContain('bottom edge of a bar about 75px tall')
  })
  it('leaves a single note on a long line (a heading sized by its line) as it was', () => {
    const m = header()
    markTextPlaces([m], [logo], 1280)
    expect(m.ends).toBeUndefined()
    expect(m.words).toBe('wellcare, teal bold')
    // and a short line with two notes is no rule
    const short = { ...header(), box: { x: 64, y: 140, w: 300, h: 0 }, from: { x: 64, y: 140 }, to: { x: 364, y: 140 } } as ShapeMark
    expect(lineEnds(short, [logo, links], 1280)).toBeNull()
  })
  it('fails a header built centred together and passes one built at its ends', () => {
    const m = header()
    markTextPlaces([m], [logo, links], 1280)
    const centred = { nodes: [leaf('wellcare', 520, 80), leaf('Prescriptions', 620, 90), leaf('Orders', 720, 50), leaf('Help', 780, 40)] }
    const v = verifyLineEnds([m], centred)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('LEFT end')
    expect(v.reason).toContain('RIGHT end')
    const split = { nodes: [leaf('wellcare', 32, 80), leaf('Prescriptions', 1010, 90), leaf('Orders', 1110, 50), leaf('Help', 1180, 40)] }
    expect(verifyLineEnds([m], split).satisfied).toBe(true)
    expect(verifyLineEnds([header()], split).unverifiable).toBe(true)
  })
})

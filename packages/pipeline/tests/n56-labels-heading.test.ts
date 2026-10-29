import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { columnOf, textPlaceBrief, verifyTextPlace } from '../src/textplace.js'
import { lineAsksBig, spanFontPx, verifyLineSpan } from '../src/linespan.js'

const VP = { w: 1280, h: 900 }
// round 33 c4 herb farm, as drawn in n49
const ring = (): ShapeMark => ({ strokeId: 'r1', shape: 'ellipse', box: { x: 250, y: 360, w: 120, h: 120 } })
const line = (id: string, x0: number, x1: number, y: number, words?: string): ShapeMark =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, ...(words ? { words } : {}) })
const node = (text: string, tb: { x: number; y: number; w: number; h: number }, fontSize?: string) =>
  ({ id: text, tag: 'p', text, rect: tb, textBox: tb, ...(fontSize ? { style: { fontSize } } : {}) })

describe('a label drawn centred under a ring is centred on it (n56)', () => {
  it('finds the ring over a centred label line, and over a second label row', () => {
    const marks = [ring(), line('l1', 284, 336, 522, 'Basil'), line('l2', 253, 367, 550, 'Sweet and leafy')]
    expect(columnOf(marks[1]!, marks)?.strokeId).toBe('r1')
    expect(columnOf(marks[2]!, marks)?.strokeId).toBe('r1')
  })
  it('a line off the ring centre, or far below, is not its label', () => {
    expect(columnOf(line('l', 250, 330, 522), [ring()])).toBeNull()
    expect(columnOf(line('l', 284, 336, 700), [ring()])).toBeNull()
  })
  it('tells the label to centre on the ring, and checks it', () => {
    const marks = [ring(), line('l1', 284, 336, 522, 'Basil')]
    const brief = textPlaceBrief([{ shapeMarks: marks }], VP)
    expect(brief).toMatch(/CENTRED on x 310/)
    expect(brief).not.toMatch(/LEFT-aligned/)
    const bad = verifyTextPlace(marks, { nodes: [node('Basil', { x: 250, y: 510, w: 40, h: 20 })] }, VP)
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/centre them on x 310/)
    const good = verifyTextPlace(marks, { nodes: [node('Basil', { x: 290, y: 510, w: 40, h: 20 })] }, VP)
    expect(good.satisfied).toBe(true)
  })
})

describe('a short phrase on a long line is a heading sized by the line (n56)', () => {
  it('reads the size from the line, not only from a size word', () => {
    expect(lineAsksBig('Fresh herbs, picked this morning', 916)).toBe(true)
    expect(lineAsksBig('Grown in the valley and on your table the same day.', 460)).toBe(false)
    expect(lineAsksBig('Basil', 52)).toBe(false)
    expect(spanFontPx('Fresh herbs, picked this morning', 916)).toBeGreaterThan(44)
  })
  it('tells it before the build and checks the span after', () => {
    const h = line('h', 182, 1098, 226, 'Fresh herbs, picked this morning')
    expect(textPlaceBrief([{ shapeMarks: [h] }], VP)).toMatch(/the line sets its SIZE/)
    const short = verifyLineSpan([h], { nodes: [node('Fresh herbs, picked this morning', { x: 352, y: 204, w: 577, h: 40 }, '28px')] })
    expect(short.satisfied).toBe(false)
    expect(short.reason).toMatch(/font-size from 28px to about 44px/)
    const sub = line('s', 410, 870, 276, 'Grown in the valley and on your table the same day.')
    expect(textPlaceBrief([{ shapeMarks: [sub] }], VP)).not.toMatch(/sets its SIZE/)
  })
  it('a stacked multi-line heading is left to the stack check', () => {
    const h = line('h', 182, 1098, 226, 'Fresh herbs, picked this morning')
    expect(textPlaceBrief([{ shapeMarks: [h], textSize: [{ lines: 2, strokes: ['h'] }] }], VP)).not.toMatch(/sets its SIZE/)
  })
})

import { verifyShapeMarks } from '../src/shapemark.js'
describe('a row of rings built high together is a shift (n56)', () => {
  const rings: ShapeMark[] = [250, 581, 910].map((x, i) => ({ strokeId: `r${i}`, shape: 'ellipse', box: { x, y: 360, w: 120, h: 120 } }))
  const before = { nodes: [{ id: 'm', tag: 'main', rect: { x: 0, y: 0, w: 1280, h: 900 } }] }
  const disc = (id: string, x: number, y: number) => ({ id, tag: 'div', rect: { x, y, w: 120, h: 120 } })
  it('fails when all three sit 24px high, inside each ring\'s own slack', () => {
    const v = verifyShapeMarks(rings, before, { nodes: [...before.nodes, disc('a', 250, 336), disc('b', 581, 336), disc('c', 910, 336)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/row of 3 rings drawn at y 360 was built 24px too high/)
  })
  it('passes when they sit near their drawn tops, or scatter', () => {
    expect(verifyShapeMarks(rings, before, { nodes: [...before.nodes, disc('a', 250, 356), disc('b', 581, 362), disc('c', 910, 360)] }).satisfied).toBe(true)
    expect(verifyShapeMarks(rings, before, { nodes: [...before.nodes, disc('a', 250, 340), disc('b', 581, 376), disc('c', 910, 360)] }).satisfied).toBe(true)
  })
})

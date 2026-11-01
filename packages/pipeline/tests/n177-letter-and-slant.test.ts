import { describe, it, expect } from 'vitest'
import { isAreaNote, bigWordOf, markAreasAndEdges } from '../src/areas.js'
import { slantedQuad, outlineMark } from '../src/outline.js'
import { shapeOf } from '../src/shapemark.js'
import type { ShapeMark } from '../src/shapemark.js'

const pts = (a: number[][]) => a.map(([x, y]) => ({ x: x!, y: y! }))

describe('n177: one giant letter in a box is that letter, filling the box', () => {
  it('reads a single named letter as the big word', () => {
    const t = 'giant red serif letter A filling the box'
    expect(isAreaNote(t)).toBe(true)
    expect(bigWordOf(t)).toBe('A')
    expect(bigWordOf('huge initial M, navy')).toBe('M')
    expect(bigWordOf('huge outlined 09, white')).toBe('09') // unchanged
    expect(isAreaNote('letter box for the newsletter')).toBe(false) // no big word asked
  })
  it('marks the box an area with the letter as its word', () => {
    const m: ShapeMark = { strokeId: 'b', shape: 'box', box: { x: 640, y: 200, w: 440, h: 430 } }
    markAreasAndEdges([m], [{ text: 'giant red serif letter A filling the box', focus: ['b'] }], { w: 1280, h: 900 })
    expect(m.area).toBe(true)
    expect(m.word).toBe('A')
  })
})

describe('n177: a filled shape with a slanted side keeps the slant', () => {
  const panel = pts([[755, 2], [1278, 2], [1278, 898], [640, 898], [755, 2]])
  it('the climbing-gym panel is a slanted quad, not an upright box', () => {
    expect(shapeOf(panel)?.shape).toBe('box') // the box test alone passes it...
    const q = slantedQuad(panel)
    expect(q).not.toBeNull() // ...but its top-left corner is 115px empty
    const om = outlineMark('p', panel)!
    expect(om.outline!.points.some((p) => p.x === 755 && p.y === 2)).toBe(true)
  })
  it('a plain box, a box with soft corners and a small box stay boxes', () => {
    expect(slantedQuad(pts([[100, 100], [700, 100], [700, 500], [100, 500], [100, 100]]))).toBeNull()
    // every corner cut by ~25px (a rough round-cornered box)
    expect(slantedQuad(pts([[125, 100], [675, 100], [700, 125], [700, 475], [675, 500], [125, 500], [100, 475], [100, 125], [125, 100]]))).toBeNull()
    expect(slantedQuad(pts([[100, 100], [190, 100], [190, 180], [80, 180], [100, 100]]))).toBeNull()
  })
})

import { verifyAreaWords } from '../src/areas.js'
describe('n177: a single letter is checked by its size, not its line box', () => {
  const m: ShapeMark = { strokeId: 'b', shape: 'box', box: { x: 645, y: 199, w: 438, h: 431 }, area: true, word: 'A' }
  const node = (fs: number) => ({ id: 'a', tag: 'span', parent: null, text: 'A', rect: { x: 645, y: 199, w: 438, h: 431 },
    textBox: { x: 740, y: 230, w: 250, h: 416 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', fontSize: `${fs}px` } })
  it('fails a half-size A whose line box looks full', () => {
    const v = verifyAreaWords([m], { nodes: [node(320)], viewport: { w: 1280, h: 900 } })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/font-size about 59\dpx/)
  })
  it('passes an A at the filling size', () => {
    expect(verifyAreaWords([m], { nodes: [node(580)], viewport: { w: 1280, h: 900 } }).satisfied).toBe(true)
  })
})

describe('n177: a filling A with a tall line box is not spilling', () => {
  const m: ShapeMark = { strokeId: 'b', shape: 'box', box: { x: 645, y: 199, w: 438, h: 431 }, area: true, word: 'A' }
  it('passes the 599px A whose line box is 689px tall', () => {
    const n = { id: 'a', tag: 'span', parent: null, text: 'A', rect: { x: 645, y: 199, w: 438, h: 431 },
      textBox: { x: 691, y: 70, w: 347, h: 689 }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', fontSize: '599px' } }
    expect(verifyAreaWords([m], { nodes: [n], viewport: { w: 1280, h: 900 } }).satisfied).toBe(true)
  })
})

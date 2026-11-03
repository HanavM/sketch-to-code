import { describe, expect, it } from 'vitest'
import { shapeOf, type ShapeMark } from '../src/shapemark.js'
import { eachBrief, glyphOf, markEach, markGlyphs, verifyEach, verifyGlyphs } from '../src/each.js'
import { markSolids } from '../src/solids.js'
// @ts-expect-error — plain .mjs bench module, no types
import { walk, jitter } from '../../../tests/bench/lib/draw.mjs'

type P = { x: number; y: number }
const hand = (wp: number[][], seed = 1): P[] => jitter(walk(wp.map(([x, y]) => ({ x, y })), 6), 0.9, seed)
const NAVY = [[708, 192], [1045, 150], [1070, 370], [735, 410], [708, 192]]
const BLUE = [[790, 300], [1126, 322], [1115, 518], [775, 515], [790, 300]]
const PINK = [[836, 466], [1172, 452], [1184, 672], [845, 688], [836, 466]]
const NOTE = '3 tilted stacked cards, white plastik top left, •••• 4 digits bottom'

function cards(): ShapeMark[] {
  const page = [hand(NAVY, 3), hand(BLUE, 4), hand(PINK, 5)]
  return page.map((p, i) => ({ strokeId: `s${i}`, ...shapeOf(p, page)! }))
}
const node = (id: string, text: string, x: number, y: number, w = 80, h = 20) =>
  ({ id, tag: 'span', text, rect: { x, y, w, h }, style: {} })

describe('n32: one note for a group puts its contents on every member', () => {
  it('flags every card the group note covers and tells codegen to repeat its contents', () => {
    const marks = cards()
    markEach(marks, [{ text: NOTE, focus: ['s0', 's1', 's2'] }, { text: 'plastik', focus: ['s0'] }])
    expect(marks.every((m) => m.each?.note === NOTE)).toBe(true)
    const b = eachBrief([{ shapeMarks: marks }])
    expect(b).toContain('EACH of these 3 marks')
    expect(b).toContain('same spot on each')
  })
  it('a note whose whole cluster is the group (no focus) covers it too', () => {
    const marks = cards()
    markEach(marks, [{ text: NOTE, strokeIds: ['s0', 's1', 's2'] }])
    expect(marks.every((m) => m.each?.of === 3)).toBe(true)
  })
  it('a note that names no group flags nothing', () => {
    const marks = cards()
    markEach(marks, [{ text: 'navy card with plastik logo', focus: ['s0', 's1'] }])
    expect(marks.some((m) => m.each)).toBe(false)
    expect(eachBrief([{ shapeMarks: marks }])).toBe('')
  })
  it('fails when the logo and digits sit on one card only, passes when on all three', () => {
    const marks = cards()
    markEach(marks, [{ text: NOTE, focus: ['s0', 's1', 's2'] }])
    // only the pink (top) card carries contents
    const one = { nodes: [node('a', 'plastik', 870, 490), node('b', '•••• 4821', 880, 630)] }
    const v1 = verifyEach(marks, one)
    expect(v1.satisfied).toBe(false)
    expect(v1.reason).toContain('fewer than 3 times')
    const all = { nodes: [
      node('a', 'plastik', 740, 200), node('b', '•••• 1111', 760, 350),
      node('c', 'plastik', 810, 320), node('d', '•••• 2222', 820, 470),
      node('e', 'plastik', 870, 490), node('f', '•••• 3333', 880, 630)] }
    expect(verifyEach(marks, all).satisfied).toBe(true)
  })
  it('a group with no text anywhere (plain gold frames) is not judged', () => {
    const marks = cards()
    markEach(marks, [{ text: 'gold frames on all 3', focus: ['s0', 's1', 's2'] }])
    expect(verifyEach(marks, { nodes: [] }).unverifiable).toBe(true)
  })
})

describe('n32: a box noted as a quote mark is the glyph', () => {
  const box = (): ShapeMark => ({ strokeId: 'q', shape: 'box', box: { x: 605, y: 165, w: 70, h: 47 } })
  it('reads quote-mark notes, opening unless told closing', () => {
    expect(glyphOf('big yellow quote mark')).toEqual({ char: '“', name: 'opening quote mark' })
    expect(glyphOf('closing quote, grey')!.char).toBe('”')
    expect(glyphOf('yellow pill + 3 dots')).toBeNull()
    expect(glyphOf('We shipped our whole spring catalogue')).toBeNull()
  })
  it('flags the box (never a solid yellow box) and tells codegen the character', () => {
    const m = box()
    const notes = [{ text: 'big yellow quote mark', strokeIds: ['q'] }]
    markGlyphs([m], notes)
    markSolids([m], notes)
    expect(m.glyph?.char).toBe('“')
    expect(m.solid).toBeUndefined()
    expect(eachBrief([{ shapeMarks: [m] }])).toContain('character “ as TEXT')
  })
  it('checks the page: “ passes, ” or nothing fails', () => {
    const m = box(); m.glyph = { char: '“', name: 'opening quote mark' }
    expect(verifyGlyphs([m], { nodes: [node('a', '“', 610, 150, 60, 90)] }).satisfied).toBe(true)
    const wrong = verifyGlyphs([m], { nodes: [node('a', '”', 610, 150, 60, 90)] })
    expect(wrong.satisfied).toBe(false)
    expect(wrong.reason).toContain('use exactly “')
    expect(verifyGlyphs([m], { nodes: [] }).satisfied).toBe(false)
    // as big as drawn: a quote mark's ink is about a third of its font-size
    const small = verifyGlyphs([m], { nodes: [{ ...node('a', '“', 610, 150, 60, 90), style: { fontSize: '103px' } }] })
    expect(small.satisfied).toBe(false)
    expect(small.reason).toContain('font-size about 141px')
    expect(verifyGlyphs([m], { nodes: [{ ...node('a', '“', 610, 150, 60, 90), style: { fontSize: '140px' } }] }).satisfied).toBe(true)
  })
})

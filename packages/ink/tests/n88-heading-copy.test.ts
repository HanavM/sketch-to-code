import { describe, expect, it } from 'vitest'
import { textStacks } from '../src/textmark.js'
import { noteFocus } from '../src/notefocus.js'
import type { Point } from '../src/types.js'

const line = (id: string, x0: number, x1: number, y: number) => {
  const points: Point[] = []
  for (let x = x0, k = 0; x <= x1; x += 6, k++) points.push({ x, y: y + Math.sin(k / 3) * 0.6, t: k })
  return { id, points }
}

// round 36 c4 (florist), as drawn: a three-line heading 62-63px apart, a two-line paragraph under it
const florist = [line('h1', 720, 1180, 290), line('h2', 720, 1075, 352), line('h3', 720, 878, 415),
  line('p1', 722, 1137, 453), line('p2', 722, 841, 480)]
const heading = { x: 950, y: 280, text: 'Fresh flowers, at your door by noon. huge bold' }
const para = { x: 930, y: 445, text: 'Seasonal bouquets cut every morning and delivered across the city.' }
const ids = florist.map((l) => l.id)

describe('a heading whose words overflow its first line covers its stack (n88)', () => {
  it('three left-aligned lines 62px apart, wrapping shorter, with long copy on line 1, are one heading', () => {
    const st = textStacks(florist, { notesAt: [heading, para] })
    expect(st).toHaveLength(1)
    expect(st[0]!.strokes).toEqual(['h1', 'h2', 'h3'])
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(54)
  })
  it('the note typed on line 1 is about all three lines, and the paragraph note keeps its two', () => {
    const opts = { notesAt: [heading, para] }
    expect(noteFocus(ids, undefined, heading, florist, heading.text, opts)).toEqual(['h1', 'h2', 'h3'])
    expect(noteFocus(ids, undefined, para, florist, para.text, opts)).toEqual(['p1', 'p2'])
  })
  it('short words that fit their line keep lines at that pitch apart (a column of links)', () => {
    const links = [line('a', 100, 300, 200), line('b', 100, 260, 262), line('c', 100, 220, 324)]
    const notes = [{ x: 150, y: 190, text: 'About us' }, { x: 150, y: 252, text: 'Careers' }, { x: 150, y: 314, text: 'Press' }]
    expect(textStacks(links, { notesAt: notes })).toEqual([])
    expect(noteFocus(['a', 'b', 'c'], undefined, notes[0], links, notes[0]!.text, { notesAt: notes })).toEqual(['a'])
  })
  it('lines that do not wrap shorter (rows of a list) stay apart however long the note', () => {
    const rows = [line('a', 100, 700, 200), line('b', 100, 760, 258), line('c', 100, 700, 316)]
    const notes = [{ x: 400, y: 190, text: 'Three rows, each a project name with its owner and due date' }]
    expect(textStacks(rows, { notesAt: notes })).toEqual([])
  })
})

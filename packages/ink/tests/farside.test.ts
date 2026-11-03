import { describe, expect, it } from 'vitest'
import { noteFocus } from '../src/notefocus.js'
import { textStacks } from '../src/textmark.js'

const line = (id: string, x0: number, x1: number, y: number) => ({ id, points: [{ x: x0, y, t: 0 }, { x: x1, y, t: 0 }] })

describe('n55: a note typed just above a paragraph is about the paragraph', () => {
  // round 33 c1: a two-line giant heading, then a two-line paragraph under it
  const marks = [line('h1', 720, 1096, 315), line('h2', 720, 1072, 387), line('p1', 720, 1124, 453), line('p2', 720, 1008, 482)]
  const ids = marks.map((m) => m.id)
  const notes = [{ x: 730, y: 280, text: 'Catch your first wave. huge bold navy' },
    { x: 730, y: 432, text: 'Small groups, warm boards and coaches who have done it ten thousand times. grey' }]
  it('the paragraph note leaves the heading line above it', () => {
    expect(noteFocus(ids, undefined, notes[1], marks, notes[1]!.text, { notesAt: notes })).toEqual(['p1', 'p2'])
  })
  it('the heading stays one two-line heading (the paragraph note is not its second line\'s sentence)', () => {
    expect(noteFocus(ids, undefined, notes[0], marks, notes[0]!.text, { notesAt: notes })).toEqual(['h1', 'h2'])
    expect(textStacks(marks, { notesAt: notes }).some((s) => s.strokes.join() === 'h1,h2')).toBe(true)
  })
  it('round 33 c4: a one-line heading and a paragraph line 50px under it', () => {
    const m = [line('h', 182, 1098, 226), line('p', 410, 870, 276)]
    expect(noteFocus(['h', 'p'], undefined, { x: 420, y: 262 }, m)).toEqual(['p'])
  })
  it('a label line with its own note is not taken by the note under it', () => {
    const m = [line('lab', 569, 711, 522), line('desc', 583, 697, 550)]
    const n = [{ x: 572, y: 508 }, { x: 586, y: 542 }]
    expect(noteFocus(['lab', 'desc'], undefined, n[1], m, 'Bright and zesty', { notesAt: n })).toEqual(['desc'])
  })
  it('a note between two wraps of one paragraph still takes both', () => {
    const m = [line('a', 100, 600, 300), line('b', 100, 560, 326)]
    expect(noteFocus(['a', 'b'], undefined, { x: 120, y: 318 }, m, 'body text', { notesAt: [{ x: 120, y: 318 }] })).toBeUndefined()
  })
})

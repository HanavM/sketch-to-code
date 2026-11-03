import { describe, expect, it } from 'vitest'
import { verifyLineSpan } from '../src/linespan.js'
import { baselineOf } from '../src/ownwords.js'
import { textPlaceBrief } from '../src/textplace.js'

// round 33 c2 slow agency (n49 sketch): SLOW on a line at y 382, WORK at y 636
const line = (id: string, x0: number, x1: number, y: number, words: string) =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, words })
const marks = [line('slow', 64, 930, 382, 'SLOW, giant outlined letters'), line('work', 60, 980, 636, 'WORK, giant outlined letters')] // WORK after linkSame
const word = (id: string, text: string, top: number, w: number, fs: number) =>
  ({ id, text, rect: { x: 64, y: top, w, h: fs }, textBox: { x: 64, y: top, w, h: fs }, style: { fontSize: `${fs}px` } })

describe('giant words sit on their drawn lines (n64)', () => {
  it('reads the baseline from the box', () => {
    expect(baselineOf(word('a', 'SLOW', 100, 860, 300))).toBe(340)
    expect(baselineOf({ id: 'b', text: 'x', rect: { x: 0, y: 0, w: 10, h: 900 }, style: { fontSize: '300px' } })).toBeNull()
  })
  it('fails letters 40px above their line, naming how far to move them down', () => {
    // n62 try 4: full width, baseline about y 342 for SLOW
    const v = verifyLineSpan(marks, { nodes: [word('s', 'SLOW', 102, 866, 300)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('40px above')
    expect(v.reason).toContain('40px down')
  })
  it('passes letters on their line, and only judges each word against its own line', () => {
    // baseline = top + 0.8 fs: top 142 -> 382; WORK top 396 -> 636
    const v = verifyLineSpan(marks, { nodes: [word('s', 'SLOW', 142, 866, 300), word('w', 'WORK', 396, 920, 300)] })
    expect(v.satisfied).toBe(true)
    expect(v.reason).toContain('2 one-line headings')
  })
  it('flags letters below the line too', () => {
    const v = verifyLineSpan(marks, { nodes: [word('w', 'WORK', 440, 920, 300)] })
    expect(v.reason).toContain('below it')
    expect(v.reason).toContain('px up')
  })
  it('leaves an ordinary one-line heading to its width check only', () => {
    const m = [line('h', 64, 716, 200, 'A quiet place to read. big italic serif')]
    const n = { id: 'h', text: 'A quiet place to read.', rect: { x: 64, y: 100, w: 640, h: 60 }, textBox: { x: 64, y: 100, w: 640, h: 60 }, style: { fontSize: '50px' } }
    expect(verifyLineSpan(m, { nodes: [n] }).satisfied).toBe(true)
  })
  it('tells the build the line is the baseline', () => {
    const b = textPlaceBrief([{ shapeMarks: marks as never }], { w: 1280, h: 860 })
    expect(b).toContain("the line is the letters' BASELINE, their bottom edge on y 382")
  })
})

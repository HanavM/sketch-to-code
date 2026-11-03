import { describe, expect, it } from 'vitest'
import { labelValue, verifyTableRows, whenLine } from '../src/linespread.js'
import { piecesOf, stackWordsBrief, verifyStackWords, wordStacks } from '../src/stackwords.js'
import { textPlaceBrief } from '../src/textplace.js'

const line = (id: string, x0: number, x1: number, y: number, words?: string) => ({
  strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, ...(words ? { words } : {}),
})
// as read live: the note sits on the action, neither line has words of its own
const chess = [{
  shapeMarks: [line('a', 604, 1105, 245), line('b', 606, 990, 378)],
  notes: ['CHECK / MATE huge bold caps, MATE outlined only'],
}] as never[]
const word = (id: string, text: string, x: number, y: number, w: number, fs: number) =>
  ({ id, text, rect: { x, y, w, h: fs * 1.2 }, textBox: { x, y, w, h: fs * 1.2 }, style: { fontSize: `${String(fs)}px` } })

// round 41 c4 chess night: one build small and far apart, the next with MATE on the date line
describe('short heading lines land on their drawn lines (n218)', () => {
  it('reads which words go on which drawn line', () => {
    expect(piecesOf('CHECK / MATE huge bold caps, MATE outlined only', 2)).toEqual(['CHECK', 'MATE'])
    expect(piecesOf('First tracks, / warm fire, huge bold, right', 2)).toEqual(['First tracks', 'warm fire'])
    expect(piecesOf('Slow Science huge bold', 2)).toEqual(['Slow', 'Science'])
    expect(piecesOf('A quiet place to read', 2)).toBeNull()
    expect(piecesOf('One / Two / Three', 2)).toBeNull()
  })
  it('tells the build each line, at one size the drawn spacing can carry', () => {
    const [s] = wordStacks(chess)
    expect(s!.pieces.map((p) => [p.text, p.y])).toEqual([['CHECK', 245], ['MATE', 378]])
    expect(s!.fontPx).toBeGreaterThan(120)
    expect(s!.fontPx).toBeLessThanOrEqual(147)
    const b = stackWordsBrief(wordStacks(chess))
    expect(b).toContain('"CHECK" on ONE line')
    expect(b).toContain('bottom edge on y 378')
  })
  it('leaves a stack alone when a second line has its own note', () => {
    const own = [{ shapeMarks: [line('a', 600, 1100, 245, 'CHECK'), line('b', 600, 1000, 378, 'MATE')], notes: ['CHECK', 'MATE'] }] as never[]
    expect(wordStacks(own)).toEqual([])
    const kept = [{ shapeMarks: [line('a', 604, 1105, 245, 'CHECK / MATE huge bold caps'), line('b', 606, 990, 378)] }] as never[]
    expect(wordStacks(kept)).toHaveLength(1)
    const withBox = [{ shapeMarks: [line('a', 604, 1105, 245), { strokeId: 'x', shape: 'box', box: { x: 0, y: 0, w: 9, h: 9 } }], notes: ['One Two'] }] as never[]
    expect(wordStacks(withBox)).toEqual([])
  })
  it('fails the two builds seen live and passes a right one', () => {
    const s = wordStacks(chess)
    // try 1: CHECK half its line, MATE far under
    const small = verifyStackWords(s, { nodes: [word('1', 'CHECK', 604, 206, 249, 66), word('2', 'MATE', 604, 390, 200, 66)] })
    expect(small.satisfied).toBe(false)
    expect(small.reason).toContain('its line was drawn 501px long')
    // try 2: right size, MATE on the date line
    const low = verifyStackWords(s, { nodes: [word('1', 'CHECK', 604, 130, 490, 130), word('2', 'MATE', 604, 330, 390, 130)] })
    expect(low.satisfied).toBe(false)
    expect(low.reason).toContain('drawn on the line at y 378')
    const good = verifyStackWords(s, { nodes: [word('1', 'CHECK', 604, 125, 495, 130), word('2', 'MATE', 604, 258, 390, 130)] })
    expect(good.satisfied).toBe(true)
  })
  it('judges one block holding both lines, and says nothing when the words are not found', () => {
    const s = wordStacks(chess)
    const block = { ...word('1', 'CHECK MATE', 604, 125, 495, 130), textBox: { x: 604, y: 125, w: 495, h: 266 }, rect: { x: 604, y: 125, w: 495, h: 266 } }
    expect(verifyStackWords(s, { nodes: [block] }).satisfied).toBe(true)
    expect(verifyStackWords(s, { nodes: [word('1', 'Other', 0, 0, 10, 10)] }).unverifiable).toBe(true)
  })
})

describe('a day and a time on their own line are one phrase (n218)', () => {
  const when = line('c', 606, 826, 433, 'Every Thursday, 7pm, bold')
  it('tells it from a label and its value', () => {
    expect(whenLine('Every Thursday, 7pm, bold')).toBe(true)
    expect(whenLine('Tonight, 8:30pm')).toBe(true)
    expect(whenLine('Fridays, 19:00')).toBe(true)
    expect(whenLine('Total, $199')).toBe(false)
    expect(whenLine('Sunset, 7pm')).toBe(false)
    expect(labelValue('Every Thursday, 7pm, bold')).not.toBeNull()
  })
  it('is told as one line, not two ends', () => {
    const b = textPlaceBrief([{ shapeMarks: [when] }] as never[], { w: 1280, h: 900 })
    expect(b).not.toContain('space-between')
    expect(b).not.toContain('ONE ROW')
  })
  it('stays a row when ruled in a list', () => {
    const rows = ['Monday, 9am', 'Tuesday, 9am', 'Friday, 10am'].map((w, k) => line(`r${String(k)}`, 600, 900, 300 + k * 40, w))
    expect(textPlaceBrief([{ shapeMarks: rows }] as never[], { w: 1280, h: 900 })).toContain('ONE ROW')
    const big = { id: 'x', text: 'Monday, 9am', rect: { x: 600, y: 285, w: 300, h: 40 }, textBox: { x: 600, y: 285, w: 300, h: 40 }, style: { fontSize: '30px' } }
    expect(verifyTableRows(rows, { nodes: [big] }).satisfied).toBe(false)
  })
})

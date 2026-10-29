import { describe, expect, it } from 'vitest'
import { rowMarksOf, rowMarksBrief, verifyRowMarks, isColourOf } from '../src/rowmarks.js'

const NOTE = 'green dot at row end for 1-3, empty ring for 4-5'
const node = (id: string, x: number, y: number, w: number, h: number, style: Record<string, string> = {}) => ({ id, rect: { x, y, w, h }, style })

describe('n84 row marks', () => {
  it('reads which mark, colour and rows a note names', () => {
    const d = rowMarksOf(NOTE)!
    expect(d.marks).toEqual([
      { mark: 'dot', colour: 'green', empty: false, rows: [1, 2, 3], side: 'end' },
      { mark: 'ring', colour: null, empty: true, rows: [4, 5], side: 'end' },
    ])
    expect(rowMarksOf('red star on rows 2 and 4')!.marks[0]!.rows).toEqual([2, 4])
    expect(rowMarksOf('blue dot on every row')!.marks[0]!.rows).toBe('all')
  })
  it('leaves other notes alone', () => {
    expect(rowMarksOf('all cards dark grey on near black page')).toBeNull()
    expect(rowMarksOf('5 rows: 1 60 kg 10 90 s / 2 70 kg 8 90 s')).toBeNull()
    expect(rowMarksOf('green button, Save')).toBeNull()
  })
  it('tells the build the colour is for the marks only', () => {
    const b = rowMarksBrief([NOTE, 'Bench press, bold white'])
    expect(b).toContain('FILLED green dot')
    expect(b).toContain('EMPTY ring')
    expect(b).toContain('never green')
  })
  it('flags a card painted the marks colour and missing dots', () => {
    const v = verifyRowMarks([NOTE], { nodes: [node('card', 24, 256, 584, 200, { backgroundColor: 'rgb(34, 160, 80)' })] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/painted green/)
    expect(v.reason).toMatch(/found 0/)
  })
  it('passes dots on a dark card', () => {
    const nodes = [node('card', 24, 256, 584, 200, { backgroundColor: 'rgb(30, 33, 40)' }),
      ...[0, 1, 2].map((k) => node(`d${k}`, 580, 308 + k * 28, 14, 14, { backgroundColor: 'rgb(52, 199, 89)' }))]
    expect(verifyRowMarks([NOTE], { nodes }).satisfied).toBe(true)
  })
  it('does not judge a green block another note asked for', () => {
    const v = verifyRowMarks([NOTE, 'green header bar'], { nodes: [node('bar', 0, 0, 1200, 90, { backgroundColor: 'rgb(34, 160, 80)' }),
      ...[0, 1, 2].map((k) => node(`d${k}`, 580, 308 + k * 28, 14, 14, { backgroundColor: 'rgb(52, 199, 89)' }))] })
    expect(v.satisfied).toBe(true)
  })
  it('knows hue families', () => {
    expect(isColourOf('rgb(52, 199, 89)', 'green')).toBe(true)
    expect(isColourOf('rgb(255, 107, 44)', 'green')).toBe(false)
    expect(isColourOf('rgb(30, 33, 40)', 'green')).toBe(false)
  })
})

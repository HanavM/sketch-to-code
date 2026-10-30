import { describe, expect, it } from 'vitest'
import { listItems, markRowWords, rowWordsBrief, spreadNotes, verifyRowWords } from '../src/rowwords.js'
import { directionStrings } from '../src/typedcopy.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w = 14, h = 14): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } }) as ShapeMark
// round 38 e3 budget, as drawn in n108: three legend swatches in a column, one list note on the middle one
const legend = () => [box('a', 100, 650), box('b', 100, 683), box('c', 100, 716), box('panel', 560, 111, 660, 739)]
const note = { text: 'Rent $1,120; Food $700; Travel $520', focus: ['b'] }
const n = (id: string, x: number, y: number, w: number, h: number, text: string) => ({ id, rect: { x, y, w, h }, text })

describe('n119 a list note on one of a line of look-alike marks spreads over them', () => {
  it('splits a note by semicolons, keeping commas inside amounts', () => {
    expect(listItems('Rent $1,120; Food $700; Travel $520')).toEqual(['Rent $1,120', 'Food $700', 'Travel $520'])
    expect(listItems('Big bold headline, dark')).toBeNull()
  })

  it('gives each swatch its own item, top to bottom, and briefs them as a list', () => {
    const marks = legend()
    markRowWords(marks, [note])
    expect(marks.slice(0, 3).map((m) => m.own)).toEqual(['Rent $1,120', 'Food $700', 'Travel $520'])
    expect(marks[3]!.own).toBeUndefined()
    const brief = rowWordsBrief([{ shapeMarks: marks }])
    expect(brief).toContain('"Food $700"')
    expect(brief.indexOf('Rent')).toBeLessThan(brief.indexOf('Travel'))
    // the items are copy: the note is left out of the directions check, which would read "Food $700" as a direction
    expect(directionStrings([note.text]).map((d) => d.text)).toContain('Food $700')
    expect(spreadNotes(marks).has(note.text)).toBe(true)
  })

  it('spreads left to right along a row too', () => {
    const marks = [box('x', 100, 100, 60, 30), box('y', 180, 100, 60, 30), box('z', 260, 100, 60, 30)]
    markRowWords(marks, [{ text: 'Day; Week; Month', focus: ['x'] }])
    expect(marks.map((m) => m.own)).toEqual(['Day', 'Week', 'Month'])
  })

  it('does not spread when the count differs or a mark was typed other words', () => {
    const two = legend()
    markRowWords(two, [{ text: 'Rent; Food', focus: ['b'] }])
    expect(two[0]!.own).toBeUndefined()
    const typed = legend()
    markRowWords(typed, [note, { text: 'Groceries', focus: ['a'] }])
    expect(typed[0]!.own).toBe('Groceries')
    expect(typed[2]!.own).toBeUndefined()
  })

  it('checks every swatch has its own words beside it on the page', () => {
    const marks = legend()
    markRowWords(marks, [note])
    const good = { nodes: [n('1', 124, 650, 40, 14, 'Rent'), n('2', 220, 650, 50, 14, '$1,120'), n('3', 124, 683, 40, 14, 'Food'), n('4', 220, 683, 40, 14, '$700'), n('5', 124, 716, 40, 14, 'Travel'), n('6', 220, 716, 40, 14, '$520')] }
    expect(verifyRowWords(marks, good).satisfied).toBe(true)
    const bare = { nodes: [n('1', 124, 650, 90, 14, 'Rent $1,120')] }
    const v = verifyRowWords(marks, bare)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('Food $700')
  })
})

describe('n119 a small swatch drawn about 14px is a box', () => {
  const wob = (way: number[][], amp: number) => {
    const pts: { x: number; y: number }[] = []
    for (let i = 1; i < way.length; i++) {
      const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
      for (let k = 0; k < 3; k++) pts.push({ x: ax! + ((bx! - ax!) * k) / 3 + (k % 2 ? amp : -amp), y: ay! + ((by! - ay!) * k) / 3 })
    }
    pts.push({ x: way[0]![0]!, y: way[0]![1]! })
    return pts
  }
  it('reads a 13px square as a box, but not a small ring or a tick', async () => {
    const { shapeOf } = await import('../src/shapemark.js')
    expect(shapeOf(wob([[100, 650], [113, 650], [113, 663], [100, 663], [100, 650]], 0.3))?.shape).toBe('box')
    const ring: { x: number; y: number }[] = []
    for (let a = 0; a <= 360; a += 20) ring.push({ x: 107 + 6.5 * Math.sin((a * Math.PI) / 180), y: 657 - 6.5 * Math.cos((a * Math.PI) / 180) })
    expect(shapeOf(ring)?.shape).not.toBe('box')
    expect(shapeOf([{ x: 100, y: 656 }, { x: 104, y: 662 }, { x: 113, y: 650 }])).toBeNull()
  })
})

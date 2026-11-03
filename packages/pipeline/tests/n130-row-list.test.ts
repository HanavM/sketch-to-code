import { describe, expect, it } from 'vitest'
import { commaItems, markRowWords, rowWordsBrief, verifyRowWords } from '../src/rowwords.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } }) as ShapeMark
const n = (id: string, x: number, y: number, w: number, h: number, text: string) => ({ id, rect: { x, y, w, h }, text })
// round 39 e4 vet booking, as drawn in n127: the selected Tue box and the Wed box of a five-day row, the note on Wed
const days = () => [box('tue', 210, 280, 140, 92), box('wed', 358, 276, 146, 98)]
const page = [{ x: 58, y: 122, w: 100, h: 6 }, { x: 58, y: 168, w: 154, h: 70 }, { x: 222, y: 166, w: 156, h: 72 }, { x: 210, y: 280, w: 140, h: 92 }, { x: 358, y: 276, w: 146, h: 98 }, { x: 58, y: 406, w: 746, h: 192 }]
const note = { text: 'Mon 14, Tue 15, Wed 16, Thu 17, Fri 18', focus: ['wed'] }

describe('n130 a list note on a row drawn short spreads over the whole row', () => {
  it('reads a comma list of items of one form, not look words or mixed parts', () => {
    expect(commaItems(note.text)).toEqual(['Mon 14', 'Tue 15', 'Wed 16', 'Thu 17', 'Fri 18'])
    expect(commaItems('big, bold, dark')).toBeNull()
    expect(commaItems('Pet Biscuit, Date Tue 15 Dec, Time 10:30, Vet Dr. Okafor, Fee €45')).toBeNull()
    expect(commaItems('Mon 14; Tue 15')).toBeNull()
  })

  it('gives the drawn boxes the items they sit at (Tue, Wed) and briefs the whole row', () => {
    const ms = days()
    markRowWords(ms, [note], page)
    expect(ms.map((m) => m.own)).toEqual(['Tue 15', 'Wed 16'])
    expect(ms[0]!.rowList).toMatchObject({ first: 1 })
    const brief = rowWordsBrief([{ shapeMarks: ms }])
    expect(brief).toContain('ONE PER BOX')
    expect(brief).toContain('"Mon 14"')
    expect(brief).toContain('= "Wed 16"')
  })

  it('starts at the first item when nothing marks a row start', () => {
    const ms = days()
    markRowWords(ms, [note])
    expect(ms.map((m) => m.own)).toEqual(['Mon 14', 'Tue 15'])
  })

  it('checks every item is in the row and no piece holds two', () => {
    const ms = days()
    markRowWords(ms, [note], page)
    const good = { nodes: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].flatMap((d, i) => [n(`${d}a`, 70 + i * 148, 290, 30, 12, d), n(`${d}b`, 70 + i * 148, 310, 30, 24, String(14 + i))]) }
    expect(verifyRowWords(ms, good).satisfied).toBe(true)
    const bad = { nodes: [...good.nodes.filter((x) => !x.id.startsWith('Wed')), n('w1', 380, 300, 30, 30, '14'), n('w2', 380, 340, 60, 12, 'Wed 16')] }
    const v = verifyRowWords(ms, bad)
    expect(v.satisfied).toBe(false)
  })
})

import { directionStrings, noteParts } from '../src/typedcopy.js'
describe('n130 words that say which item is on, or how many a row, are never copy', () => {
  it('splits a state word and a kind tail off a short label', () => {
    const p = noteParts('Biscuit selected, avatar')
    expect(p.copy).toBe('Biscuit')
    expect(p.directions).toEqual(['selected', 'avatar'])
    expect(directionStrings(['Biscuit selected, avatar']).map((d) => d.text)).toContain('avatar')
  })
  it('splits a per-row count off', () => {
    const p = noteParts('12 time slots 09:00-16:30, 4 a row; 10:30 dark green')
    expect(p.copy).toBe('12 time slots 09:00-16:30')
    expect(p.directions[0]).toBe('4 a row')
  })
  it('keeps labels that only look like it', () => {
    expect(noteParts('Selected works').copy).toBe('Selected works')
    expect(noteParts('Big bold headline, dark').copy).toBe('Big bold headline')
    expect(noteParts('Not selected').copy).toBe('Not selected')
  })
})

import { statOf } from '../src/statcard.js'
describe('n130 a row list note is never a stat card, and a mark keeps only its copy', () => {
  it('does not read "Mon 14, Tue 15..." as a value and its label', () => {
    expect(statOf(['Mon 14, Tue 15, Wed 16, Thu 17, Fri 18'])).toBeNull()
    expect(statOf(['6 big, on loan'])).not.toBeNull()
  })
  it('a pet pill typed "Biscuit selected, avatar" carries Biscuit', () => {
    const ms = [box('b', 59, 169, 151, 65), box('l', 222, 167, 156, 70)]
    markRowWords(ms, [{ text: 'Biscuit selected, avatar', focus: ['b'] }, { text: 'Luna', focus: ['l'] }])
    expect(ms.map((m) => m.own)).toEqual(['Biscuit', 'Luna'])
  })
})

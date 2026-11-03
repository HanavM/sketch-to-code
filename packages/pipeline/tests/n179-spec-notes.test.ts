import { describe, expect, it } from 'vitest'
import { directionStrings, nameList, specNote, typedCopyBrief, verifyNoDirections } from '../src/typedcopy.js'

// the real round 43 e4 pet adoption notes (n176, replayed in n178)
const SPEC = 'pet cards: tinted picture top (peach, sage, blue, lilac), name bold, age · breed under'
const NAMES = 'Biscuit, Juno, Pepper, Otis, Maple, Rio'
const FILTERS = 'filters: Animal (Dogs, Cats, Rabbits), Age (Puppy, Adult, Senior), Size (Small, Medium, Large); Dogs, Adult, Medium checked orange'
const snap = (texts: string[]) => ({ nodes: texts.map((text, i) => ({ id: `n${i}`, text })) })

describe('n179: a note describing a kind of item, and a list of names, are never printed', () => {
  it('reads the pet cards note as a description, the filters note not', () => {
    expect(specNote(SPEC)).toMatchObject({ kind: 'pet cards', lead: 'tinted picture top' })
    expect(specNote(FILTERS)).toBeNull()
    expect(specNote('Note: Copy is final')).toBeNull()
    expect(specNote('Total: $199')).toBeNull()
  })
  it('reads the six names as a list, not a sentence or a look tail', () => {
    expect(nameList(NAMES)).toEqual(['Biscuit', 'Juno', 'Pepper', 'Otis', 'Maple', 'Rio'])
    expect(nameList('Read 20 pages, bold')).toBeNull()
    expect(nameList('Hello, world, again')).toBeNull()
    expect(nameList(FILTERS)).toBeNull()
  })
  it('tells the build', () => {
    const b = typedCopyBrief([SPEC, NAMES])
    expect(b).toContain('DESCRIBES how each of the pet cards looks')
    expect(b).toContain('6 names, one per item')
    expect(directionStrings([SPEC, NAMES]).map((d) => d.text)).toEqual(['tinted picture top', 'Biscuit, Juno, Pepper'])
  })
  it('fails the n178 try 1 page and passes the try 2 page', () => {
    const bad = snap(['Pawhome', '18 dogs near you', 'pet cards: tinted picture top (peach, sage, blue, lilac), name bold, age · breed under', 'Biscuit, Juno, Pepper, Otis, Maple, Rio', 'Pepper'])
    const v = verifyNoDirections([SPEC, NAMES], bad)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('tinted picture top')
    expect(v.reason).toContain('Biscuit, Juno, Pepper')
    const good = snap(['Pawhome', '18 dogs near you', 'Biscuit', '2 yrs · Labrador', 'Juno', 'Pepper', 'Otis', 'Maple', 'Rio'])
    expect(verifyNoDirections([SPEC, NAMES], good).satisfied).toBe(true)
  })
})

import { markRowWords, rowWordsBrief } from '../src/rowwords.js'
import type { ShapeMark } from '../src/shapemark.js'

// the real pet cards: six look-alike boxes in two rows of three (n179 replay interpretation)
const card = (id: string, x: number, y: number) => ({ strokeId: id, shape: 'box', box: { x, y, w: 284, h: 253 } }) as unknown as ShapeMark
const cards = () => [card('s5', 329, 159), card('s6', 637, 159), card('s7', 945, 159), card('s8', 329, 436), card('s9', 637, 436), card('s10', 945, 436)]
const notes = [
  { text: SPEC, focus: ['s5'], strokeIds: ['s5'] },
  { text: NAMES, focus: ['s6'], strokeIds: ['s6'] },
]

describe('n179: the pet card notes on the drawn grid', () => {
  it('gives each card one name in reading order, and the description to none', () => {
    const ms = cards()
    markRowWords(ms, notes)
    expect(ms.map((m) => m.own)).toEqual(['Biscuit', 'Juno', 'Pepper', 'Otis', 'Maple', 'Rio'])
    expect(rowWordsBrief([{ shapeMarks: ms }])).not.toContain('tinted picture top')
  })
  it('leaves a list that is not as long as the grid alone', () => {
    const ms = cards()
    markRowWords(ms, [{ text: 'Biscuit, Juno, Pepper, Otis', focus: ['s6'], strokeIds: ['s6'] }])
    expect(ms.some((m) => m.own === 'Biscuit, Juno, Pepper, Otis')).toBe(false)
    expect(ms.some((m) => m.listNote && !m.rowList)).toBe(false)
  })
})

import { verifyShapeMarks } from '../src/shapemark.js'

describe('n179: a drift is traced through a line over the same column only', () => {
  it('the filter checkbox left of the heading is traced to the header rule, not the heading line', () => {
    const marks = [
      { strokeId: 's1', shape: 'line', box: { x: 2, y: 72, w: 1276, h: 0 }, from: { x: 2, y: 72 }, to: { x: 1278, y: 72 } },
      { strokeId: 's4', shape: 'line', box: { x: 330, y: 120, w: 230, h: 0 }, from: { x: 330, y: 120 }, to: { x: 560, y: 120 } },
      { strokeId: 's11', shape: 'box', box: { x: 48, y: 140, w: 19, h: 19 } },
    ] as ShapeMark[]
    // the n179 build: header rule where drawn, heading 31px low, checkbox 33px low
    const after = { nodes: [
      { id: 'h', tag: 'header', rect: { x: 0, y: 0, w: 1280, h: 72 } },
      { id: 't', tag: 'h1', rect: { x: 330, y: 123, w: 230, h: 28 } },
      { id: 'c', tag: 'span', rect: { x: 48, y: 173, w: 19, h: 19 } },
    ] }
    const v = verifyShapeMarks(marks, { nodes: [] }, after)
    const cb = v.reason.split('; the ').find((x) => x.includes('(48,140)'))!
    expect(cb).toMatch(/33px too low/)
    expect(cb).not.toMatch(/line drawn at y=120/)
    expect(cb).toMatch(/line drawn at y=72 \(the bar above it\) is built where drawn/)
  })
})

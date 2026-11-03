import { describe, expect, it } from 'vitest'
import { groupCount, noteFocus, rowSeed } from '@s2c/ink'
import { copyOf, lookAlikeLists, markRowWords, rowWordsBrief, verifyRowWords } from '../src/rowwords.js'
import type { ShapeMark } from '../src/shapemark.js'

// round 34 e1 recipe (n66 sketch): five 22px checkboxes at x 664, 38px apart, ingredients typed to the right
const square = (id: string, x: number, y: number, s: number) => ({
  id, points: [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y + 1]].flatMap(([a, b], i, all) => {
    const [c, d] = all[(i + 1) % all.length]!
    return i === all.length - 1 ? [{ x: a!, y: b!, t: 0 }] : [0, 0.25, 0.5, 0.75].map((f) => ({ x: a! + (c! - a!) * f, y: b! + (d! - b!) * f, t: 0 }))
  }),
})
const rect = (id: string, x: number, y: number, w: number, h: number) => ({
  id, points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y + 1]].flatMap(([a, b], i, all) => {
    const [c, d] = all[(i + 1) % all.length]!
    return i === all.length - 1 ? [{ x: a!, y: b!, t: 0 }] : [0, 0.25, 0.5, 0.75].map((f) => ({ x: a! + (c! - a!) * f, y: b! + (d! - b!) * f, t: 0 }))
  }),
})
const boxes = [256, 294, 332, 370, 408].map((y, i) => square(`b${i}`, 664, y, 22))
const ids = boxes.map((b) => b.id)

describe('a note beside one of a column of look-alike marks is that mark\'s (n69)', () => {
  it('binds each ingredient to the checkbox level with it', () => {
    expect(noteFocus(ids, undefined, { x: 760, y: 267 }, boxes as never, '400 g spaghetti')).toEqual(['b0'])
    expect(noteFocus(ids, undefined, { x: 770, y: 343 }, boxes as never, 'A bunch of parsley')).toEqual(['b2'])
    expect(noteFocus(ids, undefined, { x: 740, y: 419 }, boxes as never, 'Olive oil')).toEqual(['b4'])
  })
  it('binds a row\'s words to its checkbox though the heading line above is nearer', () => {
    const heading = { id: 'h', points: Array.from({ length: 19 }, (_, i) => ({ x: 664 + i * 6, y: 228, t: 0 })) }
    const all = [heading, ...boxes]
    expect(noteFocus(['h', ...ids], undefined, { x: 760, y: 267 }, all as never, '400 g spaghetti')).toEqual(['b0'])
    expect(noteFocus(['h', ...ids], undefined, { x: 715, y: 222 }, all as never, 'Ingredients, bold')).toEqual(['h'])
  })
  it('a quantity in the words is copy, not a group', () => {
    expect(groupCount('3 cloves garlic')).toBeNull()
    expect(groupCount('2 lemons')).toBeNull()
    expect(groupCount('3 tilted stacked cards')).toBe(3)
    expect(groupCount('gold frames on all 3')).toBe(3)
    expect(groupCount('Hi, the reset link says it has expired every time I click it.')).toBeNull()
    expect(groupCount('white circle on every card')).toBe(0)
  })
  it('a note typed far right on a checkbox\'s row seeds on that checkbox', () => {
    expect(rowSeed(boxes as never, { x: 770, y: 343 })).toBe('b2')
    expect(rowSeed(boxes as never, { x: 1000, y: 343 })).toBeNull()
  })
  it('a note dragged onto a box is that box only', () => {
    expect(noteFocus(ids, undefined, { x: 675, y: 305 }, boxes as never, '2 lemons')).toEqual(['b1'])
  })
  it('a note naming a group still takes the group', () => {
    const f = noteFocus(ids, undefined, { x: 742, y: 382 }, boxes as never, 'all 3 unticked')
    expect(f === undefined || f.length >= 2).toBe(true)
  })
  it('a chat message typed inside its bubble is that bubble only (helpdesk)', () => {
    const bub = [rect('m0', 420, 107, 480, 80), rect('m1', 760, 211, 480, 80), rect('m2', 420, 315, 480, 56)]
    const bids = bub.map((b) => b.id)
    expect(noteFocus(bids, undefined, { x: 600, y: 140 }, bub as never, 'Hi, the reset link has expired.')).toEqual(['m0'])
    expect(noteFocus(bids, undefined, { x: 950, y: 245 }, bub as never, 'Sorry about that!')).toEqual(['m1'])
  })
})

const mark = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })
const texts = ['400 g spaghetti', '2 lemons', 'A bunch of parsley', '3 cloves garlic', 'Olive oil']

function recipeMarks(): ShapeMark[] {
  const ms = [256, 294, 332, 370, 408].map((y, i) => mark(`b${i}`, 664, y, 22, 22))
  markRowWords(ms, texts.map((t, i) => ({ text: t, focus: [`b${i}`], strokeIds: ids })))
  return ms
}
const row = (id: string, text: string, y: number) => ({ id, text, rect: { x: 700, y, w: 120, h: 16 }, textBox: { x: 700, y, w: 120, h: 16 } })

describe('look-alike rows keep their own words (n69)', () => {
  it('keeps a note\'s copy without its style tail', () => {
    expect(copyOf('Start cooking, white bold')).toBe('Start cooking')
    expect(copyOf('Hi, the reset link in the email says it has expired.')).toBe('Hi, the reset link in the email says it has expired.')
  })
  it('finds the list and tells each item\'s words in order', () => {
    const ms = recipeMarks()
    expect(lookAlikeLists(ms)).toHaveLength(1)
    const b = rowWordsBrief([{ shapeMarks: ms }])
    expect(b).toContain('"A bunch of parsley"')
    expect(b.indexOf('400 g spaghetti')).toBeLessThan(b.indexOf('Olive oil'))
  })
  it('fails "Garlic clove" x3 and names every row\'s words', () => {
    const page = { nodes: [row('a', '400 g spaghetti', 259), row('b', '2 lemons', 297), row('c', 'Garlic clove', 335), row('d', 'Garlic clove', 373), row('e', 'Garlic clove', 411)] }
    const v = verifyRowWords(recipeMarks(), page)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('should show "A bunch of parsley" but shows "Garlic clove"')
    expect(v.reason).toContain('"Olive oil"')
  })
  it('fails a row showing another row\'s words', () => {
    const page = { nodes: [row('a', '400 g spaghetti', 259), row('b', '400 g spaghetti', 297), row('c', 'A bunch of parsley', 335), row('d', '3 cloves garlic', 373), row('e', 'Olive oil', 411)] }
    expect(verifyRowWords(recipeMarks(), page).reason).toContain('shows the words of another item ("400 g spaghetti")')
  })
  it('passes when each row has its own words, ignoring the list holding them all', () => {
    const all = { id: 'ul', text: texts.join(' '), rect: { x: 660, y: 250, w: 300, h: 190 } }
    const page = { nodes: [all, ...texts.map((t, i) => row(`r${i}`, t, 259 + 38 * i))] }
    expect(verifyRowWords(recipeMarks(), page).satisfied).toBe(true)
  })
  it('a note describing a mark is not its words', () => {
    const ms = [mark('a', 0, 0, 380, 80), mark('b', 420, 100, 480, 80), mark('c', 760, 200, 480, 80)]
    markRowWords(ms, [{ text: 'purple left edge', focus: ['a'] }, { text: 'Hi there', focus: ['b'] }, { text: 'Sorry about that! white', focus: ['c'] }])
    expect(ms[0]!.own).toBeUndefined()
    expect(ms[2]!.own).toBe('Sorry about that! white')
  })
  it('says nothing about a single box or marks with the same words', () => {
    const ms = [mark('a', 0, 0, 100, 40), mark('b', 0, 60, 100, 40)]
    markRowWords(ms, [{ text: 'Buy', focus: ['a'] }, { text: 'Buy', focus: ['b'] }])
    expect(verifyRowWords(ms, { nodes: [] }).unverifiable).toBe(true)
  })
})

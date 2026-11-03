import { describe, expect, it } from 'vitest'
import { directionStrings, lookNote, typedCopyBrief, verifyNoDirections } from '../src/typedcopy.js'
import { looksOnly, markRowWords } from '../src/rowwords.js'
import { markUnderWords, underWordsBrief, verifyUnderWords } from '../src/underbox.js'
import { verifyColor } from '../src/run2.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w: number, h: number) => ({ strokeId: id, shape: 'box', box: { x, y, w, h } }) as unknown as ShapeMark
const COVERS = () => [box('a', 40, 290, 270, 380), box('b', 340, 290, 270, 380)]
const NOTES = [
  { text: 'The Deep Blue bold', at: { x: 40, y: 684 } }, { text: 'Mara Lind grey', at: { x: 40, y: 710 } }, { text: 'Available green pill', at: { x: 50, y: 740 } },
  { text: 'Salt and Tide bold', at: { x: 340, y: 684 } },
]
const node = (text: string, x: number, y: number) => ({ text, rect: { x, y, w: 100, h: 20 }, textBox: { x, y, w: 100, h: 20 } })

describe('n268: a note about how a kind of thing looks', () => {
  it('is read as a look', () => {
    for (const t of ['four covers solid', 'Four covers solid', 'pale chips solid', 'tracks thick black', 'all the tracks thick black', 'button hollow', '3 cards white']) expect(lookNote(t), t).not.toBeNull()
  })
  it('copy with a look word stays copy', () => {
    for (const t of ['The Deep Blue bold', 'Four Seasons bold', 'Four seasons bold', 'results grey', 'All white', 'Available green pill', 'Salt and Tide bold', 'news big bold', 'Upload', 'free trials white', 'sign out grey', 'hub gold']) expect(lookNote(t), t).toBeNull()
  })
  it('never becomes a box\'s own words, so the title does', () => {
    const [a] = COVERS() as [ShapeMark]
    markRowWords([a], [{ text: 'four covers solid', focus: ['a'] }, { text: 'The Deep Blue bold', focus: ['a'] }])
    expect(looksOnly('four covers solid')).toBe(true)
    expect(a.own).toBe('The Deep Blue')
  })
  it('is told and checked as never printed', () => {
    expect(typedCopyBrief(['four covers solid'])).toContain('None of these words is text')
    expect(directionStrings(['four covers solid'])[0]!.text).toBe('four covers solid')
    expect(verifyNoDirections(['four covers solid'], { nodes: [{ id: '1', text: 'four covers solid' }] }).satisfied).toBe(false)
    expect(verifyNoDirections(['four covers solid'], { nodes: [{ id: '1', text: 'The Deep Blue' }] }).satisfied).toBe(true)
  })
})

describe('n268: words typed under a drawn box', () => {
  it('are recorded on the box they are under, in order, without their look words', () => {
    const m = COVERS(); markUnderWords(m, NOTES)
    expect(m[0]!.under!.map((u) => u.copy)).toEqual(['The Deep Blue', 'Mara Lind', 'Available'])
    expect(m[1]!.under!.map((u) => u.copy)).toEqual(['Salt and Tide'])
  })
  it('skip a look note, and notes far below or in the next column', () => {
    const m = COVERS(); markUnderWords(m, [{ text: 'four covers solid', at: { x: 130, y: 684 } }, { text: 'Footer far down', at: { x: 40, y: 800 } }])
    expect(m[0]!.under).toBeUndefined()
  })
  it('a note on or in the box, or under a small pill, is not one', () => {
    const m = COVERS(); markUnderWords(m, [{ text: 'Inside words', at: { x: 60, y: 400 } }])
    expect(m[0]!.under).toBeUndefined()
    const pill = [box('p', 40, 186, 58, 37)]; markUnderWords(pill, [{ text: 'Results', at: { x: 40, y: 240 } }])
    expect(pill[0]!.under).toBeUndefined()
  })
  it('a note inside another drawn box belongs to that box', () => {
    const m = [box('a', 40, 100, 270, 200), box('c', 30, 310, 300, 100)]; markUnderWords(m, [{ text: 'Card words', at: { x: 50, y: 320 } }])
    expect(m[0]!.under).toBeUndefined()
  })
  it('a panel round both does not take them', () => {
    const m = [box('a', 40, 100, 270, 200), box('panel', 20, 80, 800, 500)]; markUnderWords(m, [{ text: 'Caption here', at: { x: 50, y: 320 } }])
    expect(m[0]!.under!.map((u) => u.copy)).toEqual(['Caption here'])
  })
  it('are told, and checked on the page', () => {
    const m = COVERS(); markUnderWords(m, NOTES)
    expect(underWordsBrief([{ shapeMarks: m }])).toContain('ends at y 670')
    const inside = verifyUnderWords(m, { nodes: [node('The Deep Blue', 60, 576)] })
    expect(inside.satisfied).toBe(false)
    expect(inside.reason).toContain('below y 670')
    expect(verifyUnderWords(m, { nodes: [node('The Deep Blue', 60, 684)] }).satisfied).toBe(true)
    expect(verifyUnderWords(m, { nodes: [] }).unverifiable).toBe(true)
  })
})

describe('n268: a drawn colour built as a border', () => {
  const action = { color: { drawn: '#e5e7eb' }, region: { x: 0, y: 70, w: 1280, h: 1 }, targets: [] } as never
  const page = (style: object) => ({ nodes: [{ rect: { x: 0, y: 0, w: 1280, h: 70 }, style: { color: 'rgb(15, 23, 42)', backgroundColor: 'rgb(255, 255, 255)', ...style } }] }) as never
  it('is on the page', () => {
    expect(verifyColor(action, page({ borderBottom: '1px rgb(229, 231, 235)' })).satisfied).toBe(true)
    expect(verifyColor(action, page({ border: '1px rgb(229, 231, 235)' })).satisfied).toBe(true)
  })
  it('and no border of it still fails', () => {
    expect(verifyColor(action, page({ color: 'rgb(15, 23, 42)', backgroundColor: 'rgb(15, 23, 42)' })).satisfied).toBe(false)
  })
})

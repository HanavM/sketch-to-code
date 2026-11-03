import { describe, expect, it } from 'vitest'
import { markRowWords, rowListItems, rowWordsBrief } from '../src/rowwords.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } }) as ShapeMark
// round 41 e4 file browser, as drawn in n150: two rows of four cards, a small icon box inside the first folder card
const folders = () => [box('f1', 279, 151, 224, 151), box('f2', 526, 151, 224, 151), box('f3', 770, 151, 224, 152), box('f4', 1017, 151, 224, 152), box('icon', 299, 171, 56, 45)]
const files = () => [box('g1', 279, 323, 224, 151), box('g2', 525, 323, 224, 151), box('g3', 770, 324, 224, 151), box('g4', 1016, 323, 224, 151)]
const folderNote = { text: 'folders, yellow icon: Client work 14 files, Invoices 32, Photos 208, Archive 9', focus: ['f2'] }
const fileNote = { text: 'Brief.docx 2 MB, Cover.png 4 MB, Budget.xlsx 1 MB, Logo.svg 80 KB; blue, green icons', focus: ['g2'] }

describe('n153 a row of cards gets one item each from a note with a lead or a look tail', () => {
  it('reads the items past a lead before a colon and a look tail after a semicolon', () => {
    expect(rowListItems(folderNote.text)).toEqual(['Client work 14 files', 'Invoices 32', 'Photos 208', 'Archive 9'])
    expect(rowListItems(fileNote.text)).toEqual(['Brief.docx 2 MB', 'Cover.png 4 MB', 'Budget.xlsx 1 MB', 'Logo.svg 80 KB'])
  })

  it('never splits look words, a total, or a long sentence', () => {
    expect(rowListItems('big, bold, dark')).toBeNull()
    expect(rowListItems('Total: $40')).toBeNull()
    expect(rowListItems('Hello, this is a long sentence that goes on, and on, with commas everywhere in it, ok')).toBeNull()
    expect(rowListItems('Mon 14, Tue, Wed 16')).toBeNull()
  })

  it('gives each card of the row its own item in drawn order, the icon inside a card left alone', () => {
    const ms = [...folders(), ...files()]
    markRowWords(ms, [folderNote, fileNote])
    expect(ms.slice(0, 4).map((m) => m.own)).toEqual(['Client work 14 files', 'Invoices 32', 'Photos 208', 'Archive 9'])
    expect(ms[4]!.own).toBeUndefined()
    expect(ms.slice(5).map((m) => m.own)).toEqual(['Brief.docx 2 MB', 'Cover.png 4 MB', 'Budget.xlsx 1 MB', 'Logo.svg 80 KB'])
    expect(rowWordsBrief([{ shapeMarks: ms }])).toContain('"Photos 208"')
  })

  it('does not spread when the items and the cards do not match in number', () => {
    const ms = folders().slice(0, 3)
    markRowWords(ms, [{ ...folderNote, focus: ['f2'] }])
    expect(ms.map((m) => m.own)).not.toContain('Client work 14 files')
    expect(ms.some((m) => m.listNote)).toBe(false)
  })
})

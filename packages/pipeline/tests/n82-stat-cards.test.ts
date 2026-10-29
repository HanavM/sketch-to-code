import { describe, it, expect } from 'vitest'
import { statOf, markStats, verifyStats } from '../src/statcard.js'
import { markAreasAndEdges, isAreaNote } from '../src/areas.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })

describe('n82 stat cards', () => {
  it('reads a number and its label from one note or two', () => {
    expect(statOf(['6 big, on loan grey'])).toEqual({ value: '6', label: 'on loan' })
    expect(statOf(['2 big, due this week grey'])).toEqual({ value: '2', label: 'due this week' })
    expect(statOf(['Total lifted, grey', '12480 kg, huge bold white'])).toEqual({ value: '12480 kg', label: 'Total lifted', labelAbove: true })
    expect(statOf(['Streak, grey', '9 days, huge bold white'])).toEqual({ value: '9 days', label: 'Streak', labelAbove: true })
    expect(statOf(['6 · on loan'])).toEqual({ value: '6', label: 'on loan' })
  })
  it('leaves a lone big word, rows and plain copy alone', () => {
    expect(statOf(['huge outlined 09, white'])).toBeNull()
    expect(statOf(['giant SALE'])).toBeNull()
    expect(statOf(['3 rows: Route, Start, Groups'])).toBeNull()
    expect(statOf(['Search the catalogue, grey'])).toBeNull()
    expect(statOf(['The Salt Path · 2 Nov · Due soon, 6 rows like this'])).toBeNull()
  })
  it('a stat box is a card, never an area; a lone big number box stays an area', () => {
    const s = box('s1', 288, 104, 300, 96), a = box('a1', 100, 400, 400, 200)
    const notes = [{ text: '6 big, on loan grey', focus: ['s1'], at: { x: 330, y: 150 } }, { text: 'huge outlined 09, white', focus: ['a1'] }]
    expect(isAreaNote(notes[0]!.text)).toBe(true)
    const marks = [s, a]
    markAreasAndEdges(marks, notes, { w: 1280, h: 900 })
    markStats(marks, notes)
    expect(s.area).toBeUndefined()
    expect(s.card).toEqual({ fill: null })
    expect(s.stat).toEqual({ value: '6', label: 'on loan' })
    expect(a.area).toBe(true)
    expect(a.stat).toBeUndefined()
  })
  it('checks the value left inside the card and the label under it', () => {
    const s = box('s1', 288, 104, 300, 96); s.stat = { value: '6', label: 'on loan' }; s.card = { fill: null }
    const good = { nodes: [
      { id: 'v', rect: { x: 312, y: 120, w: 20, h: 40 }, textBox: { x: 312, y: 120, w: 20, h: 40 }, text: '6' },
      { id: 'l', rect: { x: 312, y: 164, w: 60, h: 18 }, textBox: { x: 312, y: 164, w: 60, h: 18 }, text: 'on loan' }] }
    expect(verifyStats([s], good).satisfied).toBe(true)
    const centred = { nodes: [
      { id: 'v', rect: { x: 430, y: 120, w: 20, h: 40 }, textBox: { x: 430, y: 120, w: 20, h: 40 }, text: '6' },
      { id: 'l', rect: { x: 312, y: 164, w: 60, h: 18 }, textBox: { x: 312, y: 164, w: 60, h: 18 }, text: 'on loan' }] }
    const v = verifyStats([s], centred)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/left/)
  })
})

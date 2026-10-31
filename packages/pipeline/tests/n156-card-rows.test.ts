import { describe, expect, it } from 'vitest'
import { cardRowsBrief, cardRowsOf, headCopy, headNote, markCardRows, verifyCardRows } from '../src/cardrows.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const box = (id: string, x: number, y: number, w: number, h: number, typed?: ShapeMark['typed']): ShapeMark =>
  ({ strokeId: id, shape: 'box', box: { x, y, w, h }, ...(typed ? { typed } : {}) }) as ShapeMark
const line = (id: string, x: number, y: number, w: number): ShapeMark =>
  ({ strokeId: id, shape: 'line', box: { x, y, w, h: 0 }, from: { x, y }, to: { x: x + w, y } }) as ShapeMark
const ring = (id: string, cx: number, cy: number, d: number): ShapeMark =>
  ({ strokeId: id, shape: 'ellipse', box: { x: cx - d / 2, y: cy - d / 2, w: d, h: d } }) as ShapeMark
const ROWS = 'rows: Corner Grocer −$42.18, Salary +$2,400.00 green, City Transit −$12.50, Streamly −$9.99; grey sub-line, dividers'
// round 41 e1 bank home as drawn in n150: the Recent card, its heading line and note, the first row's ring, the rows note mid-card
const bank = (withRing = true) => {
  const card = box('s18', 278, 327, 954, 333, [{ text: ROWS, x: 760, y: 520 }])
  const head = line('s20', 306, 363, 60)
  const shapes = [card, head, ...(withRing ? [ring('s21', 346, 427, 16)] : [])]
  return { card, marks: [card, head], shapes, notes: [{ text: 'Recent bold', x: 336, y: 363 }, { text: ROWS, x: 760, y: 520 }] }
}
const text = (t: string, x: number, y: number, w = 80, h = 16) => ({ rect: { x, y, w, h }, textBox: { x, y, w, h }, text: t })

describe('n156 rows typed in a card start under its heading', () => {
  it('reads short headings only', () => {
    expect(headNote('Recent bold')).toBe(true)
    expect(headNote(ROWS)).toBe(false)
    expect(headNote('nav: Home, Cards')).toBe(false)
    expect(headCopy('Recent bold')).toBe('recent')
  })

  it('bank home: rows start under Recent, first row level with the drawn ring', () => {
    const { card, marks, shapes, notes } = bank()
    const lists = markCardRows(marks, shapes, notes, vp)
    expect(lists).toHaveLength(1)
    const l = lists[0]!
    expect(l.rows).toBe(4)
    expect(l.start).toBeGreaterThan(363 + 14)
    expect(Math.abs(l.start + l.pitch / 2 - 427)).toBeLessThanOrEqual(2)
    expect(l.start + l.rows * l.pitch).toBeLessThanOrEqual(660)
    expect(card.typed![0]!.y).toBe(l.start + Math.round(l.pitch / 2))
    expect(cardRowsOf(marks)).toHaveLength(1)
    expect(cardRowsBrief(lists)).toContain('under its heading "Recent bold"')
  })

  it('a card read as an area (its rows note on the action, not typed on it), the first icon drawn as a small box', () => {
    const card = box('s18', 277, 326, 955, 351)
    const head = line('s20', 306, 363, 60)
    const icon = box('s21', 306, 404, 40, 39)
    const notes = [{ text: 'Recent bold', x: 336, y: 363 }, { text: ROWS, x: 760, y: 520 }]
    const lists = markCardRows([card, head, icon], [card, head, icon], notes, vp)
    expect(lists).toHaveLength(1)
    expect(Math.abs(lists[0]!.start + lists[0]!.pitch / 2 - 423.5)).toBeLessThanOrEqual(2)
    expect(cardRowsOf([card])).toHaveLength(1)
  })

  it('without a ring: rows start 18px under the heading', () => {
    const { marks, shapes, notes } = bank(false)
    const l = markCardRows(marks, shapes, notes, vp)[0]!
    expect(l.start).toBe(363 + 14 + 18)
  })

  it('leaves drawn rows and notes typed near the top alone', () => {
    const a = bank()
    expect(markCardRows(a.marks, [...a.shapes, line('d1', 290, 470, 920)], a.notes, vp)).toHaveLength(0)
    const card = box('s18', 278, 327, 954, 333, [{ text: ROWS, x: 760, y: 390 }])
    expect(markCardRows([card], [card], [{ text: 'Recent bold', x: 336, y: 363 }, { text: ROWS, x: 760, y: 390 }], vp)).toHaveLength(0)
    // no heading: nothing to stay under
    const bare = box('s18', 278, 327, 954, 333, [{ text: ROWS, x: 760, y: 520 }])
    expect(markCardRows([bare], [bare], [{ text: ROWS, x: 760, y: 520 }], vp)).toHaveLength(0)
  })

  it('checks the first row is under the heading on the page', () => {
    const { marks, shapes, notes } = bank()
    const lists = markCardRows(marks, shapes, notes, vp)
    const over = verifyCardRows(lists, { nodes: [text('Recent', 290, 335, 60, 18), text('Corner Grocer', 340, 338, 90, 14)] })
    expect(over.satisfied).toBe(false)
    expect(over.reason).toContain('over the card\'s heading')
    const ok = verifyCardRows(lists, { nodes: [text('Recent', 300, 356, 60, 18), text('Corner Grocer', 370, 420, 90, 14)] })
    expect(ok.satisfied).toBe(true)
    expect(verifyCardRows(lists, { nodes: [] }).unverifiable).toBe(true)
  })
})

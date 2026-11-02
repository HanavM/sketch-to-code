import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { countedItems, drawnListBrief, drawnLists, verifyDrawnLists } from '../src/drawnlist.js'
import { hasSampleRows, rowData } from '../src/rowdata.js'
import { hasFillerRows } from '../src/rowtemplate.js'

const NOTE = 'x4 down: Loan amount $24,000 half; Term 60 months 70%; Interest rate 6.4% 30%; Down payment $4,000 20%; values bold right'
const line = (id: string, x0: number, x1: number, y: number, color?: string): Stroke => ({ id, points: [{ x: x0, y }, { x: x1, y }], ...(color ? { color } : {}) })
const ring = (id: string, cx: number, cy: number, rad: number, color?: string): Stroke => ({
  id, ...(color ? { color } : {}),
  points: Array.from({ length: 17 }, (_, k) => ({ x: cx + rad * Math.cos((k / 16) * 2 * Math.PI), y: cy + rad * Math.sin((k / 16) * 2 * Math.PI) })),
})
// round 46 e5: four grey lines, a green part and a ring on the first
const strokes: Stroke[] = [
  line('a', 50, 670, 268, '#e5e7eb'), line('b', 50, 670, 388, '#e5e7eb'), line('c', 50, 670, 508, '#e5e7eb'), line('d', 50, 670, 628, '#e5e7eb'),
  line('f', 50, 354, 268, '#059669'), ring('k', 354, 268, 12, '#059669'),
]
const vp = { w: 1280, h: 900 }
const notes = [{ text: NOTE, at: { x: 50, y: 230 } }]

const text = (t: string, x: number, y: number, w = 100) => ({ id: t, tag: 'span', rect: { x, y: y - 10, w, h: 20 }, text: t, textBox: { x, y: y - 10, w, h: 20 } })
const bar = (id: string, x: number, y: number, w: number) => ({ id, tag: 'div', rect: { x, y: y - 3, w, h: 6 } })
const good = () => {
  const rows: Array<[string, string, number, number]> = [['Loan amount', '$24,000', 268, 0.5], ['Term', '60 months', 388, 0.7], ['Interest rate', '6.4%', 508, 0.3], ['Down payment', '$4,000', 628, 0.2]]
  return rows.flatMap(([l, v, y, s]) => [text(l, 50, y - 38), text(v, 570, y - 38), bar(`t${l}`, 50, y, 620), bar(`f${l}`, 50, y, 620 * s)])
}

describe('a count with its items is those items (n214)', () => {
  it('reads the items, values and shares, never the count words', () => {
    const c = countedItems(NOTE)!
    expect(c.n).toBe(4)
    expect(c.items[0]).toEqual({ label: 'Loan amount', value: '$24,000', share: 0.5 })
    expect(c.items[1]).toEqual({ label: 'Term', value: '60 months', share: 0.7 })
    expect(c.items[2]).toEqual({ label: 'Interest rate', value: '6.4%', share: 0.3 })
    expect(c.looks).toEqual(['values bold right'])
  })
  it('asks for no sample rows, and rowData gives the typed rows', () => {
    const d = rowData(NOTE)!
    expect(d.total).toBeNull()
    expect(d.rows).toHaveLength(4)
    expect(d.rows[0]).toEqual(['Loan amount', '$24,000'])
    expect(hasSampleRows([NOTE])).toBe(false)
    expect(hasFillerRows([NOTE])).toBe(false)
  })
  it('leaves a count with no list, or a wrong number of items, as it was', () => {
    expect(countedItems('The Salt Path · 2 Nov x6')).toBeNull()
    expect(countedItems('x4 down: Only; Two')).toBeNull()
    expect(rowData('The Salt Path · 2 Nov x6')!.total).toBe(6)
    expect(countedItems('Tea, coffee: 3 kinds')).toBeNull()
  })
  it('finds the drawn lines, the filled part and the knob', () => {
    const [l] = drawnLists(notes, strokes, vp)
    expect(l!.ys).toEqual([268, 388, 508, 628])
    expect(l!.x).toBe(50)
    expect(l!.w).toBe(620)
    expect(l!.textDy).toBe(-38)
    expect(l!.valueRight).toBe(true)
    expect(l!.fill?.colour).toBe('#059669')
    expect(l!.knob?.d).toBeGreaterThanOrEqual(20)
    const b = drawnListBrief([l!])
    expect(b).toMatch(/row 2: line at y 388, words "Term" and "60 months"/)
    expect(b).toMatch(/never add a row/)
    expect(b).not.toMatch(/"70%" at/)
  })
  it('repeats one drawn line down, within the room above the next mark', () => {
    const [l] = drawnLists([{ text: '3 sliders: Bass 10%, Mid 20%, Treble 30%', at: { x: 100, y: 180 } }], [line('a', 100, 500, 200), line('z', 100, 500, 500, '#111')], vp)
    expect(l!.ys[0]).toBe(200)
    // the like line at 500 is the only other level, so it counts as line 2
    expect(l!.drawn).toBe(2)
    const [o] = drawnLists([{ text: '3 sliders: Bass 10%, Mid 20%, Treble 30%', at: { x: 100, y: 180 } }], [line('a', 100, 500, 200)], vp)
    expect(o!.drawn).toBe(1)
    expect(o!.ys).toEqual([200, 296, 392])
  })
  it('passes the typed rows on their lines', () => {
    expect(verifyDrawnLists(drawnLists(notes, strokes, vp), { nodes: good() }).satisfied).toBe(true)
  })
  it('fails invented rows, the count printed, and rows off their lines', () => {
    const lists = drawnLists(notes, strokes, vp)
    const invented = verifyDrawnLists(lists, { nodes: [...good(), text('Vehicle price: $31,500', 50, 320, 150)] })
    expect(invented.satisfied).toBe(false)
    expect(invented.reason).toMatch(/Vehicle price.*not one of the typed rows/)
    const printed = verifyDrawnLists(lists, { nodes: good().map((n) => (n.text === 'Loan amount' ? { ...n, text: 'down: Loan amount' } : n)) })
    expect(printed.satisfied).toBe(false)
    expect(printed.reason).toMatch(/prints the count's words/)
    const off = verifyDrawnLists(lists, { nodes: good().map((n) => (n.text === 'Term' ? { ...n, textBox: { ...n.textBox!, y: 240 } } : n)) })
    expect(off.reason).toMatch(/"Term" sits at y 250/)
  })
  it('fails a missing track and a wrong filled part', () => {
    const lists = drawnLists(notes, strokes, vp)
    const noTrack = verifyDrawnLists(lists, { nodes: good().filter((n) => n.id !== 'tTerm') })
    expect(noTrack.reason).toMatch(/line 2 is missing at y 388/)
    const noFill = verifyDrawnLists(lists, { nodes: good().filter((n) => n.id !== 'fTerm') })
    expect(noFill.reason).toMatch(/line 2's filled part/)
  })
})

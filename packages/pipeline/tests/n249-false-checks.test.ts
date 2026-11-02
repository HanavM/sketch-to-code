import { describe, expect, it } from 'vitest'
import { verifyColor } from '../src/run2.js'
import { countedRow, countRows } from '../src/countrow.js'
import { rowData } from '../src/rowdata.js'
import { topBands } from '../src/topbands.js'
import { markPaleDividers } from '../src/ruleline.js'
import { looksOnly } from '../src/rowwords.js'
import { markOpenRows, openRowsBrief, verifyOpenRows } from '../src/openrows.js'
import { placedBrief, placedRowsOf, verifyPlaced } from '../src/textplace.js'

const HOURS = 'x8 across: 8am 10am 12pm 2pm 4pm 6pm 8pm 10pm, grey bold'
const ROWS = 'x6 down, ruled rows: Maya, Barista; Tom, Barista; Ines, Kitchen; Sam, Kitchen; Ravi, Floor; Jo, Floor'

describe('n249: one-word items split by spaces after a count across', () => {
  it('are that many items, with the look kept apart', () => {
    const c = countedRow(HOURS)!
    expect(c.items.map((i) => i.main)).toEqual(['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm'])
    expect(c.looks).toEqual(['grey bold'])
  })
  it('are never one table row with samples to invent', () => {
    expect(rowData(HOURS)).toBeNull()
  })
  it('a different number of words stays what it was', () => {
    expect(countedRow('x3 across: Open daily now, Pier fourteen')).toBeNull()
    expect(countedRow('x3 across: Mon Tue')).toBeNull()
  })
  it('a comma list still reads as before', () => {
    expect(countedRow('x3 across: Mon, Tue, Wed')!.items.map((i) => i.main)).toEqual(['Mon', 'Tue', 'Wed'])
  })
})

describe('n249: a pale pen on a counted row', () => {
  const stroke = (color: string) => ({ id: 's', color, points: [{ x: 240, y: 190 }, { x: 740, y: 190 }, { x: 1240, y: 190 }] })
  it('never tells the words that colour; a dark pen still does', () => {
    const at = { x: 300, y: 181 }
    expect(countRows([{ text: HOURS, at }], [stroke('#dfe5ea')] as never, { w: 1280, h: 900 })[0]!.colour).toBeUndefined()
    expect(countRows([{ text: HOURS, at }], [stroke('#223344')] as never, { w: 1280, h: 900 })[0]!.colour).toBe('#223344')
  })
  it('is a rule-only pen, so no check asks for pale words', () => {
    const inks = [{ strokeId: 's', paint: 'text', color: '#dfe5ea', how: 'pen' } as { strokeId: string; paint: string; color: string; how: string; ruleOnly?: true }]
    markPaleDividers([{ strokeId: 's', shape: 'line', box: { w: 1000, h: 0 }, words: HOURS }], inks, { r: 255, g: 255, b: 255 } as never, 1280)
    expect(inks[0]!.ruleOnly).toBe(true)
  })
  it('its line is not the bottom of a top band; a bare line still is', () => {
    const line = { shape: 'line', box: { x: 240, y: 190, w: 1000, h: 0 } } as never
    expect(topBands([line], { w: 1280, h: 900 })).toHaveLength(1)
    expect(topBands([{ ...(line as object), words: HOURS } as never], { w: 1280, h: 900 })).toHaveLength(0)
  })
})

describe('n249: a note that only says how a card looks', () => {
  it('is no card words', () => {
    for (const t of ['white, filled bars', 'white panel', 'filled', 'dark, rounded']) expect(looksOnly(t)).toBe(true)
  })
  it('real words stay words', () => {
    for (const t of ['White shirts', 'Upload', 'white noise machine for sale', 'blue: 3', 'save this', 'red 5']) expect(looksOnly(t)).toBe(false)
  })
})

describe('n249: rows typed in open space start at the spot typed', () => {
  const n = { text: ROWS, x: 40, y: 225 }
  const snap = (x: number, y: number) => ({ viewport: { w: 1280, h: 900 }, nodes: [{ text: 'Maya', rect: { x, y, w: 40, h: 20 }, textBox: { x, y, w: 40, h: 20 } }] })
  it('finds the first cells, on the left only, and only for listed rows', () => {
    expect(placedRowsOf(n, 1280)).toEqual(['Maya', 'Tom', 'Ines', 'Sam', 'Ravi', 'Jo'])
    expect(placedRowsOf({ ...n, x: 700 }, 1280)).toBeNull()
    expect(placedRowsOf({ text: 'Thursday shifts', x: 40 }, 1280)).toBeNull()
    expect(placedRowsOf({ text: 'x6 down: Maya, Barista', x: 40 }, 1280)).toBeNull()
  })
  it('is told', () => {
    const b = placedBrief([n], { w: 1280, h: 900 })
    expect(b).toContain('STARTS at x 40')
    expect(b).toContain('only as wide as its own words')
  })
  it('is checked: right spot passes, page edge and wrong height fail', () => {
    expect(verifyPlaced([n], snap(40, 215) as never).satisfied).toBe(true)
    const edge = verifyPlaced([n], snap(2, 215) as never)
    expect(edge.satisfied).toBe(false)
    expect(edge.reason).toContain('start every row')
    expect(verifyPlaced([n], snap(40, 290) as never).satisfied).toBe(false)
  })
  it('rows not built are not judged here', () => {
    expect(verifyPlaced([n], { viewport: { w: 1280, h: 900 }, nodes: [] } as never).satisfied).toBe(true)
  })
})

describe('n249: open rows under a band across the page', () => {
  const band = { shape: 'box', box: { x: 2, y: 1, w: 1276, h: 76 } }
  const note = { text: ROWS, x: 40, y: 225 }
  const placed = () => markOpenRows([note], [band] as never, [note] as never, 1280)
  const snap = (x: number, y: number) => ({ nodes: [{ text: 'Maya', rect: { x, y, w: 40, h: 20 }, textBox: { x, y, w: 40, h: 20 } }] })
  it('start at the spot typed, told so', () => {
    const p = placed()
    expect(p[0]!.openRows?.startX).toBe(40)
    expect(openRowsBrief(p as never)).toContain('STARTS at x 40')
  })
  it('are checked at that spot, and a tight row is no fault', () => {
    const p = placed()
    const mid = p[0]!.openRows!.firstMid
    expect(verifyOpenRows(p as never, snap(40, mid - 10) as never).satisfied).toBe(true)
    const off = verifyOpenRows(p as never, snap(2, mid - 10) as never)
    expect(off.satisfied).toBe(false)
    expect(off.reason).toContain('start every row')
  })
  it('take their pitch from one box per row drawn beside them', () => {
    const bars = [210, 300, 390, 480, 570, 660].map((y, k) => ({ shape: 'box', box: { x: 240 + k * 10, y, w: 400, h: 52 } }))
    const p = markOpenRows([note], [band, ...bars] as never, [note] as never, 1280)
    expect(p[0]!.openRows).toMatchObject({ startX: 40, pitch: 90, firstMid: 225 })
    expect(p[0]!.y).toBe(225)
  })
  it('a different number of boxes says nothing about the pitch', () => {
    const bars = [210, 300, 390].map((y) => ({ shape: 'box', box: { x: 240, y, w: 400, h: 52 } }))
    expect(markOpenRows([note], [band, ...bars] as never, [note] as never, 1280)[0]!.openRows!.pitch).not.toBe(90)
  })
  it('a field that is a real panel keeps its full-width rows', () => {
    const panel = { shape: 'box', box: { x: 300, y: 100, w: 600, h: 80 } }
    const n = { text: ROWS, x: 340, y: 225 }
    const p = markOpenRows([n], [panel] as never, [n] as never, 1280)
    expect(p[0]!.openRows?.startX).toBeUndefined()
  })
})

describe('n249: the drawn-colour check', () => {
  const node = (rect: object, color: string, textBox?: object) => ({ rect, textBox, text: 'x', style: { color } })
  const act = (css: string, notes: string[]) => ({ color: { drawn: css }, region: { x: 260, y: 30, w: 330, h: 20 }, targets: [], notes })
  it('finds a heading by its words when its element runs far past them', () => {
    const wide = node({ x: 260, y: 30, w: 982, h: 40 }, 'rgb(30,36,54)', { x: 260, y: 32, w: 287, h: 35 })
    expect(verifyColor(act('#1e2436', []) as never, { nodes: [wide] } as never).satisfied).toBe(true)
  })
  it('never asks a counted row for its line\'s pale pen; other pale colours are still checked', () => {
    expect(verifyColor(act('#dfe5ea', [HOURS]) as never, { nodes: [] } as never).satisfied).toBe(true)
    expect(verifyColor(act('#dfe5ea', ['Hello']) as never, { nodes: [] } as never).satisfied).toBe(false)
  })
})

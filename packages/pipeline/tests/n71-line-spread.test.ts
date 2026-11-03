import { describe, expect, it } from 'vitest'
import { isTableRow, lineSpreadBrief, notHeading, rowItems, spreadCentres, verifyLineSpread, verifyTableRows } from '../src/linespread.js'
import { lineAsksBig } from '../src/linespan.js'
import { bodyLineFont } from '../src/linkline.js'

const line = (id: string, x0: number, x1: number, y: number, words: string) =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 1 }, from: { x: x0, y }, to: { x: x1, y }, words })

// round 34 e3 habits (n66 sketch): day letters typed on a 500px line over the week's columns
const days = line('d', 570, 1070, 131, 'M T W T F S S, small grey')
const leaf = (id: string, x: number, y: number, w: number, h: number, text?: string, fs = 12) =>
  ({ id, rect: { x, y, w, h }, text, textBox: text ? { x, y, w, h } : undefined, style: { fontSize: `${fs}px` } })

describe('short items on a drawn line are spread over it (n71)', () => {
  it('reads single letters as items and spaces them over the line', () => {
    expect(rowItems('M T W T F S S, small grey')).toEqual(['M', 'T', 'W', 'T', 'F', 'S', 'S'])
    const c = spreadCentres('M T W T F S S, small grey', 570, 1070)!
    expect(c).toHaveLength(7)
    expect(c[0]).toBe(570); expect(c[6]).toBe(1070); expect(c[1]! - c[0]!).toBeGreaterThan(80)
    expect(spreadCentres('Shop Events Clubs', 400, 900)).toBeNull()
    expect(spreadCentres('M T W', 400, 450)).toBeNull()
  })
  it('tells the centres and the columns under them', () => {
    const b = lineSpreadBrief([{ shapeMarks: [days] }])
    expect(b).toContain('centres at x 570, 653')
    expect(b).toContain('SAME columns')
  })
  it('fails letters packed at the left, passes them spread', () => {
    const packed = { nodes: 'MTWTFSS'.split('').map((t, k) => leaf(`l${k}`, 560 + k * 56, 125, 10, 14, t)) }
    expect(verifyLineSpread([days], packed).satisfied).toBe(false)
    const spread = { nodes: 'MTWTFSS'.split('').map((t, k) => leaf(`l${k}`, 565 + k * 83.3, 125, 10, 14, t)) }
    expect(verifyLineSpread([days], spread).satisfied).toBe(true)
  })
  it('fails circles under the letters that are packed, though the letters are right', () => {
    const letters = 'MTWTFSS'.split('').map((t, k) => leaf(`l${k}`, 565 + k * 83.3, 125, 10, 14, t))
    const circles = [200, 300].flatMap((y) => Array.from({ length: 7 }, (_, k) => leaf(`c${y}${k}`, 556 + k * 56, y, 28, 28)))
    const v = verifyLineSpread([days], { nodes: [...letters, ...circles] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('repeated per item')
  })
})

describe('a table row on a long line is not a heading (n71)', () => {
  it('reads departures rows as table rows, headings not', () => {
    expect(isTableRow('14:40 Lisbon TP 1351 B12 Boarding blue pill')).toBe(true)
    expect(isTableRow('15:10 Rome AZ 211 C7 Delayed brown')).toBe(true)
    expect(isTableRow('Fresh herbs, picked this morning')).toBe(false)
    expect(isTableRow('Since 1998 we bake bread every morning')).toBe(false)
    expect(notHeading('TIME DESTINATION FLIGHT GATE STATUS, small grey spaced')).toBe(true)
  })
  it('never sizes a table row or a small line by its length', () => {
    expect(lineAsksBig('14:40 Lisbon TP 1351 B12 Boarding blue pill', 965)).toBe(false)
    expect(lineAsksBig('TIME DESTINATION FLIGHT GATE STATUS, small grey spaced', 950)).toBe(false)
    expect(bodyLineFont('14:40 Lisbon TP 1351 B12 Boarding blue pill', 965)).toBeNull()
    expect(lineAsksBig('Fresh herbs, picked this morning', 916)).toBe(true)
  })
  it('checks the row is built at body size', () => {
    const row = line('r', 60, 1025, 196, '14:40 Lisbon TP 1351 B12 Boarding blue pill')
    expect(verifyTableRows([row], { nodes: [leaf('a', 60, 170, 130, 50, '14:40', 48)] }).satisfied).toBe(false)
    expect(verifyTableRows([row], { nodes: [leaf('a', 60, 186, 40, 18, '14:40', 15)] }).satisfied).toBe(true)
    expect(lineSpreadBrief([{ shapeMarks: [row] }])).toContain('TABLE ROW')
  })
})

import { noteFocus } from '@s2c/ink'
describe('a note typed right on a level line is that line\'s words (n71)', () => {
  const walk = (id: string, pts: number[][]) => ({ id, points: pts.flatMap(([a, b], i) => {
    const nx = pts[i + 1]; if (!nx) return [{ x: a!, y: b!, t: 0 }]
    return Array.from({ length: 10 }, (_, k) => ({ x: a! + (nx[0]! - a!) * k / 10, y: b! + (nx[1]! - b!) * k / 10, t: 0 }))
  }) })
  // round 34 e3 habits: the day-letter line at y 131, the first card box 24px under it
  const S = [walk('line', [[570, 131], [1070, 131]]), walk('card', [[280, 155], [1220, 155], [1220, 239], [280, 239], [280, 156]])]
  it('binds "M T W T F S S" to the line alone, not the card under it too', () => {
    expect(noteFocus(['line', 'card'], undefined, { x: 800, y: 126 }, S as never, 'M T W T F S S, small grey')).toEqual(['line'])
  })
})

import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { countRowBrief, countRows, countedRow, verifyCountRows } from '../src/countrow.js'
import { cellRows, countedItems, drawnLists } from '../src/drawnlist.js'
import { rowData } from '../src/rowdata.js'
import { likeCount } from '../src/rowtemplate.js'

const line = (id: string, x0: number, x1: number, y: number, color?: string): Stroke => ({ id, points: [{ x: x0, y }, { x: x1, y }], ...(color ? { color } : {}) })
const box = (id: string, x0: number, y0: number, x1: number, y1: number): Stroke => ({ id, points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }] })
const vp = { w: 1280, h: 900 }
const CIRCUS = 'x3 across: June 4, Opening night; 7pm, Doors at six; $18, Kids go free; white under'
const SEA = 'x3 across: Open daily 9 to 6; Pier 14; Adults $24; bold'
const FOLD = 'x3 spaced across: 12 seats a night; Thursdays; $40 a class'
const t = (s: string, x: number, y: number, w = 90, h = 20) => ({ rect: { x, y: y - h / 2, w, h }, text: s, textBox: { x, y: y - h / 2, w, h } })

describe('a count across is one row of its items (n223)', () => {
  it('reads items, the line under each, and looks; never a table or rows down', () => {
    const c = countedRow(CIRCUS)!
    expect(c.items).toEqual([{ main: 'June 4', under: 'Opening night' }, { main: '7pm', under: 'Doors at six' }, { main: '$18', under: 'Kids go free' }])
    expect(c.looks).toEqual(['white under'])
    expect(countedRow(SEA)!.items.map((i) => i.main)).toEqual(['Open daily 9 to 6', 'Pier 14', 'Adults $24'])
    expect(countedRow(FOLD)!.n).toBe(3)
    expect(countedRow('row of 3: A one; B two; C three')!.n).toBe(3)
    expect(countedRow('three across: Home, Menu, Cart')!.items.map((i) => i.main)).toEqual(['Home', 'Menu', 'Cart'])
    for (const n of [CIRCUS, SEA, FOLD]) {
      expect(cellRows(n)).toBeNull()
      expect(countedItems(n)).toBeNull()
      expect(rowData(n)).toBeNull()
      expect(likeCount(n)).toBeNull()
    }
  })
  it('leaves other counts alone', () => {
    expect(countedRow('x4 down: Loan $1; Term $2; Rate $3; Down $4')).toBeNull()
    expect(countedRow('x4 across')).toBeNull()
    expect(countedRow('x7 across, white border: green, grey, grey, green, grey, green, grey')).toBeNull()
    expect(countedRow('x12, 3 across: 9:00, 9:30 off, 10:00')).toBeNull()
    expect(countedRow('x3 across: Only; Two')).toBeNull()
    expect(countedItems('x4 down: Loan $1; Term $2; Rate $3; Down $4')).not.toBeNull()
    expect(cellRows('x2 rows: Ana, Lead; Ben, Dev')).not.toBeNull()
  })
  it('spreads over the page from a short line, ignoring the band it lies in', () => {
    const [p] = countRows([{ text: CIRCUS, at: { x: 70, y: 736 } }], [box('band', 2, 650, 1276, 896), line('l', 64, 160, 716, '#f59e0b')], vp)
    expect(p).toMatchObject({ y: 716, x0: 64, x1: 1216, colour: '#f59e0b' })
    expect(countRowBrief([p!])).toContain('x 64 to x 1216')
  })
  it('takes the nearest line and its own ends when it runs most of the page', () => {
    const [p] = countRows([{ text: FOLD, at: { x: 80, y: 830 } }], [line('rule', 70, 1210, 771), line('l', 70, 1126, 810)], vp)
    expect(p).toMatchObject({ y: 810, x0: 70, x1: 1126 })
    expect(drawnLists([{ text: FOLD, at: { x: 80, y: 830 } }], [line('rule', 70, 1210, 771), line('l', 70, 1126, 810)], vp)).toEqual([])
  })
  it('stops at a mark drawn at that height', () => {
    const [p] = countRows([{ text: SEA, at: { x: 75, y: 835 } }], [line('l', 70, 214, 812), box('card', 800, 780, 1100, 860)], vp)
    expect(p!.x1).toBe(784)
  })
  it('makes no plan with no line, or no room', () => {
    expect(countRows([{ text: SEA, at: { x: 75, y: 300 } }], [line('l', 70, 214, 812)], vp)).toEqual([])
    expect(countRows([{ text: SEA, at: { x: 75, y: 835 } }], [line('l', 70, 214, 812), box('c', 230, 780, 300, 860)], vp)).toEqual([])
  })
  const plan = countRows([{ text: FOLD, at: { x: 80, y: 830 } }], [line('l', 70, 1126, 810)], vp)
  it('passes the row when built right', () => {
    const v = verifyCountRows(plan, { nodes: [t('12 seats a night', 70, 810, 120), t('Thursdays', 560, 810, 80), t('$40 a class', 1040, 810, 86)] })
    expect(v.satisfied).toBe(true)
  })
  it('fails a dropped item, a stack and a squeeze', () => {
    expect(verifyCountRows(plan, { nodes: [t('12 seats a night', 500, 810, 120)] }).reason).toContain('"Thursdays" is not on the page')
    expect(verifyCountRows(plan, { nodes: [t('12 seats a night', 70, 810), t('Thursdays', 70, 830), t('$40 a class', 70, 850)] }).satisfied).toBe(false)
    const squeezed = verifyCountRows(plan, { nodes: [t('12 seats a night', 70, 810, 40), t('Thursdays', 115, 810, 40), t('$40 a class', 160, 810, 40)] })
    expect(squeezed.reason).toContain('ends at x 200')
  })
  it('fails wrapped items and printed count words', () => {
    const wrapped = verifyCountRows(plan, { nodes: [t('12 seats a night', 70, 810, 120, 40), t('Thursdays', 560, 810, 80), t('$40 a class', 1040, 810, 86)] })
    expect(wrapped.reason).toContain('wraps')
    const printed = verifyCountRows(plan, { nodes: [t('12 seats a night', 70, 810, 120), t('Thursdays', 560, 810, 80), t('$40 a class', 1040, 810, 86), t('x3 spaced across:', 70, 780)] })
    expect(printed.reason).toContain("prints the count's words")
  })
})

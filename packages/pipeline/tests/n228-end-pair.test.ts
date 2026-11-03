import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { drawnListBrief, drawnLists, madeUpCells, verifyDrawnLists } from '../src/drawnlist.js'
import { endPair, endPairBrief, endPairs, verifyEndPairs } from '../src/endpair.js'
import { markStats } from '../src/statcard.js'
import { directionStrings, typedCopyBrief } from '../src/typedcopy.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x0: number, y0: number, x1: number, y1: number): Stroke => {
  const way: Array<[number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]
  const points: Array<{ x: number; y: number }> = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    for (let k = 0; k < 30; k++) points.push({ x: ax + ((bx - ax) * k) / 30, y: ay + ((by - ay) * k) / 30 })
  }
  points.push({ x: x0, y: y0 })
  return { id, points }
}
const line = (id: string, x0: number, x1: number, y: number): Stroke => ({ id, points: Array.from({ length: 40 }, (_, k) => ({ x: x0 + ((x1 - x0) * k) / 39, y })) })
const t = (s: string, x: number, y: number, w = 90, h = 20) => ({ rect: { x, y, w, h }, text: s, textBox: { x, y, w, h } })

describe('a name and a value go to the two ends of a bar (n228)', () => {
  it('reads the note, and only that form', () => {
    expect(endPair('Lisbon, 52%')).toEqual({ name: 'Lisbon', value: '52%', looks: [] })
    expect(endPair('Total hours, 40 big')).toEqual({ name: 'Total hours', value: '40', looks: ['big'] })
    expect(endPair('On track to save this month, $600')?.value).toBe('$600')
    expect(endPair('Income, $3,800')?.value).toBe('$3,800')
    for (const n of ['84 votes, closes Friday', 'Home, Menu, Cart', 'x3 across: A, 1; B, 2; C, 3', 'Rent, $960; Food, $600', 'Lisbon', 'lisbon, 52%', 'Total, 40 of 50 hours']) {
      expect(endPair(n), n).toBeNull()
    }
  })

  it('finds the bar: above a track beats the fill inside it, on a band, never a card', () => {
    const strokes = [box('t', 240, 292, 1040, 326), box('f', 240, 292, 656, 326), box('band', 260, 600, 1240, 680), box('card', 60, 100, 300, 220)]
    const plans = endPairs([
      { text: 'Lisbon, 52%', at: { x: 240, y: 270 } },
      { text: 'Total hours, 40 big', at: { x: 300, y: 640 } },
      { text: 'Income, $3,800', at: { x: 80, y: 150 } },
    ], strokes)
    expect(plans.map((p) => [p.name, p.where, p.bar.w])).toEqual([['Lisbon', 'above', 800], ['Total hours', 'on', 980]])
    const brief = endPairBrief(plans)
    expect(brief).toContain('"Lisbon"')
    expect(brief).toContain('font-size is at most 48px')
  })

  it('a stat card steps aside on a long bar, not on a card', () => {
    const mk = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } } as ShapeMark)
    const long = mk('a', 260, 600, 980, 80), card = mk('b', 60, 100, 240, 120)
    long.area = true
    markStats([long, card], [{ text: 'Total hours, 40 big', focus: ['a'] }, { text: 'Income, $3,800', focus: ['b'] }])
    expect(long.stat).toBeUndefined()
    expect(long.area).toBeUndefined()
    expect(long.card).toBeDefined()
    expect(card.stat?.value).toBe('$3,800')
  })

  it('the look word is no direction, and the copy tell names both pieces', () => {
    expect(directionStrings(['Total hours, 40 big'])).toEqual([])
    expect(typedCopyBrief(['Total hours, 40 big'])).toContain('"Total hours" and "40"')
  })

  it('rows with no values whose look names data keep their made-up cells', () => {
    const lines = [line('l', 260, 1240, 264), line('m', 260, 1240, 326)]
    const [l] = drawnLists([{ text: 'x3 rows: Website redo, Hiring, Admin; hours, totals bold', at: { x: 300, y: 232 } }], lines, { w: 1280, h: 900 })
    expect(l && madeUpCells(l)).toBe(true)
    expect(drawnListBrief([l!])).toContain('make up plausible numbers')
    const rowsOk = { nodes: [t('Website redo', 260, 222), t('Hiring', 260, 284), t('Admin', 260, 346), t('4', 600, 222, 12), t('16', 1190, 284, 16)] }
    expect(verifyDrawnLists([l!], rowsOk).satisfied).toBe(true)
    const made = { nodes: [...rowsOk.nodes, t('Payroll', 260, 284)] }
    expect(verifyDrawnLists([l!], made).reason).toContain('"Payroll" is not one of the typed rows')
    const [plain] = drawnLists([{ text: 'x3 rows: Website redo, Hiring, Admin; bold', at: { x: 300, y: 232 } }], lines, { w: 1280, h: 900 })
    expect(verifyDrawnLists([plain!], rowsOk).reason).toContain('"4" is not one of the typed rows')
  })

  it('checks the page', () => {
    const plans = endPairs([{ text: 'Lisbon, 52%', at: { x: 240, y: 270 } }], [box('t', 240, 292, 1040, 326)])
    expect(verifyEndPairs(plans, { nodes: [t('Lisbon', 240, 262, 60), t('52%', 1000, 262, 40)] }).satisfied).toBe(true)
    expect(verifyEndPairs(plans, { nodes: [t('Lisbon, 52%', 240, 262, 110)] }).reason).toContain('runs the name and value together')
    expect(verifyEndPairs(plans, { nodes: [t('Lisbon', 240, 262, 60), t('52%', 320, 262, 40)] }).reason).toContain("right end")
    expect(verifyEndPairs(plans, { nodes: [t('Lisbon', 240, 300, 60), t('52%', 1000, 300, 40)] }).reason).toContain('just above')
    const on = endPairs([{ text: 'Total hours, 40 big', at: { x: 300, y: 640 } }], [box('b', 260, 600, 1240, 680)])
    expect(verifyEndPairs(on, { nodes: [t('Total hours', 280, 630, 90), t('40', 1190, 590, 40, 100)] }).reason).toContain('spills out')
    expect(verifyEndPairs(on, { nodes: [t('Total hours', 280, 630, 90), t('40', 1190, 620, 40, 40)] }).satisfied).toBe(true)
  })
})

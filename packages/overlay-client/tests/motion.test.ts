/**
 * The motion layer's FLIP math (goal loop: edits feel physical, n4). Each box
 * that moved starts where it was, and a child that moved with its parent is
 * not moved twice.
 */
import { describe, expect, it } from 'vitest'
import { flipDeltas } from '../src/motion.js'
import type { Box } from '../src/optimistic.js'

const box = (x: number, y: number, w = 100, h = 40): Box => ({ x, y, w, h })

describe('flipDeltas', () => {
  it('a sibling below an erased card glides up from where it was', () => {
    const before = new Map([['a', box(0, 0)], ['b', box(0, 50)], ['c', box(0, 100)]])
    const after = new Map([['a', box(0, 0)], ['c', box(0, 50)]])
    expect(flipDeltas(before, after, () => null)).toEqual([{ key: 'c', dx: 0, dy: 50 }])
  })

  it('children that moved with their parent get no transform of their own', () => {
    const parent: Record<string, string | null> = { card: null, title: 'card', body: 'card' }
    const before = new Map([['card', box(0, 100, 300, 120)], ['title', box(10, 110)], ['body', box(10, 160)]])
    const after = new Map([['card', box(0, 60, 300, 120)], ['title', box(10, 70)], ['body', box(10, 120)]])
    expect(flipDeltas(before, after, (k) => parent[k] ?? null)).toEqual([{ key: 'card', dx: 0, dy: 40 }])
  })

  it('a child that moved more than its parent gets only the difference', () => {
    const parent: Record<string, string | null> = { col: null, item: 'col', deep: 'item' }
    const before = new Map([['col', box(0, 100)], ['item', box(0, 200)], ['deep', box(5, 205)]])
    const after = new Map([['col', box(0, 80)], ['item', box(0, 150)], ['deep', box(5, 155)]])
    expect(flipDeltas(before, after, (k) => parent[k] ?? null)).toEqual([
      { key: 'col', dx: 0, dy: 20 },
      { key: 'item', dx: 0, dy: 30 },
    ])
  })

  it('a still parent passes nothing down; sideways reflow moves both axes', () => {
    const parent: Record<string, string | null> = { row: null, x: 'row', y: 'row' }
    const before = new Map([['row', box(0, 0, 600, 40)], ['x', box(200, 0)], ['y', box(400, 0)]])
    const after = new Map([['row', box(0, 0, 600, 40)], ['x', box(0, 0)], ['y', box(200, 0)]])
    expect(flipDeltas(before, after, (k) => parent[k] ?? null)).toEqual([
      { key: 'x', dx: 200, dy: 0 },
      { key: 'y', dx: 200, dy: 0 },
    ])
  })

  it('ignores sub-pixel moves, new boxes and boxes that collapsed to nothing', () => {
    const before = new Map([['a', box(0, 0)], ['b', box(0, 50)]])
    const after = new Map([['a', box(0.3, 0.2)], ['b', box(0, 0, 0, 0)], ['n', box(0, 90)]])
    expect(flipDeltas(before, after, () => null)).toEqual([])
  })
})

import { contentKeys, orderFor } from '../src/live-reorder.js'

describe('orderFor (live reorder)', () => {
  it('moving the first of three to the end', () => {
    expect(orderFor(3, 0, 2)).toEqual([2, 0, 1])
  })
  it('moving the last to the front', () => {
    expect(orderFor(4, 3, 0)).toEqual([1, 2, 3, 0])
  })
  it('no move, or out of range, is the natural order', () => {
    expect(orderFor(3, 1, 1)).toEqual([0, 1, 2])
    expect(orderFor(3, 5, 0)).toEqual([0, 1, 2])
  })
})

describe('contentKeys', () => {
  it('names children by what they say, numbering repeats', () => {
    const el = (tag: string, text: string) => ({ tagName: tag, textContent: text }) as unknown as Element
    expect(contentKeys([el('DIV', ' A  b '), el('DIV', 'c'), el('DIV', 'A b')])).toEqual(['DIV|A b#0', 'DIV|c#0', 'DIV|A b#1'])
  })
})

describe('recolour ease (n7)', () => {
  it('the first frame is already most of the way to the new colour, and it ends exact', async () => {
    const { recolourProgress, RECOLOUR_FIRST, RECOLOUR_MS } = await import('../src/motion.js')
    expect(recolourProgress(0)).toBe(RECOLOUR_FIRST)
    expect(RECOLOUR_FIRST).toBeGreaterThanOrEqual(0.5)
    let last = 0
    for (let t = 0; t <= RECOLOUR_MS; t += 16) { const p = recolourProgress(t); expect(p).toBeGreaterThanOrEqual(last); last = p }
    expect(recolourProgress(RECOLOUR_MS)).toBe(1)
  })
  it('mixes as one CSS colour and lands on the exact target', async () => {
    const { mixColour } = await import('../src/motion.js')
    expect(mixColour('rgb(0, 0, 0)', '#16a34a', 0.5)).toBe('color-mix(in srgb, #16a34a 50.0%, rgb(0, 0, 0))')
    expect(mixColour('rgb(0, 0, 0)', '#16a34a', 1)).toBe('#16a34a')
    expect(mixColour('rgb(0, 0, 0)', '#16a34a', 0)).toBe('rgb(0, 0, 0)')
  })
})

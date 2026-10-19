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

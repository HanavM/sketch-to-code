import { describe, expect, it } from 'vitest'
import { textStacks, isLevelLine } from '../src/textmark.js'
import type { Point } from '../src/types.js'

const line = (id: string, x0: number, x1: number, y: number, wob = 1.5) => {
  const points: Point[] = []
  for (let x = x0, k = 0; x <= x1; x += 6, k++) points.push({ x, y: y + (k % 2 ? wob : -wob), t: k })
  return { id, points }
}

describe('stacked level lines read as one heading (n11)', () => {
  it('a long line with a short centred line 120px below is one two-line heading sized from the pitch', () => {
    const st = textStacks([line('a', 215, 1070, 305), line('b', 540, 745, 425), line('sub', 350, 930, 528)])
    expect(st).toHaveLength(1)
    expect(st[0]!.strokes).toEqual(['a', 'b'])
    expect(st[0]!.linePitchPx).toBe(120)
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(100)
    // letters sit on the drawn lines: line 1's box is centred on y=305
    expect(st[0]!.box.y).toBe(245)
  })
  it('body lines and a ruled list are not a heading', () => {
    expect(textStacks([line('a', 100, 600, 300), line('b', 100, 600, 340)])).toEqual([])
    const rules = [0, 1, 2, 3, 4].map((i) => line(`r${i}`, 100, 900 - 10 * i, 200 + 70 * i))
    expect(textStacks(rules)).toEqual([])
  })
  it('a page-wide divider is never a heading line', () => {
    expect(textStacks([line('a', 20, 1260, 300), line('b', 20, 1260, 400)])).toEqual([])
  })
  it('isLevelLine accepts a hand line and refuses a slope', () => {
    expect(isLevelLine(line('a', 100, 500, 300).points)).toBe(true)
    expect(isLevelLine([{ x: 0, y: 0, t: 0 }, { x: 300, y: 120, t: 1 }])).toBe(false)
  })
})

describe('a heading stack never jumps a line in its way (n19)', () => {
  it('the subtitle wrap under "hour" does not become heading line 3', () => {
    const st = textStacks([line('a', 215, 1070, 305), line('b', 540, 745, 425), line('p1', 350, 930, 528), line('p2', 585, 695, 554)])
    expect(st).toHaveLength(1)
    expect(st[0]!.strokes).toEqual(['a', 'b'])
  })
})

describe('a centred pull quote drawn as two long lines (n33)', () => {
  it('two centred lines 60px apart are one display stack at about 46px', () => {
    const st = textStacks([line('a', 200, 1080, 335), line('b', 304, 976, 395)])
    expect(st).toHaveLength(1)
    expect(st[0]!.linePitchPx).toBe(60)
    expect(st[0]!.fontPx).toBeGreaterThanOrEqual(42)
    expect(st[0]!.fontPx).toBeLessThanOrEqual(50)
  })
  it('left-aligned lines 56px apart stay separate (rows of a list)', () => {
    expect(textStacks([line('a', 200, 1080, 300), line('b', 200, 900, 356)])).toHaveLength(0)
  })
})

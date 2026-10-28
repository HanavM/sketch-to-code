import { describe, expect, it } from 'vitest'
import { textStacks } from '../src/textmark.js'
import type { Stroke } from '../src/types.js'

const walk = (id: string, way: number[][]): Stroke => {
  const points: Stroke['points'] = []
  let t = 0
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) points.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n + Math.sin(k) * 0.9, t: t++ })
  }
  points.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]!, t })
  return { id, points }
}

// round 32 c5 (bookshop), heading line and subtitle line as drawn, notes where typed
const lines = [walk('s2', [[313, 295], [965, 295]]), walk('s3', [[335, 360], [945, 360]])]
const heading = { x: 640, y: 280, text: 'A quiet place to read. big italic serif green' }
const sub = { x: 640, y: 348, text: 'An independent bookshop with a garden café, open every day until nine.' }

describe('a line with a sentence of its own is not a heading\'s wrap (n45)', () => {
  it('heading and subtitle each typed on their own line stay two blocks', () => {
    expect(textStacks(lines, { notesAt: [heading, sub] }).filter((s) => s.lines >= 2)).toEqual([])
  })
  it('the same two lines with only the heading typed are still one heading', () => {
    expect(textStacks(lines, { notesAt: [heading] }).some((s) => s.lines === 2)).toBe(true)
  })
  it('a short note on the second line (a heading word) does not split it', () => {
    expect(textStacks(lines, { notesAt: [heading, { x: 640, y: 350, text: 'two lines' }] }).some((s) => s.lines === 2)).toBe(true)
  })
})

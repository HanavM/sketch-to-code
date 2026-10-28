import { describe, expect, it } from 'vitest'
import { textStacks } from '../src/textmark.js'
import { giantStacks, noteFocus } from '../src/notefocus.js'
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

// round 32 c3 (studio), the hand sketch's text lines as drawn
const studio = [
  walk('h1', [[56, 662], [412, 662]]),
  walk('h2', [[56, 742], [520, 742]]),
  walk('p1', [[760, 622], [1197, 622]]),
  walk('p2', [[760, 648], [1030, 648]]),
  walk('link', [[760, 763], [883, 763]]),
]
const notesAt = [
  { x: 250, y: 650 }, // Buildings that breathe. huge black
  { x: 950, y: 612 }, // An architecture studio ...
  { x: 800, y: 752 }, // View projects →
]

describe('a bare line under a heading line is its next line (n44)', () => {
  it('a longer bare line wraps the noted heading line', () => {
    const st = textStacks(studio, { notesAt }).find((s) => s.strokes.includes('h1'))
    expect(st?.strokes).toEqual(['h1', 'h2'])
    expect(st!.fontPx).toBeGreaterThanOrEqual(60)
  })
  it('before: without notes known the longer line stays apart (old rule kept)', () => {
    expect(textStacks(studio).find((s) => s.strokes.includes('h1'))).toBeUndefined()
  })
  it('a longer line with its own note is the next block, not the heading', () => {
    const typed = [...notesAt, { x: 300, y: 735 }]
    expect(textStacks(studio, { notesAt: typed }).find((s) => s.strokes.includes('h1'))).toBeUndefined()
  })
  it('a paragraph wrap line never starts a heading with the link under it', () => {
    expect(textStacks(studio, { notesAt }).some((s) => s.strokes.includes('p2'))).toBe(false)
    expect(textStacks(studio).some((s) => s.strokes.includes('p2'))).toBe(false)
  })
  it('the heading note covers both lines', () => {
    expect([...giantStacks(studio, { notesAt })].map(([k]) => k).sort()).toEqual(['h1', 'h2'])
    const f = noteFocus(['h1', 'h2'], undefined, { x: 250, y: 650 }, studio, 'Buildings that breathe. huge black', { notesAt })
    expect((f ?? ['h1', 'h2']).sort()).toEqual(['h1', 'h2']) // undefined = all of the note's strokes
  })
})

import { describe, expect, it } from 'vitest'
import type { DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'
import type { TypedNote } from '../src/intent2.js'
import { colouredPen, ringNoted } from '../src/hollowring.js'
// @ts-expect-error untyped bench helper
import { walk, jitter } from '../../../tests/bench/lib/draw.mjs'

const blankPage = (): DomSnapshot => ({
  url: 'http://localhost/', viewport: { w: 1280, h: 900 },
  nodes: [{ id: 'e1', tag: 'div', parent: null, rect: { x: 0, y: 0, w: 1280, h: 900 }, style: {} } as never],
} as DomSnapshot)
/** A hand ring through waypoints, walked and wobbled the way the hand-sketch session draws it. */
const ring = (id: string, cx: number, cy: number, r: number, color: string, seed: number): Stroke => {
  const way = Array.from({ length: 15 }, (_, k) => ({ x: Math.round(cx + r * Math.cos((k / 14) * 2 * Math.PI)), y: Math.round(cy + r * Math.sin((k / 14) * 2 * Math.PI)) }))
  const pts = jitter(walk(way, 6), 0.9, seed) as Array<{ x: number; y: number }>
  return { id, color, points: pts.map((p, i) => ({ x: p.x, y: p.y, t: i * 16 })) } as Stroke
}
const ground = (strokes: Stroke[], notes: TypedNote[], depicts: string) => {
  const snap = blankPage()
  const ev = buildEvidence(strokes, snap, notes)
  return groundInterpretation({ reading: 'x', actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: depicts,
    strokes: strokes.map((s) => s.id), layer: null, depicts, fidelity: null }] }, ev, snap, 'design').actions[0]!
}

describe('n184: a ring in a coloured pen is a flat disc in that colour, even inside a depiction', () => {
  it('knows a coloured pen from a writing pen', () => {
    expect(['#ff5a36', '#ffd23f', '#3ccfae'].every(colouredPen)).toBe(true)
    expect(['#1a1a1a', '#2d2722', '#444444', '#ffffff', null].some(colouredPen)).toBe(false)
  })
  it('three holds in orange, yellow and teal pens stay rings filled in their own pen colours where drawn', () => {
    const holds = [ring('h1', 843, 173, 23, '#ff5a36', 15), ring('h2', 979, 279, 19, '#ffd23f', 16), ring('h3', 907, 427, 27, '#3ccfae', 17)]
    const a = ground(holds, [{ id: 'n1', text: 'solid holds, seven scattered like these', at: { x: 870, y: 560 }, anchor: { kind: 'strokes', strokeIds: ['h1', 'h2', 'h3'] } }], 'climbing holds')
    expect(a.svgPaths ?? []).toHaveLength(0)
    expect(a.shapeMarks!.map((m) => m.strokeId).sort()).toEqual(['h1', 'h2', 'h3'])
    for (const [id, c] of [['h1', '#ff5a36'], ['h2', '#ffd23f'], ['h3', '#3ccfae']] as const) {
      const ink = a.inkColours!.find((k) => k.strokeId === id)!
      expect(ink).toMatchObject({ mark: 'ring', paint: 'background', color: c, how: 'pen' })
      expect(ink.hollow).toBeUndefined()
    }
  })
})

describe('n184: a dark ring noted outline stamp stays a hollow ring', () => {
  it('reads the stamp note as a ring line', () => {
    expect(ringNoted(['Since 1987, tilted, outline stamp'])).toBe(true)
  })
  it('the letterpress stamp is a hollow ring in the dark pen, not a traced filled blob', () => {
    const st = ring('r1', 1130, 710, 70, '#2d2722', 10)
    const a = ground([st], [{ id: 'n1', text: 'Since 1987, tilted, outline stamp', at: { x: 1130, y: 700 }, anchor: { kind: 'strokes', strokeIds: ['r1'] } }], 'a round stamp')
    expect(a.svgPaths ?? []).toHaveLength(0)
    const ink = a.inkColours!.find((k) => k.strokeId === 'r1')!
    expect(ink).toMatchObject({ paint: 'border', color: '#2d2722' })
    expect(ink.hollow).toBeDefined()
  })
  it('a dark ring with no such note inside a depiction is still traced as before', () => {
    const a = ground([ring('r1', 400, 400, 60, '#1a1a1a', 3)], [], 'a face')
    expect(a.svgPaths ?? []).toHaveLength(1)
  })
})

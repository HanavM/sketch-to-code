import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'
import { inkColoursBrief, inkPenOutline } from '../src/inkcolour.js'
// @ts-expect-error untyped bench helper
import { walk, jitter } from '../../../tests/bench/lib/draw.mjs'

const blank = (): DomSnapshot => ({ url: 'http://localhost/', viewport: { w: 1280, h: 900 },
  nodes: [{ id: 'e1', tag: 'div', parent: null, rect: { x: 0, y: 0, w: 1280, h: 900 }, style: {} } as never] } as DomSnapshot)
type Way = { at: number; way: number[][] }
/** A hand page from its digest: the same strokes, pens and first notes (each note anchored to the mark nearest it). */
const replay = (dir: string) => {
  const d = JSON.parse(readFileSync(new URL(`../../../tests/hand/${dir}/digest.json`, import.meta.url), 'utf8'))
  const pens = d.events.filter((e: { op: string }) => e.op === 'pen') as Array<{ at: number; color: string }>
  const strokes: Stroke[] = (d.strokesDrawn as Way[]).map((s, k) => {
    const color = [...pens].reverse().find((p) => p.at <= s.at)?.color
    const way = s.way.map(([x, y]) => ({ x: x!, y: y! }))
    const raw = (way.length === 1 ? way : jitter(walk(way, 6), 0.9, k + 1)) as Array<{ x: number; y: number }>
    return { id: `s${String(k)}`, color, points: raw.map((p, i) => ({ x: p.x, y: p.y, t: i * 16 })) } as Stroke
  })
  const bb = (s: Stroke) => { const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } }
  const near = (x: number, y: number) => strokes.filter((s) => s.points.length > 1).map((s) => {
    const b = bb(s); const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1)
    return { id: s.id, d: Math.hypot(dx, dy) + ((b.x1 - b.x0) * (b.y1 - b.y0)) / 1e6 }
  }).sort((a, b) => a.d - b.d)[0]!.id
  const first = (d.events.find((e: { op: string }) => e.op === 'run')?.at ?? Infinity) as number
  const notes = (d.notesTyped as Array<{ at: number; x: number; y: number; text: string }>).filter((n) => n.at < first)
    .map((n, k) => ({ id: `n${String(k)}`, text: n.text, at: { x: n.x, y: n.y }, anchor: { kind: 'strokes' as const, strokeIds: [near(n.x, n.y)] } }))
  const snap = blank()
  const ev = buildEvidence(strokes, snap, notes)
  const ids = strokes.filter((s) => s.points.length > 1).map((s) => s.id)
  return groundInterpretation({ reading: 'x', actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'page',
    strokes: ids, layer: null, depicts: null, fidelity: null }] } as never, ev, snap, 'design')
}
const ink = (g: ReturnType<typeof replay>, id: string) => g.actions[0]!.inkColours!.find((c) => c.strokeId === id)!

describe('n194: no tap = outline in the pen colour, tap = fill, any pen on any surface', () => {
  it('cinema (round 44 c3): the two untapped yellow pills are yellow outlines on the dark page, the tapped one stays filled', () => {
    const g = replay('out-n187/round44/c3-retro-cinema')
    for (const id of ['s11', 's14']) expect(ink(g, id)).toMatchObject({ paint: 'border', color: '#f2c230', frame: true, penOutline: 'taught', pill: true, frameOn: '#140a0c' })
    expect(ink(g, 's12')).toMatchObject({ paint: 'background', color: '#f2c230', how: 'tap' })
    const brief = inkColoursBrief(g)
    expect(brief).toMatch(/pill drawn at x 292.*OUTLINED block.*2px solid #f2c230 border.*transparent.*never a bare label/)
    expect(brief).toMatch(/reads on the dark surface \(never dark text\)/)
  })
  it('pottery (round 44 c5): a dark-pen button noted "dark outline" is an outline, not a dark pill', () => {
    expect(ink(replay('out-n187/round44/c5-pottery-class'), 's9')).toMatchObject({ paint: 'border', color: '#3a2a20', penOutline: 'said' })
  })
  it('lanterns drawn in the pen of a tapped button stay filled (not look-alikes), and a box redrawn over its tapped self stays filled', () => {
    const l = replay('out-n187/round44/c1-lantern-festival')
    for (const id of ['s14', 's15', 's16', 's17']) expect(ink(l, id).penOutline).toBeUndefined()
    expect(ink(replay('out-n107/round38/c3-film-fest'), 's22').paint).not.toBe('border')
  })
  it('reads outline words, not hollow-letter words or fills', () => {
    expect(inkPenOutline('#3a2a20', { w: 200, h: 55 }, '#faf3ea', ['Book a seat, bold, dark outline'], false)).toBe('said')
    expect(inkPenOutline('#ffd166', { w: 221, h: 57 }, '#15306b', ['Check dates, yellow bold; outline only'], false)).toBe('said')
    expect(inkPenOutline('#3a2a20', { w: 200, h: 55 }, '#faf3ea', ['huge outlined letters'], false)).toBeNull()
    expect(inkPenOutline('#3a2a20', { w: 200, h: 55 }, '#faf3ea', ['outlined, solid fill'], false)).toBeNull()
    expect(inkPenOutline('#3a2a20', { w: 200, h: 55 }, '#faf3ea', ['Book a seat'], false)).toBeNull()
    expect(inkPenOutline('#f2c230', { w: 216, h: 62 }, '#140a0c', ['5:30 yellow'], true)).toBe('taught')
    expect(inkPenOutline('#f2c230', { w: 216, h: 62 }, '#f2c230', [], true)).toBeNull()
  })
})

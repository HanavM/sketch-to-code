import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'
import { textPlaceBrief } from '../src/textplace.js'
import { labelValue, ruledRow, verifyTableRows } from '../src/linespread.js'
import { lineAsksBig } from '../src/linespan.js'
import { cleanPath, shapeOf } from '../src/shapemark.js'
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

describe('n195: rows typed on ruled list lines stay rows, never headings sized by the line', () => {
  it('labelValue reads a label and its value, look words aside, and leaves headings alone', () => {
    expect(labelValue('Saturday mornings, $240 right')).toEqual({ label: 'Saturday mornings', value: '$240' })
    expect(labelValue('Tuesday evenings, $240 at right in orange')).toEqual({ label: 'Tuesday evenings', value: '$240' })
    expect(labelValue('TO DO · 3')).toEqual({ label: 'TO DO', value: '3' })
    expect(labelValue('Fresh herbs, picked this morning')).toBeNull()
    expect(labelValue('Over 10,000 readers')).toBeNull()
    expect(labelValue('Plans from $9')).toBeNull()
    expect(lineAsksBig('Saturday mornings, $240 right', 480)).toBe(false)
    expect(lineAsksBig('Fresh herbs, picked this morning', 916)).toBe(true)
  })
  it('pottery (round 44 c5): the three list lines are rows, told at body size with the value at the right', () => {
    const g = replay('out-n187/round44/c5-pottery-class')
    const marks = g.actions.flatMap((a) => a.shapeMarks ?? [])
    const rows = marks.filter((m) => m.shape === 'line' && m.words && /mornings|studio|evenings/.test(m.words))
    expect(rows.length).toBe(3)
    for (const m of rows) expect(ruledRow(m as never, marks as never)).toBe(true)
    const heading = marks.find((m) => m.words && /hands/i.test(m.words))
    if (heading) expect(ruledRow(heading as never, marks as never)).toBe(false)
    const brief = textPlaceBrief(g.actions as never, { w: 1280, h: 900 })
    expect(brief).toMatch(/"Saturday mornings, \$240 right" is typed on a ruled list line.*ONE ROW of a list, body size.*value "\$240" ends at x/)
    expect(brief).toMatch(/"Open studio, \$25 right" is typed on a ruled list line/)
    expect(brief).not.toMatch(/"Open studio[^"]*" is a short phrase typed on a long line/)
    // checked on the page: a row built 34px bold fails, at 15px passes
    const m = rows.find((r) => /studio/.test(r.words!))!
    const node = (fs: string) => ({ nodes: [{ id: 'a', rect: { x: m.box.x, y: m.box.y - 20, w: 200, h: 40 }, text: 'Open studio', textBox: { x: m.box.x, y: m.box.y - 20, w: 200, h: 40 }, style: { fontSize: fs } }] })
    expect(verifyTableRows(marks as never, node('34px') as never).satisfied).toBe(false)
    expect(verifyTableRows(marks as never, node('15px') as never).satisfied).toBe(true)
  })
  it('pottery: the pot drawn with round corners keeps them (radius on the mark, arcs in its clean path); a square box stays square', () => {
    const d = JSON.parse(readFileSync(new URL('../../../tests/hand/out-n187/round44/c5-pottery-class/digest.json', import.meta.url), 'utf8'))
    const pot = shapeOf(jitter(walk(d.strokesDrawn[3].way.map(([x, y]: number[]) => ({ x, y })), 6), 0.9, 4))!
    expect(pot.shape).toBe('box')
    expect(pot.radius).toBeGreaterThan(60)
    expect(cleanPath(pot, { x: 0, y: 0 })).toMatch(/ A \d+ \d+ 0 0 1 /)
    const square = shapeOf(jitter(walk([{ x: 700, y: 479 }, { x: 901, y: 479 }, { x: 901, y: 534 }, { x: 700, y: 534 }, { x: 700, y: 479 }], 6), 0.9, 10))!
    expect(square.radius).toBeUndefined()
    expect(cleanPath(square, { x: 0, y: 0 })).not.toMatch(/ A /)
  })
})

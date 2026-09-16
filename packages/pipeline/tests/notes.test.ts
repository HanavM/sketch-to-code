import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation, resolveNotes, type TypedNote } from '../src/intent2.js'

const node = (id: string, srcLoc: string | null, rect: DomNode['rect'], over: Partial<DomNode> = {}): DomNode => ({
  id, tag: 'div', srcLoc, text: '', classes: [], parent: null, depth: 1, rect,
  style: {
    color: 'rgb(17,24,39)', backgroundColor: 'rgb(255,255,255)', display: 'block', position: 'static',
    zIndex: 'auto', flexDirection: 'row', gap: '', padding: '', margin: '', fontSize: '',
    fontWeight: '', borderRadius: '',
  } as DomNode['style'],
  ...over,
})

const snapshot = (nodes: DomNode[]): DomSnapshot => ({
  nodes, truncated: false, url: 'http://x/', takenAt: 0,
  viewport: { w: 1200, h: 800, scrollX: 0, scrollY: 0 },
})

const stroke = (id: string, x: number, y: number, color?: string): Stroke => ({
  id,
  color,
  points: Array.from({ length: 12 }, (_, i) => ({ x: x + i * 3, y: y + (i % 3), t: i * 10 })),
})

/** Two instances of one .map() template, plus a card elsewhere. */
const page = () => {
  const a = node('e1', 'src/Card.tsx:4:5', { x: 100, y: 100, w: 200, h: 120 })
  const b = node('e2', 'src/Card.tsx:4:5', { x: 400, y: 100, w: 200, h: 120 })
  const c = node('e3', 'src/Other.tsx:2:3', { x: 100, y: 400, w: 200, h: 120 })
  return { a, b, c, snap: snapshot([a, b, c]) }
}

describe('resolveNotes — anchoring the exact words', () => {
  it('picks the instance the user was actually over, not the first stamp match', () => {
    const { b, snap } = page()
    const notes: TypedNote[] = [
      { id: 'n0', text: 'this one gets a badge', at: { x: 450, y: 150 }, anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' } },
    ]
    expect(resolveNotes(notes, snap, new Set())).toEqual([
      { id: 'n0', text: 'this one gets a badge', scope: 'element', elementId: b.id },
    ])
  })

  it('keeps ink notes pointed at the strokes that still exist', () => {
    const { snap } = page()
    const notes: TypedNote[] = [
      { id: 'n0', text: 'fade these in and out', at: { x: 0, y: 0 }, anchor: { kind: 'strokes', strokeIds: ['s1', 's2', 'gone'] } },
    ]
    expect(resolveNotes(notes, snap, new Set(['s1', 's2']))).toEqual([
      { id: 'n0', text: 'fade these in and out', scope: 'strokes', strokeIds: ['s1', 's2'] },
    ])
  })

  it('never drops what the user typed when the anchor is gone', () => {
    const { snap } = page()
    const stale: TypedNote[] = [
      { id: 'n0', text: 'still means something', at: { x: 0, y: 0 }, anchor: { kind: 'element', srcLoc: 'src/Deleted.tsx:9:1' } },
      { id: 'n1', text: 'so does this', at: { x: 0, y: 0 }, anchor: { kind: 'strokes', strokeIds: ['vanished'] } },
    ]
    expect(resolveNotes(stale, snap, new Set()).map((n) => n.scope)).toEqual(['run', 'run'])
  })

  it('ignores empty notes but keeps meaningful whitespace-trimmed ones', () => {
    const { snap } = page()
    const notes: TypedNote[] = [
      { id: 'n0', text: '   ', at: { x: 0, y: 0 }, anchor: { kind: 'run' } },
      { id: 'n1', text: '  make it blue  ', at: { x: 0, y: 0 }, anchor: { kind: 'run' } },
    ]
    expect(resolveNotes(notes, snap, new Set())).toEqual([{ id: 'n1', text: 'make it blue', scope: 'run' }])
  })
})

describe('grounding — notes reach the action they describe', () => {
  const build = (notes: TypedNote[], strokes: Stroke[]) => {
    const { snap } = page()
    return { ev: buildEvidence(strokes, snap, notes), snap }
  }

  it('attaches an ink note to the action citing those strokes, and nothing else', () => {
    const strokes = [stroke('s0', 120, 120), stroke('s1', 600, 600)]
    const { ev, snap } = build(
      [{ id: 'n0', text: 'make all of them fade in and out', at: { x: 130, y: 130 }, anchor: { kind: 'strokes', strokeIds: ['s0'] } }],
      strokes,
    )
    const g = groundInterpretation(
      {
        reading: 'two drawings',
        actions: [
          { kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'a shape', strokes: ['s0'], layer: null, depicts: null, fidelity: 'recognized' },
          { kind: 'design', elements: null, destElement: 'e3', position: 'into', instruction: 'another', strokes: ['s1'], layer: null, depicts: null, fidelity: 'recognized' },
        ],
      },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.notes).toEqual(['make all of them fade in and out'])
    expect(g.actions[1]!.notes).toBeUndefined()
    expect(g.runNotes).toBeUndefined()
  })

  it('attaches an element note to the action targeting that element', () => {
    const strokes = [stroke('s0', 120, 120)]
    const { ev, snap } = build(
      [{ id: 'n0', text: 'this one should be a link', at: { x: 150, y: 150 }, anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' } }],
      strokes,
    )
    const g = groundInterpretation(
      {
        reading: 'circled a card',
        actions: [{ kind: 'modify', elements: ['e1'], destElement: null, position: null, instruction: 'change it', strokes: ['s0'], layer: null, depicts: null, fidelity: null }],
      },
      ev, snap, 'gesture',
    )
    expect(g.actions[0]!.notes).toEqual(['this one should be a link'])
  })

  it('carries an unclaimed note to the run rather than dropping it', () => {
    const strokes = [stroke('s0', 120, 120)]
    const { ev, snap } = build(
      [{ id: 'n0', text: 'use the compact spacing everywhere', at: { x: 0, y: 0 }, anchor: { kind: 'run' } }],
      strokes,
    )
    const g = groundInterpretation(
      {
        reading: 'a shape',
        actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'a shape', strokes: ['s0'], layer: null, depicts: null, fidelity: 'recognized' }],
      },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.notes).toBeUndefined()
    expect(g.runNotes).toEqual(['use the compact spacing everywhere'])
  })
})

describe('grounding — the pen colour is the instruction', () => {
  it('snaps the drawn colour to a class the app already renders', () => {
    const blue = node('e9', 'src/B.tsx:1:1', { x: 0, y: 0, w: 50, h: 20 }, {
      classes: ['bg-blue-600'],
      style: { backgroundColor: 'rgb(37, 99, 235)', color: 'rgb(0,0,0)' } as DomNode['style'],
    })
    const { a, c } = page()
    const snap = snapshot([a, c, blue])
    const strokes = [stroke('s0', 120, 120, '#2563eb'), stroke('s1', 130, 130, '#2563eb')]
    const ev = buildEvidence(strokes, snap, [])
    const g = groundInterpretation(
      {
        reading: 'a blue shape',
        actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'a shape', strokes: ['s0', 's1'], layer: null, depicts: null, fidelity: 'recognized' }],
      },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.color?.drawn).toBe('#2563eb')
    expect(g.actions[0]!.color?.nearest?.token).toBe('bg-blue-600')
  })

  it('has no colour intent when the pen was the default ink', () => {
    const { a, snap } = page()
    void a
    const ev = buildEvidence([stroke('s0', 120, 120)], snap, [])
    const g = groundInterpretation(
      {
        reading: 'a shape',
        actions: [{ kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'a shape', strokes: ['s0'], layer: null, depicts: null, fidelity: 'recognized' }],
      },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.color).toBeUndefined()
  })
})

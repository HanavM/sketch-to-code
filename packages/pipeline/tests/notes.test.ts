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

/**
 * Elements the sentence NAMES, by pointing at them while typing.
 *
 * The anchor says what a note is about; refs say what it mentions. The whole
 * value is that the token is already resolved — the person pointed at it — so
 * these check that the resolution happens here and not by anything matching on
 * a label, and that a ref stays out of `targets`, where it would be mistaken
 * for a thing being acted on.
 */
describe('resolveNotes — elements named inside the sentence', () => {
  it('resolves each token to the element the user pointed at', () => {
    const { a, c, snap } = page()
    const notes: TypedNote[] = [{
      id: 'n0',
      text: 'when @1 is clicked add the row to @2',
      at: { x: 150, y: 150 },
      anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' },
      refs: [
        { token: '@1', srcLoc: 'src/Card.tsx:4:5', label: '<button> "Send"' },
        { token: '@2', srcLoc: 'src/Other.tsx:2:3', label: '<table> "Team"' },
      ],
    }]
    const [out] = resolveNotes(notes, snap, new Set())
    expect(out!.elementId).toBe(a.id)
    expect(out!.refs).toEqual([
      { token: '@1', elementId: a.id, label: '<button> "Send"' },
      { token: '@2', elementId: c.id, label: '<table> "Team"' },
    ])
  })

  it('picks the instance nearest where the note was typed, like the anchor does', () => {
    // one .map() template, two renders, one stamp: the sentence was written on
    // the right-hand one, so @1 is that one
    const { b, snap } = page()
    const notes: TypedNote[] = [{
      id: 'n0', text: 'copy @1 into the sidebar', at: { x: 450, y: 150 },
      anchor: { kind: 'run' },
      refs: [{ token: '@1', srcLoc: 'src/Card.tsx:4:5', label: '<div> "card"' }],
    }]
    expect(resolveNotes(notes, snap, new Set())[0]!.refs).toEqual([
      { token: '@1', elementId: b.id, label: '<div> "card"' },
    ])
  })

  it('a run-scope note can still name elements', () => {
    const { c, snap } = page()
    const notes: TypedNote[] = [{
      id: 'n0', text: 'everything should feed @1', at: { x: 10, y: 10 },
      anchor: { kind: 'run' },
      refs: [{ token: '@1', srcLoc: 'src/Other.tsx:2:3', label: '<table> "Team"' }],
    }]
    const [out] = resolveNotes(notes, snap, new Set())
    expect(out!.scope).toBe('run')
    expect(out!.refs).toEqual([{ token: '@1', elementId: c.id, label: '<table> "Team"' }])
  })

  it('drops a token the user deleted back out of the sentence', () => {
    // the words are what was meant; a reference nobody mentions any more would
    // have the model acting on an element the sentence never names
    const { snap } = page()
    const notes: TypedNote[] = [{
      id: 'n0', text: 'just save it', at: { x: 150, y: 150 },
      anchor: { kind: 'run' },
      refs: [{ token: '@1', srcLoc: 'src/Other.tsx:2:3', label: '<table> "Team"' }],
    }]
    expect(resolveNotes(notes, snap, new Set())[0]!.refs).toBeUndefined()
  })

  it('keeps the words when a referenced element is gone, and says it has no id', () => {
    const { snap } = page()
    const notes: TypedNote[] = [{
      id: 'n0', text: 'send it to @1', at: { x: 150, y: 150 },
      anchor: { kind: 'run' },
      refs: [{ token: '@1', srcLoc: 'src/Deleted.tsx:9:9', label: '<ul> "old list"' }],
    }]
    const [out] = resolveNotes(notes, snap, new Set())
    expect(out!.text).toBe('send it to @1')
    expect(out!.refs).toEqual([{ token: '@1', label: '<ul> "old list"' }])
  })

  it('survives a note with no refs field at all', () => {
    const { a, snap } = page()
    const notes: TypedNote[] = [
      { id: 'n0', text: 'make it red', at: { x: 150, y: 150 }, anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' } },
    ]
    expect(resolveNotes(notes, snap, new Set())).toEqual([
      { id: 'n0', text: 'make it red', scope: 'element', elementId: a.id },
    ])
  })
})

describe('grounding — a named element rides with the action, but is not a target', () => {
  const inkOn = (n: DomNode): Stroke => stroke('s1', n.rect.x + 10, n.rect.y + 10)

  it('attaches the refs of the note that attached, with their source locations', () => {
    const { a, c, snap } = page()
    const strokes = [inkOn(a)]
    const notes: TypedNote[] = [{
      id: 'n0',
      text: 'when this is clicked, add the name to @1',
      at: { x: 150, y: 150 },
      anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' },
      refs: [{ token: '@1', srcLoc: 'src/Other.tsx:2:3', label: '<table> "Team"' }],
    }]
    const ev = buildEvidence(strokes, snap, notes)
    const g = groundInterpretation(
      { reading: 'wire the click to the table', actions: [{ kind: 'modify', elements: [a.id], instruction: 'save on click', strokes: ['s1'] }] },
      ev, snap,
    )
    const act = g.actions[0]!
    expect(act.notes).toEqual(['when this is clicked, add the name to @1'])
    expect(act.refs).toEqual([
      { token: '@1', label: '<table> "Team"', domId: c.id, srcLoc: 'src/Other.tsx:2:3' },
    ])
    // the point of keeping them separate: the action is on the card, not on the
    // table it merely mentions
    expect(act.targets.map((t) => t.domId)).toEqual([a.id])
  })

  it('does not inflate a delete toward its confirmation gate', () => {
    // three targets trips the destructive gate; a delete that MENTIONS two
    // other elements has one target and must not be gated as if it had three
    const { a, b, c, snap } = page()
    const strokes = [inkOn(a)]
    const notes: TypedNote[] = [{
      id: 'n0', text: 'remove this, @1 and @2 stay', at: { x: 150, y: 150 },
      anchor: { kind: 'element', srcLoc: 'src/Card.tsx:4:5' },
      refs: [
        { token: '@1', srcLoc: 'src/Card.tsx:4:5', label: '<div> "b"' },
        { token: '@2', srcLoc: 'src/Other.tsx:2:3', label: '<div> "c"' },
      ],
    }]
    const ev = buildEvidence(strokes, snap, notes)
    const g = groundInterpretation(
      { reading: 'delete the card', actions: [{ kind: 'delete', elements: [a.id], instruction: 'remove it', strokes: ['s1'] }] },
      ev, snap,
    )
    expect(g.actions[0]!.needsConfirm).toBe(false)
    expect(g.actions[0]!.refs).toHaveLength(2)
    expect([b.id, c.id]).toContain(g.actions[0]!.refs![1]!.domId)
  })

  it('leaves refs off an action no note attached to', () => {
    const { a, snap } = page()
    const strokes = [inkOn(a)]
    const ev = buildEvidence(strokes, snap, [])
    const g = groundInterpretation(
      { reading: 'delete it', actions: [{ kind: 'delete', elements: [a.id], instruction: 'remove', strokes: ['s1'] }] },
      ev, snap,
    )
    expect(g.actions[0]!.refs).toBeUndefined()
  })
})

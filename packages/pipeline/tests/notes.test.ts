import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation, resolveNotes, isPageLookNote, type TypedNote } from '../src/intent2.js'

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

/**
 * The two verbs about where data lives.
 *
 * These are grounded like any other action but applied by the engines rather
 * than the model, so what matters here is that grounding refuses the shapes the
 * engines cannot act on — one target, and a target with a source location —
 * because a refusal the user reads beats a mysterious no-op later.
 */
describe('grounding — serve and save', () => {
  const inkOn = (n: DomNode): Stroke => stroke('s1', n.rect.x + 10, n.rect.y + 10)

  for (const kind of ['serve', 'save'] as const) {
    it(`${kind} grounds to one target with its source location`, () => {
      const { a, snap } = page()
      const strokes = [inkOn(a)]
      const ev = buildEvidence(strokes, snap, [])
      const g = groundInterpretation(
        { reading: 'x', actions: [{ kind, elements: [a.id], instruction: 'make it real', strokes: ['s1'] }] },
        ev, snap,
      )
      expect(g.rejected).toEqual([])
      expect(g.actions).toHaveLength(1)
      expect(g.actions[0]!.kind).toBe(kind)
      expect(g.actions[0]!.targets[0]!.srcLoc).toBe('src/Card.tsx:4:5')
    })

    it(`${kind} is refused with two targets, naming the count`, () => {
      const { a, c, snap } = page()
      const strokes = [stroke('s1', 110, 110), stroke('s2', 110, 410)]
      const ev = buildEvidence(strokes, snap, [])
      const g = groundInterpretation(
        { reading: 'x', actions: [{ kind, elements: [a.id, c.id], instruction: 'both', strokes: ['s1', 's2'] }] },
        ev, snap,
      )
      expect(g.actions).toHaveLength(0)
      expect(g.rejected[0]).toMatch(new RegExp(`${kind} action needs exactly 1 target, got 2`))
    })

    it(`${kind} is refused when its target has no source location`, () => {
      // an element the build never stamped: neither engine can find the code
      const bare = node('e9', null, { x: 100, y: 100, w: 200, h: 120 })
      const snap = snapshot([bare])
      const strokes = [inkOn(bare)]
      const ev = buildEvidence(strokes, snap, [])
      const g = groundInterpretation(
        { reading: 'x', actions: [{ kind, elements: ['e9'], instruction: 'make it real', strokes: ['s1'] }] },
        ev, snap,
      )
      expect(g.actions).toHaveLength(0)
      expect(g.rejected[0]).toMatch(/no source location/)
    })
  }

  it('a sentence asking for both is two actions, each on its own element', () => {
    const { a, c, snap } = page()
    const strokes = [stroke('s1', 110, 110), stroke('s2', 110, 410)]
    const ev = buildEvidence(strokes, snap, [])
    const g = groundInterpretation(
      {
        reading: 'submissions show up in the list',
        actions: [
          { kind: 'save', elements: [a.id], instruction: 'keep what is typed', strokes: ['s1'] },
          { kind: 'serve', elements: [c.id], instruction: 'read them back', strokes: ['s2'] },
        ],
      },
      ev, snap,
    )
    expect(g.actions.map((x) => x.kind)).toEqual(['save', 'serve'])
    expect(g.actions.map((x) => x.targets[0]!.domId)).toEqual([a.id, c.id])
  })

  it('neither trips the destructive confirmation', () => {
    // nothing is removed by either, whatever the area involved
    const { a, snap } = page()
    const ev = buildEvidence([inkOn(a)], snap, [])
    const g = groundInterpretation(
      { reading: 'x', actions: [{ kind: 'serve', elements: [a.id], instruction: 'real', strokes: ['s1'] }] },
      ev, snap,
    )
    expect(g.actions[0]!.needsConfirm).toBe(false)
  })
})

describe('the schema the model answers in', () => {
  it('offers both verbs in gesture mode', async () => {
    const { interpretationSchema } = await import('../src/intent2.js')
    const kinds = (interpretationSchema('gesture') as {
      properties: { actions: { items: { properties: { kind: { enum: string[] } } } } }
    }).properties.actions.items.properties.kind.enum
    expect(kinds).toContain('serve')
    expect(kinds).toContain('save')
  })

  it('offers neither in design mode, where there is nothing yet to make real', () => {
    // design mode builds UI that does not exist; a form you are still drawing
    // has no code to rewrite, so the enum itself excludes them
    return import('../src/intent2.js').then(({ interpretationSchema }) => {
      const kinds = (interpretationSchema('design') as {
        properties: { actions: { items: { properties: { kind: { enum: string[] } } } } }
      }).properties.actions.items.properties.kind.enum
      expect(kinds).toEqual(['add', 'design'])
    })
  })
})

/**
 * The element menu, when there is no ink to rank it by.
 *
 * The cap keeps the 70 elements nearest the drawing. A typed sentence need not
 * have a drawing — pointing at something and saying what should happen is a
 * complete interaction — and then every distance is zero and the cap keeps an
 * arbitrary 70. These check that the element somebody actually pointed at is
 * never one of the ones thrown away, because the failure is silent: the model
 * is handed a note citing an id it has no entry for, so the sentence does
 * nothing and says nothing.
 */
describe('buildEvidence — what the model is allowed to name', () => {
  /** A page with far more elements than the menu can hold. */
  const crowded = (extra = 200) => {
    const nodes: DomNode[] = []
    for (let i = 0; i < extra; i++) {
      nodes.push(node(`e${i}`, `src/Filler.tsx:${i}:1`, { x: (i % 10) * 60, y: Math.floor(i / 10) * 30, w: 50, h: 20 }))
    }
    // the one the user points at, last in document order so a naive cap drops it
    const wanted = node('target', 'src/Deep.tsx:9:3', { x: 20, y: 9000, w: 120, h: 40 })
    const other = node('other', 'src/Else.tsx:4:2', { x: 200, y: 9100, w: 120, h: 40 })
    nodes.push(wanted, other)
    return { wanted, other, snap: snapshot(nodes) }
  }

  const menuIds = (ev: ReturnType<typeof buildEvidence>) => [...ev.elements.keys()]

  it('without the fix the pointed-at element would be trimmed — check it is not', () => {
    const { wanted, snap } = crowded()
    const ev = buildEvidence([], snap, [
      { id: 'n0', text: 'this list should come from the server', at: { x: 80, y: 9020 },
        anchor: { kind: 'element', srcLoc: 'src/Deep.tsx:9:3' } },
    ])
    expect(menuIds(ev)).toContain(wanted.id)
  })

  it('and so is every element the sentence names by token', () => {
    const { wanted, other, snap } = crowded()
    const ev = buildEvidence([], snap, [
      { id: 'n0', text: 'when this is clicked add it to @1', at: { x: 80, y: 9020 },
        anchor: { kind: 'element', srcLoc: 'src/Deep.tsx:9:3' },
        refs: [{ token: '@1', srcLoc: 'src/Else.tsx:4:2', label: '<div> "else"' }] },
    ])
    expect(menuIds(ev)).toContain(wanted.id)
    expect(menuIds(ev)).toContain(other.id)
  })

  it('still respects the cap — pinning takes places, it does not add them', () => {
    const { snap } = crowded()
    const ev = buildEvidence([], snap, [
      { id: 'n0', text: 'about this', at: { x: 80, y: 9020 },
        anchor: { kind: 'element', srcLoc: 'src/Deep.tsx:9:3' } },
    ])
    expect(menuIds(ev).length).toBeLessThanOrEqual(70)
  })

  it('a pinned element too large for the usual size filter is kept anyway', () => {
    // the filter drops anything over 90% of the viewport as page furniture; an
    // element somebody deliberately pointed at is not furniture
    const big = node('big', 'src/Hero.tsx:2:2', { x: 0, y: 0, w: 1190, h: 790 })
    const snap = snapshot([big, node('e1', 'src/A.tsx:1:1', { x: 10, y: 10, w: 40, h: 20 })])
    const ev = buildEvidence([], snap, [
      { id: 'n0', text: 'this whole thing', at: { x: 500, y: 400 },
        anchor: { kind: 'element', srcLoc: 'src/Hero.tsx:2:2' } },
    ])
    expect(menuIds(ev)).toContain('big')
  })

  it('and the model can then actually target it', () => {
    // the end of the chain: pinned into the menu, so grounding resolves the id
    const { wanted, snap } = crowded()
    const notes: TypedNote[] = [
      { id: 'n0', text: 'this list should come from the server', at: { x: 80, y: 9020 },
        anchor: { kind: 'element', srcLoc: 'src/Deep.tsx:9:3' } },
    ]
    const ev = buildEvidence([], snap, notes)
    const g = groundInterpretation(
      { reading: 'serve it', actions: [{ kind: 'serve', elements: [wanted.id], instruction: 'from the server', strokes: [] }] },
      ev, snap,
    )
    expect(g.rejected).toEqual([])
    expect(g.actions[0]!.targets[0]!.srcLoc).toBe('src/Deep.tsx:9:3')
    expect(g.actions[0]!.notes).toEqual(['this list should come from the server'])
  })

  it('no notes, no pinning — the ink ranking is untouched', () => {
    const { snap } = crowded()
    const ev = buildEvidence([stroke('s1', 100, 100)], snap, [])
    expect(menuIds(ev).length).toBeLessThanOrEqual(70)
    expect(menuIds(ev)).not.toContain('target')
  })
})

describe('note focus — a cluster holding several drawings', () => {
  // headline (two lines), subtitle and button drawn close together: one cluster
  const strokes = [
    stroke('h1', 200, 300), stroke('h2', 200, 400),
    stroke('sub', 200, 520), stroke('btn', 200, 620),
  ]
  const all = ['h1', 'h2', 'sub', 'btn']
  const { snap } = page()

  it('picks the strokes right where the note was typed, keeping a heading\'s lines together', () => {
    const notes: TypedNote[] = [
      { id: 'n0', text: 'huge serif headline', at: { x: 220, y: 352 }, anchor: { kind: 'strokes', strokeIds: all } },
      { id: 'n1', text: 'white pill button', at: { x: 215, y: 621 }, anchor: { kind: 'strokes', strokeIds: all } },
    ]
    const r = resolveNotes(notes, snap, new Set(all), strokes)
    expect(r[0]!.focus).toEqual(['h1', 'h2'])
    expect(r[1]!.focus).toEqual(['btn'])
  })

  it('takes the overlay\'s own pick over the point, and omits focus when it is everything', () => {
    const notes: TypedNote[] = [
      { id: 'n0', text: 'a', at: { x: 0, y: 0 }, anchor: { kind: 'strokes', strokeIds: all, focus: ['sub'] } },
      { id: 'n1', text: 'b', at: { x: 0, y: 0 }, anchor: { kind: 'strokes', strokeIds: ['h1'] } },
    ]
    const r = resolveNotes(notes, snap, new Set(all), strokes)
    expect(r[0]!.focus).toEqual(['sub'])
    expect(r[1]!.focus).toBeUndefined()
  })

  it('attaches each note only to the action citing its focus', () => {
    const notes: TypedNote[] = [
      { id: 'n0', text: 'huge serif headline', at: { x: 220, y: 352 }, anchor: { kind: 'strokes', strokeIds: all } },
      { id: 'n1', text: 'white pill button', at: { x: 215, y: 621 }, anchor: { kind: 'strokes', strokeIds: all } },
    ]
    const ev = buildEvidence(strokes, snap, notes)
    const add = (instruction: string, ids: string[]) => ({
      kind: 'add' as const, elements: null, destElement: null, position: null, instruction, strokes: ids, layer: null, depicts: null, fidelity: null,
    })
    const g = groundInterpretation(
      { reading: 'hero', actions: [add('headline', ['h1', 'h2']), add('subtitle', ['sub']), add('button', ['btn'])] },
      ev, snap, 'design',
    )
    expect(g.actions.map((a) => a.notes)).toEqual([['huge serif headline'], undefined, ['white pill button']])
  })

  it('falls back to the whole cluster when no action cites the focus', () => {
    const notes: TypedNote[] = [
      { id: 'n0', text: 'huge serif headline', at: { x: 220, y: 352 }, anchor: { kind: 'strokes', strokeIds: all } },
    ]
    const ev = buildEvidence(strokes, snap, notes)
    const g = groundInterpretation(
      { reading: 'hero', actions: [{ kind: 'add', elements: null, destElement: null, position: null, instruction: 'button', strokes: ['btn'], layer: null, depicts: null, fidelity: null }] },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.notes).toEqual(['huge serif headline'])
  })
})

describe('page-look notes reach the whole page (round 1: c2, c4)', () => {
  it('tells page-look words from block words', () => {
    expect(isPageLookNote('brutalist: bright yellow page, black heavy type')).toBe(true)
    expect(isPageLookNote('near-black page with faint purple grid lines')).toBe(true)
    expect(isPageLookNote('magazine on warm paper, serif masthead')).toBe(true)
    expect(isPageLookNote('whole page: warm sunset gradient')).toBe(true)
    expect(isPageLookNote('dark sidebar nav')).toBe(false)
    expect(isPageLookNote('deep green panel, cream serif text')).toBe(false)
    expect(isPageLookNote('black block button, yellow text')).toBe(false)
  })

  it('a page word that says WHERE a block sits is not page look (round 2: c2, c5)', () => {
    expect(isPageLookNote('bleeding off the page edge giant heavy hollow outlined white "NOISE"')).toBe(false)
    expect(isPageLookNote('tilted bleeding off the page edge big orange, yellow, teal stripes block')).toBe(false)
    expect(isPageLookNote('band across the page, tilted')).toBe(false)
    expect(isPageLookNote('sticker at the top of the page')).toBe(false)
    expect(isPageLookNote('soft pink blob in the background')).toBe(false)
    expect(isPageLookNote('whole page: black page, white text')).toBe(true)
    expect(isPageLookNote('dark navy background, white text')).toBe(true)
  })

  it('keeps a page-look note on its action AND lists it as page look', () => {
    const { snap } = page()
    const strokes = [stroke('s0', 120, 120), stroke('s1', 600, 600)]
    const text = 'near-black page with faint purple grid lines'
    const ev = buildEvidence(strokes, snap, [{ id: 'n0', text, at: { x: 130, y: 130 }, anchor: { kind: 'strokes', strokeIds: ['s0'] } }])
    const g = groundInterpretation(
      {
        reading: 'nav and a block',
        actions: [
          { kind: 'design', elements: null, destElement: 'e1', position: 'into', instruction: 'nav', strokes: ['s0'], layer: null, depicts: null, fidelity: 'recognized' },
          { kind: 'design', elements: null, destElement: 'e3', position: 'into', instruction: 'block', strokes: ['s1'], layer: null, depicts: null, fidelity: 'recognized' },
        ],
      },
      ev, snap, 'design',
    )
    expect(g.actions[0]!.notes).toEqual([text])
    expect(g.pageNotes).toEqual([text])
    expect(g.runNotes).toBeUndefined()
  })
})

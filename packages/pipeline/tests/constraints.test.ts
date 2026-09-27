import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import {
  constraintsPath, describeConstraint, evaluateConstraints, loadConstraints,
  measureConstraint, proposeConstraints, saveConstraints, type Constraint,
} from '../src/constraints.js'

const node = (srcLoc: string, rect: DomNode['rect']): DomNode => ({
  id: srcLoc, tag: 'div', srcLoc, text: '', classes: [], parent: null, depth: 1, rect,
  style: {} as DomNode['style'],
})
const snap = (nodes: DomNode[]): DomSnapshot => ({
  nodes, truncated: false, url: 'http://x/', takenAt: 0,
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
})

const A = 'src/A.tsx:3:5'
const B = 'src/B.tsx:4:5'
const rule = (over: Partial<Constraint>): Constraint => ({
  id: 'c1', kind: 'aligned-left', subjects: [A, B], tolerance: 2, createdAt: 0, ...over,
})

describe('a rule keeps watching', () => {
  it('passes while reality matches, and complains with numbers when it drifts', () => {
    const ok = snap([node(A, { x: 100, y: 10, w: 80, h: 40 }), node(B, { x: 100, y: 80, w: 80, h: 40 })])
    expect(evaluateConstraints([rule({})], ok)).toEqual([])

    const drifted = snap([node(A, { x: 100, y: 10, w: 80, h: 40 }), node(B, { x: 117, y: 80, w: 80, h: 40 })])
    const v = evaluateConstraints([rule({})], drifted)
    expect(v).toHaveLength(1)
    expect(v[0]!.message).toBe('left edges are 17px apart (rule allows 2px)')
  })

  it('reports an element that was deleted — silent rot is the point', () => {
    const gone = snap([node(A, { x: 100, y: 10, w: 80, h: 40 })])
    const v = evaluateConstraints([rule({})], gone)
    expect(v[0]!.message).toMatch(/the other element in this rule is gone/)

    const both = snap([])
    expect(evaluateConstraints([rule({})], both)[0]!.message).toMatch(/drawn on is gone/)
  })

  it('keeps the words the user typed alongside the failure', () => {
    const drifted = snap([node(A, { x: 0, y: 0, w: 10, h: 10 }), node(B, { x: 40, y: 0, w: 10, h: 10 })])
    expect(evaluateConstraints([rule({ note: 'these two are a pair' })], drifted)[0]!.note)
      .toBe('these two are a pair')
  })

  it('checks every alignment edge independently', () => {
    const s = snap([node(A, { x: 0, y: 0, w: 100, h: 50 }), node(B, { x: 0, y: 60, w: 60, h: 50 })])
    expect(evaluateConstraints([rule({ kind: 'aligned-left' })], s)).toEqual([])
    expect(evaluateConstraints([rule({ kind: 'aligned-right' })], s)[0]!.message).toMatch(/right edges are 40px/)
    expect(evaluateConstraints([rule({ kind: 'same-width' })], s)[0]!.message).toMatch(/widths differ by 40px/)
    expect(evaluateConstraints([rule({ kind: 'same-height' })], s)).toEqual([])
  })

  it('catches something escaping its container, and says by how much', () => {
    const inside = snap([node(A, { x: 20, y: 20, w: 40, h: 40 }), node(B, { x: 0, y: 0, w: 200, h: 200 })])
    expect(evaluateConstraints([rule({ kind: 'inside' })], inside)).toEqual([])

    const escaped = snap([node(A, { x: 180, y: 20, w: 40, h: 40 }), node(B, { x: 0, y: 0, w: 200, h: 200 })])
    expect(evaluateConstraints([rule({ kind: 'inside' })], escaped)[0]!.message)
      .toBe('it escapes its container by 20px')
  })

  it('measures a gap when the rule is drawn, then holds it to that', () => {
    const s = snap([node(A, { x: 0, y: 0, w: 100, h: 50 }), node(B, { x: 124, y: 0, w: 100, h: 50 })])
    const measured = measureConstraint('gap', [A, B], s)
    expect(measured.value).toBe(24)

    const held = rule({ kind: 'gap', value: measured.value, tolerance: 4 })
    expect(evaluateConstraints([held], s)).toEqual([])

    const squashed = snap([node(A, { x: 0, y: 0, w: 100, h: 50 }), node(B, { x: 108, y: 0, w: 100, h: 50 })])
    expect(evaluateConstraints([held], squashed)[0]!.message).toBe('the gap is 8px, the rule says 24px (±4px)')
  })

  it('notices two things swapping places', () => {
    const before = snap([node(A, { x: 0, y: 0, w: 50, h: 20 }), node(B, { x: 0, y: 40, w: 50, h: 20 })])
    expect(evaluateConstraints([rule({ kind: 'order' })], before)).toEqual([])
    const after = snap([node(A, { x: 0, y: 40, w: 50, h: 20 }), node(B, { x: 0, y: 0, w: 50, h: 20 })])
    expect(evaluateConstraints([rule({ kind: 'order' })], after)[0]!.message).toMatch(/out of order/)
  })

  it('a present rule catches an element that renders nothing', () => {
    const shown = snap([node(A, { x: 0, y: 0, w: 10, h: 10 })])
    expect(evaluateConstraints([rule({ kind: 'present', subjects: [A] })], shown)).toEqual([])
    const collapsed = snap([node(A, { x: 0, y: 0, w: 0, h: 0 })])
    expect(evaluateConstraints([rule({ kind: 'present', subjects: [A] })], collapsed)[0]!.message)
      .toMatch(/renders nothing/)
  })
})

describe('rules on disk', () => {
  const repo = () => mkdtempSync(join(tmpdir(), 's2c-rules-'))

  it('round-trips', () => {
    const root = repo()
    const rules = [rule({ id: 'a' }), rule({ id: 'b', kind: 'gap', value: 16 })]
    saveConstraints(root, rules)
    expect(loadConstraints(root)).toEqual(rules)
  })

  it('has none before any are drawn', () => {
    expect(loadConstraints(repo())).toEqual([])
  })

  it('survives a corrupt or hand-edited file rather than taking the checker down', () => {
    const root = repo()
    mkdirSync(join(root, '.sketch2code'), { recursive: true })
    writeFileSync(constraintsPath(root), '{ not json')
    expect(loadConstraints(root)).toEqual([])

    saveConstraints(root, [rule({ id: 'good' })])
    const withJunk = JSON.parse(readFileSync(constraintsPath(root), 'utf8')) as unknown[]
    withJunk.push({ id: 5 }, null, { id: 'x', kind: 'gap' })
    writeFileSync(constraintsPath(root), JSON.stringify(withJunk))
    const loaded = loadConstraints(root)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.id).toBe('good')
  })
})

describe('how a rule reads', () => {
  it('says what it means in words', () => {
    expect(describeConstraint(rule({ kind: 'inside' }))).toBe('A.tsx:3:5 stays inside B.tsx:4:5')
    expect(describeConstraint(rule({ kind: 'gap', value: 16 }))).toMatch(/keep a 16px gap/)
    expect(describeConstraint(rule({ kind: 'aligned-top' }))).toMatch(/stay top-aligned/)
    expect(describeConstraint(rule({ kind: 'present', subjects: [A] }))).toBe('A.tsx:3:5 stays on the page')
  })
})

// ── the gesture: a drawn line becomes a set of readings ──────────────────────

/** Two cards side by side, left edges flush, 24px apart vertically. */
const stacked = () => snap([
  node('src/Page.tsx:1:1', { x: 0, y: 0, w: 1280, h: 900 }),
  { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), tag: 'div', text: 'Revenue' },
  { ...node(B, { x: 100, y: 204, w: 200, h: 80 }), tag: 'div', text: 'Costs' },
])

describe('proposing a rule from a drawn line', () => {
  it('reads a line down two left edges as left-alignment, and says so in the elements’ own words', () => {
    const { proposals, error } = proposeConstraints({ x0: 101, y0: 90, x1: 99, y1: 300 }, stacked())
    expect(error).toBeUndefined()
    expect(proposals[0]!.kind).toBe('aligned-left')
    expect(proposals[0]!.subjects).toEqual([A, B])
    expect(proposals[0]!.desc).toBe('div “Revenue” and div “Costs” stay left-aligned')
    expect(proposals[0]!.reading).toBe('holds right now')
  })

  it('reads the same line down the RIGHT edges as right-alignment', () => {
    const { proposals } = proposeConstraints({ x0: 299, y0: 90, x1: 301, y1: 300 }, stacked())
    expect(proposals[0]!.kind).toBe('aligned-right')
  })

  it('reads a line across the space between them as the gap, measured off the page', () => {
    const { proposals } = proposeConstraints({ x0: 200, y0: 182, x1: 200, y1: 202 }, stacked())
    expect(proposals[0]!.kind).toBe('gap')
    expect(proposals[0]!.value).toBe(24)
    expect(proposals[0]!.desc).toContain('24px gap')
    // a gap needs slack an edge does not: wrapping and font metrics move it
    expect(proposals[0]!.tolerance).toBeGreaterThan(2)
  })

  it('offers the alternatives the line cannot distinguish, never silently picking one', () => {
    const { proposals } = proposeConstraints({ x0: 101, y0: 90, x1: 99, y1: 300 }, stacked())
    expect(proposals.map((p) => p.kind)).toContain('same-width')
    expect(proposals.map((p) => p.kind)).toContain('order')
    expect(new Set(proposals.map((p) => p.kind)).size).toBe(proposals.length)
  })

  it('says a rule is already broken rather than saving a surprise', () => {
    const off = snap([
      { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), text: 'Revenue' },
      { ...node(B, { x: 117, y: 204, w: 200, h: 80 }), text: 'Costs' },
    ])
    const { proposals } = proposeConstraints({ x0: 108, y0: 90, x1: 108, y1: 300 }, off)
    expect(proposals[0]!.kind).toBe('aligned-left')
    expect(proposals[0]!.reading).toBe('right now: left edges are 17px apart (rule allows 2px)')
  })

  it('never pairs an element with its own child — that mis-hit has its own kind', () => {
    const inner = 'src/A.tsx:5:9'
    const nested = snap([
      { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), text: 'Card' },
      { ...node(inner, { x: 100, y: 110, w: 120, h: 20 }), parent: A, text: 'Title' },
    ])
    const { proposals } = proposeConstraints({ x0: 100, y0: 90, x1: 100, y1: 200 }, nested)
    // one subject, so the readings are the ones about a single thing
    expect(proposals.every((p) => p.subjects.length === 1 || p.kind === 'inside')).toBe(true)
    expect(proposals[0]!.kind).toBe('present')
  })

  it('picks the inputs, not the <form> that shares their edge', () => {
    // the shape every real form has: two inputs, each in a wrapper with no
    // padding, inside a form — four boxes with the SAME left edge
    const form = 'src/Form.tsx:5:5'
    const w1 = 'src/Form.tsx:6:7'
    const w2 = 'src/Form.tsx:10:7'
    const i1 = 'src/Form.tsx:8:9'
    const i2 = 'src/Form.tsx:12:9'
    const real = snap([
      node(form, { x: 100, y: 100, w: 300, h: 300 }),
      { ...node(w1, { x: 100, y: 100, w: 300, h: 60 }), parent: form },
      { ...node(i1, { x: 100, y: 122, w: 300, h: 38 }), parent: w1, tag: 'input' },
      { ...node(w2, { x: 100, y: 176, w: 300, h: 60 }), parent: form },
      { ...node(i2, { x: 100, y: 198, w: 300, h: 38 }), parent: w2, tag: 'input' },
    ])
    const { proposals } = proposeConstraints({ x0: 100, y0: 118, x1: 100, y1: 240 }, real)
    expect(proposals[0]!.kind).toBe('aligned-left')
    expect(proposals[0]!.subjects).toEqual([i1, i2])
  })

  it('lets what the pointer was ON settle a shared edge', () => {
    const form = 'src/Form.tsx:5:5'
    const l1 = 'src/Form.tsx:7:9'
    const i1 = 'src/Form.tsx:8:9'
    const l2 = 'src/Form.tsx:11:9'
    const i2 = 'src/Form.tsx:12:9'
    // labels and inputs share a left edge, and the labels are smaller — so
    // geometry alone watches the labels while the inputs drift
    const real = snap([
      node(form, { x: 100, y: 100, w: 300, h: 300 }),
      { ...node(l1, { x: 100, y: 100, w: 300, h: 20 }), parent: form, tag: 'label' },
      { ...node(i1, { x: 100, y: 122, w: 300, h: 38 }), parent: form, tag: 'input' },
      { ...node(l2, { x: 100, y: 176, w: 300, h: 20 }), parent: form, tag: 'label' },
      { ...node(i2, { x: 100, y: 198, w: 300, h: 38 }), parent: form, tag: 'input' },
    ])
    const line = { x0: 100, y0: 130, x1: 100, y1: 230 }
    expect(proposeConstraints(line, real).proposals[0]!.subjects).toEqual([l1, l2])
    // …and with the hit test, the elements the pointer actually touched
    const hinted = proposeConstraints(line, real, [i1, i2])
    expect(hinted.proposals[0]!.kind).toBe('aligned-left')
    expect(hinted.proposals[0]!.subjects).toEqual([i1, i2])
  })

  it('ignores a hint that says nothing — both ends on one element, or on a parent and its child', () => {
    const outer = 'src/Card.tsx:3:5'
    const inner = 'src/Card.tsx:4:7'
    const two = snap([
      { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), text: 'Revenue' },
      { ...node(B, { x: 100, y: 204, w: 200, h: 80 }), text: 'Costs' },
      { ...node(outer, { x: 600, y: 100, w: 200, h: 200 }) },
      { ...node(inner, { x: 600, y: 120, w: 100, h: 40 }), parent: outer },
    ])
    const line = { x0: 100, y0: 90, x1: 100, y1: 300 }
    // a hint of one element, and a hint of a box plus its own child, both fall
    // back to the geometry rather than proposing a relation nobody drew
    expect(proposeConstraints(line, two, [outer]).proposals[0]!.subjects).toEqual([A, B])
    expect(proposeConstraints(line, two, [outer, inner]).proposals[0]!.subjects).toEqual([A, B])
  })

  it('refuses a line drawn over nothing, and says what would work', () => {
    const { proposals, error } = proposeConstraints({ x0: 900, y0: 700, x1: 950, y1: 760 }, snap([
      { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), text: 'Revenue' },
    ]))
    expect(proposals).toEqual([])
    expect(error).toMatch(/down the edges, or across the gap/)
  })

  it('reads a horizontal line as the top/bottom pair, not the left/right one', () => {
    const row = snap([
      { ...node(A, { x: 100, y: 100, w: 200, h: 80 }), text: 'One' },
      { ...node(B, { x: 340, y: 100, w: 200, h: 80 }), text: 'Two' },
    ])
    const { proposals } = proposeConstraints({ x0: 90, y0: 101, x1: 560, y1: 99 }, row)
    expect(proposals[0]!.kind).toBe('aligned-top')
    expect(proposals.map((p) => p.kind)).toContain('same-height')
  })
})

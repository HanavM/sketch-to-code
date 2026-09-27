import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import {
  constraintsPath, describeConstraint, evaluateConstraints, loadConstraints,
  measureConstraint, saveConstraints, type Constraint,
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

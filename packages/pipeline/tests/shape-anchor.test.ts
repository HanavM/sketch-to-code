import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { decorationCandidates, verifyShapeAnchor } from '../src/shape-anchor.js'
import { isDecoration, verifyActions } from '../src/run2.js'

let id = 0
const node = (tag: string, x: number, y: number, w: number, h: number, o: { pos?: string; text?: string; parent?: string; cls?: string } = {}): DomNode => ({
  id: `n${id++}`, tag, srcLoc: 'src/App.tsx:1:1', rect: { x, y, w, h }, text: o.text ?? '', classes: [o.cls ?? `c${id}`],
  style: {
    display: 'block', position: o.pos ?? 'static', zIndex: 'auto', flexDirection: 'row', gap: 'normal', padding: '0px',
    margin: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '50%',
  },
  parent: o.parent ?? null, depth: 1,
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false })

const outer = { x: 344, y: 154, w: 592, h: 593 }
const inner = { x: 444, y: 254, w: 392, h: 393 }
const planet = { x: 915, y: 434, w: 37, h: 39 }

describe('verifyShapeAnchor', () => {
  it('fails rings built half their size down-right and a planet top-left (round-3 c3)', () => {
    const hero = node('section', 0, 0, 1280, 900)
    const h1 = node('h1', 150, 300, 980, 220, { text: 'Compute at orbit speed', parent: hero.id })
    const after = snap([
      hero, h1,
      node('div', 640, 450, 600, 600, { pos: 'absolute', parent: hero.id }),
      node('div', 640, 450, 400, 400, { pos: 'absolute', parent: hero.id }),
      node('div', 340, 150, 40, 40, { pos: 'absolute', parent: hero.id }),
    ])
    const cands = decorationCandidates(snap([]), after)
    expect(cands.map((n) => n.tag)).toEqual(['div', 'div', 'div']) // hero and h1 hold text
    const claimed = new Set<string>()
    for (const r of [outer, inner, planet]) {
      const v = verifyShapeAnchor(cands, r, claimed)
      expect(v.satisfied).toBe(false)
      expect(v.reason).toMatch(/px off.*translate\(-50%,-50%\)/)
    }
  })

  it('passes concentric rings and a planet built on their drawings, one element each', () => {
    const o = node('div', 340, 150, 600, 600, { pos: 'absolute' })
    const n = node('div', 440, 250, 400, 400, { pos: 'absolute' })
    const p = node('div', 910, 430, 46, 46, { pos: 'absolute' })
    const cands = decorationCandidates(snap([]), snap([o, n, p]))
    const claimed = new Set<string>()
    const got = [outer, inner, planet].map((r) => verifyShapeAnchor(cands, r, claimed))
    expect(got.every((v) => v.satisfied)).toBe(true)
    expect(got.map((v) => v.claimed)).toEqual([o.id, n.id, p.id])
  })

  it('says nothing when no free-standing decoration of that size exists (built in flow)', () => {
    const cands = decorationCandidates(snap([]), snap([node('div', 0, 0, 600, 600), node('span', 340, 150, 600, 600, { pos: 'absolute', text: 'x' })]))
    expect(verifyShapeAnchor(cands, outer, new Set()).unverifiable).toBe(true)
  })

  it('ignores elements that were already on the page', () => {
    const old = node('div', 0, 0, 600, 600, { pos: 'absolute', cls: 'same' })
    const again = { ...old, id: 'other' }
    expect(decorationCandidates(snap([old]), snap([again]))).toEqual([])
  })
})

describe('isDecoration / verifyActions', () => {
  const base = { kind: 'add' as const, targets: [], instruction: 'Large spinning circle outline in lavender', region: outer, svgPaths: [{ strokeId: 's0', d: 'M0 0' }] }
  it('only pure ink without quoted copy is a decoration', () => {
    expect(isDecoration(base as never)).toBe(true)
    expect(isDecoration({ ...base, instruction: 'pill reading "NOW IN BETA"' } as never)).toBe(false)
    expect(isDecoration({ ...base, instruction: "small circular badge in vivid red reading 'Issue 07 out now'." } as never)).toBe(false)
    expect(isDecoration({ ...base, instruction: 'button with near-black fill reading \u2018Subscribe\u2019' } as never)).toBe(false)
    expect(isDecoration({ ...base, instruction: "the ring's outline, don't fill it" } as never)).toBe(true)
    expect(isDecoration({ ...base, textMarks: ['s4'] } as never)).toBe(false)
    expect(isDecoration({ ...base, layer: 'container' } as never)).toBe(false)
  })
  it('a ring that only "matches" via the hero wrapper now fails', () => {
    const hero = node('section', 0, 0, 1280, 900, { pos: 'relative' })
    const wrap = node('div', 340, 150, 600, 600, { parent: hero.id })
    const h1 = node('h1', 340, 300, 600, 200, { text: 'Hi', parent: wrap.id })
    const ring = node('div', 640, 450, 600, 600, { pos: 'absolute', parent: hero.id })
    const res = verifyActions([base as never], snap([]), snap([hero, wrap, h1, ring]))
    expect(res.failures.join('\n')).toMatch(/placement\): the drawn shape/)
  })
})

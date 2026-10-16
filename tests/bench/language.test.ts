/**
 * s2c-015: the gestures docs/visual-language.md says the reader already knows,
 * held to the reader's own code. Each new rough page (r12-r15) draws one, and
 * its marks must classify as that gesture in packages/ink and resolve to the
 * right op in packages/intent (v1, deterministic). The v2 model reader is not
 * exercised here: that costs tokens and rides on the s2c-013 pilot.
 */
import { describe, expect, it } from 'vitest'
import { analyzeStrokes, type Stroke } from '../../packages/ink/src/index'
import { buildEditPlan } from '../../packages/intent/src/index'
import type { DomNode, DomSnapshot } from '../../packages/dom/src/index'
// @ts-expect-error — plain .mjs bench module, no types
import { pensFor, penChanges, penMismatch } from './lib/pen.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { rarrow, rcaret, rline, sharpTurns, closingGap } from './lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { scoreEdits } from './lib/intent.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { answerKey } from './lib/words.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from './sketches/rough/index.mjs'

type P = { x: number; y: number }
const spec = (id: string) => rough.find((s: { id: string }) => s.id.startsWith(id))
const toStrokes = (lines: P[][]): Stroke[] =>
  lines.map((pts, i) => ({ id: `s${i}`, points: pts.map((p, k) => ({ x: p.x, y: p.y, t: i * 10000 + k * 16 })) }))

/** The rough base page, enough of it for grounding (rects from base.mjs ANCHORS). */
function baseSnapshot(): DomSnapshot {
  const nodes: DomNode[] = []
  const add = (id: string, tag: string, text: string, rect: DomNode['rect'], parent: string | null, depth: number) => {
    nodes.push({ id, tag, text, classes: [], rect, srcLoc: `src/App.tsx:${nodes.length + 1}:1`, parent, children: [], depth } as unknown as DomNode)
  }
  add('main', 'main', '', { x: 0, y: 0, w: 1280, h: 900 }, null, 0)
  add('nav', 'nav', '', { x: 0, y: 0, w: 1280, h: 69 }, 'main', 1)
  add('links', 'div', '', { x: 1025, y: 24, w: 207, h: 20 }, 'nav', 2)
  add('a-features', 'a', 'Features', { x: 1025, y: 24, w: 57, h: 20 }, 'links', 3)
  add('a-pricing', 'a', 'Pricing', { x: 1114, y: 24, w: 46, h: 20 }, 'links', 3)
  add('a-about', 'a', 'About', { x: 1193, y: 24, w: 39, h: 20 }, 'links', 3)
  add('btn', 'button', 'Get started', { x: 574, y: 285, w: 132, h: 48 }, 'main', 2)
  add('features', 'section', '', { x: 0, y: 382, w: 1280, h: 156 }, 'main', 1)
  add('card1', 'article', 'Instant previews', { x: 48, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card2', 'article', 'One-click rollbacks', { x: 453, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card3', 'article', 'Usage-based billing', { x: 859, y: 382, w: 373, h: 108 }, 'features', 2)
  return { nodes, viewport: { w: 1280, h: 900 }, scroll: { x: 0, y: 0 } } as unknown as DomSnapshot
}

describe('pen colour on bench pages (lib/pen.mjs)', () => {
  it('defaults every stroke to the default ink', () => {
    expect(pensFor({ id: 'x', strokes: [[], []] })).toEqual([null, null])
    expect(penChanges({ id: 'x', strokes: [[], []] })).toEqual([])
  })
  it('only changes the pen when the colour changes', () => {
    const s = { id: 'x', strokes: [[], [], [], []], pens: ['#16a34a', '#16a34a', null, '#ef4444'] }
    expect(penChanges(s)).toEqual([{ at: 0, color: '#16a34a' }, { at: 2, color: null }, { at: 3, color: '#ef4444' }])
  })
  it('refuses a colour no user could pick, or a list of the wrong length', () => {
    expect(() => pensFor({ id: 'x', strokes: [[]], pens: ['green'] })).toThrow(/#rrggbb/)
    expect(() => pensFor({ id: 'x', strokes: [[]], pens: ['#16A34A'] })).toThrow(/#rrggbb/)
    expect(() => pensFor({ id: 'x', strokes: [[], []], pens: ['#16a34a'] })).toThrow(/one entry per stroke/)
  })
  it('flags a capture whose colours differ from what was drawn', () => {
    const s = spec('r12')
    expect(penMismatch(s, [{ color: '#16a34a' }])).toBeNull()
    expect(penMismatch(s, [{ color: '#16A34A' }])).toBeNull()
    expect(penMismatch(s, [{}])).toMatch(/default/)
    expect(penMismatch(spec('r01'), [{}])).toBeNull()
  })
})

describe('r12: the pen carries the value r03 needed words for', () => {
  it('draws the same ring shape as r03, in green, with no words', () => {
    expect(spec('r12').notes).toEqual([])
    expect(pensFor(spec('r12'))).toEqual(['#16a34a'])
    expect(sharpTurns(spec('r12').strokes[0])).toBeLessThan(4) // a ring, not a delete
  })
  it('is judged with no words, where r03 is not', () => {
    expect(answerKey(spec('r03'), 'none').judged).toBe(false)
    const k = answerKey(spec('r12'), 'none')
    expect(k.judged).toBe(true)
    expect(k.dropped).toEqual([])
  })
  it('the ring resolves to MODIFY on the button (v1 reader)', () => {
    const plan = buildEditPlan(analyzeStrokes(toStrokes(spec('r12').strokes)), baseSnapshot())
    expect(plan.ops.map((o) => o.op)).toEqual(['MODIFY'])
    expect((plan.ops[0] as { target: { domId: string } }).target.domId).toBe('btn')
  })
})

describe('r13: two arrows between the same two cards = swap', () => {
  const scene = () => analyzeStrokes(toStrokes(spec('r13').strokes))
  it('both marks are read as arrows, one each way', () => {
    const s = scene()
    expect(s.arrows).toHaveLength(2)
    const [a, b] = s.arrows
    expect(Math.sign(a!.to.x - a!.from.x)).toBe(-Math.sign(b!.to.x - b!.from.x))
  })
  it('long arrows keep their heads; long lines do not grow one (packages/ink scene.ts fix)', () => {
    // before the fix, RDP at 3.5% of the diagonal erased a normal head on any
    // shaft over ~600px, so a page-wide arrow read as a plain line
    for (const len of [300, 600, 800, 1000]) {
      for (const dir of [1, -1]) {
        const x1 = 640 - (dir * len) / 2
        const a = analyzeStrokes(toStrokes([rarrow(x1, 400, x1 + dir * len, 404)]))
        expect(a.arrows, `arrow len ${len} dir ${dir}`).toHaveLength(1)
        expect(Math.sign(a.arrows[0]!.to.x - a.arrows[0]!.from.x)).toBe(dir)
        const l = analyzeStrokes(toStrokes([rline(x1, 400, x1 + dir * len, 404)]))
        expect(l.arrows, `line len ${len} dir ${dir}`).toHaveLength(0)
      }
    }
  })
  it('each arrow grounds card1 <-> card3 (v1 emits two MOVEs; v2 is told this pair is a swap)', () => {
    const plan = buildEditPlan(scene(), baseSnapshot())
    const moves = plan.ops.filter((o) => o.op === 'MOVE') as Array<{ source: { domId: string }; dest: { domId: string } }>
    expect(moves.map((m) => `${m.source.domId}>${m.dest.domId}`).sort()).toEqual(['card1>card3', 'card3>card1'])
  })
  it('swapped passes, a one-way move does not', () => {
    const el = (text: string, x: number) => ({ tag: 'article', text, rect: { x, y: 382, w: 373, h: 108 }, parent: -1, children: 0 })
    const swapped = [el('Usage-based billing', 48), el('One-click rollbacks', 453), el('Instant previews', 859), { tag: 'p', text: 'We cut our release time in half.', rect: { x: 48, y: 583, w: 1184, h: 32 }, parent: -1, children: 0 }]
    expect(scoreEdits(spec('r13'), swapped).realized).toBe(true)
    const moved = [el('One-click rollbacks', 48), el('Usage-based billing', 453), el('Instant previews', 859), swapped[3]]
    expect(scoreEdits(spec('r13'), moved).realized).toBe(false)
  })
})

describe('r14: a caret says where, the words say what', () => {
  it('rcaret classifies as a caret', () => {
    for (const [x, y] of [[1098, 42], [400, 300], [700, 120]]) {
      const s = analyzeStrokes(toStrokes([rcaret(x, y)]))
      expect(s.nodes[0]?.kind, `${x},${y}`).toBe('caret')
    }
  })
  it('the caret resolves to INSERT in the nav links (v1 reader)', () => {
    const plan = buildEditPlan(analyzeStrokes(toStrokes(spec('r14').strokes)), baseSnapshot())
    const ins = plan.ops.filter((o) => o.op === 'INSERT') as Array<{ container: { domId: string } }>
    expect(ins).toHaveLength(1)
    expect(['links', 'nav']).toContain(ins[0]!.container.domId)
  })
  it('is not judged with no words: the link text is content', () => {
    expect(answerKey(spec('r14'), 'none').judged).toBe(false)
  })
})

/** BASE_LIST_APP: the base plus a three-tile row in a 4-column grid (rects from base.mjs). */
function listSnapshot(): DomSnapshot {
  const snap = baseSnapshot() as unknown as { nodes: Array<Record<string, unknown>> }
  const add = (id: string, tag: string, text: string, rect: object, parent: string, depth: number) =>
    snap.nodes.push({ id, tag, text, classes: [], rect, srcLoc: `src/App.tsx:${snap.nodes.length + 1}:1`, parent, children: [], depth })
  add('integrations', 'section', '', { x: 0, y: 519, w: 1280, h: 210 }, 'main', 1)
  add('row', 'div', '', { x: 48, y: 591, w: 1184, h: 90 }, 'integrations', 2)
  add('t-github', 'div', 'GitHub', { x: 48, y: 591, w: 278, h: 90 }, 'row', 3)
  add('t-gitlab', 'div', 'GitLab', { x: 350, y: 591, w: 278, h: 90 }, 'row', 3)
  add('t-slack', 'div', 'Slack', { x: 652, y: 591, w: 278, h: 90 }, 'row', 3)
  return snap as unknown as DomSnapshot
}

describe('r15: one empty box in the empty slot of a list = one more of these', () => {
  it('is one closed-ish box in the empty fourth cell, touching no tile, with no words', () => {
    const s = spec('r15')
    expect(s.notes).toEqual([])
    expect(s.strokes).toHaveLength(1)
    const xs = s.strokes[0].map((p: P) => p.x)
    expect(Math.min(...xs)).toBeGreaterThan(930) // Slack's tile ends at 930
    expect(Math.max(...xs)).toBeLessThan(1240)
    expect(closingGap(s.strokes[0])).toBeLessThan(40)
  })
  it('the box resolves to ADD into the row, not a modify or delete of a tile (v1 reader)', () => {
    const plan = buildEditPlan(analyzeStrokes(toStrokes(spec('r15').strokes)), listSnapshot())
    expect(plan.ops.map((o) => o.op)).toEqual(['ADD'])
    expect((plan.ops[0] as unknown as { container: { domId: string } }).container.domId).toBe('row')
  })
  it('is judged with no words, and nothing is dropped from its key', () => {
    const k = answerKey(spec('r15'), 'none')
    expect(k.judged).toBe(true)
    expect(k.dropped).toEqual([])
  })
})

describe('the table in docs/visual-language.md, v1 column, on the existing rough pages', () => {
  const ops = (id: string) => buildEditPlan(analyzeStrokes(toStrokes(spec(id).strokes)), baseSnapshot()).ops
  it('r01 scribble -> DELETE card3', () => {
    expect(ops('r01').map((o) => `${o.op}:${(o as { target?: { domId: string } }).target?.domId}`)).toEqual(['DELETE:card3'])
  })
  it('r06 X over a nav link -> NOTHING in v1 (each diagonal fails the flat strike test); only v2 reads X', () => {
    expect(ops('r06')).toEqual([])
  })
})

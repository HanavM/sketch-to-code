/**
 * s2c-020: a bare ring (default ink, no words, around an existing element)
 * asks a question instead of spending a model call. Fixtures are the rough
 * bench's own strokes (tests/bench/sketches/rough), so the detector is held to
 * the marks the s2c-013 pilot will draw, not to tidy test geometry.
 */
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { askKey, askSentence, bareRing, isRing, ringTarget, targetName } from '../src/bare-ring.js'
import type { RingInput } from '../src/bare-ring.js'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rring } from '../../../tests/bench/lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { pensFor } from '../../../tests/bench/lib/pen.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from '../../../tests/bench/sketches/rough/index.mjs'

type P = { x: number; y: number }
type Spec = { id: string; strokes: P[][]; notes: unknown[]; pens?: Array<string | null> }
const spec = (id: string): Spec => rough.find((s: Spec) => s.id.startsWith(id))
const toInput = (lines: P[][], colors: Array<string | null> = []): RingInput[] =>
  lines.map((pts, i) => ({
    id: `s${String(i)}`,
    points: pts.map((p, k) => ({ x: p.x, y: p.y, t: i * 10000 + k * 16 })),
    ...(colors[i] ? { color: colors[i]! } : {}),
  }))
const strokesOf = (id: string) => { const s = spec(id); return toInput(s.strokes, s.pens ? pensFor(s) : []) }

/** The rough base page (rects from base.mjs ANCHORS), as language.test.ts builds it. */
function baseSnapshot(): DomSnapshot {
  const nodes: DomNode[] = []
  const add = (id: string, tag: string, text: string, rect: DomNode['rect'], parent: string | null, depth: number) => {
    nodes.push({ id, tag, text, classes: [], rect, srcLoc: `src/App.tsx:${String(nodes.length + 1)}:1`, parent, depth } as unknown as DomNode)
  }
  add('main', 'main', '', { x: 0, y: 0, w: 1280, h: 900 }, null, 0)
  add('nav', 'nav', '', { x: 0, y: 0, w: 1280, h: 69 }, 'main', 1)
  add('links', 'div', '', { x: 1025, y: 24, w: 207, h: 20 }, 'nav', 2)
  add('a-features', 'a', 'Features', { x: 1025, y: 24, w: 57, h: 20 }, 'links', 3)
  add('a-pricing', 'a', 'Pricing', { x: 1114, y: 24, w: 46, h: 20 }, 'links', 3)
  add('a-about', 'a', 'About', { x: 1193, y: 24, w: 39, h: 20 }, 'links', 3)
  add('btn', 'button', 'Get started', { x: 574, y: 285, w: 132, h: 48 }, 'main', 2)
  add('features', 'section', '', { x: 0, y: 382, w: 1280, h: 156 }, 'main', 1)
  add('card1', 'article', '', { x: 48, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card1-h', 'h3', 'Instant previews', { x: 72, y: 406, w: 160, h: 24 }, 'card1', 3)
  add('card2', 'article', '', { x: 453, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card2-h', 'h3', 'One-click rollbacks', { x: 477, y: 406, w: 180, h: 24 }, 'card2', 3)
  add('card3', 'article', '', { x: 859, y: 382, w: 373, h: 108 }, 'features', 2)
  add('footer', 'footer', '© 2026 Acme Inc.', { x: 0, y: 695, w: 1280, h: 68 }, 'main', 1)
  return { nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'http://x/', takenAt: 0, truncated: false }
}

/** BASE_LIST_APP: the base plus a three-tile row in a 4-column grid, with an empty fourth cell. */
function listSnapshot(): DomSnapshot {
  const snap = baseSnapshot()
  const add = (id: string, tag: string, text: string, rect: DomNode['rect'], parent: string, depth: number) =>
    snap.nodes.push({ id, tag, text, classes: [], rect, srcLoc: `src/App.tsx:${String(snap.nodes.length + 1)}:1`, parent, depth } as unknown as DomNode)
  add('integrations', 'section', '', { x: 0, y: 519, w: 1280, h: 210 }, 'main', 1)
  add('row', 'div', '', { x: 48, y: 591, w: 1184, h: 90 }, 'integrations', 2)
  add('t-github', 'div', 'GitHub', { x: 48, y: 591, w: 278, h: 90 }, 'row', 3)
  add('t-gitlab', 'div', 'GitLab', { x: 350, y: 591, w: 278, h: 90 }, 'row', 3)
  add('t-slack', 'div', 'Slack', { x: 652, y: 591, w: 278, h: 90 }, 'row', 3)
  return snap
}

describe('isRing: the ink package decides what is closed', () => {
  it("reads the bench's lopsided rings and loose boxes as rings", () => {
    expect(isRing(strokesOf('r03')[0]!)).toBe(true)
    expect(isRing(strokesOf('r12')[0]!)).toBe(true)
    expect(isRing(strokesOf('r15')[0]!)).toBe(true)
    expect(isRing(toInput([rbox(560, 274, 160, 70, { close: 'overlap' })])[0]!)).toBe(true)
  })
  it('never reads a scribble, a strike, an arrow, an X or a partial box as a ring', () => {
    for (const id of ['r01', 'r02', 'r04', 'r05', 'r06', 'r13', 'r14']) {
      for (const s of strokesOf(id)) expect(isRing(s), `${id} ${s.id}`).toBe(false)
    }
  })
})

describe('bareRing: ask only when the sketch says nothing on its own', () => {
  const base = baseSnapshot()

  it('r03 with its words taken away asks, and names the button', () => {
    const ask = bareRing(strokesOf('r03'), 0, base, 'gesture')
    expect(ask?.strokeIds).toEqual(['s0'])
    expect(ask?.targets.map((t) => t.id)).toEqual(['btn'])
    expect(ask?.names).toEqual(['"Get started"'])
  })
  it('r03 as drawn (with "bigger and green") does not ask: any note is an answer', () => {
    expect(spec('r03').notes.length).toBe(1)
    expect(bareRing(strokesOf('r03'), spec('r03').notes.length, base, 'gesture')).toBeNull()
  })
  it('r12 does not ask: the green pen is the instruction', () => {
    expect(strokesOf('r12')[0]!.color).toBe('#16a34a')
    expect(bareRing(strokesOf('r12'), 0, base, 'gesture')).toBeNull()
    // and it is the colour that decides, not the shape: the same ring in default ink asks
    expect(bareRing(toInput(spec('r12').strokes), 0, base, 'gesture')).not.toBeNull()
  })
  it('r01 scribble (delete) does not ask', () => {
    expect(bareRing(strokesOf('r01'), 0, base, 'gesture')).toBeNull()
  })
  it('r05 partial box in the footer does not ask, with or without its words', () => {
    expect(bareRing(strokesOf('r05'), 0, base, 'gesture')).toBeNull()
    expect(bareRing(strokesOf('r05'), 1, base, 'gesture')).toBeNull()
  })
  it('r15 one closed empty box in the empty slot of a list does not ask: that is "add here"', () => {
    const list = listSnapshot()
    expect(isRing(strokesOf('r15')[0]!)).toBe(true)
    expect(ringTarget(strokesOf('r15')[0]!, list)).toBeNull()
    expect(bareRing(strokesOf('r15'), 0, list, 'gesture')).toBeNull()
  })
  it('a closed box around a card asks, and names the card by its heading', () => {
    const ask = bareRing(toInput([rbox(444, 374, 392, 124)]), 0, base, 'gesture')
    expect(ask?.targets.map((t) => t.id)).toEqual(['card2'])
    expect(ask?.names).toEqual(['"One-click rollbacks"'])
  })
  it('two bare rings ask once, about both', () => {
    const ask = bareRing(toInput([...spec('r03').strokes, rbox(40, 374, 390, 124)]), 0, base, 'gesture')
    expect(ask?.targets.map((t) => t.id)).toEqual(['btn', 'card1'])
  })
  it('one bare ring next to anything that says something does not ask', () => {
    const ring = spec('r03').strokes
    expect(bareRing(toInput([...ring, ...spec('r01').strokes]), 0, base, 'gesture')).toBeNull()
    expect(bareRing(toInput([...ring, ...spec('r12').strokes], [null, '#16a34a']), 0, base, 'gesture')).toBeNull()
  })
  it('a ring around nothing but a sliver of a big card does not ask', () => {
    // inside card3's empty right half: card3 is not enclosed, nothing else is there
    expect(bareRing(toInput([rring(1150, 436, 60, 30)]), 0, base, 'gesture')).toBeNull()
  })
  it('design and screenshot readings never ask, and an empty sketch never asks', () => {
    expect(bareRing(strokesOf('r03'), 0, base, 'design')).toBeNull()
    expect(bareRing(strokesOf('r03'), 0, base, 'screenshot')).toBeNull()
    expect(bareRing([], 0, base, 'gesture')).toBeNull()
  })
  it('a ring around the whole page is not about the page wrapper', () => {
    expect(ringTarget(toInput([rbox(4, 4, 1272, 892)])[0]!, base)?.id).not.toBe('main')
  })
})

describe('the rough bench with every word removed (--words none)', () => {
  it('asks about exactly one edit page: r03, the ring whose only instruction was its words', () => {
    const edits = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r12', 'r13', 'r14', 'r15']
    const asked = edits.filter((id) =>
      bareRing(strokesOf(id), 0, id === 'r15' ? listSnapshot() : baseSnapshot(), 'gesture') !== null)
    expect(asked).toEqual(['r03'])
  })
})

describe('the question', () => {
  it('names the thing by its own text, else its kind, in words a non-coder reads', () => {
    const n = (tag: string, text = '') => ({ tag, text } as DomNode)
    expect(targetName(n('button', 'Get started'))).toBe('"Get started"')
    expect(targetName(n('article'), 'One-click rollbacks')).toBe('"One-click rollbacks"')
    expect(targetName(n('article'))).toBe('this card')
    expect(targetName(n('div'))).toBe('this part')
    expect(targetName(n('p', 'x'.repeat(50)))).toHaveLength(34)
  })
  it('marks where an inline child sat instead of joining the words around it (s2c-046)', () => {
    const p = { tag: 'p', text: 'Edit and save to test', textRuns: ['Edit', 'and save to test'] } as DomNode
    expect(targetName(p)).toBe('"Edit … and save to test"')
    expect(askSentence([targetName(p)])).toMatch(/^What should change about "Edit … and save to test"\?/)
  })
  it('gives both answers and the way past it, on one line', () => {
    const s = askSentence(['"Get started"'])
    expect(s).toMatch(/^What should change about "Get started"\?/)
    expect(s).toMatch(/Type a word/)
    expect(s).toMatch(/pen colour \(Alt\+P\)/)
    expect(s).toMatch(/Run again/)
    expect(askSentence(['a', 'b'])).toMatch(/these 2 things/)
  })
  it('keys the question to the strokes, so the same sketch is asked about once', () => {
    expect(askKey(['s0', 's1'])).toBe(askKey(['s0', 's1']))
    expect(askKey(['s0'])).not.toBe(askKey(['s0', 's1']))
  })
})

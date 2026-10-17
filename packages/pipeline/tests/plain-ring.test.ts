/**
 * s2c-050: a ring drawn in a pen colour round one element, no words, is read
 * without a model (visual-language row 7). Fixtures: the rough bench's own
 * r12 ring (lopsided, wobbly, drawn in #16a34a) and its base page rects.
 */
import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import {
  isRing, plainReading, RECOLOR_INSTRUCTION, recolorPropOf, ringTarget,
} from '../src/plain-reading.js'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'
import * as overlay from '../../overlay-client/src/bare-ring.js'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rring } from '../../../tests/bench/lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from '../../../tests/bench/sketches/rough/index.mjs'

type P = { x: number; y: number }
const CLEAR = 'rgba(0, 0, 0, 0)'
const toStroke = (pts: P[], id = 's0', color?: string): Stroke => ({
  id,
  points: pts.map((p, k) => ({ x: p.x, y: p.y, t: k * 16 })),
  ...(color ? { color } : {}),
})
const r12 = rough.find((s: { id: string }) => s.id.startsWith('r12')) as { strokes: P[][]; pens: string[] }
const r12Stroke = (): Stroke => toStroke(r12.strokes[0]!, 's0', r12.pens[0])

/** The rough base page (base.mjs rects), with the computed fills a real page has. */
function base(): DomSnapshot {
  const nodes: DomNode[] = []
  const add = (id: string, tag: string, text: string, rect: DomNode['rect'], parent: string | null, bg = CLEAR) => {
    nodes.push({
      id, tag, text, classes: [], rect, parent, depth: parent ? 2 : 0,
      srcLoc: `src/App.tsx:${String(nodes.length + 1)}:5`,
      style: { color: 'rgb(17, 24, 39)', backgroundColor: bg } as DomNode['style'],
    } as DomNode)
  }
  add('main', 'main', '', { x: 0, y: 0, w: 1280, h: 900 }, null, 'rgb(255, 255, 255)')
  add('hero-h', 'h1', 'Ship faster with Acme', { x: 380, y: 160, w: 520, h: 56 }, 'main')
  add('btn', 'button', 'Get started', { x: 574, y: 285, w: 132, h: 48 }, 'main', 'rgb(17, 24, 39)')
  add('features', 'section', '', { x: 0, y: 382, w: 1280, h: 156 }, 'main')
  add('card1', 'article', '', { x: 48, y: 382, w: 373, h: 108 }, 'features')
  add('card1-h', 'h3', 'Instant previews', { x: 72, y: 406, w: 160, h: 24 }, 'card1')
  add('card1-btn', 'button', 'Try', { x: 72, y: 440, w: 60, h: 30 }, 'card1', 'rgb(37, 99, 235)')
  return { nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'http://x/', takenAt: 0, truncated: false }
}
const ringAround = (r: DomNode['rect'], seed: number, color?: string, pad = 14): Stroke =>
  toStroke(rring(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + pad, r.h / 2 + pad, { seed }), 's0', color)

describe('plainReading: a coloured ring needs no model (s2c-050)', () => {
  const snap = base()
  const node = (id: string) => snap.nodes.find((n) => n.id === id)!

  it("the bench's r12 (green ring round a filled button) reads as: make its background green", () => {
    const r = plainReading([r12Stroke()], snap)
    if (!r.ok) throw new Error(r.reason)
    expect(r.rule).toBe('ring-recolor')
    expect(r.tokens).toEqual({ input: 0, cacheRead: 0, output: 0 })
    const a = r.interpretation.actions[0]!
    expect(a.kind).toBe('modify')
    expect(a.instruction).toBe(RECOLOR_INSTRUCTION.backgroundColor)
    expect(a.targets[0]!.srcLoc).toBe(node('btn').srcLoc)
    expect(a.color?.drawn).toBe('#16a34a')
    expect(r.raw.reading).toBe('You ringed the button with "Get started" in green: make its background green.')
  })

  it('a red ring round a heading (no fill) colours the words', () => {
    const r = plainReading([ringAround(node('hero-h').rect, 7, '#dc2626')], snap)
    if (!r.ok) throw new Error(r.reason)
    expect(r.interpretation.actions[0]!.instruction).toBe(RECOLOR_INSTRUCTION.color)
    expect(r.interpretation.actions[0]!.targets[0]!.srcLoc).toBe(node('hero-h').srcLoc)
    expect(r.raw.reading).toMatch(/^You ringed the heading with "Ship faster with Acme" in red: make it red\.$/)
  })

  it('the reading survives the re-grounding a run does, and run2 recognises it', () => {
    const s = [r12Stroke()]
    const r = plainReading(s, snap)
    if (!r.ok) throw new Error(r.reason)
    const again = groundInterpretation(JSON.parse(JSON.stringify(r.raw)), buildEvidence(s, snap, []), snap, 'gesture')
    expect(again.rejected).toEqual([])
    expect(recolorPropOf(again.actions[0]!.instruction)).toBe('backgroundColor')
    expect(again.actions[0]!.color?.drawn).toBe('#16a34a')
  })

  it('declines the default ink: that is the bare-ring question, not a colour', () => {
    const r = plainReading([toStroke(r12.strokes[0]!)], snap)
    expect(r.ok).toBe(false)
  })

  it('declines any typed words', () => {
    const r = plainReading([r12Stroke()], snap, 'gesture', [{ id: 'n1', text: 'and bigger', anchor: { kind: 'free', x: 0, y: 0 } } as never])
    expect(r).toEqual({ ok: false, reason: 'typed words: the model reads them' })
  })

  it('declines two rings (one colour for two things is the model\'s to read)', () => {
    const two = [ringAround(node('btn').rect, 3, '#16a34a'), { ...ringAround(node('hero-h').rect, 4, '#16a34a'), id: 's1' }]
    expect(plainReading(two, snap).ok).toBe(false)
  })

  it('declines a clear box holding a button: fill or words is not decidable', () => {
    const r = plainReading([ringAround(node('card1').rect, 5, '#16a34a', 10)], snap)
    expect(r.ok).toBe(false)
  })

  it('declines a coloured ring round empty space', () => {
    const r = plainReading([toStroke(rring(1100, 700, 60, 40, { seed: 9 }), 's0', '#16a34a')], snap)
    expect(r.ok).toBe(false)
  })

  it('declines in design mode (a coloured box there is new UI)', () => {
    expect(plainReading([r12Stroke()], snap, 'design').ok).toBe(false)
  })

  it('declines an open, three-sided box in colour (a frame for something new)', () => {
    const r = plainReading([toStroke(rbox(560, 274, 160, 70, { sides: 3 }), 's0', '#16a34a')], snap)
    expect(r.ok).toBe(false)
  })

  it('a model reading with its own wording never takes the engine path', () => {
    expect(recolorPropOf('make it this colour')).toBeNull()
    expect(recolorPropOf(undefined)).toBeNull()
  })
})

describe('a long, flat ring is still a ring (found by s2c-050)', () => {
  it('rings of 3:1 to 7:1 round a heading read as rings, in both readers', () => {
    for (const [rx, ry] of [[274, 42], [200, 42], [150, 42], [300, 40]]) {
      for (const seed of [7, 8, 9]) {
        const st = toStroke(rring(640, 188, rx, ry, { seed }))
        expect(isRing(st), `${rx}x${ry} seed ${seed}`).toBe(true)
        expect(overlay.isRing(st)).toBe(true)
      }
    }
  })
  it('a long strike, a long zigzag and a long open bracket are still not rings', () => {
    const strike = Array.from({ length: 40 }, (_, i) => ({ x: 380 + i * 14, y: 188 + (i % 3) }))
    const zig = Array.from({ length: 17 }, (_, i) => ({ x: 380 + i * 32, y: i % 2 ? 210 : 166 }))
    const bracket = [...Array.from({ length: 10 }, (_, i) => ({ x: 380, y: 166 + i * 5 })),
      ...Array.from({ length: 50 }, (_, i) => ({ x: 380 + i * 11, y: 212 })),
      ...Array.from({ length: 10 }, (_, i) => ({ x: 930, y: 212 - i * 5 }))]
    for (const pts of [strike, zig, bracket]) {
      expect(isRing(toStroke(pts))).toBe(false)
      expect(overlay.isRing(toStroke(pts))).toBe(false)
    }
  })
})

describe('the ported ring reader agrees with the overlay\'s bare-ring reader', () => {
  const snap = base()
  const ids = ['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r12', 'r13', 'r14', 'r15']
  it('isRing and ringTarget give the same answers on every bench edit page', () => {
    let rings = 0
    for (const id of ids) {
      const spec = rough.find((s: { id: string }) => s.id.startsWith(id)) as { strokes: P[][] }
      spec.strokes.forEach((pts, i) => {
        const st = toStroke(pts, `s${String(i)}`)
        const mine = isRing(st)
        expect(mine, `${id} s${String(i)}`).toBe(overlay.isRing(st))
        if (mine) rings++
        expect(ringTarget(st, snap)?.id ?? null, `${id} s${String(i)} target`).toBe(overlay.ringTarget(st, snap)?.id ?? null)
      })
    }
    expect(rings).toBeGreaterThanOrEqual(3)
  })
})

/**
 * Pending previews (goal loop n7): an arrow, a caret and a box in empty space
 * each read in the browser as move / insert / new section, on the rough bench
 * sketches, and the caret's gap is the one the pipeline's slot finder picks.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DomSnapshot } from '@s2c/dom'
import { findInsertSlot as serverSlot } from '../../pipeline/src/insert-slot.js'
import { findInsertSlot } from '../src/insert-slot-copy.js'
import { previewLanded, previewReading } from '../src/preview.js'
import type { QStroke } from '../src/optimistic.js'
// @ts-expect-error — plain .mjs bench module, no types
import { rarrow, rbox, rcaret, rring, rscribble } from '../../../tests/bench/lib/rough.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from '../../../tests/bench/sketches/rough/index.mjs'

type P = { x: number; y: number }
const BASE: DomSnapshot = JSON.parse(
  readFileSync(new URL('../../../tests/bench/fixtures/base-snapshot.json', import.meta.url), 'utf8'),
)
const toInput = (lines: P[][]): QStroke[] =>
  lines.map((pts, i) => ({ id: `s${String(i)}`, points: pts.map((p, k) => ({ x: p.x, y: p.y, t: i * 10000 + k * 16 })) }))
const spec = (id: string): { strokes: P[][] } => rough.find((s: { id: string }) => s.id.startsWith(id))

describe('previewReading', () => {
  it('reads r04 (arrow from the testimonial up) as a move of the quote, ghost at the head', () => {
    const p = previewReading(toInput(spec('r04').strokes), BASE)
    expect(p?.kind).toBe('move')
    expect(p?.srcLoc).toBe('src/App.tsx:32:9')
    const from = p!.boxes.find((b) => b.role === 'from')!
    const ghost = p!.boxes.find((b) => b.role === 'ghost')!
    expect(from.rect.y).toBe(583)
    expect(ghost.rect.y + ghost.rect.h / 2).toBeLessThan(400)
    expect(ghost.rect.w).toBeCloseTo(from.rect.w)
    expect(p!.label).toMatch(/pending/)
  })

  it('reads r14 (caret between Features and Pricing) as an insert into that gap', () => {
    const p = previewReading(toInput(spec('r14').strokes), BASE)
    expect(p?.kind).toBe('insert')
    expect(p?.slot?.after.text).toBe('Features')
    expect(p?.slot?.before.text).toBe('Pricing')
    const g = p!.boxes[0]!.rect
    expect(g.x).toBeGreaterThanOrEqual(1025 + 57 - 1)
    expect(g.x + g.w).toBeLessThanOrEqual(1114.5 + 1)
    expect(g.h).toBe(20)
  })

  it('reads a loose box in the empty band under the footer as a new section', () => {
    const p = previewReading(toInput([rbox(200, 780, 600, 90, { seed: 7 })]), BASE)
    expect(p?.kind).toBe('section')
    expect(p!.boxes[0]!.rect.w).toBeGreaterThan(500)
  })

  it('declines a box drawn ON content (a mark about it, not a new thing)', () => {
    expect(previewReading(toInput([rbox(560, 280, 160, 60, { seed: 3 })]), BASE)).toBeNull()
  })

  it('declines a scribble, a ring and a tiny box', () => {
    expect(previewReading(toInput([rscribble(200, 790, 300, 60)]), BASE)).toBeNull()
    expect(previewReading(toInput([rring(400, 820, 120, 40)]), BASE)?.kind ?? null).not.toBe('move')
    expect(previewReading(toInput([rbox(300, 800, 30, 20, { seed: 2 })]), BASE)).toBeNull()
  })

  it('declines an arrow plus anything else, and an arrow that ends on nothing stamped', () => {
    const two = toInput([rarrow(660, 600, 630, 372), rbox(200, 780, 600, 90, { seed: 7 })])
    expect(previewReading(two, BASE)?.kind ?? null).not.toBe('move')
    // ends in the body only (no stamp below the footer)
    expect(previewReading(toInput([rarrow(660, 600, 640, 860)]), BASE)).toBeNull()
  })

  it('declines a caret on top of a link (no gap)', () => {
    expect(previewReading(toInput([rcaret(1140, 40, 18, 16)]), BASE)?.kind ?? null).not.toBe('insert')
  })

  it('declines a truncated page', () => {
    expect(previewReading(toInput(spec('r14').strokes), { ...BASE, truncated: true })).toBeNull()
  })
})

describe('the copied slot finder agrees with the pipeline', () => {
  const regions = [
    { x: 1089, y: 34, w: 18, h: 16 }, { x: 1170, y: 34, w: 18, h: 16 },
    { x: 425, y: 400, w: 24, h: 40 }, { x: 830, y: 400, w: 24, h: 40 },
    { x: 600, y: 300, w: 20, h: 20 }, { x: 10, y: 10, w: 10, h: 10 },
  ]
  for (const r of regions) {
    it(`same slot for ${JSON.stringify(r)}`, () => {
      expect(findInsertSlot(BASE, r)).toEqual(serverSlot(BASE, r))
    })
  }
})

describe('a box inside a container but on no content', () => {
  it('reads as a new section; one over the cards does not', () => {
    // the features section spans y 381-535; the band under its cards (487-535) is empty
    expect(previewReading(toInput([rbox(300, 492, 500, 38, { seed: 4 })]), BASE)?.kind).toBe('section')
    expect(previewReading(toInput([rbox(60, 392, 340, 80, { seed: 5 })]), BASE)).toBeNull()
  })
})

describe('previewLanded (n9): the preview comes down when the real change shows', () => {
  const clone = (): DomSnapshot => JSON.parse(JSON.stringify(BASE))
  const stamp = (snap: DomSnapshot, like: DomSnapshot['nodes'][number], over: Partial<DomSnapshot['nodes'][number]>) => {
    snap.nodes.push({ ...JSON.parse(JSON.stringify(like)), id: `new${String(snap.nodes.length)}`, ...over })
  }
  const byText = (snap: DomSnapshot, t: string) => snap.nodes.find((n) => n.text === t)!

  it('insert: a new link between Features and Pricing lands it; one elsewhere, or none, does not', () => {
    const p = previewReading(toInput(spec('r14').strokes), BASE)!
    expect(previewLanded(p, BASE, BASE)).toBe(false)
    const after = clone()
    const feat = byText(after, 'Features')
    const pricing = byText(after, 'Pricing')
    for (const n of after.nodes) if (n.rect.y < 80 && n.rect.x >= pricing.rect.x) n.rect.x += 50
    stamp(after, feat, { text: 'Blog', srcLoc: 'src/App.tsx:9:9', rect: { ...feat.rect, x: pricing.rect.x - 4, w: 40 } })
    expect(previewLanded(p, BASE, after)).toBe(true)
    // something else: the same link added far away (in the footer band)
    const other = clone()
    stamp(other, byText(other, 'Features'), { text: 'Blog', rect: { x: 200, y: 800, w: 40, h: 20 } })
    expect(previewLanded(p, BASE, other)).toBe(false)
  })

  it('move: the quote near the ghost lands it; the quote left in place does not', () => {
    const p = previewReading(toInput(spec('r04').strokes), BASE)!
    const ghost = p.boxes.find((b) => b.role === 'ghost')!.rect
    const after = clone()
    const q = after.nodes.find((n) => n.id === p.fromId)!
    q.rect = { ...q.rect, x: ghost.x + 5, y: ghost.y + 20 }
    expect(previewLanded(p, BASE, after)).toBe(true)
    const other = clone()
    other.nodes.find((n) => n.text && n.id !== p.fromId)!.text = 'changed words'
    expect(previewLanded(p, BASE, other)).toBe(false)
  })

  it('section: a new heading in the drawn band lands it; one at the top of the page does not', () => {
    const p = previewReading(toInput([rbox(200, 780, 600, 90, { seed: 7 })]), BASE)!
    const h = BASE.nodes.find((n) => n.tag === 'h2' && n.srcLoc) ?? BASE.nodes.find((n) => n.text && n.srcLoc)!
    const after = clone()
    stamp(after, h, { text: 'FAQ', rect: { x: 220, y: 770, w: 300, h: 30 } })
    expect(previewLanded(p, BASE, after)).toBe(true)
    const other = clone()
    stamp(other, h, { text: 'FAQ', rect: { x: 220, y: 60, w: 300, h: 30 } })
    expect(previewLanded(p, BASE, other)).toBe(false)
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { plainReading } from '@s2c/pipeline'
// @ts-expect-error plain .mjs bench helpers, no types
import { expectedRule, judgePlain, subtreeText, tallyPlain } from './lib/plain.mjs'
// @ts-expect-error plain .mjs bench helpers, no types
import { rscribble, rring } from './lib/rough.mjs'
// @ts-expect-error plain .mjs bench helpers, no types
import rough from './sketches/rough/index.mjs'

const SNAP = JSON.parse(readFileSync(new URL('./fixtures/base-snapshot.json', import.meta.url), 'utf8'))
const wireOf = (strokes: unknown[], notes: unknown[] = []) => ({ strokes, snapshot: SNAP, mode: 'gesture', notes })
const toWire = (pts: Array<{ x: number; y: number }>, color?: string) => ({
  id: 's0', points: pts.map((p, k) => ({ x: p.x, y: p.y, t: 16 * k })), ...(color ? { color } : {}),
})
const read = (w: ReturnType<typeof wireOf>) =>
  plainReading(w.strokes as never, w.snapshot, 'gesture', w.notes as never)
const spec = (id: string) => (rough as Array<{ id: string; strokes: Array<Array<{ x: number; y: number }>>; edits: unknown[] }>).find((s) => s.id.startsWith(id))!

describe('bench: judging no-model readings against the answer key (s2c-052)', () => {
  it('expects a rule only for a lone delete or a lone pen-coloured recolour, with no words', () => {
    const del = { edits: [{ check: 'absent', text: 'x', must: true }, { check: 'kept', text: 'y' }] }
    const bg = { edits: [{ check: 'bg', text: 'x', must: true }, { check: 'kept', text: 'x', must: true }] }
    expect(expectedRule(del, { words: false, pen: false })).toBe('scribble-delete')
    expect(expectedRule(del, { words: true, pen: false })).toBeNull()
    expect(expectedRule(bg, { words: false, pen: true })).toBe('ring-recolor')
    expect(expectedRule(bg, { words: false, pen: false })).toBeNull()
    expect(expectedRule({ edits: [{ check: 'absent', text: 'a', must: true }, { check: 'present', text: 'b', must: true }] }, { words: false, pen: false })).toBeNull()
  })

  it('the base snapshot fixture is the bench base page (card 3 holds its own title and body)', () => {
    const card = SNAP.nodes.find((n: { tag: string; id: string }) => n.tag === 'article' && subtreeText(SNAP, n.id).includes('Usage-based billing'))
    expect(card).toBeTruthy()
    expect(subtreeText(SNAP, card.id)).toContain('Pay for the minutes')
  })

  it("r01's scribble is read right, for free, on the fixture", () => {
    const s = spec('r01')
    const w = wireOf([toWire(s.strokes[0]!)])
    const j = judgePlain(s, w, read(w))
    expect(j.outcome).toBe('right')
    expect(j.targets.join(' ')).toContain('Usage-based billing')
  })

  it("r12's green ring is read right, for free, on the fixture", () => {
    const s = spec('r12')
    const w = wireOf([toWire(s.strokes[0]!, '#16a34a')])
    expect(judgePlain(s, w, read(w)).outcome).toBe('right')
  })

  it('a delete that also takes a kept element is judged wrong, not right', () => {
    const key = { edits: [{ check: 'absent', text: 'Pricing', must: true }, { check: 'kept', text: 'Features' }] }
    const row = SNAP.nodes.find((n: { tag: string; parent: string; id: string }) => n.tag === 'div' && subtreeText(SNAP, n.id).startsWith('Features'))
    const fake = { ok: true, rule: 'scribble-delete', raw: { actions: [{ elements: [row.id] }] } }
    const j = judgePlain(key, wireOf([toWire([{ x: 0, y: 0 }])]), fake)
    expect(j.outcome).toBe('wrong')
    expect(j.why).toMatch(/also delete "Features"/)
  })

  it('a fire on a page no rule should take is a false fire; a decline there is right', () => {
    const key = { edits: [{ check: 'order', text: 'n/a', must: true }] }
    const w = wireOf([toWire([{ x: 0, y: 0 }])])
    expect(judgePlain(key, w, { ok: true, rule: 'scribble-delete', raw: { actions: [{ elements: ['e12'] }] } }).outcome).toBe('false-fire')
    expect(judgePlain(key, w, { ok: false, reason: 'no' }).outcome).toBe('declined')
    expect(tallyPlain([{ outcome: 'right' }, { outcome: 'missed' }, { outcome: 'false-fire' }])).toMatchObject({ able: 2, freeRate: 0.5, badFires: 1 })
  })

  it('regression: a rough scratch-out running past one nav link never deletes the row (the s2c-052 bad fire)', () => {
    const link = SNAP.nodes.find((n: { text: string }) => n.text === 'Pricing')
    const R = link.rect
    const key = { edits: [{ check: 'absent', text: 'Pricing', must: true }, { check: 'kept', text: 'Features' }, { check: 'kept', text: 'About' }] }
    for (let seed = 0; seed < 40; seed++) {
      // 8 px past each side of the link, inside the row's height: confined only to the row
      const pts = rscribble(R.x - 8, R.y - 2, R.w + 16, R.h + 4, { seed, passes: 5 })
      const wire = wireOf([toWire(pts)])
      const j = judgePlain(key, wire, read(wire))
      expect(j.outcome, `seed ${seed}: ${j.why ?? ''}`).not.toBe('wrong')
    }
  })

  it('a default-ink ring round the button is never read by a rule (the overlay asks instead)', () => {
    const b = SNAP.nodes.find((n: { text: string }) => n.text === 'Get started').rect
    for (let seed = 0; seed < 20; seed++) {
      const w = wireOf([toWire(rring(b.x + b.w / 2, b.y + b.h / 2, b.w * 0.7, b.h * 0.8, { seed, wobble: 6 }))])
      expect(read(w).ok).toBe(false)
    }
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence, groundInterpretation, type RawAction } from '../src/intent2.js'
import { findInsertSlot, verifyInsertSlot } from '../src/insert-slot.js'
import { verifyActions } from '../src/run2.js'
import { explainRun } from '../src/explain.js'
import { toStrokes } from '../../../tests/bench/lib/draw.mjs'
import { rcaret, rbox } from '../../../tests/bench/lib/rough.mjs'
import r14 from '../../../tests/bench/sketches/rough/r14-caret-insert-nav-link.mjs'

/**
 * s2c-055. The bench's r14: a caret under the gap between "Features" and
 * "Pricing" + the typed word "Blog". In the s2c-013 runs the structured path
 * put Blog after About both times, and the bar said Done both times.
 */
const BASE: DomSnapshot = JSON.parse(
  readFileSync(new URL('../../../tests/bench/fixtures/base-snapshot.json', import.meta.url), 'utf8'),
)
const caret: Stroke[] = toStrokes(r14.strokes)

const ground = (raw: Partial<RawAction>, strokes: Stroke[] = caret) => {
  const ev = buildEvidence(strokes, BASE)
  return groundInterpretation(
    {
      reading: 'add a "Blog" link to the nav',
      actions: [{
        kind: 'add', elements: null, destElement: 'e5', position: 'into',
        instruction: 'add a nav link "Blog"', strokes: strokes.map((s) => s.id),
        layer: 'in-flow', depicts: null, fidelity: null, ...raw,
      } as RawAction],
    },
    ev, BASE, 'gesture',
  ).actions[0]!
}

/** The base page after the edit: the link group laid out right-aligned, 32 px gaps. */
function afterWith(order: string[]): DomSnapshot {
  const W: Record<string, number> = { Features: 57.33, Pricing: 46.08, About: 39.48, Blog: 30.2 }
  const total = order.reduce((s, t) => s + W[t]!, 0) + 32 * (order.length - 1)
  let x = 1232 - total
  const group = BASE.nodes.find((n) => n.id === 'e5')!
  const links: DomNode[] = order.map((t, i) => {
    const n: DomNode = {
      ...BASE.nodes.find((b) => b.id === 'e6')!,
      id: `x${i}`, text: t, srcLoc: `src/App.tsx:${7 + i}:11`, rect: { x, y: 24, w: W[t]!, h: 20 },
    }
    x += W[t]! + 32
    return n
  })
  const nodes: DomNode[] = []
  for (const n of BASE.nodes) {
    if (n.parent === 'e5') continue
    nodes.push(n.id === 'e5' ? { ...group, rect: { ...group.rect, x: 1232 - total, w: total } } : n)
    if (n.id === 'e5') nodes.push(...links)
  }
  return { ...BASE, nodes }
}

describe('a caret between two nav links: where it goes (s2c-055)', () => {
  it('grounding names the two neighbours, by source location, from geometry', () => {
    const a = ground({})
    expect(a.insertSlot).toBeDefined()
    expect(a.insertSlot!.axis).toBe('row')
    expect(a.insertSlot!.after).toMatchObject({ text: 'Features', srcLoc: 'src/App.tsx:7:11' })
    expect(a.insertSlot!.before).toMatchObject({ text: 'Pricing', srcLoc: 'src/App.tsx:8:11' })
    expect(a.insertSlot!.container.domId).toBe('e5')
  })

  it('the same when the reading names the whole nav, or no container at all', () => {
    for (const destElement of ['e3', null]) {
      const a = ground({ destElement })
      expect(a.insertSlot?.after.text, String(destElement)).toBe('Features')
      expect(a.insertSlot?.before.text, String(destElement)).toBe('Pricing')
    }
  })

  it('codegen sees it: the slot is part of the action it is sent', () => {
    const json = JSON.stringify({ action: 0, ...ground({}) })
    expect(json).toContain('"insertSlot"')
    expect(json).toContain('src/App.tsx:7:11')
  })

  it('a caret in the other gap goes between Pricing and About', () => {
    const a = ground({}, toStrokes([rcaret(1176, 42, 18, 16)]))
    expect([a.insertSlot?.after.text, a.insertSlot?.before.text]).toEqual(['Pricing', 'About'])
  })

  it('no slot when the reading already anchors to a sibling, or the mark is on a link, not in a gap', () => {
    expect(ground({ destElement: 'e6', position: 'after' }).insertSlot).toBeUndefined()
    // a box drawn over "Pricing" is about Pricing
    expect(findInsertSlot(BASE, { x: 1110, y: 20, w: 54, h: 28 })).toBeUndefined()
    // a box in open space under the hero is not an insert between anything
    expect(ground({ destElement: null }, toStrokes([rbox(200, 600, 300, 120)])).insertSlot).toBeUndefined()
  })
})

describe('the tick checks where, not just whether (s2c-055)', () => {
  const action = ground({})
  const atEnd = afterWith(['Features', 'Pricing', 'About', 'Blog'])
  const between = afterWith(['Features', 'Blog', 'Pricing', 'About'])

  it('Blog at the end of the nav fails, and says where it went', () => {
    const v = verifyInsertSlot(action.insertSlot!, BASE, atEnd)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toBe('the new "Blog" went after "About", not between "Features" and "Pricing" where it was drawn')
  })

  it('Blog between Features and Pricing passes', () => {
    expect(verifyInsertSlot(action.insertSlot!, BASE, between)).toMatchObject({ satisfied: true })
  })

  it('verifyActions: the s2c-013 outcome is no longer 100%', () => {
    const wrong = verifyActions([action], BASE, atEnd)
    expect(wrong.score).toBeLessThan(1)
    expect(wrong.failures).toEqual(['action 0 (place): the new "Blog" went after "About", not between "Features" and "Pricing" where it was drawn'])
    const right = verifyActions([action], BASE, between)
    expect(right.score).toBe(1)
    expect(right.failures).toEqual([])
  })

  it('the bar says it in words instead of "Done"', () => {
    const { failures } = verifyActions([action], BASE, atEnd)
    const ex = explainRun({ reading: 'add a "Blog" link to the nav', actions: [action], failures, files: ['src/App.tsx'] })
    expect(ex.problem).toBe(true)
    expect(ex.sentence).not.toMatch(/^Done/)
    expect(ex.sentence).toContain(`But I couldn't put it between "Features" and "Pricing", where you marked it (it went after "About")`)
    expect(ex.sentence).not.toMatch(/App\.tsx|action \d|e\d/)
  })

  it('a neighbour that is gone makes the check unverifiable, not a failure', () => {
    const noPricing: DomSnapshot = { ...between, nodes: between.nodes.filter((n) => n.text !== 'Pricing') }
    expect(verifyInsertSlot(action.insertSlot!, BASE, noPricing)).toMatchObject({ satisfied: true, unverifiable: true })
  })
})

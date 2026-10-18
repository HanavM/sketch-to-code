/**
 * Optimistic changes (goal loop n1): the browser-side quick reading must agree
 * with the server's no-model reading (plain-reading.ts) on the rough bench, and
 * the patch must undo to exactly the original element.
 */
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { plainReading } from '@s2c/pipeline'
import {
  applyPatch, isScribble, PENDING_ATTR, quickReading,
  type Cand, type Patchable, type QStroke,
} from '../src/optimistic.js'
// @ts-expect-error — plain .mjs bench module, no types
import { pensFor } from '../../../tests/bench/lib/pen.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from '../../../tests/bench/sketches/rough/index.mjs'

type P = { x: number; y: number }
type Spec = { id: string; strokes: P[][]; notes: unknown[]; pens?: Array<string | null> }
const toInput = (lines: P[][], colors: Array<string | null> = []): QStroke[] =>
  lines.map((pts, i) => ({
    id: `s${String(i)}`,
    points: pts.map((p, k) => ({ x: p.x, y: p.y, t: i * 10000 + k * 16 })),
    ...(colors[i] ? { color: colors[i]! } : {}),
  }))
const strokesOfSpec = (s: Spec) => toInput(s.strokes, s.pens ? pensFor(s) : [])
const spec = (id: string): Spec => rough.find((s: Spec) => s.id.startsWith(id))

/** The rough base page, as bare-ring.test.ts builds it. */
function baseSnapshot(): DomSnapshot {
  const nodes: DomNode[] = []
  const add = (id: string, tag: string, text: string, rect: DomNode['rect'], parent: string | null, depth: number, bg = 'rgba(0, 0, 0, 0)') => {
    nodes.push({
      id, tag, text, classes: [], rect, srcLoc: `src/App.tsx:${String(nodes.length + 1)}:1`, parent, depth,
      style: { display: 'block', position: 'static', backgroundColor: bg, color: 'rgb(0, 0, 0)' },
    } as unknown as DomNode)
  }
  add('main', 'main', '', { x: 0, y: 0, w: 1280, h: 900 }, null, 0)
  add('nav', 'nav', '', { x: 0, y: 0, w: 1280, h: 69 }, 'main', 1)
  add('links', 'div', '', { x: 1025, y: 24, w: 207, h: 20 }, 'nav', 2)
  add('a-features', 'a', 'Features', { x: 1025, y: 24, w: 57, h: 20 }, 'links', 3)
  add('a-pricing', 'a', 'Pricing', { x: 1114, y: 24, w: 46, h: 20 }, 'links', 3)
  add('a-about', 'a', 'About', { x: 1193, y: 24, w: 39, h: 20 }, 'links', 3)
  add('btn', 'button', 'Get started', { x: 574, y: 285, w: 132, h: 48 }, 'main', 2, 'rgb(37, 99, 235)')
  add('features', 'section', '', { x: 0, y: 382, w: 1280, h: 156 }, 'main', 1)
  add('card1', 'article', '', { x: 48, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card1-h', 'h3', 'Instant previews', { x: 72, y: 406, w: 160, h: 24 }, 'card1', 3)
  add('card2', 'article', '', { x: 453, y: 382, w: 373, h: 108 }, 'features', 2)
  add('card2-h', 'h3', 'One-click rollbacks', { x: 477, y: 406, w: 180, h: 24 }, 'card2', 3)
  add('card3', 'article', '', { x: 859, y: 382, w: 373, h: 108 }, 'features', 2)
  add('footer', 'footer', '© 2026 Acme Inc.', { x: 0, y: 695, w: 1280, h: 68 }, 'main', 1)
  return { nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'http://x/', takenAt: 0, truncated: false }
}

/** The candidates main.ts would collect for the same page. */
function candsOf(snap: DomSnapshot): Cand<string>[] {
  const index = new Map(snap.nodes.map((n, i) => [n.id, i]))
  return snap.nodes.map((n) => ({
    ref: n.id,
    rect: n.rect,
    srcLoc: n.srcLoc!,
    parent: n.parent ? index.get(n.parent) ?? -1 : -1,
    filled: !/rgba\(0, 0, 0, 0\)|transparent/.test(n.style.backgroundColor),
    worded: !!n.text,
  }))
}

const VIEW = 1280 * 900

describe('quickReading agrees with the server reading', () => {
  it('reads r01 (scribble over a card) as hide on that card', () => {
    const r = quickReading(strokesOfSpec(spec('r01')), candsOf(baseSnapshot()), VIEW)
    expect(r?.kind).toBe('hide')
  })

  it('reads r12 (green ring round the button) as a background recolour of the button', () => {
    const r = quickReading(strokesOfSpec(spec('r12')), candsOf(baseSnapshot()), VIEW)
    expect(r?.kind).toBe('recolour')
    expect(r?.target.ref).toBe('btn')
    if (r?.kind === 'recolour') {
      expect(r.prop).toBe('background-color')
      expect(r.color).toBe('#16a34a')
    }
  })

  it('declines when there are typed words', () => {
    expect(quickReading(strokesOfSpec(spec('r01')), candsOf(baseSnapshot()), VIEW, true)).toBeNull()
  })

  it('never fires where the server would not (and fires where it does, same element)', () => {
    const snap = baseSnapshot()
    const cands = candsOf(snap)
    const rows: string[] = []
    for (const s of rough as Spec[]) {
      const strokes = strokesOfSpec(s)
      const hasNotes = s.notes.length > 0
      const quick = quickReading(strokes, cands, VIEW, hasNotes)
      const plain = hasNotes ? { ok: false as const } : plainReading(strokes, snap, 'gesture', [])
      const plainTarget = plain.ok ? plain.interpretation.actions[0]?.targets[0]?.srcLoc ?? null : null
      rows.push(`${s.id}: quick=${quick ? `${quick.kind}:${quick.target.srcLoc}` : '-'} plain=${plain.ok ? `${plain.rule}:${plainTarget}` : '-'}`)
      if (quick) {
        expect(plain.ok, `${s.id}: quick fired, server would not`).toBe(true)
        expect(quick.target.srcLoc, s.id).toBe(plainTarget)
        expect(plain.ok && plain.rule).toBe(quick.kind === 'hide' ? 'scribble-delete' : 'ring-recolor')
      }
      if (plain.ok) expect(quick, `${s.id}: server reads it plainly, quick missed it`).not.toBeNull()
    }
    if (process.env.S2C_ROWS) console.log(rows.join("\n"))
    expect(rows.length).toBe((rough as Spec[]).length)
  })

  it('agrees on a sweep of 600 random scribbles over the page (both ways, same element)', () => {
    const snap = baseSnapshot()
    const cands = candsOf(snap)
    let seed = 7
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    let fired = 0
    for (let k = 0; k < 600; k++) {
      const n = snap.nodes[1 + Math.floor(rnd() * (snap.nodes.length - 1))]!
      const r = n.rect
      // anywhere from a corner nick to a scratch-out spilling past the edges
      const fx0 = -0.1 + rnd() * 0.5, fx1 = 0.5 + rnd() * 0.6
      const fy0 = -0.1 + rnd() * 0.5, fy1 = 0.5 + rnd() * 0.6
      const x0 = r.x + r.w * fx0, x1 = r.x + r.w * fx1, y0 = r.y + r.h * fy0, y1 = r.y + r.h * fy1
      const zigs = 4 + Math.floor(rnd() * 6)
      const pts: P[] = []
      for (let i = 0; i <= zigs; i++) {
        const ax = x0 + ((x1 - x0) * i) / zigs, ay = i % 2 ? y1 : y0
        const bx = x0 + ((x1 - x0) * (i + 1)) / zigs, by = i % 2 ? y0 : y1
        for (let j = 0; j < 8 && i < zigs; j++) pts.push({ x: ax + ((bx - ax) * j) / 8 + (rnd() - 0.5) * 2, y: ay + ((by - ay) * j) / 8 + (rnd() - 0.5) * 2 })
      }
      const strokes = toInput([pts])
      const quick = quickReading(strokes, cands, VIEW)
      const plain = plainReading(strokes, snap, 'gesture', [])
      const plainTarget = plain.ok ? plain.interpretation.actions[0]?.targets[0]?.srcLoc ?? null : null
      const tag = `#${String(k)} on ${n.id}: quick=${quick?.target.srcLoc ?? '-'} plain=${plain.ok ? plainTarget : plain.reason}`
      if (!!quick !== plain.ok && process.env.S2C_ROWS) { const { buildEvidence } = require('@s2c/pipeline'); console.log(tag, (buildEvidence(strokes, snap, []).brief)) }
      expect(!!quick, tag).toBe(plain.ok)
      if (quick) { fired++; expect(quick.target.srcLoc, tag).toBe(plainTarget) }
    }
    // the sweep has to exercise both outcomes to mean anything
    expect(fired).toBeGreaterThan(30)
    expect(fired).toBeLessThan(570)
  }, 60000)

  it('a multi-lap ring is not a scribble', () => {
    const pts = []
    for (let i = 0; i <= 120; i++) {
      const a = (i / 40) * Math.PI * 2
      pts.push({ x: 640 + 80 * Math.cos(a), y: 300 + 40 * Math.sin(a), t: i * 16 })
    }
    expect(isScribble({ id: 'r', points: pts })).toBe(false)
  })
})

/** A minimal element: inline style + attributes, enough for applyPatch. */
function fakeEl(inline: Record<string, [string, string]> = {}) {
  const style = new Map(Object.entries(inline))
  const attrs = new Map<string, string>()
  const el: Patchable & { style: Patchable['style']; dump(): unknown } = {
    style: {
      getPropertyValue: (p) => style.get(p)?.[0] ?? '',
      getPropertyPriority: (p) => style.get(p)?.[1] ?? '',
      setProperty: (p, v, prio = '') => void style.set(p, [v, prio]),
      removeProperty: (p) => { const v = style.get(p)?.[0] ?? ''; style.delete(p); return v },
    },
    setAttribute: (n, v) => void attrs.set(n, v),
    removeAttribute: (n) => void attrs.delete(n),
    getAttribute: (n) => attrs.get(n) ?? null,
    dump: () => ({ style: Object.fromEntries(style), attrs: Object.fromEntries(attrs) }),
  }
  return el
}

describe('applyPatch', () => {
  const cand = (ref: Patchable): Cand<Patchable> => ({ ref, rect: { x: 0, y: 0, w: 10, h: 10 }, srcLoc: 'a:1:1', parent: -1, filled: false })

  it('hides with display:none !important, marks it pending, and undoes to the original', () => {
    const el = fakeEl()
    const before = JSON.stringify(el.dump())
    const a = applyPatch({ kind: 'hide', target: cand(el), ink: { x: 0, y: 0, w: 1, h: 1 } })
    expect(el.style.getPropertyValue('display')).toBe('none')
    expect(el.style.getPropertyPriority('display')).toBe('important')
    expect(el.getAttribute(PENDING_ATTR)).toBe('hide')
    a.undo()
    a.undo()
    expect(JSON.stringify(el.dump())).toBe(before)
  })

  it('recolours and restores a pre-existing inline value and priority', () => {
    const el = fakeEl({ color: ['red', ''] })
    const a = applyPatch({ kind: 'recolour', target: cand(el), ink: { x: 0, y: 0, w: 1, h: 1 }, color: '#16a34a', prop: 'color' })
    expect(el.style.getPropertyValue('color')).toBe('#16a34a')
    a.undo()
    expect(el.style.getPropertyValue('color')).toBe('red')
    expect(el.style.getPropertyPriority('color')).toBe('')
    expect(el.getAttribute(PENDING_ATTR)).toBeNull()
  })
})

describe('resample is the ink package’s, point for point', () => {
  it('matches resampleBySpacing on random strokes', async () => {
    const { resampleBySpacing } = await import('@s2c/ink')
    const { resample } = await import('../src/optimistic.js')
    let seed = 3
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let k = 0; k < 200; k++) {
      const pts = Array.from({ length: 2 + Math.floor(rnd() * 60) }, (_, i) => ({ x: rnd() * 300, y: rnd() * 300, t: i * 16 }))
      expect(resample(pts)).toEqual(resampleBySpacing(pts, 8))
    }
  })
})

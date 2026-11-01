/**
 * n191: a tap on the plan picks the part a fix is about.
 *
 * Round 44 e5 (n188, n190): the whole-sketch fix "grey track to right edge" meant the progress bar's grey rest.
 * The reading aimed it at the map route (an svg path), the plan outlined the route before ✓ Go, and the build
 * turned the orange route grey. The plan showed the wrong part, but there was no way to say "not that, this":
 * the only ways out were Cancel and retype, or Go and fix the fix. e3 had the same shape ("sky" went into the
 * crop frame instead of the canvas).
 *
 * Now each outlined target in the plan has a "not this" button; the next tap on the page picks the element
 * meant. The client sends the swap as { action, from, srcLoc, rect } and this module rewrites the echoed raw
 * interpretation before it is grounded: the tapped element (found in the run's own snapshot by its source
 * stamp, nearest the tapped box when one stamp renders many times) replaces the old id in that action, and the
 * action says the person picked it. Pure, so tests feed it anything; an unknown stamp leaves the action alone
 * and says so.
 */
import type { DomSnapshot } from '@s2c/dom'
import type { RawInterpretation } from './intent2.js'

export interface Retarget {
  /** Index of the action in the raw interpretation. */
  action: number
  /** Menu id the plan showed (e9), or null when the action had no target and the tap adds one. */
  from: string | null
  /** data-s2c stamp of the tapped element. */
  srcLoc: string
  /** Page box of the tapped element, to tell apart the copies of one stamp. */
  rect: { x: number; y: number; w: number; h: number }
}

export interface RetargetResult {
  raw: RawInterpretation
  applied: Array<{ action: number; from: string | null; to: string }>
  refused: string[]
}

const dist = (a: Retarget['rect'], b: Retarget['rect']) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.w - b.w) + Math.abs(a.h - b.h)

/** The snapshot node a tap meant: same stamp, nearest box. */
export function nodeForTap(snap: DomSnapshot, srcLoc: string, rect: Retarget['rect']): string | null {
  let best: { id: string; d: number } | null = null
  for (const n of snap.nodes) {
    if (n.srcLoc !== srcLoc) continue
    const d = dist(n.rect, rect)
    if (!best || d < best.d) best = { id: n.id, d }
  }
  return best?.id ?? null
}

export function applyRetargets(raw: RawInterpretation, snap: DomSnapshot, retargets: readonly Retarget[] | undefined): RetargetResult {
  const out: RawInterpretation = { ...raw, actions: raw.actions.map((a) => ({ ...a, elements: a.elements ? [...a.elements] : a.elements })) }
  const applied: RetargetResult['applied'] = []
  const refused: string[] = []
  for (const r of retargets ?? []) {
    // the client counts grounded actions; a raw action the grounding dropped shifts them, so the one holding
    // the old id wins over the index
    const holder = r.from ? out.actions.findIndex((x) => (x.elements ?? []).includes(r.from!)) : -1
    const at = r.from && !(out.actions[r.action]?.elements ?? []).includes(r.from) && holder !== -1 ? holder : r.action
    const a = out.actions[at]
    if (!a || typeof r.srcLoc !== 'string' || !r.rect) { refused.push(`retarget ${String(r.action)}: no such action`); continue }
    const to = nodeForTap(snap, r.srcLoc, r.rect)
    if (!to) { refused.push(`retarget ${String(r.action)}: tapped element ${r.srcLoc} is not on the page`); continue }
    const els = a.elements ?? []
    const i = r.from ? els.indexOf(r.from) : -1
    const next = i === -1 ? [...els, to] : els.map((e, k) => (k === i ? to : e))
    a.elements = [...new Set(next)]
    // the person's tap outranks the reading: say so where the build reads it
    a.instruction = `${a.instruction}${a.instruction ? ' ' : ''}(The person tapped ${to} as the part this is about${r.from && r.from !== to ? `, not ${r.from}: leave ${r.from} exactly as it is` : ''}.)`
    applied.push({ action: at, from: r.from, to })
  }
  return { raw: out, applied, refused }
}

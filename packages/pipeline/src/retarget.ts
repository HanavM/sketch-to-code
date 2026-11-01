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

/**
 * n192: "skip" on a plan row strikes that action before ✓ Go.
 *
 * Round 44 e3 replay (n192): the fix "delete texts 4 grey squares and 5 sliders" (the printed words of two
 * notes) was read as two DELETE actions — the four grey tool squares and the five sliders, outright. A tap pick
 * can only re-point a part; it cannot say "not this at all". So each plan row now has "skip": the client sends
 * { action, ids } (ids = the targets the row showed, so a shifted index still finds its action), the action is
 * dropped here before grounding, and the build is told plainly that the person struck that reading of their
 * words, so the run notes it came from are not read as asking for it again.
 */
export interface Skip {
  /** Index of the action as the plan showed it. */
  action: number
  /** The target ids the plan row showed (may be empty for an ADD). */
  ids?: string[]
}

export interface SkipResult {
  raw: RawInterpretation
  struck: Array<{ action: number; kind: string; instruction: string }>
  refused: string[]
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x))

export function applySkips(raw: RawInterpretation, skips: readonly Skip[] | undefined): SkipResult {
  const drop = new Set<number>()
  const refused: string[] = []
  for (const s of skips ?? []) {
    if (typeof s?.action !== 'number') { refused.push('skip: no action'); continue }
    const ids = Array.isArray(s.ids) ? s.ids.filter((x) => typeof x === 'string') : []
    const at = raw.actions[s.action]
    let i = s.action
    // the client counts grounded actions; if the index no longer holds the ids the row showed, find the one that does
    if (ids.length && !(at && sameSet(at.elements ?? [], ids))) {
      const holder = raw.actions.findIndex((x, k) => !drop.has(k) && sameSet(x.elements ?? [], ids))
      if (holder !== -1) i = holder
    }
    if (!raw.actions[i]) { refused.push(`skip ${String(s.action)}: no such action`); continue }
    drop.add(i)
  }
  const struck = [...drop].sort((a, b) => a - b).map((k) => ({
    action: k, kind: String(raw.actions[k]!.kind ?? ''), instruction: String(raw.actions[k]!.instruction ?? ''),
  }))
  return { raw: { ...raw, actions: raw.actions.filter((_, k) => !drop.has(k)) }, struck, refused }
}

/** The brief's word on struck actions: the build must not do them, whatever the run notes seem to say. */
export function struckBrief(struck: SkipResult['struck']): string {
  if (!struck.length) return ''
  return `STRUCK FROM THE PLAN (the person read the plan and pressed "skip" on these before Go — they are a ` +
    `MISREADING of their words: do NOT do them, and do not read their notes as asking for them; leave those ` +
    `parts exactly as they are):\n${struck.map((s) => `- ${s.kind.toUpperCase()}: ${s.instruction}`).join('\n')}\n\n`
}

/**
 * A fix note after a build is checked on the page like a build (n37).
 *
 * Round 32 (hand, n35): three of four fix notes typed on a built page made it
 * worse, and nothing noticed. "two lines: NORTH / LIGHTS" broke the heading
 * down onto the date line; "one line, below heading" moved the subtitle UP
 * into the heading; "no panel behind bars; pink at top" painted the panel
 * pink instead of taking it away. A fix run had no drawn marks, so none of the
 * build checks applied to it: whatever the quick edit did was kept.
 *
 * So a run on a page that is already built is held to three things, all
 * measured from the page before the run and the page after it (zero tokens):
 *
 *  1. Words that were apart stay apart. Two pieces of text that did not touch
 *     before the fix and overlap after it are a failure, named by their words.
 *  2. "no panel / no background / no card" means the thing the note sits on
 *     stops painting a fill (or a frame or a shadow) — not that it changes colour.
 *  3. A note that names parts ("bars", "cards", "links") on a wrapper is about
 *     those parts: codegen is told to change them, not the wrapper's own look.
 *
 * And a fix that still breaks rule 1 or 2 after its repair rounds is put back:
 * the page goes back to exactly how it was before the note, and the run says so.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { GroundedAction } from './intent2.js'
import { parseCssColor } from './palette.js'

type Box = { x: number; y: number; w: number; h: number }

/** A page counts as already built when it shows a few pieces of the user's own copy. */
export function isBuiltPage(snap: DomSnapshot): boolean {
  return snap.nodes.filter((n) => n.srcLoc && words(n).length >= 2 && n.rect.w > 0 && n.rect.h > 0).length >= 3
}

const words = (n: DomNode): string => (n.text ?? '').replace(/\s+/g, ' ').trim()
const boxOf = (n: DomNode): Box => n.textBox ?? n.rect

function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function isAncestor(snap: Map<string, DomNode>, a: DomNode, b: DomNode): boolean {
  for (let p = b.parent; p; p = snap.get(p)?.parent ?? null) if (p === a.id) return true
  return false
}

/** Text pieces worth checking: visible own copy, de-duplicated by words (first one wins). */
function texts(snap: DomSnapshot): Array<{ key: string; node: DomNode; box: Box }> {
  const seen = new Set<string>()
  const out: Array<{ key: string; node: DomNode; box: Box }> = []
  for (const n of snap.nodes) {
    const key = words(n)
    if (key.length < 2 || seen.has(key)) continue
    const b = boxOf(n)
    if (b.w < 2 || b.h < 4) continue
    if (n.style.opacity && Number(n.style.opacity) < 0.15) continue
    seen.add(key)
    out.push({ key, node: n, box: b })
  }
  return out
}

/** How much two text boxes overlap, as a share of the smaller one. */
function overlapShare(a: Box, b: Box): number {
  const i = inter(a, b)
  return i ? i / Math.max(1, Math.min(a.w * a.h, b.w * b.h)) : 0
}

export interface NewOverlap { a: string; b: string; share: number }

/** Pairs of words that were apart before the run and overlap after it (rule 1). */
export function newTextOverlaps(before: DomSnapshot, after: DomSnapshot, min = 0.25): NewOverlap[] {
  const was = new Map(texts(before).map((t) => [t.key, t]))
  const now = texts(after).filter((t) => was.has(t.key))
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const out: NewOverlap[] = []
  for (let i = 0; i < now.length; i++) {
    for (let j = i + 1; j < now.length; j++) {
      const A = now[i]!, B = now[j]!
      if (isAncestor(byId, A.node, B.node) || isAncestor(byId, B.node, A.node)) continue
      const share = overlapShare(A.box, B.box)
      if (share < min) continue
      const a0 = was.get(A.key)!, b0 = was.get(B.key)!
      if (overlapShare(a0.box, b0.box) >= min / 2) continue // they already touched: not this fix
      out.push({ a: A.key, b: B.key, share: Math.round(share * 100) / 100 })
    }
  }
  // r32 c2 (n37 replay): a heading set on one line ran under the big drawn disc beside it. Painted
  // shapes with no words of their own count too: words that were clear of one must stay clear.
  const area = after.viewport.w * after.viewport.h
  const shapes = after.nodes.filter((n) => !words(n) && paints(n) && n.rect.w >= 24 && n.rect.h >= 24 && n.rect.w * n.rect.h < area * 0.4)
  for (const T of now) {
    for (const S of shapes) {
      if (isAncestor(byId, S, T.node) || isAncestor(byId, T.node, S)) continue
      const share = inter(T.box, S.rect) / Math.max(1, T.box.w * T.box.h)
      if (share < min) continue
      if (inter(was.get(T.key)!.box, S.rect) / Math.max(1, T.box.w * T.box.h) >= min / 2) continue
      out.push({ a: T.key, b: `the ${S.tag} shape at ${Math.round(S.rect.x)},${Math.round(S.rect.y)}`, share: Math.round(share * 100) / 100 })
    }
  }
  return out.sort((x, y) => y.share - x.share).slice(0, 6)
}

const NO_FILL = /\b(?:no|without|remove(?: the)?|drop(?: the)?|lose(?: the)?|take away(?: the)?)\s+(?:the\s+)?(?:grey\s+|gray\s+|white\s+|dark\s+)?(panel|background|bg|card|box|frame|backdrop|container|fill)\b/i

/** Does the element paint something behind its contents? */
export function paints(n: DomNode): boolean {
  const bg = parseCssColor(n.style.backgroundColor)
  const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(n.style.backgroundColor ?? '')
  const a = n.style.backgroundColor?.startsWith('rgba') && alpha ? Number(alpha[1]) : bg ? 1 : 0
  return a > 0.05 || !!n.style.backgroundImage || !!n.style.border || !!n.style.boxShadow
}

function nearest(after: DomSnapshot, r: Box): DomNode | null {
  let best: DomNode | null = null, bestS = 0
  for (const n of after.nodes) {
    const i = inter(n.rect, r)
    if (!i) continue
    const s = i / (n.rect.w * n.rect.h + r.w * r.h - i)
    if (s > bestS) { bestS = s; best = n }
  }
  return bestS >= 0.6 ? best : null
}

export interface NoFillMiss { action: number; what: string; target: string }

/** "no panel" on a target that still paints a fill, frame or shadow after the run (rule 2). */
export function noFillMisses(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot): NoFillMiss[] {
  const out: NoFillMiss[] = []
  const was = new Map(before.nodes.map((n) => [n.id, n]))
  for (const [i, a] of actions.entries()) {
    const said = [a.instruction, ...(a.notes ?? [])].join(' ')
    const m = NO_FILL.exec((a.notes ?? []).join(' ') || said)
    if (!m) continue
    for (const t of a.targets) {
      const b = was.get(t.domId)
      if (!b || !paints(b)) continue // it painted nothing to take away
      const now = nearest(after, t.rect)
      if (now && paints(now)) out.push({ action: i, what: (m[1] ?? 'panel').toLowerCase(), target: (t.subtreeText || t.tag).slice(0, 40) })
    }
  }
  return out
}

const PARTS = /\b(bars|cards|rows|items|links|icons|buttons|tiles|columns|lines|dots|labels|tabs|chips|pills|avatars|images|photos|names|bubbles|steps)\b/i

/** Rule 3: a note naming parts, typed on a wrapper, is about the parts. */
export function fixBrief(actions: readonly GroundedAction[], before: DomSnapshot): string {
  if (!isBuiltPage(before)) return ''
  const lines: string[] = []
  for (const [i, a] of actions.entries()) {
    if (a.kind !== 'modify' || !a.targets.length) continue
    const note = (a.notes ?? []).join(' ')
    const parts = PARTS.exec(note)?.[1]
    const nofill = NO_FILL.exec(note)?.[1]
    if (parts) lines.push(`- action ${i}: the note names the ${parts.toLowerCase()} inside ${a.targets[0]?.tag ?? 'it'}. Change the ${parts.toLowerCase()} themselves (their colour, size, place); leave the wrapper's own background, border and size as they are unless the note names the wrapper.`)
    if (nofill) lines.push(`- action ${i}: "no ${nofill.toLowerCase()}" means the element it sits on stops painting: transparent background, no gradient, no border, no shadow. Do not recolour it.`)
  }
  return (
    `THIS IS A FIX ON A BUILT PAGE. Change only what the notes ask. Every other piece of text stays where it is; ` +
    `two pieces of text that do not touch now must not touch after your edit (it will be measured, and an edit ` +
    `that makes words run into each other is put back).\n` +
    (lines.length ? lines.join('\n') + '\n' : '') + '\n'
  )
}

export interface FixVerdict { overlaps: NewOverlap[]; noFill: NoFillMiss[]; failures: string[] }

/** Both measured rules, as repair-ready failure lines. Empty when the page was not built before the run. */
export function verifyFix(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot): FixVerdict {
  if (!isBuiltPage(before)) return { overlaps: [], noFill: [], failures: [] }
  const overlaps = newTextOverlaps(before, after)
  const noFill = noFillMisses(actions, before, after)
  const failures = [
    ...overlaps.map((o) => `page (fix check): "${o.a.slice(0, 40)}" now runs into "${o.b.slice(0, 40)}" (${Math.round(o.share * 100)}% of the smaller one covered); before this fix they were apart. Keep the change the note asked for, and size or place it so they do not touch.`),
    ...noFill.map((m) => `action ${m.action} (fix check): the note says no ${m.what}, but the element behind "${m.target}" still paints a background, border or shadow. Make it transparent with no border or shadow; do not recolour it.`),
  ]
  return { overlaps, noFill, failures }
}

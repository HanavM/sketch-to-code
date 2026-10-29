/**
 * A row of words typed on one drawn line stays within that line (n46).
 *
 * Round 32 c5 (bookshop, n45): "Shop Events, Leaf & Spine big bold serif, Clubs Visit" was typed on
 * one short level line, 524px, drawn centred at the top. Three builds in four spread the row to the
 * page edges (Shop, Events at the far left, Clubs, Visit at the far right, a space-between nav), so
 * the header no longer looked like the drawing. The brief said "centre the words on x ..." and the
 * centre was right; nothing said the row must also stay as narrow as drawn, and nothing checked it.
 *
 * Here every level line with words typed on it is found on the page as the separate pieces of text
 * that carry its copy words (two or more leaves near the line: a row of items, not one heading).
 * The row fails when it runs clearly past either end of the drawn line. The fix names the span.
 * Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { wordsOf } from './ownwords.js'
import { copyWords } from './linespan.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RowVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const r1 = (v: number) => Math.round(v)
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2
const inside = (a: BBox, b: BBox) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1

/** How far past each end of a drawn line a row may run before it is "spread", in px. */
export const rowSlack = (len: number) => Math.max(40, len * 0.12)

/** The brief line for a row typed on a centred line (said before the build, then checked). */
export function rowBrief(words: string, x0: number, x1: number): string {
  return `if those words are a row of separate items (nav links round a logo, tags, a menu), the whole row stays within x ${r1(x0)} to ${r1(x1)} ` +
    `as one centred group with even gaps (justify-content: center, a fixed gap), never spread to the page edges (no justify-between / space-between across the page, no ml-auto pushing items out)`
}

export function verifyRowSpan(marks: readonly MarkLike[], after: Snap): RowVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const m of marks) {
    if (!isLevel(m) || !m.words) continue
    const len = Math.abs(m.to!.x - m.from!.x)
    if (len < 120) continue
    const want = copyWords(m.words)
    if (want.length < 3) continue
    const wantSet = new Set(want)
    const y = m.box.y
    const x0 = Math.min(m.from!.x, m.to!.x), x1 = x0 + len
    // pieces of text near the line made only of the line's copy words (each a leaf)
    let cands = after.nodes.filter((n) => {
      if (!n.text || !n.textBox) return false
      const tb = n.textBox
      if (Math.abs(tb.y + tb.h / 2 - y) > 60) return false
      const got = wordsOf(n.text)
      return got.length > 0 && got.length < want.length && got.every((w) => wantSet.has(w))
    })
    cands = cands.filter((n) => !cands.some((o) => o !== n && inside(o.textBox!, n.textBox!) && o.textBox!.w * o.textBox!.h < n.textBox!.w * n.textBox!.h))
    // one piece per box (a link and its span report the same letters)
    const seen = new Set<string>()
    cands = cands.filter((n) => { const k = `${r1(n.textBox!.x)},${r1(n.textBox!.y)}`; return !seen.has(k) && seen.add(k) })
    if (cands.length < 2) continue
    const covered = new Set(cands.flatMap((n) => wordsOf(n.text!)))
    if (covered.size / want.length < 0.6) continue
    judged++
    const ux0 = Math.min(...cands.map((n) => n.textBox!.x))
    const ux1 = Math.max(...cands.map((n) => n.textBox!.x + n.textBox!.w))
    const slack = rowSlack(len)
    if (ux0 >= x0 - slack && ux1 <= x1 + slack) continue
    const quote = `"${m.words}"`.slice(0, 70)
    const sumW = cands.reduce((t, n) => t + n.textBox!.w, 0)
    const gap = r1(Math.min(64, Math.max(12, (len - sumW) / Math.max(1, cands.length - 1))))
    misses.push(`the words ${quote} were typed on one line drawn ${r1(len)}px long, from x ${r1(x0)} to ${r1(x1)} (centre x ${r1((x0 + x1) / 2)}, y ${r1(y)}), ` +
      `but the row of ${String(cands.length)} pieces runs from x ${r1(ux0)} to ${r1(ux1)} (${r1(ux1 - ux0)}px), spread past the line: ` +
      `keep every piece of that row within x ${r1(x0)} to ${r1(x1)}, in the order typed, as one centred group with even gaps ` +
      `(justify-content: center and a fixed gap of about ${String(gap)}px; drop justify-between / space-between, ml-auto, flex-1 spacers or full-width sides that push items to the edges). ` +
      `Keep the row's height, sizes and colours; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no row of words on a drawn line found' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${judged} row${judged > 1 ? 's' : ''} of words within ${judged > 1 ? 'their' : 'its'} drawn line` }
}

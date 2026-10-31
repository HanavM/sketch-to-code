/**
 * n157: a big title drawn on a line with another line drawn close under it is only as big as that gap allows.
 *
 * Round 41 e3 (to-do, hand, n150/n156): "Today, huge bold" was typed on a short level line at y 92 and
 * "Tuesday, March 10" on the line drawn 40px under it. "huge" was built at 60px: the title's block ran from y 62
 * to 122, over the date line (own-words saw "Today" cover a third of the date), and the layout score fell to 47.
 * In the target the title is about 36px and the date sits clear under it. The person drew the two lines 40px
 * apart; that pitch is the size they meant. A size word ("huge", "big") says "the biggest thing here", not
 * "bigger than the room drawn for it".
 *
 * From the drawing alone:
 * - TITLE: a level line under 200px (longer ones are sized by their length, linespan.ts), not a divider, not part
 *   of a drawn stack, whose note asks for big type (big, huge, heading, title ...).
 * - UNDER: the nearest level line drawn below it, 20-100px lower, its x span overlapping the title's (or starting
 *   within 60px of it), with its own words that do not ask for big type (a date, a subtitle, a meta line).
 * - CAP: font-size at most 0.95 of the pitch (line to line), at least 18px. Told to the build, and checked on the
 *   page: the title's font-size is not over the cap by more than a fifth, and its letters do not run into the
 *   words under it. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { BIG_WORD, copyWords } from './linespan.js'
import { inkBand, wordsOf } from './ownwords.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string; rule?: unknown }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface TitleCapVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface TitleCap {
  title: string
  under: string
  /** the title's line: x0, x1 and y */
  x0: number
  x1: number
  y: number
  /** the line under it */
  underY: number
  pitch: number
  /** the most the title's font-size can be, px */
  cap: number
}

const r = Math.round
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 4
const span = (m: MarkLike) => ({ x0: Math.min(m.from!.x, m.to!.x), x1: Math.max(m.from!.x, m.to!.x), y: r((m.from!.y + m.to!.y) / 2) })

export const CAP_SHARE = 0.95

/** Every big title held to the gap over the line drawn under it. */
export function titleCaps(marks: readonly MarkLike[], stacked: ReadonlySet<string> = new Set()): TitleCap[] {
  const lines = marks.filter((m) => isLevel(m) && !!m.words && !m.rule)
  const out: TitleCap[] = []
  for (const t of lines) {
    if (t.strokeId && stacked.has(t.strokeId)) continue
    if (!BIG_WORD.test(t.words!) || !copyWords(t.words!).length) continue
    const a = span(t)
    // a line 200px or longer sizes its heading by its length (line-span, n45/n56): leave that one to it
    if (a.x1 - a.x0 >= 200) continue
    const below = lines.filter((u) => u !== t).map((u) => ({ u, s: span(u) }))
      .filter(({ u, s }) => s.y - a.y >= 20 && s.y - a.y <= 100 && !BIG_WORD.test(u.words!) &&
        (Math.min(s.x1, a.x1) - Math.max(s.x0, a.x0) > 0 || Math.abs(s.x0 - a.x0) <= 60))
      .sort((p, q) => p.s.y - q.s.y)
    const b = below[0]
    if (!b) continue
    const pitch = b.s.y - a.y
    out.push({ title: t.words!, under: b.u.words!, x0: a.x0, x1: a.x1, y: a.y, underY: b.s.y, pitch, cap: Math.max(18, r(pitch * CAP_SHARE)) })
  }
  return out
}

export function titleCapBrief(caps: readonly TitleCap[]): string {
  if (!caps.length) return ''
  return '\n\nTITLES SIZED BY THE GAP DRAWN UNDER THEM (checked on the page):\n' + caps.map((c) =>
    `- "${c.title}" is typed on the line at y ${c.y} (x ${c.x0} to ${c.x1}) and "${c.under}" on the line drawn ${c.pitch}px under it (y ${c.underY}). ` +
    `The drawn gap sets the title's size: font-size about ${c.cap}px and NEVER more (line-height about 1.1), whatever size word the note uses ` +
    `("huge" means the biggest text here, not bigger than the room drawn for it). A line drawn for words marks the MIDDLE of those words: the title's words are centred on y ${c.y} (block about ${r(c.y - c.cap * 0.55)} to ${r(c.y + c.cap * 0.55)}), never pushed lower; "${c.under}" is centred on y ${c.underY}, clear under it, never touching or covered.`,
  ).join('\n')
}

const findText = (snap: Snap, words: string, nearY: number): { n: NodeLike; tb: BBox; fs: number } | null => {
  const want = copyWords(words)
  if (!want.length) return null
  const set = new Set(want)
  let best: { n: NodeLike; tb: BBox; fs: number; d: number } | null = null
  for (const n of snap.nodes) {
    if (!n.text || !n.textBox) continue
    const got = wordsOf(n.text)
    if (!got.length || got.length > want.length * 2 + 2) continue
    if (got.filter((w) => set.has(w)).length / want.length < 0.7) continue
    const tb = n.textBox
    const d = Math.abs(tb.y + tb.h / 2 - nearY)
    if (d > 90) continue
    const fs = parseFloat(n.style?.fontSize ?? '') || 0
    if (!best || d < best.d - 1 || (Math.abs(d - best.d) <= 1 && tb.w * tb.h < best.tb.w * best.tb.h)) best = { n, tb, fs, d }
  }
  return best
}

export function verifyTitleCaps(caps: readonly TitleCap[], after: Snap): TitleCapVerdict {
  if (!caps.length) return { satisfied: true, unverifiable: true, reason: 'no big title drawn over a close line' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const c of caps) {
    const t = findText(after, c.title, c.y - c.pitch / 3)
    const u = findText(after, c.under, c.underY - 8)
    if (!t || !u || t.n === u.n) continue
    judged++
    const q = `"${copyWords(c.title).join(' ')}"`
    const tb = inkBand(t.n), ub = inkBand(u.n)
    const xOver = Math.min(tb.x + tb.w, ub.x + ub.w) - Math.max(tb.x, ub.x) > 0
    const into = xOver ? r(tb.y + tb.h - ub.y) : 0
    if (t.fs > c.cap * 1.2 || into > 2) {
      misses.push(`the title ${q} is ${t.fs ? `${r(t.fs)}px` : 'built'}${into > 2 ? ` and runs ${into}px into "${c.under}" under it` : ''}, but the two lines were drawn only ${c.pitch}px apart (y ${c.y} and ${c.underY}): ` +
        `take its font-size down to about ${c.cap}px (line-height 1.1) so its words stay centred on y ${c.y}, clear above "${c.under}", keeping its weight, colour and left edge; change nothing else`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'title or the line under it not found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${judged} title${judged > 1 ? 's' : ''} sized by the gap under ${judged > 1 ? 'them' : 'it'}` }
}

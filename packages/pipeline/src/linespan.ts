/**
 * A one-line heading spans the line drawn for it (n45).
 *
 * Round 32 c5 (bookshop, n44): "A quiet place to read." was typed on one long level line, 652px,
 * with "big italic serif". The brief said a regular heading drawn as one long line is sized up to
 * span it, but nothing checked: three builds in a row came out about 490px wide, a quarter short,
 * and the layout score fell. Multi-line text has its check (stacklines, n33); a single drawn line
 * had none.
 *
 * Here every level line with a note that asks for big type (big, huge, large, giant, heading,
 * headline, title, display) is found on the page by the words typed on it (most of the note's
 * words, style words aside, in one piece of text near the line), and fails when that text, on one
 * line, runs clearly shorter or longer than the line was drawn. The fix names the font-size that
 * would make it span. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { baselineOf, wordsOf } from './ownwords.js'
import { notHeading } from './linespread.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string; rule?: unknown }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface SpanVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const BIG_WORD = /\b(big|bigger|huge|large|giant|massive|heading|headline|title|display|hero)\b/i
/** Words in a note that describe the type rather than say the copy. */
const STYLE = new Set(['big', 'bigger', 'huge', 'large', 'giant', 'massive', 'heading', 'headline', 'title', 'display', 'hero',
  'bold', 'italic', 'serif', 'sans', 'regular', 'light', 'thin', 'heavy', 'black', 'white', 'green', 'dark', 'navy', 'red', 'blue',
  'grey', 'gray', 'cream', 'yellow', 'orange', 'pink', 'purple', 'teal', 'lime', 'gold', 'brown', 'centred', 'centered',
  'left', 'right', 'uppercase', 'caps', 'mono', 'font', 'text', 'in', 'and', 'the',
  // n57: words about the letters' look, not copy ("SLOW, giant outlined letters", "WORK, same")
  'outlined', 'outline', 'hollow', 'stroked', 'letters', 'letter', 'same', 'type'])

const r1 = (v: number) => Math.round(v)
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2

/**
 * n56: the line itself can ask for big type. Round 33 c4 (herb farm): "Fresh herbs, picked this morning" was
 * typed on a level line 916px long with no size word, so nothing told or checked its size and it was built at
 * 28px, running 577px. Words that would run under half the drawn length at body size (about 8.5px a letter at
 * 16px) on a line 300px or longer are a heading sized by the line.
 */
export function lineAsksBig(words: string, len: number): boolean {
  if (BIG_WORD.test(words)) return true
  // n71: a table row of short values ("14:40 Lisbon TP 1351 B12 ...") or a line noted small is never a heading
  if (notHeading(words)) return false
  const want = copyWords(words)
  if (len < 300 || want.length < 2 || want.length > 10) return false
  const chars = want.join(' ').length
  return len >= 2 * chars * 8.5
}

/** n57: a giant word or two on a long line ("SLOW, giant outlined letters"): display type sized by its line. */
export function isDisplay(words: string, len: number): boolean {
  return BIG_WORD.test(words) && len >= 300 && copyWords(words).length >= 1 && copyWords(words).length <= 2
}

/** About the font-size (px) at which these words run the drawn length on one line (bold sans, ~0.56em a letter). */
export function spanFontPx(words: string, len: number): number {
  const chars = Math.max(1, copyWords(words).join(' ').length)
  // n57: one short display word may run far bigger than a sentence (SLOW over 870px)
  return Math.round(Math.min(chars <= 6 ? 300 : 160, Math.max(18, len / (chars * 0.56))))
}

/** The copy words of a note (its style words taken out). */
export function copyWords(note: string): string[] {
  return wordsOf(note).filter((w) => !STYLE.has(w))
}

export function verifyLineSpan(marks: readonly MarkLike[], after: Snap, stacked: ReadonlySet<string> = new Set()): SpanVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const m of marks) {
    if (!isLevel(m) || !m.words || m.rule) continue // n142: words over a divider are not sized by it
    const len = Math.abs(m.to!.x - m.from!.x)
    // a line drawn as part of a multi-line stack is the stack check's (stacklines), except a giant word or two a
    // line (n57: "SLOW" over "WORK", 250px apart): the stack check only judges text of 3+ words, so nothing held it
    const inStack = !!m.strokeId && stacked.has(m.strokeId)
    if (inStack && !isDisplay(m.words, len)) continue
    if (!lineAsksBig(m.words, len)) continue
    if (len < 200) continue
    const want = copyWords(m.words)
    // n57: a single giant word ("SLOW, giant ...") is checked too when the note asks for big type
    if (want.length < 1 || (want.length < 2 && (!BIG_WORD.test(m.words) || want[0]!.length < 2))) continue
    const wantSet = new Set(want)
    const y = m.box.y
    const x0 = Math.min(m.from!.x, m.to!.x), x1 = x0 + len
    let best: { n: NodeLike; tb: BBox; fs: number; share: number } | null = null
    for (const n of after.nodes) {
      if (!n.text || !n.textBox) continue
      const tb = n.textBox
      const cy = tb.y + tb.h / 2
      // n64: giant display type has its middle far above the line its letters sit on (SLOW at ~290px: ~140px)
      const nfs = parseFloat(n.style?.fontSize ?? '') || 0
      if (Math.abs(cy - y) > Math.max(110, isDisplay(m.words, len) ? nfs * 0.9 : 0)) continue
      if (Math.min(tb.x + tb.w, x1) - Math.max(tb.x, x0) <= 0) continue
      const got = wordsOf(n.text)
      if (got.length > want.length * 2 + 2) continue // a wrapper holding more than this line
      const hit = got.filter((w) => wantSet.has(w)).length
      const share = hit / want.length
      if (share < 0.7) continue
      const fs = parseFloat(n.style?.fontSize ?? '') || 0
      // the leaf: the smallest box that still carries the words
      if (!best || share > best.share + 0.01 || (Math.abs(share - best.share) <= 0.01 && tb.w * tb.h < best.tb.w * best.tb.h)) best = { n, tb, fs, share }
    }
    if (!best) continue
    const { tb, fs } = best
    judged++
    const keep = r1(best.n.rect.h)
    const quote = `"${want.join(' ')}"`.slice(0, 60)
    // drawn as ONE line, so a heading that wrapped is wrong however wide it runs (n45 try 2: a
    // repair took the size up, the words wrapped onto two lines and pushed the button 73px down)
    if (fs && tb.h > fs * 1.9 && !inStack) {
      const lines = Math.max(2, Math.round(tb.h / (fs * 1.2)))
      misses.push(`the heading ${quote} was drawn as ONE line ${r1(len)}px long (x ${r1(x0)} to ${r1(x1)}, y ${r1(y)}) but is built on about ${String(lines)} lines (${r1(tb.h)}px tall): keep it on one line ` +
        `(white-space: nowrap, its block at least ${r1(len)}px wide, no max-width narrower than that), at the font-size that makes its words run about ${r1(len)}px, line-height about ${r1(fs * 1.2)}px, so what is under it moves back up; change nothing else`)
      continue
    }
    // n64: a giant word or two drawn on a line sits ON it: the letters' bottoms on the line, not above it. Round 33 c2
    // (slow agency, n62): SLOW and WORK were built at full width but about 40px above their lines, every try.
    if (isDisplay(m.words, len) && fs) {
      const base = baselineOf(best.n)
      const off = base == null ? 0 : y - base
      if (base != null && Math.abs(off) > Math.max(16, fs * 0.07)) {
        misses.push(`the heading ${quote} was drawn ON a line at y ${r1(y)} (x ${r1(x0)} to ${r1(x1)}): the bottoms of its letters (the baseline) belong on that line, ` +
          `but they sit at about y ${String(base)}, ${r1(Math.abs(off))}px ${off > 0 ? 'above' : 'below'} it: move just this word ${r1(Math.abs(off))}px ${off > 0 ? 'down' : 'up'} ` +
          `(position: relative; top: ${off > 0 ? '' : '-'}${r1(Math.abs(off))}px on its own element, or translateY), keeping its font-size, width and everything else as is`)
      }
    }
    const ratio = tb.w / len
    if (ratio >= 0.85 && ratio <= 1.18) continue
    const to = fs ? r1(fs / ratio) : 0
    misses.push(ratio < 0.85
      ? `the heading ${quote} was drawn as one line ${r1(len)}px long (x ${r1(x0)} to ${r1(x1)}, y ${r1(y)}); its letters run only ${r1(tb.w)}px (${r1(ratio * 100)}% of the line)` +
        `${fs ? `: take its font-size from ${r1(fs)}px to about ${String(to)}px` : ': make its letters bigger'} so the words run the drawn length on ONE line (white-space: nowrap; its block at least the drawn length wide). Keep its block exactly ${String(keep)}px tall (line-height ${String(keep)}px, same margins) so nothing under it moves; keep its weight, face and colour; change nothing else`
      : `the heading ${quote} was drawn as one line ${r1(len)}px long (x ${r1(x0)} to ${r1(x1)}, y ${r1(y)}); its letters run ${r1(tb.w)}px, past the line` +
        `${fs ? `: take its font-size from ${r1(fs)}px down to about ${String(to)}px` : ': make its letters smaller'} so it fits the drawn length on one line. Keep its block exactly ${String(keep)}px tall (line-height ${String(keep)}px) so nothing under it moves; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no one-line heading found on its drawn line' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${judged} one-line heading${judged > 1 ? 's' : ''} span${judged > 1 ? '' : 's'} its drawn line` }
}

/**
 * n60: how many one-line headings miss their drawn line in a verify record (0 when the check passed), or null when
 * it did not judge. Round 33 c2 (slow agency, n57): the repair that took SLOW up to its drawn 866px pushed the
 * line under it down, so the boxes-moved-further rule put the whole repair back and SLOW stayed two thirds wide.
 */
export function spanMisses(detail: unknown): number | null {
  let found: number | null = null
  const walk = (v: unknown, depth: number): void => {
    if (found !== null || !v || typeof v !== 'object' || depth > 6) return
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return }
    const o = v as Record<string, unknown>
    if (o.kind === 'line-span' && o.verdict && typeof o.verdict === 'object') {
      const vd = o.verdict as { satisfied?: boolean; reason?: string }
      found = vd.satisfied ? 0 : Math.max(1, (String(vd.reason ?? '').match(/the heading "/g) ?? []).length)
      return
    }
    for (const x of Object.values(o)) walk(x, depth + 1)
  }
  walk(detail, 0)
  return found
}

/**
 * n60: keep a repair that sized a heading to its drawn line even though drawn boxes moved further off, unless they
 * moved by a lot more (a bigger heading pushes what is under it down a little; that is the cost of the right size).
 */
export function keepSpanRepair(prev: { span: number | null; miss: number | null }, now: { span: number | null; miss: number | null }): boolean {
  if (prev.span == null || now.span == null || now.span >= prev.span) return false
  if (prev.miss == null || now.miss == null) return true
  return now.miss <= prev.miss + 160
}

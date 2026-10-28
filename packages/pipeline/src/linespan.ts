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
import { wordsOf } from './ownwords.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface SpanVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const BIG = /\b(big|bigger|huge|large|giant|massive|heading|headline|title|display|hero)\b/i
/** Words in a note that describe the type rather than say the copy. */
const STYLE = new Set(['big', 'bigger', 'huge', 'large', 'giant', 'massive', 'heading', 'headline', 'title', 'display', 'hero',
  'bold', 'italic', 'serif', 'sans', 'regular', 'light', 'thin', 'heavy', 'black', 'white', 'green', 'dark', 'navy', 'red', 'blue',
  'grey', 'gray', 'cream', 'yellow', 'orange', 'pink', 'purple', 'teal', 'lime', 'gold', 'brown', 'centred', 'centered',
  'left', 'right', 'uppercase', 'caps', 'mono', 'font', 'text', 'in', 'and', 'the'])

const r1 = (v: number) => Math.round(v)
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2

/** The copy words of a note (its style words taken out). */
export function copyWords(note: string): string[] {
  return wordsOf(note).filter((w) => !STYLE.has(w))
}

export function verifyLineSpan(marks: readonly MarkLike[], after: Snap, stacked: ReadonlySet<string> = new Set()): SpanVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const m of marks) {
    if (!isLevel(m) || !m.words || !BIG.test(m.words)) continue
    // a line drawn as part of a multi-line stack is the stack check's (stacklines)
    if (m.strokeId && stacked.has(m.strokeId)) continue
    const len = Math.abs(m.to!.x - m.from!.x)
    if (len < 200) continue
    const want = copyWords(m.words)
    if (want.length < 2) continue
    const wantSet = new Set(want)
    const y = m.box.y
    const x0 = Math.min(m.from!.x, m.to!.x), x1 = x0 + len
    let best: { n: NodeLike; tb: BBox; fs: number; share: number } | null = null
    for (const n of after.nodes) {
      if (!n.text || !n.textBox) continue
      const tb = n.textBox
      const cy = tb.y + tb.h / 2
      if (Math.abs(cy - y) > 110) continue
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
    if (fs && tb.h > fs * 1.9) {
      const lines = Math.max(2, Math.round(tb.h / (fs * 1.2)))
      misses.push(`the heading ${quote} was drawn as ONE line ${r1(len)}px long (x ${r1(x0)} to ${r1(x1)}, y ${r1(y)}) but is built on about ${String(lines)} lines (${r1(tb.h)}px tall): keep it on one line ` +
        `(white-space: nowrap, its block at least ${r1(len)}px wide, no max-width narrower than that), at the font-size that makes its words run about ${r1(len)}px, line-height about ${r1(fs * 1.2)}px, so what is under it moves back up; change nothing else`)
      continue
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

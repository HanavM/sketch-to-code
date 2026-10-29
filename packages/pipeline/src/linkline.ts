/**
 * A link drawn on a coloured line is underlined; a sentence on one drawn line runs its length (n62).
 *
 * Round 33 c2 (slow agency, n60): "See our projects →" was typed on a short line drawn in red pen. Since n59 a
 * line drawn for words is never also a rule, so the build dropped the red underline the screenshot shows. And
 * "A design studio that takes the time to get it right." was typed on a 468px line but built at about 13px,
 * running 366px, because only headings were sized by their line.
 *
 * - A short line drawn in a coloured pen whose words read as a link (an arrow, or "see / view / read / learn
 *   more / explore / browse / shop / discover ...") is the link's place AND its underline, in that ink: told,
 *   left out of the no-rules check, and checked (an underline or bottom border under the words, or a thin bar
 *   just under them).
 * - A sentence of 4+ words on one level line (not a heading, not part of a stack) whose drawn length implies
 *   body type (13-26px) is set at the size that runs about that length on one line: told and checked.
 * Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { BIG_WORD, copyWords, lineAsksBig } from './linespan.js'
import { wordsOf } from './ownwords.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string }
interface InkLike { strokeId?: string; paint: string; color: string; how?: string }
interface ActionLike { onScreen?: unknown; shapeMarks?: MarkLike[]; inkColours?: InkLike[]; textSize?: Array<{ lines: number; strokes: string[] }> }
interface NodeLike { id: string; tag?: string; rect: BBox; text?: string; textBox?: BBox; parent?: string | null; style?: { fontSize?: string; borderBottom?: string; textDecoration?: string; backgroundColor?: string; color?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface Verdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const LINK = /(→|->|›|»|\b(see|view|read|learn|explore|browse|shop|discover|visit|watch|more|all projects|our work)\b)/i
const r = Math.round
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 4
const dark = (hex: string) => /^#(0[0-9a-f]|1[0-9a-f]){3}$/i.test(hex)
const quote = (w: string) => `"${w.replace(/,.*$/, '').trim()}"`

export interface LinkLine { strokeId: string; words: string; color: string; x0: number; x1: number; y: number; action: number }

/** Short lines drawn in a coloured pen whose words read as a link. */
export function linkLines(actions: readonly ActionLike[]): LinkLine[] {
  const out: LinkLine[] = []
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const m of a.shapeMarks ?? []) {
      if (!isLevel(m) || !m.words || !m.strokeId) continue
      const len = Math.abs(m.to!.x - m.from!.x)
      if (len > 420 || len < 40) continue
      if (!LINK.test(m.words) || copyWords(m.words).length > 6) continue
      const ink = (a.inkColours ?? []).find((c) => c.strokeId === m.strokeId && c.paint === 'text' && c.how !== 'tap')
      if (!ink || dark(ink.color)) continue
      const x0 = Math.min(m.from!.x, m.to!.x)
      out.push({ strokeId: m.strokeId, words: m.words, color: ink.color, x0, x1: x0 + len, y: r(m.box.y), action: i })
    }
  })
  return out
}

/** A sentence on one drawn line: the font-size (px) at which it runs that length, or null when not judged. */
export function bodyLineFont(words: string, len: number): number | null {
  if (BIG_WORD.test(words) || lineAsksBig(words, len) || len < 200) return null
  const want = copyWords(words)
  if (want.length < 4) return null
  // the copy as typed (articles kept), with a trailing look tail ("..., light grey" / "... right. light grey") cut
  const toks = words.replace(/,[^,]*$/, (t) => (copyWords(t).length ? t : '')).trim().split(/\s+/)
  // a word ending the sentence ("right.") is copy even when it is also a look word
  while (toks.length > 1 && !/[.!?…]$/.test(toks.at(-1)!) && !copyWords(toks.at(-1)!).length) toks.pop()
  const chars = Math.max(want.join(' ').length, toks.join(' ').length)
  const fs = len / (chars * 0.5)
  return fs >= 13 && fs <= 26 ? r(fs) : null
}

export interface BodyLine { strokeId: string; words: string; len: number; x0: number; y: number; fs: number; action: number }

export function bodyLines(actions: readonly ActionLike[]): BodyLine[] {
  const stacked = new Set(actions.flatMap((a) => (a.textSize ?? []).filter((t) => t.lines >= 2).flatMap((t) => t.strokes)))
  const out: BodyLine[] = []
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const m of a.shapeMarks ?? []) {
      if (!isLevel(m) || !m.words || !m.strokeId || stacked.has(m.strokeId)) continue
      const len = Math.abs(m.to!.x - m.from!.x)
      const fs = bodyLineFont(m.words, len)
      if (fs == null) continue
      out.push({ strokeId: m.strokeId, words: m.words, len, x0: Math.min(m.from!.x, m.to!.x), y: r(m.box.y), fs, action: i })
    }
  })
  return out
}

export function linkLineBrief(actions: readonly ActionLike[]): string {
  const links = linkLines(actions)
  const body = bodyLines(actions)
  if (!links.length && !body.length) return ''
  const lines = [
    ...links.map((l) => `- action ${String(l.action)}: ${quote(l.words)} is typed on a short line drawn in ${l.color} pen (x ${String(l.x0)} to ${String(l.x1)}, y ${String(l.y)}): it is a LINK, and the drawn line is ALSO its underline. ` +
      `Set the words in ${l.color} with a ${l.color} underline under them (border-bottom 1-2px solid ${l.color} with a few px padding-bottom, or text-decoration: underline), the words just above y ${String(l.y)} and the underline on it.`),
    ...body.map((b) => `- action ${String(b.action)}: ${quote(b.words)} is a sentence typed on ONE line drawn ${String(b.len)}px long (x ${String(b.x0)} to ${String(b.x0 + b.len)}, y ${String(b.y)}): the line sets its SIZE. ` +
      `Keep it on one line with letters running about ${String(b.len)}px: font-size about ${String(b.fs)}px (adjust so the width matches), its baseline about y ${String(b.y)}.`),
  ]
  return `LINKS AND SENTENCES ON DRAWN LINES (from the ink; checked on the page):\n${lines.join('\n')}\n\n`
}

/** The built text carrying most of these words, nearest the line. */
function textOn(words: string, x0: number, x1: number, y: number, after: Snap): NodeLike | null {
  const want = new Set(copyWords(words))
  if (!want.size) return null
  let best: { n: NodeLike; share: number; area: number } | null = null
  for (const n of after.nodes) {
    const tb = n.textBox ?? n.rect
    if (!n.text || Math.abs(tb.y + tb.h / 2 - y) > 90) continue
    if (Math.min(tb.x + tb.w, x1 + 60) - Math.max(tb.x, x0 - 60) <= 0) continue
    const got = wordsOf(n.text)
    if (got.length > want.size * 2 + 3) continue
    const share = got.filter((w) => want.has(w)).length / want.size
    if (share < 0.6) continue
    const area = tb.w * tb.h
    if (!best || share > best.share + 0.01 || (Math.abs(share - best.share) <= 0.01 && area < best.area)) best = { n, share, area }
  }
  return best?.n ?? null
}

const underlined = (n: NodeLike) => !!n.style?.borderBottom || /underline/.test(n.style?.textDecoration ?? '')

export function verifyLinkLines(actions: readonly ActionLike[], after: Snap): Verdict {
  const links = linkLines(actions)
  if (!links.length) return { satisfied: true, unverifiable: true, reason: 'no link drawn on a coloured line' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const misses: string[] = []
  let judged = 0
  for (const l of links) {
    const t = textOn(l.words, l.x0, l.x1, l.y, after)
    if (!t) continue
    judged++
    // the text, its parents (an <a> round a <span>) or its children carry the underline
    const chain: NodeLike[] = []
    for (let m: NodeLike | undefined = t, k = 0; m && k < 3; m = m.parent ? byId.get(m.parent) : undefined, k++) chain.push(m)
    const kids = after.nodes.filter((n) => n.parent === t.id)
    const tb = t.textBox ?? t.rect
    // a link drawn on one short line stays on one line (n62 try 1: the arrow wrapped under the words)
    const fs = parseFloat(t.style?.fontSize ?? '') || 0
    if (fs && tb.h > fs * 1.9) {
      misses.push(`the link ${quote(l.words)} was drawn on ONE short line (x ${String(l.x0)} to ${String(l.x1)}, y ${String(l.y)}) but wraps onto two lines (${String(r(tb.h))}px tall): ` +
        `keep it on one line (white-space: nowrap; no fixed width narrower than its words), right edge near x ${String(l.x1)}, its underline still under it; change nothing else`)
      continue
    }
    if ([...chain, ...kids].some(underlined)) continue
    const bar = after.nodes.some((n) => !(n.text ?? '').trim() && n.rect.h <= 4 && n.rect.w >= tb.w * 0.5 && n.rect.w <= tb.w * 1.6 + 30 &&
      Math.abs(n.rect.y - (tb.y + tb.h)) <= 14 && Math.min(n.rect.x + n.rect.w, tb.x + tb.w) - Math.max(n.rect.x, tb.x) > 0 &&
      !!n.style?.backgroundColor && !/transparent|rgba\([^)]*,\s*0\)/.test(n.style.backgroundColor))
    if (bar) continue
    misses.push(`the link ${quote(l.words)} was drawn on a ${l.color} line (x ${String(l.x0)} to ${String(l.x1)}, y ${String(l.y)}), which is also its underline, but the built words have no underline: ` +
      `give that text a ${l.color} underline (border-bottom 1-2px solid ${l.color}, padding-bottom 2-4px, display inline-block), keep the words where they are; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'link words not found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(judged)} link${judged > 1 ? 's' : ''} underlined as drawn` }
}

export function verifyBodyLines(actions: readonly ActionLike[], after: Snap): Verdict {
  const body = bodyLines(actions)
  if (!body.length) return { satisfied: true, unverifiable: true, reason: 'no sentence on one drawn line' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const b of body) {
    const t = textOn(b.words, b.x0, b.x0 + b.len, b.y, after)
    if (!t) continue
    const tb = t.textBox ?? t.rect
    const fs = parseFloat(t.style?.fontSize ?? '') || 0
    judged++
    if (fs && tb.h > fs * 1.9) {
      misses.push(`the sentence ${quote(b.words)} was drawn as ONE line ${String(b.len)}px long (y ${String(b.y)}) but wraps onto ${String(Math.max(2, r(tb.h / (fs * 1.3))))} lines: keep it on one line (white-space: nowrap, its block at least ${String(b.len)}px wide) at about ${String(b.fs)}px; change nothing else`)
      continue
    }
    const ratio = tb.w / b.len
    if (ratio >= 0.9 && ratio <= 1.2) continue
    const to = fs ? r(fs / ratio) : b.fs
    misses.push(`the sentence ${quote(b.words)} was drawn as one line ${String(b.len)}px long (x ${String(b.x0)} to ${String(b.x0 + b.len)}, y ${String(b.y)}); its letters run ${String(r(tb.w))}px (${String(r(ratio * 100))}% of the line): ` +
      `take its font-size ${fs ? `from ${String(r(fs))}px ` : ''}to about ${String(to)}px so it runs the drawn length on one line; keep its colour, weight and left edge; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'sentence not found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(judged)} sentence${judged > 1 ? 's' : ''} run${judged > 1 ? '' : 's'} its drawn line` }
}

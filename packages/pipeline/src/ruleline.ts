/**
 * A note typed just above a long divider is a small label over a rule, not a heading sized by the line (n142).
 *
 * Round 40 e4 (support inbox, n139): "Refund not received bold" was typed just above a line drawn edge to edge
 * across the middle column (the header's bottom border). The line-sizes-the-heading rule (n56: a short phrase
 * on a long line is a heading that runs the line) made it a 60px heading, then a fix note that shrank it also
 * moved it to the right edge. Round 40 e2 (recipe): "Pantry bold" typed above a line across the whole page (the
 * top bar's border) was centred, because a line spanning its box reads as centred.
 *
 * A person draws a full-width rule for a divider and types the words just above it where they go. So a level
 * line that runs (nearly) edge to edge of its column, box or the page, 300px or longer, with its own note typed
 * a little ABOVE it (not on it: "white roads, thick" typed on a road line is about the line) is a RULE LABEL:
 * the line is a 1px divider (kept, not dropped as a line that only stands for words), and the note's words are
 * ordinary text (14-20px, bold if asked) sitting just above the rule at the side they were typed on. A note
 * asking for big type (big, huge, heading ...) keeps the heading rule. Told in the brief and checked on the
 * page: size, sitting above the rule, side. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { ABOUT_LINE, BIG_WORD, copyWords } from './linespan.js'
import { wordsOf } from './ownwords.js'

interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RuleLabelVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }
export type RuleSide = 'left' | 'centre' | 'right'
export interface RuleLabel { side: RuleSide; x: number; y: number; holder: BBox }

const r1 = (v: number) => Math.round(v)
const isLevel = (m: ShapeMark) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2

/** The column the line sits in: the smallest drawn box holding it, else the page, cut by upright lines and tall box edges. */
export function ruleHolder(line: BBox, others: readonly ShapeMark[], viewport: { w: number; h: number }): BBox {
  const y = line.y
  const x0 = line.x, x1 = line.x + line.w
  const boxes = others.filter((o) => o.shape === 'box' && o.box.w >= 40 && o.box.h >= 24)
  const hold = boxes.filter((o) => o.box.x <= x0 + 8 && o.box.x + o.box.w >= x1 - 8 && o.box.y <= y + 2 && o.box.y + o.box.h >= y - 2)
    .sort((p, q) => p.box.w * p.box.h - q.box.w * q.box.h)[0]
  let h: BBox = hold ? hold.box : { x: 0, y: 0, w: viewport.w, h: viewport.h }
  // upright lines and the sides of tall boxes beside the line (a sidebar) are column edges
  const edges: number[] = []
  for (const o of others) {
    if (o.shape === 'line' && !o.edge && o.from && o.to && Math.abs(o.from.x - o.to.x) <= 4 && Math.abs(o.from.y - o.to.y) >= 120 &&
      o.box.y <= y + 2 && o.box.y + o.box.h >= y - 2) edges.push(o.box.x + o.box.w / 2)
    if (o.shape === 'box' && o !== hold && o.box.h >= 120 && o.box.y <= y + 2 && o.box.y + o.box.h >= y - 2) edges.push(o.box.x, o.box.x + o.box.w)
  }
  for (const vx of edges) {
    if (vx <= h.x || vx >= h.x + h.w) continue
    if (vx <= x0 + 8) h = { x: vx, y: h.y, w: h.x + h.w - vx, h: h.h }
    else if (vx >= x1 - 8) h = { x: h.x, y: h.y, w: vx - h.x, h: h.h }
  }
  return h
}

/** Does this level line run (nearly) edge to edge of its column? */
export function spansHolder(line: BBox, h: BBox): boolean {
  const slack = Math.max(24, h.w * 0.05)
  return line.w >= 300 && line.x - h.x <= slack && h.x + h.w - (line.x + line.w) <= slack
}

/**
 * Mark level lines that are rule labels (in place): the line spans its column and its own note was typed just
 * above it. `others` is every drawn stroke's shape (dividers are often in no action); `at` comes from the note.
 */
export function markRuleLabels(marks: ShapeMark[], others: readonly ShapeMark[], viewport: { w: number; h: number }): void {
  for (const m of marks) {
    if (!isLevel(m) || !m.words || !m.wordsAt || m.ends) continue
    if (BIG_WORD.test(m.words) || ABOUT_LINE.test(m.words) || !copyWords(m.words).length) continue
    const above = m.box.y - m.wordsAt.y
    if (above < 4 || above > 70) continue
    const h = ruleHolder(m.box, [...marks, ...others], viewport)
    if (!spansHolder(m.box, h)) continue
    const fx = (m.wordsAt.x - h.x) / h.w
    const side: RuleSide = fx < 0.4 ? 'left' : fx > 0.62 ? 'right' : 'centre'
    m.rule = { side, x: r1(m.wordsAt.x), y: r1(m.wordsAt.y), holder: { x: r1(h.x), y: r1(h.y), w: r1(h.w), h: r1(h.h) } }
  }
}

/** The words a rule label shows (style words out, the note's own spelling kept for the brief). */
const copyOf = (words: string) => (words.includes(',') && !copyWords(words.slice(words.indexOf(',') + 1)).length ? words.slice(0, words.indexOf(',')) : words)
  .replace(/\b(bold|semibold|small|grey|gray|muted|dark|left|right|centred|centered)\b/gi, '').replace(/\s+/g, ' ').trim()

export function ruleLabelBrief(actions: ReadonlyArray<{ shapeMarks?: ShapeMark[]; onScreen?: unknown }>): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const m of a.shapeMarks ?? []) {
      if (!m.rule || !m.words) continue
      const h = m.rule.holder
      const x0 = m.box.x, x1 = m.box.x + m.box.w, y = m.box.y
      const where = m.rule.side === 'left' ? `LEFT-aligned at the column's left padding (first letter about x ${String(Math.max(h.x + 16, Math.min(m.rule.x, h.x + 32)))}; never centred)`
        : m.rule.side === 'right' ? `RIGHT-aligned, ending near the column's right padding (about x ${String(h.x + h.w - 20)})`
          : `centred on x ${String(r1(h.x + h.w / 2))}`
      lines.push(`- action ${String(i)}: "${copyOf(m.words)}" (note "${m.words}") was typed just ABOVE a line drawn edge to edge across its column (x ${String(x0)} to ${String(x1)} at y ${String(y)}; column x ${String(h.x)} to ${String(h.x + h.w)}). ` +
        `The line is a DIVIDER: a thin 1px rule in a light tone of the surface (a border-bottom is fine) across the column at y ${String(y)}, kept. The band above it is NOT a filled bar: it keeps the background of the page or column behind it, never the line's pen colour; the pen colour, if any, is the WORDS' colour. ` +
        `The words are ORDINARY text, about 14-18px (bold only if the note says bold), NEVER a big heading sized by the line's length, ` +
        `sitting in the space just above the rule (their middle about halfway between the top of that space and y ${String(y)}), ${where}.`)
    }
  })
  return lines.length ? `WORDS OVER A DIVIDER (deterministic, from where the note was typed over a full-width line; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

/** Built text carrying most of the note's copy words, nearest above the rule. */
function labelNode(m: ShapeMark, after: Snap): NodeLike | null {
  const want = copyWords(copyOf(m.words!))
  if (!want.length) return null
  const wantSet = new Set(want)
  let best: { n: NodeLike; share: number; area: number } | null = null
  for (const n of after.nodes) {
    if (!n.text || !n.textBox) continue
    const got = wordsOf(n.text)
    if (got.length > want.length * 2 + 2) continue
    const share = got.filter((w) => wantSet.has(w)).length / want.length
    if (share < 0.7) continue
    const cy = n.textBox.y + n.textBox.h / 2
    if (Math.abs(cy - m.box.y) > 140) continue
    const area = n.textBox.w * n.textBox.h
    if (!best || share > best.share + 0.01 || (Math.abs(share - best.share) <= 0.01 && area < best.area)) best = { n, share, area }
  }
  return best?.n ?? null
}

export function verifyRuleLabels(marks: readonly ShapeMark[], after: Snap): RuleLabelVerdict {
  const rules = marks.filter((m) => m.rule && m.words)
  if (!rules.length) return { satisfied: true, unverifiable: true, reason: 'no words typed over a divider' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const m of rules) {
    const n = labelNode(m, after)
    if (!n) continue
    judged++
    const tb = n.textBox!
    const q = `"${copyOf(m.words!)}"`.slice(0, 60)
    const fs = parseFloat(n.style?.fontSize ?? '') || 0
    const h = m.rule!.holder
    const y = m.box.y
    const faults: string[] = []
    if (fs > 24) faults.push(`it is ${r1(fs)}px: take it to about 16px (ordinary text, bold if asked), keeping it where it is`)
    const cy = tb.y + tb.h / 2
    if (cy > y + 4) faults.push(`its middle is at y ${r1(cy)}, below the rule at y ${String(y)}: it sits just above the rule`)
    else if (cy < y - 80) faults.push(`its middle is at y ${r1(cy)}, far above the rule at y ${String(y)}: it sits just above the rule`)
    if (m.rule!.side === 'left' && tb.x > h.x + Math.max(60, h.w * 0.2)) faults.push(`it starts at x ${r1(tb.x)}: it was typed at the LEFT of the column (x ${String(h.x)} to ${String(h.x + h.w)}), so left-align it at the column's left padding (about x ${String(h.x + 20)})`)
    if (m.rule!.side === 'right' && tb.x + tb.w < h.x + h.w - Math.max(60, h.w * 0.2)) faults.push(`it ends at x ${r1(tb.x + tb.w)}: it was typed at the RIGHT of the column, so right-align it near x ${String(h.x + h.w - 20)}`)
    if (m.rule!.side === 'centre' && Math.abs(tb.x + tb.w / 2 - (h.x + h.w / 2)) > Math.max(40, h.w * 0.1)) faults.push(`its centre is x ${r1(tb.x + tb.w / 2)}: centre it on x ${r1(h.x + h.w / 2)}`)
    if (faults.length) misses.push(`${q} was typed just above the divider drawn across the column at y ${String(y)}: ${faults.join('; ')}; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no words over a divider found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(judged)} label${judged > 1 ? 's' : ''} over a divider small and in place` }
}

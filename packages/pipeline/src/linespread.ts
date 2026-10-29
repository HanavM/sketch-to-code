/**
 * Repeated items spread as drawn, and a table row is not a heading (n71).
 *
 * Round 34 e3 (habits, n66): "M T W T F S S, small grey" was typed on a level line drawn 500px wide over
 * the week's seven columns. Single letters are not words to the word reader (it keeps 2+ letters), so the
 * line said nothing: the build packed the letters, and the seven circles in every card under them, 56px apart
 * at the left, where the drawing put them 83px apart across the line. Layout 49%.
 *
 * Round 34 e2 (departures, n66): each table row ("14:40 Lisbon TP 1351 B12 Boarding blue pill") was typed on
 * its own long line. n56's "a short phrase on a long line is a heading the line sizes" read every row as a
 * heading, so the first build set each row in 60px bold. One fix note brought them back.
 *
 * Here:
 * - a line with three or more short items typed on it (each 1-3 characters: day letters, numbers, grades) is
 *   a row of repeated items spread evenly over the drawn line; the build is told each item's centre, and that
 *   anything repeated per item in the rows under it (circles, dots, cells) shares those centres; the page is
 *   checked on both;
 * - a line of short values with numbers in them (a time, a code, a count) is a table row, and a line whose
 *   note says small (small, tiny, normal size) is small: neither is ever a heading sized by its line; table
 *   rows are told to stay at body size and checked.
 * Zero tokens.
 */
import type { BBox } from '@s2c/ink'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface SpreadVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const r1 = (v: number) => Math.round(v)
const isLevel = (m: MarkLike) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2

/** Words that describe the look of a row (a trailing ", small grey" tail), not its items. */
const LOOK = /^(small|tiny|grey|gray|light|dark|bold|regular|caps|uppercase|spaced|muted|white|black|centred|centered|normal|size|text|and|faint|thin)$/i
export const SMALL_WORD = /\b(small|smaller|tiny|little|normal size|regular size|body size|body text|fine print)\b/i

/** The items typed on a line: the copy before a trailing look tail, split on spaces. */
export function rowItems(words: string): string[] {
  let copy = words.trim()
  const i = copy.lastIndexOf(',')
  if (i > 0) {
    const tail = copy.slice(i + 1).trim().split(/\s+/)
    if (tail.length && tail.every((w) => LOOK.test(w.replace(/[^\p{L}]/gu, '')))) copy = copy.slice(0, i)
  }
  return copy.split(/\s+/).map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')).filter(Boolean)
}

/** Three or more short items (1-3 characters each) over a line long enough to spread them: their centres, else null. */
export function spreadCentres(words: string, x0: number, x1: number): number[] | null {
  const items = rowItems(words)
  const len = x1 - x0
  if (items.length < 3 || items.length > 14 || !items.every((w) => w.length <= 3)) return null
  if (len < items.length * 36) return null
  const step = len / (items.length - 1)
  return items.map((_, k) => r1(x0 + k * step))
}

/** A row of table values: four or more items, two or more with digits in them, mostly short. */
export function isTableRow(words: string): boolean {
  const items = rowItems(words)
  if (items.length < 4) return false
  const digits = items.filter((w) => /\d/.test(w)).length
  const short = items.filter((w) => w.length <= 6).length
  return digits >= 2 && short >= items.length * 0.6
}

/** A line's words that must never be sized up by its length (a table row, or a note that says small). */
export function notHeading(words: string): boolean {
  return SMALL_WORD.test(words) || isTableRow(words)
}

export interface SpreadRow { strokeId: string; items: string[]; centres: number[]; y: number; x0: number; x1: number }

export function spreadRows(marks: readonly MarkLike[]): SpreadRow[] {
  const out: SpreadRow[] = []
  for (const m of marks) {
    if (!isLevel(m) || !m.words) continue
    const x0 = Math.min(m.from!.x, m.to!.x), x1 = Math.max(m.from!.x, m.to!.x)
    const centres = spreadCentres(m.words, x0, x1)
    if (centres) out.push({ strokeId: m.strokeId ?? '', items: rowItems(m.words), centres, y: r1(m.box.y), x0: r1(x0), x1: r1(x1) })
  }
  return out
}

/** The brief: repeated items spread over their line, and table rows kept at body size. */
export function lineSpreadBrief(actions: ReadonlyArray<{ shapeMarks?: MarkLike[]; onScreen?: unknown }>): string {
  const marks = actions.flatMap((a) => a.onScreen ? [] : a.shapeMarks ?? [])
  const lines: string[] = []
  for (const s of spreadRows(marks)) {
    const step = s.centres.length > 1 ? r1(s.centres[1]! - s.centres[0]!) : 0
    lines.push(`- "${s.items.join(' ')}" is ${String(s.items.length)} short items typed on ONE line drawn from x ${String(s.x0)} to ${String(s.x1)} at y ${String(s.y)}: ` +
      `the line sets their SPACING. Spread them evenly over the whole line, each item centred on its own column: centres at x ${s.centres.join(', ')} ` +
      `(about ${String(step)}px apart; e.g. a grid of ${String(s.items.length)} equal columns from x ${String(r1(s.x0 - step / 2))} to ${String(r1(s.x1 + step / 2))}, text centred), never packed together at one side with a small gap. ` +
      `Anything repeated once per item in the rows under it (a circle, dot, tick or cell per item) uses the SAME columns: each one centred on the x of its item above. Checked on the page.`)
  }
  for (const m of marks) {
    if (!isLevel(m) || !m.words || !isTableRow(m.words)) continue
    const x0 = r1(Math.min(m.from!.x, m.to!.x)), x1 = r1(Math.max(m.from!.x, m.to!.x))
    lines.push(`- "${m.words}" typed on the line from x ${String(x0)} to ${String(x1)} at y ${r1(m.box.y)} is a TABLE ROW of short values, not a heading: ` +
      `body size (about 14-16px), regular weight unless its note says bold, each value in its column under the header; the line's length never sets its size.`)
  }
  return lines.length ? `ROWS OF ITEMS ON DRAWN LINES (deterministic; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

const leafText = (n: NodeLike) => (n.text ?? '').trim()
const cx = (b: BBox) => b.x + b.w / 2

/** Spread rows: the items sit at their centres, and like marks repeated per item under them share the columns. */
export function verifyLineSpread(marks: readonly MarkLike[], after: Snap): SpreadVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const s of spreadRows(marks)) {
    const step = s.centres[1]! - s.centres[0]!
    const tol = Math.max(18, step * 0.3)
    // the items: one small leaf of text each, near the line, in drawn order
    const near = after.nodes.filter((n) => n.textBox && leafText(n) && Math.abs(n.textBox.y + n.textBox.h / 2 - s.y) <= 60 &&
      n.textBox.x + n.textBox.w >= s.x0 - step && n.textBox.x <= s.x1 + step && leafText(n).length <= 3)
    const seen = new Map<string, NodeLike>()
    for (const n of near) {
      const key = `${r1(n.textBox!.x)}:${r1(n.textBox!.y)}`
      const had = seen.get(key)
      if (!had || n.textBox!.w * n.textBox!.h < had.textBox!.w * had.textBox!.h) seen.set(key, n)
    }
    const got = [...seen.values()].sort((a, b) => a.textBox!.x - b.textBox!.x)
    if (got.length >= Math.ceil(s.items.length * 0.7) && got.length <= s.items.length + 1) {
      judged++
      const first = cx(got[0]!.textBox!), last = cx(got.at(-1)!.textBox!)
      const want0 = s.centres[0]!, want1 = s.centres.at(-1)!
      if (Math.abs(first - want0) > tol || Math.abs(last - want1) > tol) {
        const gap = got.length > 1 ? (last - first) / (got.length - 1) : 0
        misses.push(`"${s.items.join(' ')}" was drawn spread over a line from x ${String(s.x0)} to ${String(s.x1)} (centres ${s.centres.join(', ')}, about ${r1(step)}px apart) ` +
          `but is built from x ${r1(first)} to ${r1(last)}, about ${r1(gap)}px apart: set each item's column so its centre is at those x (a ${String(s.items.length)}-column grid, ${r1(step)}px per column, ` +
          `starting at x ${r1(want0 - step / 2)}), and move whatever repeats once per item in the rows below (circles, dots) into the same columns; change nothing else`)
        continue
      }
    }
    // marks repeated per item below: rows of like small squarish boxes (circles, dots) with no words of their own
    const below = after.nodes.filter((n) => !leafText(n) && n.rect.w >= 10 && n.rect.w <= 70 && Math.abs(n.rect.w - n.rect.h) <= Math.max(4, n.rect.w * 0.2) &&
      n.rect.y > s.y && n.rect.x + n.rect.w >= s.x0 - step && n.rect.x <= s.x1 + step)
    const rows = new Map<number, NodeLike[]>()
    for (const n of below) {
      const key = r1((n.rect.y + n.rect.h / 2) / 12)
      const row = rows.get(key) ?? []
      if (!row.some((o) => Math.abs(cx(o.rect) - cx(n.rect)) < 4)) row.push(n)
      rows.set(key, row)
    }
    const full = [...rows.values()].filter((r) => r.length === s.items.length)
    if (!full.length) continue
    judged++
    const off = full.filter((r) => {
      const xs = r.map((n) => cx(n.rect)).sort((a, b) => a - b)
      return xs.some((x, k) => Math.abs(x - s.centres[k]!) > tol)
    })
    if (off.length) {
      const xs = off[0]!.map((n) => cx(n.rect)).sort((a, b) => a - b)
      misses.push(`the ${String(s.items.length)} marks repeated per item under "${s.items.join(' ')}" (${String(off.length)} of ${String(full.length)} rows) sit at x ${xs.map(r1).join(', ')}, ` +
        `not under their items' drawn centres x ${s.centres.join(', ')}: put each one in its item's column (${r1(step)}px apart), keep their size; change nothing else`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no row of short items found on its drawn line' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(judged)} row${judged > 1 ? 's' : ''} of items spread as drawn` }
}

/** Table rows stay at body size: a row's values built far bigger than body text is the line sizing them. */
export function verifyTableRows(marks: readonly MarkLike[], after: Snap): SpreadVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const m of marks) {
    if (!isLevel(m) || !m.words || !isTableRow(m.words)) continue
    const items = rowItems(m.words).map((w) => w.toLowerCase())
    const y = m.box.y
    const hits = after.nodes.filter((n) => n.textBox && leafText(n) && Math.abs(n.textBox.y + n.textBox.h / 2 - y) <= 40 &&
      items.some((w) => w.length >= 2 && leafText(n).toLowerCase().includes(w)) && leafText(n).length <= 40)
    if (!hits.length) continue
    judged++
    const big = hits.map((n) => parseFloat(n.style?.fontSize ?? '') || 0).filter((f) => f > 22)
    if (big.length) misses.push(`the table row "${rowItems(m.words).join(' ')}" at y ${r1(y)} is built at ${r1(Math.max(...big))}px: set its values at body size (about 15px), keep its columns and row height; change nothing else`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no table row found' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${String(judged)} table row${judged > 1 ? 's' : ''} at body size` }
}

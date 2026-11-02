/**
 * Items after a count across go in one row over the page, all of them (n223).
 *
 * Round 47 (n221): the note "x3 across: <item>; <item>; <item>" on a short drawn line broke three ways. On the circus
 * page ("June 4, Opening night; 7pm, Doors at six; $18, Kids go free; white under") the items were read as table rows
 * and stacked down the page. On the aquarium page ("Open daily 9 to 6; Pier 14; Adults $24; bold") all three squeezed
 * inside the width of the drawn line and wrapped. On the origami page ("x3 spaced across: ...") two of three were left
 * out, on a line nearly the page's width, and a fix note listing them again did nothing.
 *
 * A person who types a count, a direction across and that many items, and draws one line, has said: these words, in
 * one row, starting at my line. The drawn line says where the row starts and its height; it does not hold them. So:
 * - ITEMS: "x3 across:", "x3 spaced across:", "3 across:", "row of 3:", "x3 side by side:", then exactly that many
 *   items split by ';' (or ', ' when no ';' is typed). A lower-case segment says how they all look ("bold", "white
 *   under"). An item with a comma is a main line and the smaller line under it; the comma is not printed.
 * - SPAN: from the line's left end to its right end when it runs most of the page, else to the same margin on the
 *   other side, or up to the next mark drawn at that height. First item starts at the left, last ends at the right.
 * - One line each (no wrapping), left-aligned. The line is the words' place, not a rule on the page.
 * Told to the build, and checked on the page. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'
import { shapeOf } from './shapemark.js'

export interface RowItem { main: string; under?: string }
export interface CountedRow { n: number; items: RowItem[]; looks: string[] }
export interface CountRowPlan extends CountedRow {
  note: string
  /** Height of the first line of words: the drawn line. */
  y: number
  x0: number
  x1: number
  colour?: string
}
interface Box { x: number; y: number; w: number; h: number }
interface NoteLike { text: string; at?: { x: number; y: number } }
interface NodeLike { rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface CountRowVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const WORDN: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const N = '(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const WAY = '(?:across|side by side|in a row|in one row)'
const LEADS = [
  // x3 across: / x3 spaced across: / x3 evenly side by side:
  new RegExp(`^\\s*(?:x|×)\\s?(\\d{1,2})\\s+(?:[a-z]+\\s+){0,2}?${WAY}\\s*:\\s*(.+)$`, 'is'),
  // 3 across: / three spaced across:
  new RegExp(`^\\s*${N}\\s+(?:[a-z]+\\s+){0,2}?${WAY}\\s*:\\s*(.+)$`, 'is'),
  // row of 3: / row of 3 spaced:
  new RegExp(`^\\s*(?:a\\s+)?row\\s+of\\s+${N}(?:\\s+[a-z]+){0,2}\\s*:\\s*(.+)$`, 'is'),
]
const isItem = (s: string) => /^[\p{Lu}\p{N}$£€¥#"'“]/u.test(s)

/** The items a count across lists, or null when the note lists a different number or goes another way. */
export function countedRow(note: string): CountedRow | null {
  const m = LEADS.map((l) => l.exec(note)).find(Boolean)
  if (!m) return null
  const n = /^\d/.test(m[1]!) ? Number(m[1]) : WORDN[m[1]!.toLowerCase()] ?? 0
  if (n < 2 || n > 8) return null
  let segs = m[2]!.trim().split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean)
  if (segs.filter(isItem).length < n) {
    // no semicolons: a comma list, with any look after a further ';' kept apart
    const [first, ...rest] = segs
    segs = [...(first ?? '').split(/\s*,\s+/).map((s) => s.trim()).filter(Boolean), ...rest]
    const items = segs.filter(isItem)
    if (items.length !== n) return null
    return { n, items: items.map((main) => ({ main })), looks: segs.filter((s) => !isItem(s)) }
  }
  const items = segs.filter(isItem)
  if (items.length !== n) return null
  return {
    n,
    items: items.map((s) => {
      const c = /^(.+?),\s+(.+)$/.exec(s)
      return c ? { main: c[1]!.trim(), under: c[2]!.trim() } : { main: s }
    }),
    looks: segs.filter((s) => !isItem(s)),
  }
}

const r = Math.round
const q = (s: string) => `"${s}"`

/** Every note listing a count across that sits on, just above or just under a drawn level line. */
export function countRows(notes: readonly NoteLike[], strokes: readonly Stroke[], vp: { w: number; h: number }): CountRowPlan[] {
  const marks = strokes.filter((s) => s.points.length > 1).map((s) => {
    const sh = shapeOf(s.points)
    const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y)
    const box = sh?.box ?? { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    return { box, color: s.color }
  })
  const flat = marks.filter((m) => m.box.w >= 30 && m.box.h <= 10)
  const out: CountRowPlan[] = []
  for (const note of notes) {
    const c = countedRow(note.text)
    const at = note.at
    if (!c || !at) continue
    const home = flat
      .filter((l) => at.x >= l.box.x - 24 && at.x <= l.box.x + l.box.w + 24 && at.y >= l.box.y - 80 && at.y <= l.box.y + 44)
      .sort((a, b) => Math.abs(a.box.y - at.y) - Math.abs(b.box.y - at.y))[0]
    if (!home) continue
    const H = home.box
    const y = H.y + H.h / 2
    let x1 = H.w >= vp.w * 0.6 ? H.x + H.w : vp.w - H.x
    // a mark drawn at that height to the right ends the row; a band the line lies in does not
    for (const m of marks) {
      if (m === home || m.box.x <= H.x + H.w - 4) continue
      if (m.box.y <= y + 12 && m.box.y + m.box.h >= y - 12 && m.box.x - 16 < x1) x1 = m.box.x - 16
    }
    // too little room for one column each: leave it to the other readings
    if (x1 - H.x < c.n * 60) continue
    out.push({ ...c, note: note.text, y: r(y), x0: r(H.x), x1: r(x1), ...(home.color ? { colour: home.color } : {}) })
  }
  return out
}

export function countRowBrief(plans: readonly CountRowPlan[]): string {
  if (!plans.length) return ''
  const lines = plans.map((p) => {
    const items = p.items.map((it, k) => `item ${String(k + 1)}: ${q(it.main)}${it.under ? ` with ${q(it.under)} on its own smaller line right under it` : ''}`).join('; ')
    return `- ${q(p.note.slice(0, 120))} lists ${String(p.n)} items, typed by the person, side by side in ONE row: ${items}. ` +
      `The row spans x ${String(p.x0)} to x ${String(p.x1)} (one flex row positioned there, justify-content: space-between, no max-width): the first item's words START at x ${String(p.x0)}, the last item's words END at x ${String(p.x1)}, the others evenly between. ` +
      `Each item's first line is centred at y ${String(p.y)}, on one line with no wrapping (white-space: nowrap, text-align left)${p.colour ? `, in the line's pen colour ${p.colour}` : ''}. ` +
      (p.looks.length ? `How they all look: ${p.looks.map(q).join(', ')}. ` : '') +
      `The drawn line only says where the row starts and its height: it is not a rule on the page and the words do not stay within its length.`
  })
  return `A ROW OF TYPED ITEMS ACROSS (a count across with its items after it; deterministic; checked on the page):\n${lines.join('\n')}\n` +
    `Print every item, exactly as typed, and only those: never stack them down the page, squeeze them into the drawn line, drop one, make one up, or print the count, the words before the colon, the comma between an item's two lines, or the look words. ` +
    `This overrides any other reading of the note or of its line.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export const COUNT_ROW_Y_TOL = 26
export const COUNT_ROW_X_TOL = 48

export function verifyCountRows(plans: readonly CountRowPlan[] | undefined, after: Snap): CountRowVerdict {
  if (!plans?.length) return { satisfied: true, unverifiable: true, reason: 'no typed rows across' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  const texts = after.nodes.filter((n) => (n.text ?? '').trim() && n.textBox && n.textBox.w > 0)
  for (const p of plans) {
    const found: Box[] = []
    p.items.forEach((it) => {
      const want = norm(it.main)
      const hits = texts.filter((n) => norm(n.text!) === want)
      const loose = hits.length ? hits : texts.filter((n) => norm(n.text!).includes(want) && norm(n.text!).length <= want.length + 40)
      const hit = loose.sort((a, b) => Math.abs(a.textBox!.y + a.textBox!.h / 2 - p.y) - Math.abs(b.textBox!.y + b.textBox!.h / 2 - p.y))[0]
      if (!hit) { faults.push(`${q(it.main)} is not on the page: it is one of the ${String(p.n)} items of the row at y ${String(p.y)}`); return }
      const b = hit.textBox!
      found.push(b)
      if (norm(hit.text!) !== want && it.under && norm(hit.text!).includes(norm(it.under))) faults.push(`${q(it.main)} and ${q(it.under)} are printed as one line: two lines, the second under the first, and no comma`)
      if (it.under && !texts.some((n) => norm(n.text!).includes(norm(it.under!)))) faults.push(`${q(it.under)} is not on the page: it goes right under ${q(it.main)}`)
      const cy = b.y + b.h / 2
      if (Math.abs(cy - p.y) > COUNT_ROW_Y_TOL + (b.h > 44 ? b.h / 2 : 0)) faults.push(`${q(it.main)} sits at y ${String(r(cy))}; the row is at y ${String(p.y)}`)
    })
    if (found.length === p.n) {
      // one row, not stacked and not squeezed: left to right over the whole span
      for (let k = 1; k < found.length; k++) {
        if (found[k]!.x <= found[k - 1]!.x + found[k - 1]!.w) faults.push(`${q(p.items[k]!.main)} is not to the right of ${q(p.items[k - 1]!.main)}: side by side in one row, left to right`)
      }
      const first = found[0]!, last = found[found.length - 1]!
      if (Math.abs(first.x - p.x0) > COUNT_ROW_X_TOL) faults.push(`${q(p.items[0]!.main)} starts at x ${String(r(first.x))}; it starts at x ${String(p.x0)}`)
      if (Math.abs(last.x + last.w - p.x1) > COUNT_ROW_X_TOL) faults.push(`${q(p.items[p.n - 1]!.main)} ends at x ${String(r(last.x + last.w))}; it ends at x ${String(p.x1)}`)
      const heights = found.map((b) => b.h).sort((a, b) => a - b)
      const low = heights[0]!
      if (low > 0 && heights[heights.length - 1]! > low * 1.7) faults.push(`an item wraps onto two lines: every item stays on one line (white-space: nowrap)`)
    }
    for (const n of texts) {
      if (/^\s*(?:x|×)\s?\d{1,2}\b/i.test(n.text!) || /\b(?:spaced\s+)?across\s*:/i.test(n.text!)) faults.push(`${q(n.text!.trim().slice(0, 40))} prints the count's words: print the items only`)
    }
  }
  return faults.length
    ? { satisfied: false, reason: `${faults.slice(0, 8).join('; ')}; change nothing else` }
    : { satisfied: true, reason: `${plans.map((p) => `${String(p.n)} items`).join(', ')} in one row over the span` }
}

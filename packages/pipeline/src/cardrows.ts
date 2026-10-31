/**
 * n156: rows typed in a card under its small heading start below that heading, never over it.
 *
 * Round 41 (hand, n150/n155): in the bank home, the white "Recent" card was drawn at (278,327) 954x333, a short line
 * at y 363 near its top left carried "Recent bold", a small ring at (346,423) marked the first row's icon, and the
 * transaction rows were typed as one note ("rows: Corner Grocer −$42.18, Salary +$2,400.00 green, ...") in the
 * middle of the card at y 520. The note's spot was told as where its words sit, and the build put the list at the
 * card's top: "Corner Grocer" started at y 342, on the "Recent" heading ("Rec" cut off). In the target the rows start
 * under the heading, the first one's middle level with the drawn ring. A person types a long rows note wherever there
 * is room; in a card with a heading, the rows start right under the heading.
 *
 * From the drawing alone:
 * - CARD: a drawn box at least 280px wide and 160px tall (not a side panel).
 * - ROWS: a note typed in it that gives rows of data (rowdata.ts: 2+ rows, or a row and a count).
 * - HEAD: a short note (four words or fewer, no colon, no rows) typed in the card's top 120px, above the rows note.
 * - No level line drawn across the card under the heading (drawn rows or dividers place the rows themselves).
 * - START: the heading's bottom + 18px; when a small ring (12-56px) is drawn in the card's left third under the
 *   heading, the first row's middle is that ring's middle. Row pitch: what fits down to the card's foot, 40-72px.
 * The note's typed spot is moved to the first row's middle (so no other brief says "at y 520"), the build is told the
 * start, pitch and the heading to stay below, and the page is checked: the first row's words start under the
 * heading's words and near the start. Zero tokens.
 */
import { listNote, type BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { rowData } from './rowdata.js'
import { sidePanels } from './sidelist.js'
import { checkRowMarks, rowMarkWords } from './openrows.js'

interface NodeLike { rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
interface Spot { text: string; x: number; y: number }
export interface CardRowsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface CardRows {
  text: string
  /** the heading note's words */
  head: string
  /** where the heading note was typed (its first line's middle), px */
  headY: number
  card: BBox
  /** where the rows note was typed */
  typedY: number
  /** top of the first row, px */
  start: number
  pitch: number
  rows: number
  /** first cell of the first row, if typed */
  firstCell: string | null
  /** n114: the small ring or square drawn for row 1, repeated on every row */
  mark?: BBox & { hollow?: string; round?: boolean }
}

export const START_TOL_PX = 28
const r = Math.round
const NOTE_H = 14
const HEAD_GAP = 18

const within = (b: BBox, p: { x: number; y: number }, tol = 4) => p.x >= b.x - tol && p.x <= b.x + b.w + tol && p.y >= b.y - tol && p.y <= b.y + b.h + tol
const insideBox = (a: BBox, b: BBox, tol = 8) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol
const sameBox = (a: BBox, b: BBox) => Math.abs(a.x - b.x) <= 6 && Math.abs(a.y - b.y) <= 6 && Math.abs(a.w - b.w) <= 12 && Math.abs(a.h - b.h) <= 12

/**
 * The rows a note gives: rows of data (rowdata.ts), or a lead list split by commas ("rows: Corner Grocer −$42.18,
 * Salary +$2,400.00 green, ...; grey sub-line, dividers", what follows a semicolon says how they look). Null otherwise.
 */
export function noteRows(text: string): { n: number; first: string | null } | null {
  const rd = rowData(text)
  if (rd) return { n: rd.total ?? rd.rows.length, first: rd.rows[0]?.[0] ?? null }
  if (!listNote(text) || !/^\s*(?:\d{1,2}\s+)?(?:rows?|items?|entries|list|transactions?|lines?)\b[^:]{0,30}:/i.test(text)) return null
  const items = text.slice(text.indexOf(':') + 1).split(';')[0]!.split(/\s*,\s+/).map((t) => t.trim()).filter(Boolean)
  return items.length >= 2 ? { n: items.length, first: items[0]! } : null
}

/** A short heading note: four words or fewer, no colon, no rows. */
export function headNote(text: string): boolean {
  const t = text.trim()
  return !!t && !t.includes(':') && t.split(/\s+/).length <= 4 && !noteRows(t)
}

/** The rows in a card under its heading, from the marks, every drawn shape on the page, and every typed note. */
export function cardRows(marks: readonly ShapeMark[], shapes: readonly Pick<ShapeMark, 'shape' | 'box' | 'from' | 'to' | 'tilt'>[], notes: readonly Spot[], viewport: { w: number; h: number }): CardRows[] {
  const out: CardRows[] = []
  const seen = new Set<string>()
  for (const m of marks) {
    if (m.shape !== 'box' || m.tilt) continue
    const C = m.box
    if (C.w < 280 || C.h < 160 || sidePanels([m], viewport).length) continue
    // the notes typed in it: its own typed spots, and any note typed inside it that no smaller drawn box inside it holds
    // (a card read as an area of bare rows keeps its notes on the action, not as typed spots)
    const inner = shapes.filter((s) => s.shape === 'box' && !sameBox(s.box, C) && insideBox(s.box, C) && s.box.w >= 60 && s.box.h >= 40)
    const own = [...(m.typed ?? []), ...notes.filter((n) => within(C, n, 0) && !inner.some((b) => within(b.box, n, 0)) && !(m.typed ?? []).some((t) => t.text === n.text))]
    for (const t of own) {
      if (seen.has(t.text)) continue
      const rd = noteRows(t.text)
      if (!rd) continue
      const heads = notes.filter((n) => n.text !== t.text && within(C, n) && headNote(n.text) && n.y < t.y - 20 && n.y - C.y <= 120)
        .sort((a, b) => b.y - a.y)
      const h = heads[0]
      if (!h) continue
      const headBottom = h.y + NOTE_H
      const inCard = shapes.filter((s) => !sameBox(s.box, C) && insideBox(s.box, C))
      // drawn rows: a level line across most of the card under the heading places the rows itself
      const level = (s: (typeof inCard)[number]) => s.shape === 'line' && !!s.from && !!s.to && Math.abs(s.from.y - s.to.y) <= 6 && s.box.w >= 0.5 * C.w
      if (inCard.some((s) => level(s) && s.box.y > headBottom + 4)) continue
      // other notes typed between the heading and the rows note are copy in that space: leave it alone
      if (notes.some((n) => n !== h && n.text !== t.text && within(C, n) && n.y > h.y + 8 && n.y < t.y - 8)) continue
      const n = rd.n
      if (n < 2 || n > 12) continue
      let start = r(headBottom + HEAD_GAP)
      const room = C.y + C.h - 12 - start
      let pitch = Math.max(40, Math.min(72, Math.floor(room / n)))
      // a small ring, or a small square (an icon drawn as a box), at the left under the heading
      const ring = inCard.filter((s) => (s.shape === 'ellipse' || (s.shape === 'box' && Math.abs(s.box.w - s.box.h) <= 0.25 * Math.max(s.box.w, s.box.h))) && s.box.w >= 12 && s.box.w <= 56 && s.box.h >= 12 && s.box.h <= 56 &&
        s.box.y + s.box.h / 2 >= h.y + 6 && s.box.x + s.box.w / 2 <= C.x + C.w / 3).sort((a, b) => a.box.y - b.box.y)[0]
      if (ring) {
        const cy = ring.box.y + ring.box.h / 2
        const s2 = r(cy - pitch / 2)
        if (s2 >= headBottom + 4 && s2 <= headBottom + 80) start = s2
        else if (s2 < headBottom + 4) { pitch = Math.max(40, r(2 * (cy - headBottom - 4))); start = r(cy - pitch / 2) }
      }
      if (t.y < start) continue // typed above where the rows go: nothing to move
      seen.add(t.text)
      out.push({ text: t.text, head: h.text, headY: h.y, card: { x: r(C.x), y: r(C.y), w: r(C.w), h: r(C.h) }, typedY: t.y, start, pitch, rows: n,
        firstCell: rd.first, ...(ring ? { mark: { x: r(ring.box.x), y: r(ring.box.y), w: r(ring.box.w), h: r(ring.box.h), ...(ring.shape === 'ellipse' ? { round: true } : {}) } } : {}) })
    }
  }
  return out
}

/** Move each card list's typed spot to its first row's middle (in place), so no other brief places it at the note. */
export function markCardRows(marks: ShapeMark[], shapes: readonly Pick<ShapeMark, 'shape' | 'box' | 'from' | 'to' | 'tilt'>[], notes: readonly Spot[], viewport: { w: number; h: number }): CardRows[] {
  const lists = cardRows(marks, shapes, notes, viewport)
  for (const l of lists) {
    for (const m of marks) {
      const own = (m.typed ?? []).filter((t) => t.text === l.text && t.y === l.typedY)
      for (const t of own) t.y = l.start + r(l.pitch / 2)
      if (own.length || (m.shape === 'box' && sameBox(m.box, l.card) && !(m.cardRows ?? []).some((c) => c.text === l.text))) (m.cardRows ??= []).push(l)
    }
  }
  return lists
}

export const cardRowsOf = (marks: readonly ShapeMark[]): CardRows[] => marks.flatMap((m) => m.cardRows ?? [])

export function cardRowsBrief(lists: readonly CardRows[]): string {
  if (!lists.length) return ''
  const each = lists.map((l) => {
    const end = l.start + l.rows * l.pitch
    return `"${l.text}" (${l.rows} rows) was typed in the card drawn at (${l.card.x},${l.card.y}) ${l.card.w}x${l.card.h} under its heading "${l.head}" (typed at y ${l.headY}), with no rows drawn: ` +
      `the rows start BELOW that heading, not where the note was typed (y ${l.typedY}) and never at the card's top. The heading stays at the card's top left as its own line; ` +
      `the first row's top is at y ${l.start} (its middle about y ${l.start + r(l.pitch / 2)}), rows about ${l.pitch}px apart, so the last ends by y ${end}. ` +
      `No row sits beside, on or over the heading's words` + (l.mark ? `. ${rowMarkWords(l.mark, l.start + r(l.pitch / 2), l.rows)}` : '')
  })
  return `\n\nROWS UNDER A CARD HEADING (deterministic, from the drawing; checked on the page): ${each.join('; ')}.`
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()
const LOOK = /\b(bold|big|small|tiny|grey|gray|muted|faint|white|dark|light|blue|green|red|purple|heading|title|label|semibold|caps|uppercase)\b/gi
/** A heading note's copy ("Recent bold" -> "recent"). */
export const headCopy = (s: string) => norm(s.replace(LOOK, '')) || norm(s)

export function verifyCardRows(lists: readonly CardRows[], after: Snap): CardRowsVerdict {
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no rows under a card heading' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const l of lists) {
    const C = l.card
    const inCard = (after.nodes ?? []).filter((n) => n.text && n.textBox && n.textBox.w > 0 && n.textBox.h > 0 &&
      n.textBox.x + n.textBox.w / 2 >= C.x - 8 && n.textBox.x + n.textBox.w / 2 <= C.x + C.w + 8 && n.textBox.y >= C.y - 60 && n.textBox.y <= C.y + C.h + 60)
    const smallest = (want: string) => inCard.filter((n) => norm(n.text!) === want).sort((a, b) => a.textBox!.h - b.textBox!.h)[0] ?? null
    const head = smallest(headCopy(l.head))
    const fc = l.firstCell ? norm(l.firstCell) : ''
    // the first cell as built, or the start of it (a typed "Corner Grocer −$42.18" builds "Corner Grocer" and its amount apart)
    const first = fc.length >= 3 ? smallest(fc) ?? inCard.filter((n) => { const t = norm(n.text!); return t.length >= 4 && (t.startsWith(fc) || fc.startsWith(t + ' ')) })
      .sort((a, b) => a.textBox!.y - b.textBox!.y)[0] ?? null : null
    if (!head || !first) continue
    judged++
    const hb = head.textBox!, fb = first.textBox!
    const cy = fb.y + fb.h / 2
    const want = l.start + l.pitch / 2
    if (fb.y < hb.y + hb.h + 2) {
      faults.push(`the first row "${l.firstCell}" sits at y ${r(fb.y)} to ${r(fb.y + fb.h)}, level with or over the card's heading "${headCopy(l.head)}" (y ${r(hb.y)} to ${r(hb.y + hb.h)}): ` +
        `the rows start under the heading: put the first row's top at y ${l.start} (its words' middle about y ${r(want)}), rows about ${l.pitch}px apart, and keep the heading on its own line above`)
    } else if (Math.abs(cy - want) > START_TOL_PX) {
      faults.push(`the first row "${l.firstCell}" has its middle at y ${r(cy)} but was drawn to start under the heading: move the rows ${cy > want ? 'up' : 'down'} so its middle is about y ${r(want)}, rows about ${l.pitch}px apart`)
    }
    const mk = l.mark ? checkRowMarks(l.mark, r(want), l.pitch, l.rows, after) : null
    if (mk) faults.push(mk)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'card heading or first row not found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only where the rows start and their spacing; not their colours, copy or width' }
    : { satisfied: true, reason: `${lists.length} card list${lists.length > 1 ? 's' : ''} under ${lists.length > 1 ? 'their headings' : 'its heading'}` }
}

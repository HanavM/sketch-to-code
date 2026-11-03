/**
 * The drawn first row is the template (n89).
 *
 * Round 36 (n87): on transactions and email the person drew ONE row (a square, a name line, a middle line
 * far right, an amount line at the end, all on one level about 40-60px tall) and typed "5 rows like this".
 * Both first builds stacked the middle column's text under the name and made every row 78-115px tall; a fix
 * note restored the drawn row both times. And every row had to be typed in full (131 and 119 words), because
 * a bare "5 rows like this" with nothing typed after it was read as no rows at all.
 *
 * Here, for a note that asks for N rows like the drawn one:
 * - the drawn row is found in the strokes inside the note's mark: the topmost level band of two or more
 *   strokes spanning a good part of the mark's width (a lone heading line above it is not the row);
 * - its parts, left to right, are told to the build with their drawn x (a square or dot is a picture or
 *   icon, a line is a text column; a line ending near the mark's right edge is right aligned), and its height
 *   (the tallest part plus padding, or twice the gap down to a drawn divider) is every row's pitch;
 * - with no row content typed ("5 rows like this", "7 like this"), the rows are filled with SAMPLE content
 *   that fits the page, so a list costs four words, not a hundred;
 * - checked on the page: text sits in each drawn column (not stacked under the name), and rows step at about
 *   the drawn pitch.
 * Zero tokens.
 *
 * n244 (round 48 e5, wifi): a panel drawn 560px tall with a square and a pill in its first row and "x6 down: ...".
 * The pitch came from the row alone (65px), so "no taller rows" shrank the panel to 390px and pulled the drawn
 * button up 109px; the mark check said give it its height, the template said keep the rows, and no repair could do
 * both. Now:
 * - a box with a good part left under its rows (a quarter more height each or better), whose rows would still be no more
 *   than twice the drawn row, is shared by them evenly, down to any part drawn low in the box;
 * - any other box drawn taller than its rows keeps its height too, its rows at the drawn row's pitch and the space under
 *   them empty on purpose. Sharing every box was tried on paper first: of the three kept pages with a picture to check
 *   against, it would have helped wifi (80px rows) and hurt transactions (58px, would be 66) and the night market
 *   (47px, would be 70), both built with empty space under their rows;
 * - a pill at the row's end, where no typed cell could be its words, is a toggle: never words in it, its tap is the
 *   on colour, a typed "off" on a row is that toggle's state and is not printed;
 * - a part's tap paints every row's copy, not only the first.
 */
import { countedRow } from './countrow.js'
import { countedItems } from './drawnlist.js'
import type { Stroke } from '@s2c/ink'
import { rowData } from './rowdata.js'

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { id: string; rect: Box; text?: string; textBox?: Box }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
interface ActionLike { notes?: string[]; region?: Box; kind?: string; onScreen?: unknown }
export interface RowTemplateVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface RowPart {
  kind: 'mark' | 'text' | 'toggle'
  /** Left edge, page px. */
  x: number
  w: number
  h: number
  /** A text line ending near the right edge of the mark: its text is right aligned, ending at x + w. */
  right?: boolean
  /** n244: the colour tapped inside this drawn part. */
  paint?: string
}
export interface RowTemplate {
  note: string
  total: number
  /** Did the note type any row content? If not, the rows are sample content. */
  typed: boolean
  parts: RowPart[]
  /** Vertical centre of the drawn first row, page px. */
  cy: number
  /** Row height and pitch, page px. */
  pitch: number
  container: Box
  /** n244: the rows share the drawn box's height (the pitch came from the box, not the row). */
  shared?: boolean
  /** n244: the box is taller than the rows at their pitch: it keeps its height, with the space left under them. */
  roomy?: boolean
  /** n244: 1-based rows whose typed words end in "off": their toggle is off, and the word is not printed. */
  off?: number[]
}

const NUMW = '(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const NOUN = '(?:rows?|items?|entries|cards?|lines?|emails?|messages?|people|ones?|transactions?)'
const LIKE = new RegExp(`\\b${NUMW}\\s+(?:${NOUN}\\s+)?(?:just\\s+)?like\\s+(?:this|that|it|the\\s+first(?:\\s+one)?)\\b`, 'i')
const TIMES = /(?:^|[\s,;(])(?:x|×)\s?(\d{1,2})\b/i
/** n244: space kept under the last row, and how much taller than the row's own pitch a shared row must be to be worth sharing. */
const SHARE_PAD_PX = 24
const SHARE_MIN = 1.25
const num = (s: string) => (/^\d/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? 0)

/** How many rows a note asks for "like this", and whether it typed any row content. */
export function likeCount(note: string): { total: number; typed: boolean } | null {
  const m = note.match(LIKE) ?? note.match(TIMES)
  if (!m) return null
  // n223: a count across is one row of items (countrow.ts), never rows like this
  if (countedRow(note)) return null
  // n214: "x4 down: A; B; C; D" lists its rows: they are typed, none to invent
  if (countedItems(note)) return { total: num(m[1]!), typed: true }
  const total = num(m[1]!)
  if (total < 2 || total > 40) return null
  const d = rowData(note)
  // content is typed when rows or cells are given (slashes, dots) or a colon follows the count;
  // a look tail ("thin dividers", "names bold") is no content
  const typed = (!!d && (d.rows.length >= 2 || d.rows.some((r) => r.length >= 2))) || /:\s*\S/.test(note.slice(note.indexOf(m[0]) + m[0].length))
  return { total, typed }
}

const bbox = (pts: ReadonlyArray<{ x: number; y: number }>): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
const inside = (b: Box, c: Box, pad = 6) => b.x >= c.x - pad && b.y >= c.y - pad && b.x + b.w <= c.x + c.w + pad && b.y + b.h <= c.y + c.h + pad

/** n244: the pitch at which `total` rows share the box down to `floor`, or null when the drawn row's own pitch stands. A box never squeezes rows: a short box may be the first card, not the panel. */
export function sharedPitch(cy: number, floor: number, total: number, rowPitch: number, tall: number): number | null {
  if (total < 2) return null
  const even = (floor - SHARE_PAD_PX - cy) / (total - 0.5)
  if (even < rowPitch * SHARE_MIN || even > Math.min(120, tall * 2)) return null
  return Math.round(even)
}

/** n244: every typed row's last piece could only be a figure or an on/off, so a pill at the row's end holds no words. */
const LAST_OFF = /(?:^|\s)off$/i
const LAST_ON = /(?:^|\s)on$/i
function pillHasNoWords(note: string): boolean {
  if (/\b(?:toggles?|switch(?:es)?)\b/i.test(note)) return true
  const rows = rowData(note)?.rows
  if (!rows || rows.length < 2) return false
  return rows.every((r) => { const l = (r[r.length - 1] ?? '').trim(); return r.length >= 2 && (/\d/.test(l) || LAST_OFF.test(l) || LAST_ON.test(l)) })
}
/** The typed rows that say their toggle is off, 1-based. */
export function offRows(note: string): number[] {
  return (rowData(note)?.rows ?? []).flatMap((r, k) => (LAST_OFF.test((r[r.length - 1] ?? '').trim()) ? [k + 1] : []))
}

/** The drawn first row inside a mark, or null when none is drawn there. With `total` (n244), its rows share a box drawn for them. */
export function templateIn(container: Box, strokes: readonly Stroke[], total?: number, note?: string): Omit<RowTemplate, 'note' | 'total' | 'typed'> | null {
  if (container.w < 160 || container.h < 60) return null
  const inner = strokes.map((s) => bbox(s.points))
    .filter((b) => inside(b, container) && !(b.w >= container.w * 0.9 && b.h >= container.h * 0.9) && b.h <= 90 && b.w * b.h < container.w * container.h * 0.3)
  const dividers = inner.filter((b) => b.w >= container.w * 0.6 && b.h <= 12)
  const parts = inner.filter((b) => !dividers.includes(b) && (b.w >= 4 || b.h >= 4))
  if (parts.length < 2) return null
  // level bands by vertical centre
  const sorted = [...parts].sort((a, b) => (a.y + a.h / 2) - (b.y + b.h / 2))
  const bands: Box[][] = []
  for (const b of sorted) {
    const cy = b.y + b.h / 2
    const band = bands[bands.length - 1]
    const bcy = band ? band.reduce((s, x) => s + x.y + x.h / 2, 0) / band.length : -Infinity
    if (band && Math.abs(cy - bcy) <= Math.max(14, Math.max(...band.map((x) => x.h)) / 2)) band.push(b)
    else bands.push([b])
  }
  const row = bands.find((band) => {
    if (band.length < 2) return false
    const x0 = Math.min(...band.map((b) => b.x)), x1 = Math.max(...band.map((b) => b.x + b.w))
    return x1 - x0 >= container.w * 0.4
  })
  if (!row) return null
  const cy = Math.round(row.reduce((s, b) => s + b.y + b.h / 2, 0) / row.length)
  const tall = Math.max(...row.map((b) => b.h))
  const right = container.x + container.w
  const taps = strokes.filter((s) => s.color && s.points.length >= 1).map((s) => ({ b: bbox(s.points), color: s.color! })).filter((t) => t.b.w + t.b.h <= 6)
  const ordered = [...row].sort((a, b) => a.x - b.x)
  const ps: RowPart[] = ordered.map((b, k) => {
    const mark = b.h >= 14 && b.w <= b.h * 2.5
    // n244: a pill at the row's end, with nothing typed that could be its words
    const pill = mark && k === ordered.length - 1 && k > 0 && b.w >= b.h * 1.4 && b.h <= 48 && !!note && pillHasNoWords(note)
    const p: RowPart = { kind: pill ? 'toggle' : mark ? 'mark' : 'text', x: Math.round(b.x), w: Math.round(b.w), h: Math.round(b.h) }
    const tap = mark ? taps.filter((t) => t.b.x >= b.x && t.b.x <= b.x + b.w && t.b.y >= b.y && t.b.y <= b.y + b.h).pop() : undefined
    if (tap) p.paint = tap.color
    if (!mark && right - (b.x + b.w) <= Math.max(60, container.w * 0.08) && b.x > container.x + container.w * 0.5) p.right = true
    return p
  })
  const below = dividers.map((d) => d.y + d.h / 2).filter((y) => y > cy && y - cy <= 60).sort((a, b) => a - b)[0]
  let pitch = below !== undefined ? 2 * (below - cy) : tall + 20
  pitch = Math.round(Math.min(120, Math.max(40, pitch)))
  // n244: a drawn divider says the pitch itself; otherwise the rows share the box, down to the first part drawn under them
  const low = parts.filter((b) => !row.includes(b) && b.y > cy + tall / 2).map((b) => b.y)
  const floor = Math.min(container.y + container.h, ...low)
  const share = total !== undefined && below === undefined ? sharedPitch(cy, floor, total, pitch, tall) : null
  const off = note && ps.some((p) => p.kind === 'toggle') ? offRows(note) : []
  return {
    parts: ps, cy, pitch: share ?? pitch,
    container: { x: Math.round(container.x), y: Math.round(container.y), w: Math.round(container.w), h: Math.round(container.h) },
    ...(share !== null ? { shared: true } : {}), ...(off.length ? { off } : {}),
    // a box with a whole row's room left under its rows; a box too short to hold them is the first card, not the panel
    ...(share === null && total !== undefined && below === undefined && cy + (total - 0.5) * pitch + pitch <= floor ? { roomy: true } : {}),
  }
}

/** Every "N rows like this" note whose mark holds a drawn first row. */
export function rowTemplates(actions: readonly ActionLike[], strokes: readonly Stroke[], skip?: ReadonlySet<string>): RowTemplate[] {
  const out: RowTemplate[] = []
  const seen = new Set<string>()
  for (const a of actions) {
    if (a.onScreen || !a.region) continue
    for (const note of a.notes ?? []) {
      if (seen.has(note)) continue
      // n214: a count listing its items on drawn lines is told by drawnlist.ts: its rows go on the lines, not at a drawn row's height
      if (skip?.has(note)) continue
      const c = likeCount(note)
      if (!c) continue
      const t = templateIn(a.region, strokes, c.total, note)
      if (!t) continue
      seen.add(note)
      out.push({ note, ...c, ...t })
    }
  }
  return out
}

/** Notes asking for rows like a drawn one with nothing typed: their sample words are allowed. */
export function hasFillerRows(notes: readonly string[]): boolean {
  return notes.some((n) => { const c = likeCount(n); return !!c && !c.typed })
}

const q = (s: string) => `"${s}"`
const partWords = (p: RowPart, k: number, texts: number) => p.kind === 'toggle'
  ? `a ${String(p.w)}x${String(p.h)}px toggle at x ${String(p.x)}: a rounded track with a round knob always inside it, NO words in or beside it (no Online, Offline, On, Off, Active)${p.paint ? `, its track ${p.paint} when on` : ''}`
  : p.kind === 'mark'
  ? `a ${String(p.w)}x${String(p.h)}px square/round picture or icon at x ${String(p.x)}${p.paint ? `, painted ${p.paint} in EVERY row, unless a note names each row's colour` : ''}`
  : p.right ? `text column ${String(k)} ENDING at x ${String(p.x + p.w)} (right aligned)`
    : `text column ${String(k)} STARTING at x ${String(p.x)}${k === 1 && texts > 1 ? ' (the name, stronger)' : ''}`

/**
 * n90: which kind of value goes in which drawn column when the rows are samples. With nothing typed, the drawn
 * middle line had no words to say what it holds, and the transactions build put the amount there and a date at the
 * drawn right end (target: amount at the end). People read a list's right edge as its figure column, so: the
 * right-aligned end holds each row's figure (amount, price, count, time), a middle column holds the secondary
 * detail (category, date, subject or preview), and the first column holds the name.
 */
export function sampleRoles(t: Pick<RowTemplate, 'parts'>): string {
  const texts = t.parts.filter((p) => p.kind === 'text')
  if (texts.length < 2) return ''
  const end = texts[texts.length - 1]!
  const mids = texts.slice(1, end.right ? -1 : undefined)
  const bits = [`text column 1 holds the row's name or title`]
  mids.forEach((_, i) => bits.push(`text column ${String(i + 2)} holds a secondary detail (category and/or date, or a subject/preview line), never the row's amount`))
  if (end.right) bits.push(`text column ${String(texts.length)} (right aligned, at the row's end) holds the row's figure: its amount, price, count or time, and nothing else (no date there when there is an amount)`)
  return ` Which value goes where: ${bits.join('; ')}.`
}

/**
 * n91: a look tail that asks for a two-line name ("title over small grey line", "name with a grey line under",
 * "bold title, description below") makes the first text column two stacked lines. On notifications the tail was
 * typed but the brief said every row is ONE line and never text under the name, so the grey line was dropped.
 */
const STACK = /\b(?:title|name|heading|label)s?\b[^,;.]{0,24}?\b(?:over|above|on top of)\b[^,;.]{0,20}?\b(?:line|text|subtitle|description|detail|caption)s?\b|\b(?:(?:small|grey|gray|light|muted)\s+){1,3}(?:line|text|subtitle|description|caption)s?\s+(?:under|below|beneath)(?:\s+(?:it|each|the|every))?(?:\s+(?:title|name|one))?\b|\btwo[- ]line\b/i
export function stackedName(note: string): boolean {
  return STACK.test(note)
}

export function rowTemplateBrief(actions: readonly ActionLike[], strokes: readonly Stroke[], skip?: ReadonlySet<string>): string {
  const ts = rowTemplates(actions, strokes, skip)
  if (!ts.length) return ''
  const lines = ts.map((t) => {
    const texts = t.parts.filter((p) => p.kind === 'text').length
    let k = 0
    const parts = t.parts.map((p) => partWords(p, p.kind === 'text' ? ++k : k, texts)).join('; ')
    const drawnText = t.parts.some((p) => p.kind === 'text')
    const pitchWords = t.shared
      ? `The drawn box (top y ${String(t.container.y)}, ${String(t.container.h)}px tall, down to y ${String(t.container.y + t.container.h)}) keeps EXACTLY its drawn height, and the rows share it evenly: each row is ${String(t.pitch)}px, the first centred at y ${String(t.cy)}, the next at y ${String(t.cy + t.pitch)}, and so on (row k centred at ${String(t.cy)} + (k-1) x ${String(t.pitch)}); the last row ends inside the box. Nothing drawn below the box moves up.`
      : `Each row is about ${String(t.pitch)}px tall: the first row centred at y ${String(t.cy)}, the next at y ${String(t.cy + t.pitch)}, and so on (row k centred at ${String(t.cy)} + (k-1) x ${String(t.pitch)}); no taller rows, no extra padding.` + (t.roomy ? ` The drawn box (top y ${String(t.container.y)}, ${String(t.container.h)}px tall) still keeps EXACTLY its drawn height: the empty space under the last row is drawn on purpose, and nothing drawn below the box moves up.` : '')
    const offWords = t.off?.length
      ? ` Row${t.off.length > 1 ? 's' : ''} ${t.off.join(', ')} typed "off": that toggle is off (a pale grey track, knob at the left), every other toggle on (knob at the right). "off" says the toggle's state and is never printed.`
      : t.parts.some((p) => p.kind === 'toggle') ? ' Every toggle is on (knob at the right).' : ''
    return `- ${q(t.note.slice(0, 120))}: the drawn first row (centred at y ${String(t.cy)}) is ONE ${stackedName(t.note) ? 'row' : 'line'} of ${String(t.parts.length)} parts, left to right: ${parts}. ` +
      `Build exactly ${String(t.total)} rows, every one this same line: each part in its own column at its drawn x, all parts vertically centred on the row. ` +
      (stackedName(t.note)
        ? `Text column 1 is TWO stacked lines, as the note asks: the title (stronger) and right under it a smaller grey line (a short description; sample words if none typed), both inside the row's height; the pair is centred on the row. Apart from that, never put one column's text under another's. `
        : drawnText ? `Never put one column's text under another's: a detail (category, date, subject, preview) drawn as its own line further right stays in that column on the same line as the name. ` : '') +
      pitchWords + offWords +
      (t.typed ? (drawnText ? ' Fill the columns with the typed row content in order (the k-th piece of each row in text column k).' : ' No text column is drawn: the typed row content goes between the drawn parts, as the rows note gives it.')
        : ` Nothing was typed for the rows: fill them with SAMPLE content that fits this page and the words near this mark (plausible names, titles, dates, amounts, varied per row, never copies). These sample words are allowed (the person asked for them).` + sampleRoles(t))
  })
  return `ROW TEMPLATE (deterministic, from the drawn first row; checked on the page):\n${lines.join('\n')}\n` +
    `Never print the count or "like this".\n\n`
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
/** n244: the y of each typed row on the page, found by its first piece, top to bottom; empty if any is missing. */
function rowsByName(t: RowTemplate, L: ReturnType<typeof leaves>): number[] {
  const firsts = (rowData(t.note)?.rows ?? []).map((r) => (r[0] ?? '').trim().toLowerCase()).filter(Boolean)
  const ys = firsts.map((f) => L.find((l) => (l.x.text ?? '').trim().toLowerCase() === f)).map((l) => (l ? l.b.y + l.b.h / 2 : null))
  return ys.every((y): y is number => y !== null) ? ys : []
}
const leaves = (s: Snap) => s.nodes.filter((x) => (x.text ?? '').trim()).map((x) => ({ x, b: x.textBox ?? x.rect }))

/** Text sits in each drawn column on the row's line, and rows step at about the drawn pitch. */
export function verifyRowTemplate(actions: readonly ActionLike[], strokes: readonly Stroke[] | undefined, after: Snap, skip?: ReadonlySet<string>): RowTemplateVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const ts = strokes ? rowTemplates(actions, strokes, skip) : []
  if (!ts.length) return { satisfied: true, unverifiable: true, reason: 'no drawn row template' }
  const L = leaves(after)
  const problems: string[] = []
  for (const t of ts) {
    const texts = t.parts.filter((p) => p.kind === 'text')
    // n244: rows find themselves by their typed names when no text column is drawn; toggles hold no words
    const named = rowsByName(t, L)
    if (t.shared && named.length >= 3) {
      const step = median(named.slice(1).map((y, k) => y - named[k]!))
      if (Math.abs(step - t.pitch) > t.pitch * 0.2) problems.push(`rows of ${q(t.note.slice(0, 40))} step every ${String(Math.round(step))}px; the drawn box is shared at ${String(t.pitch)}px a row: each row ${String(t.pitch)}px, the first centred at y ${String(t.cy)}, the box keeping its drawn height`)
    }
    for (const p of t.parts.filter((x) => x.kind === 'toggle')) {
      const worded = L.filter((l) => l.b.x + l.b.w / 2 >= p.x - 6 && l.b.x + l.b.w / 2 <= p.x + p.w + 6 && l.b.y >= t.cy - t.pitch && l.b.y <= t.cy + t.pitch * t.total && l.b.w <= p.w + 12)
      if (worded.length) problems.push(`the toggles at x ${String(p.x)} hold words (${q((worded[0]!.x.text ?? '').trim().slice(0, 20))}): nobody typed them: a toggle is a track and a knob, no words`)
    }
    if (!texts.length) continue
    const top = t.cy - t.pitch, bottom = t.cy + t.pitch * (t.total + 1)
    const band = L.filter((l) => l.b.y + l.b.h / 2 >= top && l.b.y + l.b.h / 2 <= bottom)
    const atCol = (p: RowPart) => band.filter((l) => p.right ? Math.abs(l.b.x + l.b.w - (p.x + p.w)) <= 48 : Math.abs(l.b.x - p.x) <= 48)
    const first = atCol(texts[0]!)
    if (first.length < 2) continue
    // the name column: one leaf per row; rows step at the drawn pitch
    const ys = [...new Set(first.map((l) => Math.round(l.b.y + l.b.h / 2)))].sort((a, b) => a - b)
    const rowsY: number[] = []
    for (const y of ys) if (!rowsY.length || y - rowsY[rowsY.length - 1]! > Math.max(12, t.pitch * 0.5)) rowsY.push(y)
    if (rowsY.length >= 3) {
      const gaps = rowsY.slice(1).map((y, k) => y - rowsY[k]!).sort((a, b) => a - b)
      const med = gaps[Math.floor(gaps.length / 2)]!
      if (med > t.pitch * 1.3 + 4) problems.push(`rows of ${q(t.note.slice(0, 40))} step every ${String(med)}px; the drawn row is ${String(t.pitch)}px: make each row ${String(t.pitch)}px tall (less padding), the first centred at y ${String(t.cy)}`)
    }
    // stacked detail: text right under the name in the name column, while a drawn column further right is empty
    for (const p of texts.slice(1)) {
      const col = atCol(p)
      if (col.length >= Math.min(2, rowsY.length)) continue
      const stacked = first.filter((l) => rowsY.every((y) => Math.abs(l.b.y + l.b.h / 2 - y) > 4) || first.filter((o) => Math.abs(o.b.y - l.b.y) > 10 && Math.abs(o.b.y - l.b.y) < 30).length > 0)
      problems.push(`the drawn ${p.right ? 'right-hand' : 'middle'} column of ${q(t.note.slice(0, 40))} (${p.right ? `ending at x ${String(p.x + p.w)}` : `at x ${String(p.x)}`}) is empty${stacked.length ? ' and its text is stacked under the name' : ''}: put that piece of every row in its own column on the row's line, at x ${String(p.right ? p.x + p.w : p.x)}`)
    }
  }
  return problems.length
    ? { satisfied: false, reason: problems.slice(0, 4).join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(ts.length)} drawn row template${ts.length > 1 ? 's' : ''} kept: columns where drawn, rows at the drawn pitch` }
}

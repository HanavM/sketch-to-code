/**
 * Rows are quick to give (n80).
 *
 * Round 35 (n76/n77): strokes stayed low (13-18 a page) but words ran 120-139 on four of five app pages,
 * because every row of a list or table had to be typed out as its own note: "The Salt Path · 2 Nov · Due
 * soon", then the next book, and the next. And a card's note with dot separators ("Sertraline 50 mg · 1
 * tablet daily · 4 days left") was printed verbatim as one bold line, dots and all.
 *
 * A person giving a table its data writes it the short way: one note with the rows split by slashes, the
 * cells by dots ("Piranesi · 3 Nov / Educated · 22 Nov"), or types one row and says how many there are
 * ("6 rows like this"). Here:
 *
 * - a note's cells (split by ·, • or |) are separate text items in the drawn row or card: the first is the
 *   name, the middle ones its details, the last its side value; the separators are never printed. Checked:
 *   no single piece of text carries two cells of a row;
 * - a note with rows split by " / " (or new lines) fills the drawn rows in order, top to bottom, one typed
 *   row per drawn row, its cells in the columns. Checked: every cell is on the page, rows in typed order;
 * - "N rows like this", "N more like this", "x6" or "×6" after a typed row makes N rows in that row's shape:
 *   the typed row first, the rest sample data of the same kind (other titles, other dates, statuses from the
 *   same set), varied, never copies. Those sample words are allowed. Checked: N rows share the first cell's
 *   column and look.
 * Zero tokens.
 */
import { noteParts } from './typedcopy.js'
import { buttonLabel } from './buttonlabel.js'

interface NodeLike { id: string; rect: { x: number; y: number; w: number; h: number }; text?: string; textBox?: { x: number; y: number; w: number; h: number }; style?: { fontSize?: string; fontWeight?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RowDataVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface RowData {
  note: string
  /** Typed rows, each split into its cells. */
  rows: string[][]
  /** Total rows wanted when the note asks for more rows in the same shape ("6 rows like this"); else null. */
  total: number | null
}

const NUM: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
const n = (s: string) => (/^\d/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? 0)
const NUMW = '(\\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)'
const NOUN = '(?:rows?|items?|entries|cards?|lines?|books?|people|ones?)'
// "6 rows like this", "6 like this", "5 more like this", "x6", "×6", "like this x6"
const LIKE_TOTAL = new RegExp(`\\b${NUMW}\\s+(?:${NOUN}\\s+)?(?:just\\s+)?like\\s+(?:this|that|it)\\b`, 'i')
const LIKE_MORE = new RegExp(`\\b${NUMW}\\s+more(?:\\s+${NOUN})?(?:\\s+like\\s+(?:this|that|it))?\\b`, 'i')
const TIMES = /(?:^|[\s,;(])(?:x|×)\s?(\d{1,2})\b|\b(\d{1,2})\s?×(?=\s|$|[,;)])/i
const CELL = /\s*(?:·|•|\|)\s*/
const ROWSEP = /\s+\/\s+|\n+/
// "5 rows:" or "rows:" in front of slash rows
const LEAD = new RegExp(`^\\s*(?:${NUMW}\\s+)?(?:rows?|items?|entries|lines?)\\s*:\\s*`, 'i')

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * n105: name / preview pairs split by commas. A sidebar note typed the short way, "#design / New logo is up,
 * Ravi Patel / sounds good, #support / 3 new tickets", is rows of (name / preview) joined by ", ": split at
 * slashes it gives "#design", "New logo is up, Ravi Patel", "sounds good, #support", "3 new tickets", so every
 * inner piece holds one row's preview and the next row's name. Read that way it is one row per pair, the name
 * and its preview as cells (the name first, the preview under it). Needs 3+ pieces, a comma in every inner
 * piece and none in the outer two; otherwise null (rows split by slashes as before).
 */
function pairRows(parts: string[]): string[] | null {
  if (parts.length < 3) return null
  const inner = parts.slice(1, -1)
  const outer = [parts[0]!, parts[parts.length - 1]!]
  if (outer.some((p) => /,\s/.test(p) || /[·•|]/.test(p))) return null
  if (!inner.every((p) => /,\s+\S/.test(p) && !/[·•|]/.test(p))) return null
  const out: string[] = []
  let name = parts[0]!.trim()
  for (const p of inner) {
    const k = p.lastIndexOf(',')
    const preview = p.slice(0, k).trim(), next = p.slice(k + 1).trim()
    // the next name is short (a person, a channel, a title): a long tail means the commas are inside the copy
    if (!preview || !next || next.split(/\s+/).length > 4) return null
    out.push(`${name} · ${preview}`)
    name = next
  }
  out.push(`${name} · ${parts[parts.length - 1]!.trim()}`)
  return out
}

/**
 * n111: a name, then a comma, then a dotted details line ("Product designer, Fernway · Remote · $95k",
 * "Garden double, Queen bed · courtyard view, $140"): the comma ends the name, and the dotted run is ONE details
 * line kept as typed (its dots printed), not cells spread across the row. A later comma part holding a number is
 * the row's side value; other later parts say how the row looks. Null when the copy is not of that shape.
 */
export function commaDotCells(copy: string): string[] | null {
  const segs = copy.split(/,\s+/).map(clean).filter(Boolean)
  if (segs.length < 2) return null
  const di = segs.findIndex((s) => /[·•|]/.test(s))
  if (di < 1) return null
  const name = segs.slice(0, di).join(', ')
  if (name.split(/\s+/).length > 6) return null
  const meta = segs[di]!.split(CELL).map(clean).filter(Boolean)
  if (meta.length < 2) return null
  // a nav or words placed round a mark ("nav right ROUTES · CREW", "LOUDER · LISTEN around it") are no details line,
  // and a time at the end ("to me · 9:14 AM") is the row's side value: keep the cells as before
  if (/\b(nav|menu|links|around|right|left|top|bottom)\b/i.test(segs[di]!) || /\d{1,2}(:\d{2})?\s*(am|pm)\b|\b\d{1,2}:\d{2}\b/i.test(meta[meta.length - 1]!)) return null
  const out = [name, meta.join(' · ')]
  const val = segs.slice(di + 1).find((s) => /\d/.test(s) && s.split(/\s+/).length <= 3 && !/[·•|]/.test(s))
  if (val) out.push(val)
  return out
}

/**
 * n144: rows typed after a colon and split by semicolons, each a dotted row ("rides: Standard 4 min away · 4 seats
 * £18.40; Comfort 6 min away · extra room £24.10"). What comes before the colon says how the rows look. Null otherwise.
 */
export function semiRows(text: string): string[] | null {
  const c = text.indexOf(':')
  if (c < 0) return null
  const parts = text.slice(c + 1).split(/\s*;\s*/).map(clean).filter(Boolean)
  if (parts.length < 2 || !parts.every((p) => CELL.test(p))) return null
  return parts
}

const PRICE_END = /^(.*\S)\s+((?:[£$€¥]\s?\d[\d.,]*)|(?:\d[\d.,]*\s?(?:€|kr|zł)))$/u
const NAME_HEAD = /^(\p{Lu}[\p{L}'&-]*(?:\s+\p{Lu}[\p{L}'&-]*){0,2})\s+(\d.*)$/u
/**
 * n144: a dotted row typed without a dot after its name or before its price ("Standard 4 min away · 4 seats £18.40"):
 * the capitalised name before the first number is its own cell, the price at the very end the side value, and what is
 * between them one details line, dots kept.
 * Round 40 e3: the three ride rows were built as "Standard 4 min away" bold and "4 seats £18.40" together at the right.
 */
export function splitEnds(cs: string[]): string[] {
  // only a row that ends in a price run into it ("4 seats £18.40"); "Sertraline 50 mg · 1 tablet daily" keeps its cells
  const last = PRICE_END.exec(cs[cs.length - 1]!)
  const head = NAME_HEAD.exec(cs[0]!)
  if (!last || !head || last[1]!.split(/\s+/).length > 5) return cs
  // name | one details line (dots kept, printed as typed) | price
  const meta = [head[2]!.trim(), ...cs.slice(1, -1), last[1]!.trim()]
  return [head[1]!.trim(), meta.join(' · '), last[2]!.trim()]
}

/** The rows a note gives, or null when it gives none. */
export function rowData(note: string): RowData | null {
  // n111: a button's label ("Reserve · 4 nights") is one piece of copy, no row of data
  if (buttonLabel(note)) return null
  let text = note
  let total: number | null = null
  let more = 0
  const like = text.match(LIKE_TOTAL)
  const plus = like ? null : text.match(LIKE_MORE)
  const times = like || plus ? null : text.match(TIMES)
  if (like) { total = n(like[1]!); text = text.replace(like[0], ' ') }
  else if (plus && /like|more/i.test(plus[0]) && (/like/i.test(plus[0]) || CELL.test(text) || ROWSEP.test(text))) { more = n(plus[1]!); text = text.replace(plus[0], ' ') }
  else if (times) { total = Number(times[1] ?? times[2]); text = text.replace(times[0], ' ') }
  text = text.replace(/[,;:\s]+$/, '').replace(/^[,;:\s]+/, '')
  // n144: rows split by semicolons after a colon ("3 rides, grey thumb: Standard ... £18.40; Comfort ... £24.10")
  const semi = ROWSEP.test(text) ? null : semiRows(text)
  if (semi) text = semi.join(' / ')
  const slashRows = ROWSEP.test(text.replace(LEAD, ''))
  if (slashRows) text = text.replace(LEAD, '')
  // look tail and directions come off the copy (they apply to every row, they are not a row)
  // n104: a dotted label placed by a position word ("Mia · 2:14 pm above; message") is a label over its item, no row of data
  if (!slashRows && noteParts(text).place) return null
  const body = slashRows ? text : noteParts(text).copy
  const rows = (slashRows ? pairRows(body.split(ROWSEP)) ?? body.split(ROWSEP) : [body]).map((r) => {
    const copy = slashRows ? noteParts(r).copy : r
    const cd = commaDotCells(copy)
    if (cd) return cd
    const cs = copy.split(CELL).map(clean).filter(Boolean)
    // a dotted row's last cell ends at ", ": what follows says how the row looks ("teal Refill"), it is no cell
    if (cs.length >= 2) cs[cs.length - 1] = cs[cs.length - 1]!.split(/,\s+/)[0]!.trim()
    return (cs.length >= 2 ? splitEnds(cs) : cs).filter(Boolean)
  }).filter((r) => r.length)
  if (more) total = rows.length + more
  // n89: "5 rows like this, thin dividers" types no row: what follows the count is how the rows look
  // (a single short cell, no colon, no slashes, no dots), so it is no data and never printed as a row
  if (total !== null && !slashRows && rows.length === 1 && rows[0]!.length < 2 && !/:\s*\S/.test(note)) return null
  if (total !== null && (total < 2 || total > 40)) total = null
  const cells = rows.some((r) => r.length >= 2)
  if (!rows.length) return null
  if (rows.length < 2 && !cells && total === null) return null
  // a bare "6 like this" with nothing typed before it: the row is the mark it sits on, nothing to fill
  if (total !== null && !rows.some((r) => r.join('').replace(/[^\p{L}\p{N}]/gu, '').length >= 2)) return null
  return { note, rows, total }
}

export function rowDataAll(notes: readonly string[]): RowData[] {
  const out: RowData[] = []
  const seen = new Set<string>()
  for (const t of notes) {
    if (seen.has(t)) continue
    seen.add(t)
    const d = rowData(t)
    if (d) out.push(d)
  }
  return out
}

/** Do any notes ask for sample rows? (Their words are then allowed on the page.) */
export function hasSampleRows(notes: readonly string[]): boolean {
  return rowDataAll(notes).some((d) => d.total !== null && d.total > d.rows.length)
}

const q = (s: string) => `"${s}"`

export function rowDataBrief(notes: readonly string[]): string {
  const found = rowDataAll(notes)
  if (!found.length) return ''
  const lines: string[] = []
  for (const d of found.slice(0, 16)) {
    const parts: string[] = []
    if (d.rows.length >= 2) {
      parts.push(`${String(d.rows.length)} rows, in this order top to bottom, one per drawn row: ` +
        d.rows.map((r, k) => `row ${String(k + 1)} = ${r.map(q).join(' | ')}`).join('; '))
    } else {
      parts.push(`one row: ${d.rows[0]!.map(q).join(' | ')}`)
    }
    const cells = Math.max(...d.rows.map((r) => r.length))
    if (cells >= 2) {
      parts.push(`each quoted cell is its OWN text item (its own element) in that row's column or spot: in a card or list row the first is the name (stronger), the middle ones its details (smaller, muted, on a second line UNDER the name when the drawn row is tall enough for two lines, else beside it), the last its side value (at the row's right end, before any button); in a table, cell k sits under column header k. Never print the separators (·, •, |, /) or the cells run together on one line, EXCEPT inside a quoted cell that itself holds dots: that cell is ONE details line printed exactly as typed, dots and all, on one line (for example under the name), never split into columns or moved apart`)
    } else if (d.rows.length >= 2) {
      parts.push(`a row typed as one run of words ("1 60 kg 10 90 s") is split across the drawn columns or header words in order, one value per column`)
    }
    if (d.total !== null && d.total > d.rows.length) {
      parts.push(`build exactly ${String(d.total)} rows in that shape: the typed row${d.rows.length > 1 ? 's' : ''} first as typed, then ${String(d.total - d.rows.length)} more of the same kind with SAMPLE values you make up (other plausible titles, names, dates, amounts; statuses from the same small set), each row different, never a copy of the typed one. These sample words are allowed (the person asked for them). Every row is built exactly like the first: the same parts (any circle, icon or picture drawn in the first row, its button and side value, even where the other rows' drawn boxes are empty), the same look, columns and spacing; a button's look may vary only as drawn or noted`)
    } else if (d.total !== null) {
      parts.push(`exactly ${String(d.total)} rows`)
    }
    lines.push(`- ${q(d.note.replace(/\n+/g, ' / '))}: ${parts.join('. ')}.`)
  }
  return `ROWS AS DATA (deterministic; checked on the page). A note can give a list's or table's rows the short way:\n${lines.join('\n')}\n` +
    `Fill the drawn rows (lines or boxes) in order with these rows; where fewer rows are drawn than given, continue them at the drawn pitch. Never print "rows:", counts like "6 rows like this", or any separator.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
const leaves = (s: Snap) => s.nodes.filter((x) => (x.text ?? '').trim()).map((x) => ({ x, t: norm(x.text!), b: x.textBox ?? x.rect }))

/** Cells are separate items, typed rows are all there in order, and sample rows are as many as asked. */
export function verifyRowData(notes: readonly string[], after: Snap): RowDataVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const found = rowDataAll(notes)
  if (!found.length) return { satisfied: true, unverifiable: true, reason: 'no rows typed as data' }
  const L = leaves(after)
  if (!L.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const problems: string[] = []
  let checked = 0
  for (const d of found) {
    // 1) cells never run together
    for (const r of d.rows) {
      if (r.length < 2) continue
      const cs = r.map(norm).filter((c) => c.length >= 2)
      const joined = L.find((l) => cs.filter((c) => l.t.includes(c)).length >= 2)
      if (joined) problems.push(`${q(joined.x.text!.slice(0, 60))} runs cells of the row ${q(r.join(' · '))} together in one piece of text: make each cell its own element (name, details, side value as typed), no separators`)
      // n111: a dotted details cell ("Fernway · Remote · $95k") is one line, kept whole as typed
      const dn = (s: string) => norm(s).replace(/\s*([·•|])\s*/g, ' $1 ')
      for (const c of r.filter((c) => /[·•|]/.test(c))) {
        if (!L.some((l) => dn(l.x.text!).includes(dn(c)))) problems.push(`the details line ${q(c)} is not on the page as one line: print it exactly as typed, dots included, as ONE text item (under the name), never split into columns`)
      }
      checked++
    }
    // 2) typed rows (2+) all on the page, top to bottom in order
    if (d.rows.length >= 2) {
      const ys: number[] = []
      const missing: string[] = []
      for (const r of d.rows) {
        const first = norm(r[0]!)
        const hit = first.length >= 1 ? L.find((l) => l.t === first) ?? L.find((l) => first.length >= 3 && l.t.includes(first)) : undefined
        if (!hit) { missing.push(r[0]!); continue }
        ys.push(hit.b.y)
      }
      checked++
      if (missing.length) problems.push(`the typed row${missing.length > 1 ? 's' : ''} starting ${missing.slice(0, 4).map(q).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not on the page: fill the drawn rows with every typed row, in order`)
      else if (ys.some((y, k) => k > 0 && y < ys[k - 1]! - 4)) problems.push(`the rows of ${q(d.note.slice(0, 50))} are not in the typed order top to bottom: put them in the order typed`)
    }
    // 3) sample rows: N rows in the first cell's column and look
    if (d.total !== null && d.total > d.rows.length) {
      const first = norm(d.rows[0]![0]!)
      const hit = L.find((l) => l.t === first) ?? L.find((l) => first.length >= 3 && l.t.includes(first))
      checked++
      const said = L.find((l) => /\b(like (this|that|it)|more like)\b|^(x|×)\s?\d+$/.test(l.t))
      if (said) problems.push(`${q(said.x.text!.slice(0, 40))} is the count the person typed, printed as text: take it out (it asked for more rows, it is not copy)`)
      if (!hit) { problems.push(`the typed row starting ${q(d.rows[0]![0]!)} is not on the page: build it first, then ${String(d.total - d.rows.length)} sample rows like it`); continue }
      const fs = hit.x.style?.fontSize, fw = hit.x.style?.fontWeight
      const col = L.filter((l) => Math.abs(l.b.x - hit.b.x) <= 8 && (!fs || l.x.style?.fontSize === fs) && (!fw || l.x.style?.fontWeight === fw))
      const rowsY = [...new Set(col.map((l) => Math.round(l.b.y / 6)))]
      const look = L.filter((l) => (!fs || l.x.style?.fontSize === fs) && (!fw || l.x.style?.fontWeight === fw))
      const lookY = [...new Set(look.map((l) => Math.round(l.b.y / 6)))]
      if (rowsY.length < d.total && lookY.length >= d.total) problems.push(`${q(d.note.slice(0, 50))}: the ${String(d.total)} rows are there but not built like the first one (only ${String(rowsY.length)} start at its left edge, x ${String(Math.round(hit.b.x))}): give every row every part of the first row (the same icon, circle or picture before the name, the same button and side value at the end, the same look), so each name starts at x ${String(Math.round(hit.b.x))}; keep the sample words`)
      else if (rowsY.length < d.total) problems.push(`${q(d.note.slice(0, 50))} asked for ${String(d.total)} rows like the typed one; the page has ${String(rowsY.length)} in its column and look: add sample rows of the same kind (made-up values, varied) until there are ${String(d.total)}, at the same pitch`)
      else if (rowsY.length > d.total + 1) problems.push(`${q(d.note.slice(0, 50))} asked for ${String(d.total)} rows; the page has ${String(rowsY.length)}: keep exactly ${String(d.total)}`)
    }
  }
  if (!checked) return { satisfied: true, unverifiable: true, reason: 'nothing to check' }
  return problems.length
    ? { satisfied: false, reason: problems.slice(0, 5).join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(found.length)} row note${found.length > 1 ? 's' : ''} filled as data: cells apart, rows in order, counts kept` }
}

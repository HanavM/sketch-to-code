/**
 * n165: a table typed in open space under a drawn header rule, with row 1's cells drawn hanging under that rule.
 *
 * Round 42 e5 (gradebook, hand, n162): the sketcher drew a long line at y 242 (the table header's bottom rule), and
 * hanging under it a small grey ring at the left (row 1's avatar) and a pale green box at the right, 166x56 (row 1's
 * Average cell, tinted). The columns were typed as one note further down in open space: "table: Student, Lab 1, Lab 2,
 * Quiz, Project, Average; 7 made-up students ...". The reader took the ring and the box for "a toolbar (checkbox +
 * green button)", the build made a "Save Grades" button above the table and every row came out 70px low. A person
 * draws one row's distinctive cells and types the rest; the marks say where the table is, not new controls.
 *
 * From the drawing alone:
 * - TABLE: a placed note whose lead before a colon names a table or grid ("table:", "scores table:", "grid:") with
 *   2-10 columns after it (before any ';'). Typed in open space (no box of real size round it).
 * - RULE: the lowest long drawn line (at least 400px) above the note, spanning the note's x. Its y is the bottom of
 *   the header row; its x span is the table's.
 * - ROW 1: drawn marks under the rule, inside its span, above the note: a small ring or square
 *   (12-56px) at the left, its middle within 44px under the rule, is row 1's leading mark (an avatar, a checkbox), repeated on every row; a box 40-420px wide
 *   and 24-80px tall whose top hangs 0-14px under the rule is row 1's own CELL in the column at its x (its fill is that cell's tint), its height the row's.
 * - PITCH: the cell box's height, else the ring's height + 24; 36-72px. Row 1's middle is the marks' middle.
 * Told to the build in place of the typed spot (the marks are never buttons, a toolbar or anything above the table),
 * and checked on the page: the first column's header word sits just above the rule, and the drawn leading mark shows
 * at the left of (nearly) every row. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { checkRowMarks, smallMark } from './openrows.js'

interface ShapeLike { shape: string; box: BBox }
interface Spot { text: string; x: number; y: number }
interface NodeLike { rect: BBox; text?: string; textBox?: BBox; tag?: string }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface TableVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface TableCell { box: BBox; column: string; last: boolean }
export interface TableRows {
  /** the drawn header rule: y is the header row's bottom, x span the table's */
  rule: { x: number; y: number; w: number }
  columns: string[]
  /** row 1's middle */
  firstMid: number
  pitch: number
  /** rows the note asks for ("7 made-up students"), or null */
  rows: number | null
  /** row 1's leading mark (avatar, checkbox), on every row */
  mark?: BBox & { round?: boolean }
  /** row 1's drawn cells */
  cells: TableCell[]
  typedY: number
}

export const TABLE_HEADER_TOL_PX = 22
const r = Math.round
const LEAD = /^\s*([^:]{1,40}):\s*(.+)$/s
const TABLEY = /\b(table|grid|spreadsheet|columns?)\b/i

/** The columns a "table: A, B, C; ..." note names, and how many rows it asks for, or null. */
export function tableNote(text: string): { columns: string[]; rows: number | null } | null {
  const m = LEAD.exec(text)
  if (!m || !TABLEY.test(m[1]!)) return null
  const [head, ...rest] = m[2]!.split(';')
  const columns = head!.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean)
  if (columns.length < 2 || columns.length > 10 || columns.some((c) => c.split(/\s+/).length > 4)) return null
  const k = /\b(\d{1,2})\s+(?:[a-z-]+\s+)?(?:rows?|students|people|users|items|entries|records|orders|lines|[a-z]+s)\b/i.exec(rest.join(';'))
  const rows = k ? Number(k[1]) : null
  return { columns, rows: rows && rows >= 2 && rows <= 30 ? rows : null }
}

const inside = (b: BBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

export function tableRows(n: Spot, shapes: readonly ShapeLike[]): TableRows | null {
  const t = tableNote(n.text)
  if (!t) return null
  if (shapes.some((s) => s.shape === 'box' && s.box.w >= 60 && s.box.h >= 40 && inside(s.box, n))) return null
  const rule = shapes.filter((s) => s.shape === 'line' && s.box.w >= 400 && s.box.h <= 12 && s.box.y < n.y - 30 && n.x >= s.box.x - 20 && n.x <= s.box.x + s.box.w + 20)
    .sort((a, b) => b.box.y - a.box.y)[0]
  if (!rule) return null
  const R = rule.box
  const ry = R.y + R.h / 2
  const span = (s: ShapeLike) => s !== rule && s.box.y >= ry - 4 && s.box.y + s.box.h < n.y && s.box.x >= R.x - 20 && s.box.x + s.box.w <= R.x + R.w + 20
  // a cell hangs from the rule (top within 14px); a small mark sits centred in row 1 (middle within 44px under it)
  const ring = shapes.filter((s) => span(s) && smallMark(s) && s.box.x <= R.x + 120 && s.box.y + s.box.h / 2 <= ry + 44).sort((a, b) => a.box.x - b.box.x)[0]
  const boxes = shapes.filter((s) => span(s) && s !== ring && s.box.y <= ry + 14 && s.shape === 'box' && s.box.w >= 40 && s.box.w <= 420 && s.box.h >= 24 && s.box.h <= 80)
  if (!ring && !boxes.length) return null
  const tallest = boxes.map((b) => b.box.h).sort((a, b) => b - a)[0]
  const pitch = r(Math.max(36, Math.min(72, tallest ?? (ring!.box.h + 24))))
  const mids = [...(ring ? [ring] : []), ...boxes].map((s) => s.box.y + s.box.h / 2)
  const firstMid = r(mids.reduce((a, b) => a + b, 0) / mids.length)
  const right = R.x + R.w
  const cells = boxes.map((b): TableCell => {
    const B = b.box
    const last = right - (B.x + B.w) <= 30
    const firstCol = B.x - R.x <= 40
    // a cell at the right end is the last column's; at the left end the first's; else the column at its middle, by even slots
    const k = last ? t.columns.length - 1 : firstCol ? 0 : Math.min(t.columns.length - 1, Math.max(0, Math.floor(((B.x + B.w / 2) - R.x) / (R.w / t.columns.length))))
    return { box: { x: r(B.x), y: r(B.y), w: r(B.w), h: r(B.h) }, column: t.columns[k]!, last }
  })
  return { rule: { x: r(R.x), y: r(ry), w: r(R.w) }, columns: t.columns, firstMid, pitch, rows: t.rows, cells, typedY: n.y,
    ...(ring ? { mark: { x: r(ring.box.x), y: r(ring.box.y), w: r(ring.box.w), h: r(ring.box.h), ...(ring.shape === 'ellipse' ? { round: true } : {}) } } : {}) }
}

/** Mark each table note typed in open space with where its table is, from the drawn header rule and row 1's cells. */
export function markTableRows<T extends Spot & { table?: TableRows; openRows?: unknown }>(placed: T[], shapes: readonly ShapeLike[]): T[] {
  return placed.map((n) => {
    if (n.openRows) return n
    const t = tableRows(n, shapes)
    return t ? { ...n, x: t.rule.x + 8, y: t.firstMid, table: t } : n
  })
}

export function tableRowsBrief(notes: ReadonlyArray<Spot & { table?: TableRows }> | undefined): string {
  const each = (notes ?? []).filter((n) => n.table).map((n) => {
    const t = n.table!
    const end = t.rule.x + t.rule.w
    const parts = [
      `"${n.text}" was typed at y ${t.typedY} in open space, under the long line drawn at y ${t.rule.y} from x ${t.rule.x} to x ${end}. ` +
      `That line is the table's header rule: the header cells (${t.columns.join(', ')}) sit in one row just ABOVE it (their middle about y ${t.rule.y - 22}), ` +
      `the line under them, and the table spans x ${t.rule.x} to x ${end}, columns in that order, the last one ending at x ${end}. ` +
      `Row 1 starts right under the line: its middle at y ${t.firstMid}, rows about ${t.pitch}px tall${t.rows ? `, ${t.rows} rows` : ''}. ` +
      `Nothing goes between the header row and row 1, and nothing between the line above (tabs, title) and the header row but the table itself`,
    ]
    for (const c of t.cells) {
      parts.push(`the box drawn at (${c.box.x},${c.box.y}) ${c.box.w}x${c.box.h} hanging under the rule is row 1's own "${c.column}" cell` +
        `${c.last ? ' (the last column)' : ''}: the cell's place and height (its fill, if any, is that cell's background tint, as the note colours it per value). ` +
        `It is NOT a button, a toolbar, a badge or anything of its own, and nothing is built above the table for it; every row has a cell in that column`)
    }
    if (t.mark) {
      parts.push(`the small ${t.mark.round ? 'ring' : 'square'} drawn at (${t.mark.x},${t.mark.y}) ${t.mark.w}x${t.mark.h} is row 1's own leading mark in the "${t.columns[0]}" cell ` +
        `(an avatar or checkbox before the words), REPEATED at the left of every row in the same size and shape, the row's words just right of it; never a checkbox, ` +
        `button or control above the table`)
    }
    return parts.join('. ')
  })
  return each.length ? `A TABLE TYPED UNDER ITS DRAWN HEADER RULE (deterministic, from the drawing; checked on the page; this overrides any action that reads the drawn ring or box as a toolbar, checkbox or button): ${each.join('; ')}.\n\n` : ''
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()

/** On the page: the first column's header word sits just above the drawn rule, and the leading mark is on every row. */
export function verifyTableRule(notes: ReadonlyArray<Spot & { table?: TableRows }> | undefined, after: Snap): TableVerdict {
  const tables = (notes ?? []).filter((n) => n.table)
  if (!tables.length) return { satisfied: true, unverifiable: true, reason: 'no table typed under a drawn rule' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const n of tables) {
    const t = n.table!
    const want = norm(t.columns[0]!)
    if (want.length < 2) continue
    const head = (after.nodes ?? []).filter((x) => x.text && x.textBox && x.textBox.w > 0 && norm(x.text) === want &&
      x.textBox.x >= t.rule.x - 40 && x.textBox.x <= t.rule.x + t.rule.w / 2)
      .sort((a, b) => Math.abs(a.textBox!.y + a.textBox!.h / 2 - (t.rule.y - 22)) - Math.abs(b.textBox!.y + b.textBox!.h / 2 - (t.rule.y - 22)))[0]
    if (!head) continue
    judged++
    const bad: string[] = []
    const cy = head.textBox!.y + head.textBox!.h / 2
    const want0 = t.rule.y - 22
    if (cy > t.rule.y + 4 || Math.abs(cy - want0) > TABLE_HEADER_TOL_PX) {
      bad.push(`the header "${t.columns[0]}" sits at y ${r(cy)}, but its row sits just above the line drawn at y ${t.rule.y} (middle about y ${want0}): move the whole table ${cy > want0 ? 'up' : 'down'} ${r(Math.abs(cy - want0))}px` +
        ` and take out anything built between the line above and the table (a button or toolbar made from row 1's drawn cells)`)
    }
    if (t.mark) {
      const k = t.rows ?? 5
      const mk = checkRowMarks(t.mark, t.firstMid, t.pitch, k, after)
      if (mk) bad.push(mk)
    }
    if (bad.length) faults.push(`the table "${t.columns.slice(0, 3).join(', ')}...": ${bad.join('; and ')}`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'table header not found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only where the table sits and its row marks; not its copy or colours' }
    : { satisfied: true, reason: `${judged} table${judged > 1 ? 's' : ''} under ${judged > 1 ? 'their' : 'its'} drawn header rule` }
}

/**
 * n158: a rows note typed in open space (no card drawn round it) takes the width of the drawn field above it and
 * starts just under the last thing drawn.
 *
 * Round 41 e3 (to-do, hand, n150/n157): the "Add a task" field was drawn 640px wide (x 320 to 960), three filter
 * chips under it, a small checkbox at (320,313) for the first row, and the rows typed as one note in open space at
 * (640,480): "checkbox rows, dividers: Water the plants (done), Call the landlord, urgent orange right, ...". The note's
 * spot was told as where its words sit ("about y 480, centred near x 640"); one build made the list half the page
 * wide, another started it 18px low. In the target the rows run the field's full width, the first one level with the
 * drawn checkbox. A person types a long rows note wherever there is room; the drawing above says where the list goes.
 *
 * From the drawing alone:
 * - ROWS: a note typed where nothing is drawn, with a lead ending in a colon that names rows or a list ("checkbox
 *   rows, dividers:", "tasks:") and 2-12 items after it (an item starting in lower case, "urgent orange right", is
 *   a look for the item before it, not a row of its own).
 * - FIELD: the nearest drawn box above it, at least 280px wide, spanning the note's x. The rows take its x span.
 * - START: just under the lowest thing drawn between the field's top and the note, in the field's span (+16px);
 *   when that lowest thing is a small square or ring (12-56px) at the field's left, it is row 1's own mark and the
 *   first row's middle is level with it.
 * - PITCH: when a note is typed under the note (a footer), the rows end about 34px above it; else 52px. 36-72px.
 * Told to the build in place of the typed spot, and checked on the page: the first row's words near the start and
 * the row they sit in at least 85% of the field's width. Zero tokens.
 */
import type { BBox } from '@s2c/ink'

interface ShapeLike { shape: string; box: BBox }
interface Spot { text: string; x: number; y: number }
interface NodeLike { rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface OpenRowsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export interface OpenRows {
  /** the field drawn above, whose x span the rows take */
  field: BBox
  /** where the note was typed */
  typedY: number
  /** first row's middle, px */
  firstMid: number
  pitch: number
  rows: number
  first: string
  /** what set the start: a drawn mark for row 1, or the last thing drawn */
  by: 'mark' | 'last'
}

export const OPEN_START_TOL_PX = 26
export const OPEN_WIDTH_SHARE = 0.85
const r = Math.round
const LEAD = /^\s*([^:]{1,48}):\s*(.+)$/s
const LISTY = /\b(rows?|list|items?|tasks?|todos?|entries|lines|checkbox(?:es)?|checklist)\b/i

/** The rows a lead-and-colon note gives in open space, or null. */
export function openRowItems(text: string): string[] | null {
  const m = LEAD.exec(text)
  if (!m || !LISTY.test(m[1]!)) return null
  const parts = m[2]!.split(';')[0]!.split(/\s*,\s+/).map((s) => s.trim()).filter(Boolean)
  const caps = parts.filter((p) => /^[\p{Lu}\p{N}#$£€"'“]/u.test(p))
  // lower-case items are looks for the item before ("urgent orange right"), unless nothing is capitalised
  const items = caps.length >= 2 ? caps : parts
  return items.length >= 2 && items.length <= 12 ? items : null
}

const inside = (b: BBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
const xOver = (a: BBox, x0: number, x1: number) => Math.min(a.x + a.w, x1) - Math.max(a.x, x0) > 0

/** Every rows note typed in open space, with where its rows go. */
export function openRows(placed: readonly Spot[], shapes: readonly ShapeLike[], notes: readonly Spot[]): Map<Spot, OpenRows> {
  const out = new Map<Spot, OpenRows>()
  for (const n of placed) {
    const items = openRowItems(n.text)
    if (!items) continue
    // open space: no drawn box of real size round it
    if (shapes.some((s) => s.shape === 'box' && s.box.w >= 60 && s.box.h >= 40 && inside(s.box, n))) continue
    const field = shapes.filter((s) => s.shape === 'box' && s.box.w >= 280 && s.box.y + s.box.h < n.y && n.x >= s.box.x - 20 && n.x <= s.box.x + s.box.w + 20)
      .sort((a, b) => (b.box.y + b.box.h) - (a.box.y + a.box.h))[0]
    if (!field) continue
    const F = field.box
    // everything drawn under the field's top and above the note, in its span
    const between = shapes.filter((s) => s !== field && s.box.y >= F.y - 4 && s.box.y + s.box.h < n.y && xOver(s.box, F.x, F.x + F.w))
    // another note typed between the last drawn thing and this note is copy there: leave it alone
    const lowest = between.sort((a, b) => (b.box.y + b.box.h) - (a.box.y + a.box.h))[0] ?? field
    const lb = lowest.box
    if (notes.some((o) => o.text !== n.text && o.y > lb.y + lb.h + 8 && o.y < n.y - 8 && o.x >= F.x - 20 && o.x <= F.x + F.w + 20)) continue
    const small = lowest !== field && (lowest.shape === 'box' || lowest.shape === 'ellipse') && lb.w >= 12 && lb.w <= 56 && lb.h >= 12 && lb.h <= 56 &&
      Math.abs(lb.w - lb.h) <= 0.3 * Math.max(lb.w, lb.h) && lb.x <= F.x + 60
    const foot = notes.filter((o) => o.text !== n.text && o.y > n.y + 20 && o.x >= F.x - 20 && o.x <= F.x + F.w + 20).sort((a, b) => a.y - b.y)[0]
    const k = items.length
    let pitch = 52
    let firstMid: number
    if (small) {
      firstMid = r(lb.y + lb.h / 2)
      if (foot) pitch = (foot.y - 34 - firstMid) / (k - 0.5)
    } else {
      const start = lb.y + lb.h + 16
      if (foot) pitch = (foot.y - 34 - start) / k
      pitch = Math.max(36, Math.min(72, pitch))
      firstMid = r(start + pitch / 2)
    }
    pitch = r(Math.max(36, Math.min(72, pitch)))
    if (n.y < firstMid - 20) continue // typed above where the rows go: nothing to move
    out.set(n, { field: { x: r(F.x), y: r(F.y), w: r(F.w), h: r(F.h) }, typedY: n.y, firstMid, pitch, rows: k, first: items[0]!, by: small ? 'mark' : 'last' })
  }
  return out
}

/** Place each open rows note at its first row (left edge of the field), and keep what was found on it. */
export function markOpenRows<T extends Spot & { openRows?: OpenRows }>(placed: T[], shapes: readonly ShapeLike[], notes: readonly Spot[]): T[] {
  const found = openRows(placed, shapes, notes)
  return placed.map((n) => {
    const o = found.get(n)
    return o ? { ...n, x: o.field.x + 8, y: o.firstMid, openRows: o } : n
  })
}

export function openRowsBrief(notes: ReadonlyArray<Spot & { openRows?: OpenRows }> | undefined): string {
  const each = (notes ?? []).filter((n) => n.openRows).map((n) => {
    const o = n.openRows!
    const end = r(o.firstMid + (o.rows - 0.5) * o.pitch)
    return `"${n.text}" (${o.rows} rows) was typed in open space at y ${o.typedY}, under the field drawn at (${o.field.x},${o.field.y}) ${o.field.w}x${o.field.h}. ` +
      `The rows run that field's FULL width: every row from x ${o.field.x} to x ${o.field.x + o.field.w} (its dividers too), never a narrower or centred column. ` +
      `${o.by === 'mark' ? 'The small mark drawn at the field\'s left under the last controls is row 1\'s own mark: ' : 'They start just under the last thing drawn: '}` +
      `the first row's middle is at y ${o.firstMid}, rows about ${o.pitch}px apart, so the last ends by about y ${end + r(o.pitch / 2)}. Not at the note's typed spot`
  })
  return each.length ? `ROWS TYPED IN OPEN SPACE (deterministic, from the drawing above them; checked on the page): ${each.join('; ')}.\n\n` : ''
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim()

export function verifyOpenRows(notes: ReadonlyArray<Spot & { openRows?: OpenRows }> | undefined, after: Snap): OpenRowsVerdict {
  const lists = (notes ?? []).filter((n) => n.openRows)
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no rows typed in open space' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const n of lists) {
    const o = n.openRows!
    const F = o.field
    const want = norm(o.first)
    if (want.length < 3) continue
    const cands = (after.nodes ?? []).filter((x) => x.text && x.textBox && x.textBox.w > 0 && x.textBox.h > 0 && x.textBox.y > F.y + F.h - 4 &&
      x.textBox.x + x.textBox.w / 2 >= F.x - 20 && x.textBox.x + x.textBox.w / 2 <= F.x + F.w + 20)
    const first = cands.filter((x) => { const t = norm(x.text!); return t === want || (t.length >= 4 && (t.startsWith(want) || want.startsWith(t + ' '))) })
      .sort((a, b) => a.textBox!.h - b.textBox!.h || a.textBox!.y - b.textBox!.y)[0]
    if (!first) continue
    judged++
    const tb = first.textBox!
    const cy = tb.y + tb.h / 2
    // the row it sits in: the widest box round its middle that is no taller than two rows
    const row = (after.nodes ?? []).filter((x) => x.rect.w > 0 && x.rect.h > 0 && x.rect.h <= 2 * o.pitch && x.rect.y <= cy && x.rect.y + x.rect.h >= cy &&
      x.rect.x <= tb.x + 2 && x.rect.x + x.rect.w >= tb.x + tb.w - 2 && x.rect.x >= F.x - 40 && x.rect.x + x.rect.w <= F.x + F.w + 40)
      .sort((a, b) => b.rect.w - a.rect.w)[0]
    const bad: string[] = []
    if (Math.abs(cy - o.firstMid) > OPEN_START_TOL_PX) bad.push(`its middle is at y ${r(cy)}, not y ${o.firstMid}: move the rows ${cy > o.firstMid ? 'up' : 'down'} ${r(Math.abs(cy - o.firstMid))}px, rows about ${o.pitch}px apart`)
    if (row && row.rect.w < OPEN_WIDTH_SHARE * F.w) bad.push(`its row is ${r(row.rect.w)}px wide (x ${r(row.rect.x)} to ${r(row.rect.x + row.rect.w)}), but the rows run the drawn field's width: make every row x ${F.x} to ${F.x + F.w}`)
    if (bad.length) faults.push(`the first row "${o.first}": ${bad.join('; and ')}`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'first open row not found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only where the rows start, their spacing and width; not their copy or colours' }
    : { satisfied: true, reason: `${judged} open list${judged > 1 ? 's' : ''} under ${judged > 1 ? 'their fields' : 'its field'}, full width` }
}

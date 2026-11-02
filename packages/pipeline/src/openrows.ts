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
  /** n114: the small ring or square drawn for row 1, repeated on every row (n167: hollow = its pen colour when drawn with no tap) */
  mark?: BBox & { hollow?: string; round?: boolean }
  /** n114: no field drawn: the rows are led by the mark alone and run to the page's margin */
  led?: boolean
  /** n166: no field drawn: a column of like boxes down the left leads the rows (one picture per row), a panel on the right ends them */
  column?: { x: number; w: number; h: number; boxes: number; panelX?: number }
  /** n172: a control drawn inside row 1's band (a stepper), repeated on every row; its note's own words and per-row values */
  controls?: RowControl[]
  /** n249: the field is a band across the whole page, so the rows' first cells start where the note was typed */
  startX?: number
}

export interface RowControl { x: number; y: number; w: number; h: number; label?: string; values?: string[] }

export const OPEN_START_TOL_PX = 26
export const OPEN_WIDTH_SHARE = 0.85
const r = Math.round
const LEAD = /^\s*([^:]{1,48}):\s*(.+)$/s
const LISTY = /\b(rows?|list|items?|tasks?|todos?|entries|lines|checkbox(?:es)?|checklist)\b/i

/** The rows a lead-and-colon note gives in open space, or null. */
export function openRowItems(text: string): string[] | null {
  const m = LEAD.exec(text)
  if (!m || !LISTY.test(m[1]!)) return null
  // n166: rows given whole, one per ';' (Linen throw, Sand, $89; Stoneware mug, Sage, $48; dividers): each capitalised
  // segment with its own commas is a row; a lower-case segment (dividers) is a look for the list
  const segs = m[2]!.split(';').map((s) => s.trim()).filter(Boolean)
  const rowSegs = segs.filter((s) => /^[\p{Lu}\p{N}#$£€"'“]/u.test(s))
  if (rowSegs.length >= 2 && rowSegs.length <= 12 && rowSegs.every((s) => /,\s/.test(s))) return rowSegs
  const parts = m[2]!.split(';')[0]!.split(/\s*,\s+/).map((s) => s.trim()).filter(Boolean)
  const caps = parts.filter((p) => /^[\p{Lu}\p{N}#$£€"'“]/u.test(p))
  // lower-case items are looks for the item before ("urgent orange right"), unless nothing is capitalised
  const items = caps.length >= 2 ? caps : parts
  return items.length >= 2 && items.length <= 12 ? items : null
}

const inside = (b: BBox, p: { x: number; y: number }) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
const xOver = (a: BBox, x0: number, x1: number) => Math.min(a.x + a.w, x1) - Math.max(a.x, x0) > 0

/** Every rows note typed in open space, with where its rows go. */
export function openRows(placed: readonly Spot[], shapes: readonly ShapeLike[], notes: readonly Spot[], viewW = 1280): Map<Spot, OpenRows> {
  const out = new Map<Spot, OpenRows>()
  for (const n of placed) {
    const items = openRowItems(n.text)
    if (!items) continue
    // open space: no drawn box of real size round it
    if (shapes.some((s) => s.shape === 'box' && s.box.w >= 60 && s.box.h >= 40 && inside(s.box, n))) continue
    const field = shapes.filter((s) => s.shape === 'box' && s.box.w >= 280 && s.box.y + s.box.h < n.y && n.x >= s.box.x - 20 && n.x <= s.box.x + s.box.w + 20)
      .sort((a, b) => (b.box.y + b.box.h) - (a.box.y + a.box.h))[0]
    if (!field) {
      const led = ringLed(n, items.length, shapes, notes, viewW) ?? columnLed(n, items, shapes, viewW, notes)
      if (led) out.set(n, led)
      continue
    }
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
    out.set(n, { field: { x: r(F.x), y: r(F.y), w: r(F.w), h: r(F.h) }, typedY: n.y, firstMid, pitch, rows: k, first: items[0]!.split(/\s*,\s+/)[0]!, by: small ? 'mark' : 'last',
      ...(small ? { mark: { x: r(lb.x), y: r(lb.y), w: r(lb.w), h: r(lb.h), ...(lowest.shape === 'ellipse' ? { round: true } : {}) } } : {}) })
  }
  return out
}

/** A small ring or square (12-56px, about as wide as tall): a row's own mark when it leads a list. */
export const smallMark = (s: ShapeLike) => (s.shape === 'ellipse' || s.shape === 'box') && s.box.w >= 12 && s.box.w <= 56 && s.box.h >= 12 && s.box.h <= 56 &&
  Math.abs(s.box.w - s.box.h) <= 0.3 * Math.max(s.box.w, s.box.h)

/**
 * n114: no wide field drawn above, but a lone small ring drawn above the note and to its left, with nothing drawn
 * between: that ring is row 1's own mark (round 42 e1 podcast: a hollow ring at (308,343) under "Latest episodes", the
 * rows typed at (760,460); the build made the ring a play button above row 1). The rows start level with it, run from
 * its left to the page's right with the same margin it keeps from the panel or edge on its left, and carry the ring.
 */
function ringLed(n: Spot, k: number, shapes: readonly ShapeLike[], notes: readonly Spot[], viewW: number): OpenRows | null {
  const ring = shapes.filter((s) => smallMark(s) && s.box.y + s.box.h < n.y - 8 && s.box.y + s.box.h > n.y - 320 && s.box.x + s.box.w < n.x)
    .sort((a, b) => (b.box.y + b.box.h) - (a.box.y + a.box.h))[0]
  if (!ring) return null
  const R = ring.box
  const x1 = Math.max(n.x + 200, R.x + 400)
  // nothing else drawn between the ring and the note, and no other note typed there (that would be copy in that space)
  if (shapes.some((s) => s !== ring && s.box.w >= 8 && s.box.y > R.y + R.h - 4 && s.box.y < n.y && xOver(s.box, R.x, x1) &&
    !(s.box.w >= 60 && s.box.h >= 40 && inside(s.box, n)))) return null
  if (notes.some((o) => o.text !== n.text && o.y > R.y + 8 && o.y < n.y - 8 && o.x >= R.x - 20 && o.x <= x1)) return null
  // another small mark level with it on the left of the same row band: it is a row of icons, not a list's lead
  if (shapes.some((s) => s !== ring && smallMark(s) && Math.abs((s.box.y + s.box.h / 2) - (R.y + R.h / 2)) < 12 && Math.abs(s.box.x - R.x) < 200)) return null
  const cy = R.y + R.h / 2
  const left = Math.max(0, ...shapes.filter((s) => s !== ring && s.box.w >= 60 && s.box.x + s.box.w <= R.x + 4 && s.box.y <= cy && s.box.y + s.box.h >= cy)
    .map((s) => s.box.x + s.box.w))
  const margin = Math.max(16, R.x - left)
  const right = viewW - margin
  if (right - R.x < 280) return null
  const firstMid = r(cy)
  if (n.y < firstMid + 20) return null
  const foot = notes.filter((o) => o.text !== n.text && o.y > n.y + 20 && o.x >= R.x - 20 && o.x <= right).sort((a, b) => a.y - b.y)[0]
  // the note typed in the list's middle: rows spread so it sits about half way down them
  const pitch = r(Math.max(40, Math.min(72, foot ? (foot.y - 34 - firstMid) / (k - 0.5) : (2 * (n.y - firstMid)) / Math.max(1, k - 1))))
  const items = openRowItems(n.text)!
  return { field: { x: r(R.x), y: r(R.y), w: r(right - R.x), h: 0 }, typedY: n.y, firstMid, pitch, rows: k, first: items[0]!.split(/\s*,\s+/)[0]!, by: 'mark', led: true,
    mark: { x: r(R.x), y: r(R.y), w: r(R.w), h: r(R.h), ...(ring.shape === 'ellipse' ? { round: true } : {}) } }
}

/**
 * n166: no field drawn above, but a column of like boxes drawn down the left of the note (a picture per row) and,
 * maybe, a panel drawn to its right. Round 42 e3 (cart, n162): three 96px thumbs at x 60, rows typed at (420,330),
 * a stepper drawn at x 544-648 and the summary panel from x 820; the build ran the rows only to x 660 (price at 636),
 * where the target's rows run up to the panel (price at 736, dividers to 750). The column says where rows start and
 * how far apart; the panel on the right says where they end: about the column's own left margin short of it (at most
 * 60px), or, with no panel, the same margin from the page's right edge.
 */
function columnLed(n: Spot, items: string[], shapes: readonly ShapeLike[], viewW: number, notes: readonly Spot[] = []): OpenRows | null {
  const cands = shapes.filter((s) => s.shape === 'box' && s.box.w >= 24 && s.box.w <= 180 && s.box.h >= 24 && s.box.h <= 180 && s.box.x + s.box.w < n.x)
  let best: ShapeLike[] = []
  for (const a of cands) {
    const like = cands.filter((b) => Math.abs(b.box.x - a.box.x) <= 16 && Math.abs(b.box.w - a.box.w) <= 0.25 * a.box.w && Math.abs(b.box.h - a.box.h) <= 0.25 * a.box.h)
      .sort((p, q) => p.box.y - q.box.y)
    // stacked, not overlapping
    if (like.some((b, i) => i > 0 && b.box.y < like[i - 1]!.box.y + like[i - 1]!.box.h - 4)) continue
    if (like.length > best.length) best = like
  }
  if (best.length < 2) return null
  const top = best[0]!.box
  const bot = best[best.length - 1]!.box
  // the note is typed beside the column, between its first and last box (give or take a box)
  if (n.y < top.y - 40 || n.y > bot.y + bot.h + 40) return null
  const k = items.length
  if (Math.abs(best.length - k) > 1) return null
  const mids = best.map((b) => b.box.y + b.box.h / 2)
  const gaps = mids.slice(1).map((m, i) => m - mids[i]!).sort((a, b) => a - b)
  const pitch = r(gaps[Math.floor(gaps.length / 2)]!)
  if (pitch < 36 || pitch > 220) return null
  const firstMid = r(mids[0]!)
  const left = top.x
  const margin = Math.max(16, Math.min(60, left))
  const y0 = top.y
  const y1 = bot.y + bot.h
  // the nearest wide box drawn to the right that shares the rows' height: the rows end short of it
  const panel = shapes.filter((s) => s.shape === 'box' && s.box.w >= 120 && s.box.x > n.x && s.box.y < y1 && s.box.y + s.box.h > y0)
    .sort((a, b) => a.box.x - b.box.x)[0]
  const right = panel ? panel.box.x - margin : viewW - margin
  if (right - left < 280) return null
  const controls = rowControls(top, left + top.w, right, best, shapes, notes, items)
  return { field: { x: r(left), y: r(y0 - 4), w: r(right - left), h: 0 }, typedY: n.y, firstMid, pitch, rows: k,
    first: items[0]!.split(/\s*,\s+/)[0]!, by: 'mark', column: { x: r(left), w: r(top.w), h: r(top.h), boxes: best.length, ...(panel ? { panelX: r(panel.box.x) } : {}) },
    ...(controls.length ? { controls } : {}) }
}

/**
 * n172: a small box drawn inside row 1's band, between its picture and the rows' right end, is a control every row has
 * (round 42 e3 cart, n162: a stepper drawn at (544,230) 104x40 on row 1 only, noted "− 1 + (mug 2)"; every build put
 * one stepper on one row, the target has one on each). A person draws a repeated control once. Its note's words are the
 * control's look; a "(name value)" at its end gives that row its own value, the rest keep the note's own value.
 */
export function rowControls(top: BBox, x0: number, x1: number, column: readonly ShapeLike[], shapes: readonly ShapeLike[], notes: readonly Spot[], items: readonly string[]): RowControl[] {
  const out: RowControl[] = []
  for (const s of shapes) {
    const b = s.box
    if (s.shape !== 'box' || column.includes(s)) continue
    if (b.w < 32 || b.w > 260 || b.h < 14 || b.h > 80 || b.h > top.h) continue
    const cy = b.y + b.h / 2
    if (cy < top.y || cy > top.y + top.h || b.x < x0 + 40 || b.x + b.w > x1) continue
    const note = notes.find((o) => o.x >= b.x - 12 && o.x <= b.x + b.w + 12 && o.y >= b.y - 30 && o.y <= b.y + b.h + 30)
    const c: RowControl = { x: r(b.x), y: r(b.y), w: r(b.w), h: r(b.h) }
    if (note) {
      const m = /^(.*?)\s*\(([^()]+?)\s+(\S+)\)\s*$/.exec(note.text.trim())
      const label = (m ? m[1]! : note.text).trim()
      c.label = label
      const own = /\d+/.exec(label)?.[0]
      if (own) {
        const values = items.map(() => own)
        if (m) {
          const who = m[2]!.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
          const i = items.findIndex((it) => who.length > 0 && who.every((w) => it.toLowerCase().includes(w)))
          if (i >= 0) values[i] = m[3]!
        }
        c.values = values
      }
    }
    out.push(c)
  }
  return out
}

/** n172: told: the control drawn on row 1 is on every row, at the same x, each row with its own value. */
export function rowControlWords(c: RowControl, firstMid: number, pitch: number, items: readonly string[]): string {
  const mids = items.map((_, i) => r(firstMid + i * pitch))
  const vals = c.values ? `; each shows its own value: ${items.map((it, i) => `"${it.split(/\s*,\s+/)[0]}" ${c.values![i]}`).join(', ')}` : ''
  return `The control drawn at (${c.x},${c.y}) ${c.w}x${c.h} inside row 1's band${c.label ? `, noted "${c.label}"` : ''}, is a control EVERY row has: ` +
    `build the same control (same size, same look) at x ${c.x} to ${c.x + c.w} on each of the ${items.length} rows, middles at y ${mids.join(', ')}${vals}. ` +
    `Never on one row only, and never a plain empty box`
}

/** n172: on the page, the row control shows on (nearly) every row: a box near its size and x in each row's band. */
export function checkRowControls(c: RowControl, firstMid: number, pitch: number, rows: number, after: Snap): string | null {
  const mx = c.x + c.w / 2
  const hit = new Set<number>()
  for (const x of after.nodes ?? []) {
    const b = x.rect
    if (!(b.w >= 0.5 * c.w && b.w <= 1.8 * c.w && b.h >= 0.5 * c.h && b.h <= 2 * c.h)) continue
    if (Math.abs(b.x + b.w / 2 - mx) > Math.max(48, 0.6 * c.w)) continue
    const i = Math.round((b.y + b.h / 2 - firstMid) / pitch)
    if (i >= 0 && i < rows && Math.abs(b.y + b.h / 2 - (firstMid + i * pitch)) <= 0.45 * pitch) hit.add(i)
  }
  if (hit.size >= Math.max(2, rows - (rows > 3 ? 1 : 0))) return null
  return `the control drawn at (${c.x},${c.y}) on row 1${c.label ? ` ("${c.label}")` : ''} shows on only ${hit.size} of the ${rows} rows: put the same control at x ${c.x} to ${c.x + c.w} on EVERY row ` +
    `(middles about y ${firstMid}, ${firstMid + pitch}, ...)${c.values ? `, values ${c.values.join(', ')} in row order` : ''}`
}

/** n114: the build is told a row's drawn mark is on every row, at its left, and is no element of its own. */
export function rowMarkWords(m: BBox & { hollow?: string; round?: boolean }, firstMid: number, rows: number): string {
  const look = m.hollow
    ? `a HOLLOW ring: a thin ${m.hollow} outline, border-radius 50%, its inside the row's own background, NEVER a filled or solid disc, on every row alike`
    : 'same size, shape, colour, hollow or filled as drawn'
  return `The small mark drawn at (${m.x},${m.y}) ${m.w}x${m.h} is row 1's OWN leading mark, not an element of its own: ` +
    `build it inside row 1 at the row's left, its middle level with the row's words (y ${firstMid}), and REPEAT the same mark (same size and place; ${look}) ` +
    `at the left of each of the ${rows} rows, with each row's words starting just right of it. Never a separate button, ` +
    `icon or dot above, beside or on top of the rows, and never on the row's words`
}

/**
 * n114: on the page, the drawn row mark sits at the left of (nearly) every row: count rows with a small near-square box
 * whose middle is near the mark's x and inside that row's band. Null when it holds.
 */
export function checkRowMarks(m: BBox, firstMid: number, pitch: number, rows: number, after: Snap): string | null {
  const mx = m.x + m.w / 2
  const hit = new Set<number>()
  for (const x of after.nodes ?? []) {
    const b = x.rect
    if (!(b.w >= 0.5 * m.w && b.w <= 2 * m.w + 8 && b.h >= 0.5 * m.h && b.h <= 2 * m.h + 8 && Math.abs(b.w - b.h) <= 0.35 * Math.max(b.w, b.h))) continue
    if (Math.abs(b.x + b.w / 2 - mx) > Math.max(40, m.w)) continue
    const i = Math.round((b.y + b.h / 2 - firstMid) / pitch)
    if (i >= 0 && i < rows && Math.abs(b.y + b.h / 2 - (firstMid + i * pitch)) <= 0.45 * pitch) hit.add(i)
  }
  if (hit.size >= Math.max(2, rows - 1)) return null
  return `the mark drawn at (${m.x},${m.y}) for row 1 shows at the left of only ${hit.size} of the ${rows} rows: put the same small mark at the left of every row ` +
    `(middles about y ${firstMid}, ${firstMid + pitch}, ...), the row's words right of it, and no separate copy of it above the rows`
}

/** Place each open rows note at its first row (left edge of the field), and keep what was found on it. */
export function markOpenRows<T extends Spot & { openRows?: OpenRows }>(placed: T[], shapes: readonly ShapeLike[], notes: readonly Spot[], viewW = 1280): T[] {
  const found = openRows(placed, shapes, notes, viewW)
  return placed.map((n) => {
    const o = found.get(n)
    if (!o) return n
    // n249 (rota, n250): a band across the whole page says nothing about the rows' left edge; with no mark or column to go by, the spot typed does
    if (!o.mark && !o.column && !o.led && o.field.w >= 0.9 * viewW && n.x >= o.field.x + START_MIN_PX && n.x <= o.field.x + START_MAX_PX) o.startX = n.x
    // n249 (rota): look-alike boxes drawn one under another beside the rows, as many as the rows, say the pitch: a row's words stand level with its box
    if (o.startX != null) {
      const step = besideBoxes(n, o.rows, shapes)
      if (step) { o.pitch = step.pitch; o.firstMid = Math.abs(n.y - step.mid) <= 30 ? n.y : step.mid }
    }
    return { ...n, x: o.startX ?? o.field.x + 8, y: o.firstMid, openRows: o }
  })
}

/** Boxes to the right of a note, one per row and evenly stepped down from about its height: the pitch and the first box's middle. */
function besideBoxes(n: Spot, rows: number, shapes: readonly ShapeLike[]): { pitch: number; mid: number } | null {
  const boxes = shapes.filter((s) => s.shape === 'box' && s.box.x > n.x && s.box.h >= 16 && s.box.h <= 120 && s.box.y + s.box.h >= n.y - 40).sort((a, b) => a.box.y - b.box.y)
  if (boxes.length !== rows || rows < 2) return null
  const tops = boxes.map((b) => b.box.y + b.box.h / 2)
  if (Math.abs(tops[0]! - n.y) > 60) return null
  const pitch = (tops[rows - 1]! - tops[0]!) / (rows - 1)
  if (pitch < 24 || tops.some((t, k) => Math.abs(t - (tops[0]! + k * pitch)) > 0.12 * pitch)) return null
  return { pitch: r(pitch), mid: r(tops[0]!) }
}

const START_MIN_PX = 24
const START_MAX_PX = 120
export const OPEN_START_X_TOL_PX = 16

export function openRowsBrief(notes: ReadonlyArray<Spot & { openRows?: OpenRows }> | undefined): string {
  const each = (notes ?? []).filter((n) => n.openRows).map((n) => {
    const o = n.openRows!
    const end = r(o.firstMid + (o.rows - 0.5) * o.pitch)
    if (o.column) {
      const c = o.column
      return `"${n.text}" (${o.rows} rows) was typed in open space at y ${o.typedY}, beside the column of ${c.boxes} like boxes drawn at x ${c.x} (${c.w}x${c.h} each): ` +
        `each box is its row's own picture, at the row's left. Row 1's middle is at y ${o.firstMid}, rows ${o.pitch}px apart (box to box), each row's words just right of its box. ` +
        `Every row runs from x ${o.field.x} to x ${o.field.x + o.field.w}${c.panelX != null ? ` (just short of the panel drawn at x ${c.panelX})` : ' (the same margin on the right as on the left)'}, its dividers too, ` +
        `never a narrower column: the row's last value (a price, a total, a time) sits at its RIGHT end, right-aligned to x ${o.field.x + o.field.w}. ` +
        `Anything drawn inside a row's band (a control between the words and the end) stays where it was drawn, on every row. Not at the note's typed spot` +
        (o.controls ?? []).map((c) => `. ${rowControlWords(c, o.firstMid, o.pitch, openRowItems(n.text) ?? [])}`).join('')
    }
    return `"${n.text}" (${o.rows} rows) was typed in open space at y ${o.typedY}, ${o.led ? `under a lone small mark drawn at (${o.mark!.x},${o.mark!.y}) with nothing else drawn between: the list starts there. Every row runs from x ${o.field.x} to x ${o.field.x + o.field.w} (the same margin on the right as the mark keeps on its left)` : `under the field drawn at (${o.field.x},${o.field.y}) ${o.field.w}x${o.field.h}`}. ` +
      (o.startX != null
        ? `Each row's dividers run the field's full width, x ${o.field.x} to x ${o.field.x + o.field.w}, but the first cell of every row STARTS at x ${o.startX}, where the note was typed; each cell's element is only as wide as its own words (a tap on a name picks that name), never a box the width of the row with padding pushing its words in. `
        : `The rows run that field's FULL width: every row from x ${o.field.x} to x ${o.field.x + o.field.w} (its dividers too), never a narrower or centred column. `) +
      `${o.by === 'mark' ? 'The small mark drawn at the field\'s left under the last controls is row 1\'s own mark: ' : 'They start just under the last thing drawn: '}` +
      `the first row's middle is at y ${o.firstMid}, rows about ${o.pitch}px apart, so the last ends by about y ${end + r(o.pitch / 2)}. Not at the note's typed spot` +
      (o.mark ? `. ${rowMarkWords(o.mark, o.firstMid, o.rows)}` : '')
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
    if (o.startX != null && Math.abs(tb.x - o.startX) > OPEN_START_X_TOL_PX) bad.push(`its words start at x ${r(tb.x)}, not x ${o.startX} where the rows were typed: start every row's first cell at x ${o.startX}`)
    if (o.startX == null && row && row.rect.w < OPEN_WIDTH_SHARE * F.w) bad.push(`its row is ${r(row.rect.w)}px wide (x ${r(row.rect.x)} to ${r(row.rect.x + row.rect.w)}), but the rows run the drawn field's width: make every row x ${F.x} to ${F.x + F.w}`)
    const mk = o.mark ? checkRowMarks(o.mark, o.firstMid, o.pitch, o.rows, after) : null
    if (mk) bad.push(mk)
    for (const c of o.controls ?? []) { const ck = checkRowControls(c, o.firstMid, o.pitch, o.rows, after); if (ck) bad.push(ck) }
    if (bad.length) faults.push(`the first row "${o.first}": ${bad.join('; and ')}`)
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'first open row not found on the page' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only where the rows start, their spacing and width; not their copy or colours' }
    : { satisfied: true, reason: `${judged} open list${judged > 1 ? 's' : ''} under ${judged > 1 ? 'their fields' : 'its field'}, full width` }
}

/** n168: a list's heading: a short note typed in open space just above an open rows list. */
export const HEADING_LEFT_TOL_PX = 14

/**
 * n168: a short heading typed in open space just above a list lines up with the list's left edge.
 *
 * Round 42 e1 (podcast, n162/n167): "Latest episodes" was typed at (365,291), over a ring drawn at (308,326) that leads
 * the rows typed below. A person types a heading's note a little right of where its words start (the chip's grip
 * sits left of the text); it was told "starting near x 365" and built about 60px right of the rows' left edge. In
 * the target a list heading starts exactly where the list does. From the drawing alone: a placed note of four words or
 * fewer, no colon, not itself a list, whose spot is 16-120px above the list's first row middle, within 200px right of
 * (or 40px left of) the list's left edge, and in the list's left half. Its words start at the list's left edge (the
 * row mark's left, or the field's). Told and checked on the page (left edge within 14px). Zero tokens.
 */
export function alignListHeadings<T extends Spot & { openRows?: OpenRows; leftAt?: number }>(placed: T[]): T[] {
  const lists = placed.filter((n) => n.openRows)
  if (!lists.length) return placed
  return placed.map((n) => {
    if (n.openRows || n.text.includes(':') || openRowItems(n.text)) return n
    const words = n.text.trim().split(/\s+/).length
    if (words < 1 || words > 4) return n
    const L = lists.map((l) => l.openRows!).filter((o) => {
      const above = o.firstMid - n.y
      return above >= 16 && above <= 120 && n.x >= o.field.x - 40 && n.x <= o.field.x + 200 && n.x < o.field.x + o.field.w / 2
    }).sort((a, b) => (a.firstMid - n.y) - (b.firstMid - n.y))[0]
    if (!L || Math.abs(n.x - L.field.x) <= 4) return n
    return { ...n, x: L.field.x, leftAt: L.field.x }
  })
}

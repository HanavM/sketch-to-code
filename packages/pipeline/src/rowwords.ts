/**
 * Look-alike rows keep their own words (n69).
 *
 * Round 34 e1 (recipe): five checkboxes, each ingredient typed beside its box. The build made one row
 * component and repeated one note's words ("Garlic clove" x3 for parsley, garlic and olive oil). Round 34 e4
 * (helpdesk): three chat bubbles, each message typed inside its bubble; the first message filled every bubble,
 * and a fix invented new messages. Nothing told the build that marks which look alike still carry different
 * words, and nothing checked it.
 *
 * Here every box or ring with a note of its own records that note (`own`). Like-sized closed marks chained
 * close together, two or more with different words, are a list: codegen is told each item's exact words in
 * drawn order, and the page is checked: each mark has its own words beside or inside it (not a sibling's, not
 * made up). The fix names every row and its words. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { wordsOf } from './ownwords.js'
import { copyWords } from './linespan.js'
import { noteParts } from './typedcopy.js'

interface NoteLike { text: string; focus?: string[]; strokeIds?: string[] }
interface NodeLike { id: string; text?: string; rect: BBox; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RowWordsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const r1 = (v: number) => Math.round(v)
const closed = (m: ShapeMark) => (m.shape === 'box' || m.shape === 'ellipse') && !m.area && !m.glyph && !m.each

// n83: words that name what a mark is ("dark pills", "rounded tabs"): a style tail, never copy
const KIND = /^(pills?|buttons?|btns?|tabs?|chips?|toggles?|segments?|segmented|tags?|badges?|boxes|box|cards?|outline|outlined|rounded|round|filled|shape|style)$/

/** A note's copy: the words before a trailing ", style" tail, as typed. */
export function copyOf(text: string): string {
  const i = text.lastIndexOf(',')
  if (i > 0) {
    const tail = text.slice(i + 1)
    if (wordsOf(tail).length > 0 && copyWords(tail).every((w) => KIND.test(w))) return text.slice(0, i).trim()
  }
  return text.trim()
}

/** Words to show, not a description of the mark: "purple left edge" leaves one word once its look words go. */
export function isCopy(text: string): boolean {
  const all = wordsOf(text), copy = copyWords(text)
  return copy.length > 0 && !(copy.length < all.length && copy.length <= 1)
}

/** Record each box's or ring's own note (in place): the note's focus is that mark alone. */
export function markRowWords(marks: ShapeMark[], notes: NoteLike[], page: readonly BBox[] = []): void {
  for (const m of marks) {
    if (!closed(m) || m.own) continue
    const own = notes.filter((n) => n.focus?.length
      ? n.focus.length === 1 && n.focus[0] === m.strokeId
      : n.strokeIds?.length === 1 && n.strokeIds[0] === m.strokeId)
    const n = own.find((x) => isCopy(copyOf(x.text)))
    // n130: the note's copy without its directions ("Biscuit selected, avatar" is "Biscuit")
    if (n) m.own = (/[;\n]/.test(n.text) ? '' : noteParts(copyOf(n.text)).copy) || copyOf(n.text)
  }
  spreadListNotes(marks, notes, page)
  splitRowNotes(marks)
}

/** n119: a note's items split by semicolons or new lines ("Rent $1,120; Food $700; Travel $520"), or null. */
export function listItems(text: string): string[] | null {
  if (!/[;\n]/.test(text)) return null
  const items = text.split(/\s*(?:;|\n)\s*/).map((t) => t.trim()).filter(Boolean)
  return items.length >= 2 && items.length <= 8 ? items : null
}

/**
 * n130: a comma list of short items of one form ("Mon 14, Tue 15, Wed 16, Thu 17, Fri 18"): 3 to 8 items, each
 * 1 to 3 words, all the same number of words, a digit in every item or in none, every item copy (not look words
 * like "big, bold, dark"). Notes with semicolons are listItems' (n119). Null otherwise.
 */
export function commaItems(text: string): string[] | null {
  if (/[;\n]/.test(text) || !text.includes(',')) return null
  const items = text.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean)
  if (items.length < 3 || items.length > 8) return null
  const counts = items.map((t) => t.split(/\s+/).length)
  if (counts.some((c) => c > 3) || new Set(counts).size > 1) return null
  if (new Set(items.map((t) => /\d/.test(t))).size > 1) return null
  if (!items.every((t) => isCopy(t) && copyWords(t).length === wordsOf(t).length)) return null
  return items
}

/** Look-alike closed marks chained to a seed in one column or one row (same kind, about the same size, aligned). */
export function lineOfLookAlikes(seed: ShapeMark, pool: ShapeMark[]): { marks: ShapeMark[]; axis: 'column' | 'row' } | null {
  const s = seed.box
  const small = Math.min(s.w, s.h)
  const reach = Math.max(24, 1.5 * small)
  const like = (o: ShapeMark) => o.shape === seed.shape && ratio(o.box.w, s.w) <= 1.5 && ratio(o.box.h, s.h) <= 1.5
  const cx = (b: BBox) => b.x + b.w / 2, cy = (b: BBox) => b.y + b.h / 2
  let best: { marks: ShapeMark[]; axis: 'column' | 'row' } | null = null
  for (const axis of ['column', 'row'] as const) {
    const aligned = (o: ShapeMark) => axis === 'column' ? Math.abs(cx(o.box) - cx(s)) <= Math.max(8, 0.6 * s.w) : Math.abs(cy(o.box) - cy(s)) <= Math.max(8, 0.6 * s.h)
    const line = [seed]
    for (let grew = true; grew;) {
      grew = false
      for (const o of pool) {
        if (line.includes(o) || !like(o) || !aligned(o)) continue
        if (line.some((g) => holds(g.box, o.box) || holds(o.box, g.box))) continue
        if (line.some((g) => gapOf(g.box, o.box) <= reach)) { line.push(o); grew = true }
      }
    }
    if (line.length >= 2 && (!best || line.length > best.marks.length)) {
      best = { marks: line.sort((a, b) => axis === 'column' ? a.box.y - b.box.y : a.box.x - b.box.x), axis }
    }
  }
  return best
}

/**
 * n119: one note listing several items ("Rent $1,120; Food $700; Travel $520") typed on one of a column or row of
 * look-alike small marks (three legend swatches, round 38 e3) is those marks' words, one item each, in drawn order
 * (top to bottom, or left to right). The build had printed the first item beside the first swatch and left the
 * other two bare. Spread only when the items are exactly as many as the marks in the line and no mark was typed
 * other words of its own. In place.
 */
export function spreadListNotes(marks: ShapeMark[], notes: NoteLike[], page: readonly BBox[] = []): void {
  const pool = marks.filter((m) => closed(m))
  for (const n of notes) {
    const semi = listItems(copyOf(n.text))
    const comma = semi ? null : commaItems(n.text)
    const items = semi ?? comma
    if (!items || !items.every((t) => isCopy(t))) continue
    const ids = n.focus?.length ? n.focus : n.strokeIds ?? []
    const anchors = pool.filter((m) => ids.includes(m.strokeId))
    if (!anchors.length) continue
    for (const a of anchors) {
      // n130: a lone small box with a comma list of items of one form is the first drawn of a row
      const line = lineOfLookAlikes(a, pool) ?? (comma && a.box.w <= 260 && a.box.h <= 160 ? { marks: [a], axis: 'row' as const } : null)
      if (!line) continue
      // every mark the note was bound to is in the line (a note on two far-apart marks is not a list for this line)
      if (anchors.some((x) => !line.marks.includes(x))) continue
      // n130: fewer marks drawn than items (two days of a five-day row): the drawn marks are some of the row's items
      // (which ones from where they sit after the row's start), the rest are built at the drawn size and pitch
      const short = line.marks.length < items.length
      if (!short && line.marks.length !== items.length) continue
      if (short && !comma) continue
      const first = short ? rowOffset(line.marks, line.axis, items.length, page) : 0
      const whole = copyOf(n.text).trim()
      const typedOwn = line.marks.filter((o) => o.own && o.own.trim() !== whole)
      if (typedOwn.some((o) => o.own!.trim().toLowerCase() !== items[first + line.marks.indexOf(o)]!.toLowerCase())) continue
      line.marks.forEach((o, i) => { o.own = items[first + i]!; o.listNote = n.text })
      if (short) {
        const ms = line.marks, h = line.axis === 'row'
        const pitch = pitchOf(ms, line.axis)
        const at = (h ? ms[0]!.box.x : ms[0]!.box.y) - first * pitch
        for (const o of ms) o.rowList = { items, first, axis: line.axis, pitch: r1(pitch), start: r1(at), size: { w: r1(ms[0]!.box.w), h: r1(ms[0]!.box.h) } }
      }
      break
    }
  }
}

/** n130: the centre-to-centre step of a line of marks (or a box and a small gap when one is drawn). */
function pitchOf(ms: readonly ShapeMark[], axis: 'row' | 'column'): number {
  const c = (m: ShapeMark) => axis === 'row' ? m.box.x + m.box.w / 2 : m.box.y + m.box.h / 2
  if (ms.length >= 2) return (c(ms.at(-1)!) - c(ms[0]!)) / (ms.length - 1)
  const s = axis === 'row' ? ms[0]!.box.w : ms[0]!.box.h
  return s + Math.max(8, s * 0.08)
}

/**
 * n130: which item the first drawn mark is, from where the row starts: the nearest left (or top) edge of other drawn
 * marks in the same column of the page (a heading line, the boxes above or below) before the first mark, within the
 * room the missing items need. 0 when nothing marks the start.
 */
export function rowOffset(ms: readonly ShapeMark[], axis: 'row' | 'column', count: number, page: readonly BBox[]): number {
  const room = count - ms.length
  if (room <= 0 || !page.length) return 0
  const p = pitchOf(ms, axis), f = ms[0]!.box, last = ms.at(-1)!.box
  const h = axis === 'row'
  const lo = h ? f.x : f.y
  const starts = page.filter((b) => {
    if (ms.some((m) => Math.abs(m.box.x - b.x) <= 2 && Math.abs(m.box.y - b.y) <= 2 && Math.abs(m.box.w - b.w) <= 2)) return false
    const s = h ? b.x : b.y
    if (s >= lo - p * 0.4 || s < lo - p * (room + 0.5)) return false
    // near the row on the other axis (above or below it, within a few rows' height), and not wrapping the whole row
    const near = h ? b.y + b.h >= f.y - 4 * f.h && b.y <= f.y + 5 * f.h : b.x + b.w >= f.x - 4 * f.w && b.x <= f.x + 5 * f.w
    const wraps = h ? b.x + b.w >= last.x + last.w : b.y + b.h >= last.y + last.h
    return near && !(wraps && (h ? b.h : b.w) > (h ? f.h : f.w) * 1.6 && (h ? b.y <= f.y && b.y + b.h >= f.y + f.h : b.x <= f.x && b.x + b.w >= f.x + f.w))
  }).map((b) => h ? b.x : b.y)
  if (!starts.length) return 0
  const start = Math.min(...starts)
  return Math.max(0, Math.min(room, Math.round((lo - start) / p)))
}

/**
 * n83: one note typed on a row of look-alike pills or tabs, one word per pill ("Week Month Year, dark pills" on
 * the first of three boxes, round 35 e3), is each pill's word in drawn order: the build printed the whole note on
 * the first pill. Split when the note's words are as many as the boxes in the row (three or more, or two when
 * another pill's own note confirms its word), and no pill was typed a word that disagrees. In place.
 */
export function splitRowNotes(marks: ShapeMark[]): void {
  const pool = marks.filter((m) => closed(m))
  for (const m of pool) {
    if (!m.own) continue
    const words = m.own.split(/[\s·•|/]+/).map((w) => w.trim()).filter(Boolean)
    if (words.length < 2 || words.length > 7 || words.some((w) => !/^[\p{L}\p{N}&+'-]+$/u.test(w))) continue
    const s = m.box
    const like = (o: ShapeMark) => o.shape === m.shape && ratio(o.box.w, s.w) <= 1.6 && ratio(o.box.h, s.h) <= 1.4 &&
      Math.abs((o.box.y + o.box.h / 2) - (s.y + s.h / 2)) <= s.h * 0.5
    const row = [m]
    const reach = Math.max(24, 0.6 * s.h)
    for (let grew = true; grew;) {
      grew = false
      for (const o of pool) {
        if (row.includes(o) || !like(o)) continue
        if (row.some((g) => holds(g.box, o.box) || holds(o.box, g.box))) continue
        if (row.some((g) => gapOf(g.box, o.box) <= reach)) { row.push(o); grew = true }
      }
    }
    if (row.length !== words.length) continue
    row.sort((a, b) => a.box.x - b.box.x)
    const others = row.filter((o) => o !== m && o.own)
    const agrees = (o: ShapeMark) => o.own!.trim().toLowerCase() === words[row.indexOf(o)]!.toLowerCase()
    if (others.some((o) => !agrees(o))) continue
    if (words.length < 3 && !others.length) continue
    row.forEach((o, i) => { o.own = words[i]! })
  }
}

const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b))
const gapOf = (a: BBox, b: BBox) => Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h))
const holds = (a: BBox, b: BBox) => b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h

/** Lists: like-sized closed marks of one kind chained by small gaps, two or more with different words of their own. */
export function lookAlikeLists(marks: ShapeMark[]): ShapeMark[][] {
  const seen = new Set<string>()
  const pool = marks.filter((m) => closed(m) && !seen.has(m.strokeId) && seen.add(m.strokeId))
  const used = new Set<ShapeMark>()
  const out: ShapeMark[][] = []
  for (const seed of pool) {
    if (used.has(seed) || !seed.own) continue
    const s = seed.box
    const reach = Math.max(40, 0.6 * Math.min(s.w, s.h))
    const like = (m: ShapeMark) => m.shape === seed.shape && ratio(m.box.w, s.w) <= 1.5 && ratio(m.box.h, s.h) <= 1.5
    const group = [seed]
    for (let grew = true; grew;) {
      grew = false
      for (const m of pool) {
        if (group.includes(m) || used.has(m) || !like(m)) continue
        if (group.some((g) => holds(g.box, m.box) || holds(m.box, g.box))) continue
        if (group.some((g) => gapOf(g.box, m.box) <= reach)) { group.push(m); grew = true }
      }
    }
    const worded = group.filter((m) => m.own)
    if (worded.length < 2 || new Set(worded.map((m) => copyWords(m.own!).join(' '))).size < 2) continue
    for (const m of group) used.add(m)
    out.push(group.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x))
  }
  return out
}

const where = (m: ShapeMark) => `the ${m.shape === 'ellipse' ? 'ring' : 'box'} at (${r1(m.box.x)},${r1(m.box.y)}) ${r1(m.box.w)}x${r1(m.box.h)}`

export function rowWordsBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const all = actions.flatMap((a) => a.shapeMarks ?? [])
  const rows = rowListsBrief(all)
  const lists = lookAlikeLists(all).filter((l) => !l.some((m) => m.rowList))
  if (!lists.length) return rows
  const lines = lists.map((l) => {
    const items = l.map((m) => `  - ${where(m)}: ${m.own ? `"${m.own}"` : '(no words typed)'}`)
    return `- these ${l.length} marks look alike (one list or thread), but EACH was typed its OWN words, in this order:\n${items.join('\n')}\n` +
      `  Build each item with exactly its own words, beside or inside its own mark (keep a mark's look and position as drawn). ` +
      `If you map over an array, the array holds these exact texts in this order; never repeat one item's words in another, and never make up texts for them.`
  })
  return rows + `LOOK-ALIKE MARKS, EACH WITH ITS OWN WORDS (deterministic, from which mark each note was typed on; checked on the page):\n${lines.join('\n')}\n\n`
}

/** n130: rows drawn short of their list: every item is one box of the row, the drawn ones where drawn. */
function rowListsBrief(marks: readonly ShapeMark[]): string {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const m of marks) {
    const r = m.rowList
    if (!r || !m.listNote || seen.has(m.listNote)) continue
    seen.add(m.listNote)
    const drawn = marks.filter((o) => o.listNote === m.listNote && o.rowList).sort((a, b) => r.axis === 'row' ? a.box.x - b.box.x : a.box.y - b.box.y)
    const row = r.axis === 'row'
    lines.push(`- the note "${m.listNote}" lists ${String(r.items.length)} items, ONE PER BOX of one ${row ? 'row (left to right)' : 'column (top to bottom)'}: ${r.items.map((t) => `"${t}"`).join(', ')}. ` +
      `${drawn.length > 1 ? `The ${String(drawn.length)} boxes drawn are` : 'The box drawn is'} ${drawn.map((o) => `${where(o)} = "${o.own}"`).join(', ')}; ` +
      `build all ${String(r.items.length)} boxes alike, each about ${String(r.size.w)}x${String(r.size.h)}, ${String(r.pitch)}px apart ${row ? 'centre to centre' : 'top to top'}, the first (${JSON.stringify(r.items[0])}) at ${row ? 'x' : 'y'}≈${String(r.start)}, the drawn ones exactly where drawn (keep their fills and looks: a filled one is the selected item). ` +
      `Each box shows ONLY its own item's words (split as typed, e.g. a small word over a bigger number); never the whole note, never one item's words in two boxes, never an extra number.`)
  }
  return lines.length ? `A LIST NOTE FOR A ROW DRAWN SHORT (deterministic, from the note's items and the drawn boxes; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

/** Text pieces near a mark: beside it on its row (to the right, a little to the left) or inside it. */
function near(m: ShapeMark, nodes: NodeLike[], maxWords: number): NodeLike[] {
  const b = m.box
  return nodes.filter((n) => {
    const t = n.textBox ?? n.rect
    if (!n.text || t.w < 2 || t.h < 2) return false
    if (wordsOf(n.text).length > maxWords) return false
    const cy = t.y + t.h / 2
    const inRow = cy >= b.y - Math.max(10, b.h * 0.25) && cy <= b.y + b.h + Math.max(10, b.h * 0.25)
    return inRow && t.x + t.w >= b.x - 40 && t.x <= b.x + b.w + 600
  })
}

export function verifyRowWords(marks: ShapeMark[], after: Snap): RowWordsVerdict {
  const lists = lookAlikeLists(marks)
  const rowed = marks.filter((m) => m.rowList)
  if (!lists.length && !rowed.length) return { satisfied: true, unverifiable: true, reason: 'no look-alike marks with their own words' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  // n130: a row drawn short of its list: every item shows in the row's band, and no piece holds two items or the whole note
  const doneNotes = new Set<string>()
  for (const m of rowed) {
    const r = m.rowList!
    if (doneNotes.has(m.listNote!)) continue
    doneNotes.add(m.listNote!)
    const b = m.box, row = r.axis === 'row'
    const inBand = after.nodes.filter((n) => {
      const t = n.textBox ?? n.rect
      if (!n.text || t.w < 2 || t.h < 2) return false
      return row ? t.y + t.h / 2 >= b.y - 8 && t.y + t.h / 2 <= b.y + b.h + 8 : t.x + t.w / 2 >= b.x - 8 && t.x + t.w / 2 <= b.x + b.w + 8
    })
    const words = new Set(inBand.flatMap((n) => wordsOf(n.text!)))
    const missing = r.items.filter((it) => { const w = copyWords(it); return w.length > 0 && w.filter((x) => words.has(x)).length / w.length < 0.7 })
    const crowded = inBand.filter((n) => {
      const got = new Set(wordsOf(n.text!))
      return r.items.filter((it) => { const w = copyWords(it); return w.length > 0 && w.every((x) => got.has(x)) }).length >= 2
    })
    // a drawn box showing words of another item ("14" over "Wed 16"): the note's start was put in the box it was typed on
    const foreign: string[] = []
    for (const o of rowed.filter((x) => x.listNote === m.listNote)) {
      const own = new Set(copyWords(o.own!)), ob = o.box
      const other = new Set(r.items.filter((it) => it !== o.own).flatMap((it) => copyWords(it)).filter((w) => !own.has(w)))
      const inside = after.nodes.filter((nd) => { const t = nd.textBox ?? nd.rect; const cx = t.x + t.w / 2, cy = t.y + t.h / 2; return !!nd.text && cx >= ob.x && cx <= ob.x + ob.w && cy >= ob.y && cy <= ob.y + ob.h })
      const bad = [...new Set(inside.flatMap((nd) => wordsOf(nd.text!)).filter((w) => other.has(w)))]
      if (bad.length) foreign.push(`${where(o)} is "${o.own}" but also shows "${bad.join(' ')}" from another item`)
    }
    judged++
    if (foreign.length) misses.push(`${foreign.join('; ')}: each box of the row shows only its own item`)
    if (missing.length || crowded.length) {
      misses.push(`the row listed as ${r.items.map((t) => `"${t}"`).join(', ')} should be ${String(r.items.length)} look-alike boxes ${String(r.pitch)}px apart, each with only its own item: ` +
        `${missing.length ? `${missing.map((t) => `"${t}"`).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not in the row` : ''}${missing.length && crowded.length ? '; ' : ''}` +
        `${crowded.length ? `"${crowded[0]!.text!.replace(/\s+/g, ' ').trim().slice(0, 60)}" holds more than one item` : ''}; keep the drawn boxes where drawn`)
    }
  }
  for (const l of lists) {
    const worded = l.filter((m) => m.own)
    const wrong: string[] = []
    for (const m of worded) {
      const want = copyWords(m.own!)
      if (!want.length) continue
      judged++
      const cands = near(m, after.nodes, want.length * 2 + 6)
      const hit = cands.some((n) => { const got = new Set(wordsOf(n.text!)); return want.filter((w) => got.has(w)).length / want.length >= 0.7 })
      if (hit) continue
      // n119: a label and its amount built as two pieces on the mark's row ("Rent" ... "$1,120") are its words together
      const row = new Set(cands.flatMap((n) => wordsOf(n.text!)))
      if (want.length >= 2 && want.filter((w) => row.has(w)).length / want.length >= 0.7) continue
      // what is there instead: another item's words, or something nobody typed
      const other = worded.find((o) => o !== m && cands.some((n) => { const got = new Set(wordsOf(n.text!)); const w = copyWords(o.own!); return w.length > 0 && w.filter((x) => got.has(x)).length / w.length >= 0.7 }))
      const shown = cands.map((n) => n.text!.replace(/\s+/g, ' ').trim()).filter(Boolean)[0]
      wrong.push(`${where(m)} should show "${m.own}" but ${other ? `shows the words of another item ("${other.own}")` : shown ? `shows "${shown.slice(0, 60)}"` : 'has no words beside or inside it'}`)
    }
    if (wrong.length) {
      misses.push(`${wrong.join('; ')}. The ${l.length} look-alike marks each carry their OWN typed words, in this order: ` +
        `${l.filter((m) => m.own).map((m) => `"${m.own}"`).join(', ')}: put exactly those texts on those items (fix the array or props the list maps over; ` +
        `never repeat one item's words, never make texts up), keeping every item's look, size and position`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no look-alike marks with copy words' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: `${judged} look-alike item${judged > 1 ? 's' : ''} each show their own words` }
}

/** n119: notes spread over look-alike marks: their items are each mark's copy, never directions to keep off the page. */
export function spreadNotes(marks: readonly ShapeMark[]): Set<string> {
  return new Set(marks.flatMap((m) => (m.listNote ? [m.listNote] : [])))
}

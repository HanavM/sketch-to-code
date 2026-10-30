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
export function markRowWords(marks: ShapeMark[], notes: NoteLike[]): void {
  for (const m of marks) {
    if (!closed(m) || m.own) continue
    const own = notes.filter((n) => n.focus?.length
      ? n.focus.length === 1 && n.focus[0] === m.strokeId
      : n.strokeIds?.length === 1 && n.strokeIds[0] === m.strokeId)
    const n = own.find((x) => isCopy(copyOf(x.text)))
    if (n) m.own = copyOf(n.text)
  }
  spreadListNotes(marks, notes)
  splitRowNotes(marks)
}

/** n119: a note's items split by semicolons or new lines ("Rent $1,120; Food $700; Travel $520"), or null. */
export function listItems(text: string): string[] | null {
  if (!/[;\n]/.test(text)) return null
  const items = text.split(/\s*(?:;|\n)\s*/).map((t) => t.trim()).filter(Boolean)
  return items.length >= 2 && items.length <= 8 ? items : null
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
export function spreadListNotes(marks: ShapeMark[], notes: NoteLike[]): void {
  const pool = marks.filter((m) => closed(m))
  for (const n of notes) {
    const items = listItems(copyOf(n.text))
    if (!items || !items.every((t) => isCopy(t))) continue
    const ids = n.focus?.length ? n.focus : n.strokeIds ?? []
    const anchors = pool.filter((m) => ids.includes(m.strokeId))
    if (!anchors.length) continue
    for (const a of anchors) {
      const line = lineOfLookAlikes(a, pool)
      if (!line || line.marks.length !== items.length) continue
      // every mark the note was bound to is in the line (a note on two far-apart marks is not a list for this line)
      if (anchors.some((x) => !line.marks.includes(x))) continue
      const whole = copyOf(n.text).trim()
      const typedOwn = line.marks.filter((o) => o.own && o.own.trim() !== whole)
      if (typedOwn.some((o) => o.own!.trim().toLowerCase() !== items[line.marks.indexOf(o)]!.toLowerCase())) continue
      line.marks.forEach((o, i) => { o.own = items[i]!; o.listNote = n.text })
      break
    }
  }
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
  const lists = lookAlikeLists(actions.flatMap((a) => a.shapeMarks ?? []))
  if (!lists.length) return ''
  const lines = lists.map((l) => {
    const items = l.map((m) => `  - ${where(m)}: ${m.own ? `"${m.own}"` : '(no words typed)'}`)
    return `- these ${l.length} marks look alike (one list or thread), but EACH was typed its OWN words, in this order:\n${items.join('\n')}\n` +
      `  Build each item with exactly its own words, beside or inside its own mark (keep a mark's look and position as drawn). ` +
      `If you map over an array, the array holds these exact texts in this order; never repeat one item's words in another, and never make up texts for them.`
  })
  return `LOOK-ALIKE MARKS, EACH WITH ITS OWN WORDS (deterministic, from which mark each note was typed on; checked on the page):\n${lines.join('\n')}\n\n`
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
  if (!lists.length) return { satisfied: true, unverifiable: true, reason: 'no look-alike marks with their own words' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
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

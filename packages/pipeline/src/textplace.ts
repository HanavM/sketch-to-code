/**
 * Words sit where they were drawn or typed (n21).
 *
 * Round 5 c5 bento (hand, n19): two gaps in one page.
 * 1. "Prism 2" was typed on a level line drawn at the LEFT of the hero box
 *    (28px in from its left edge, 440px short of its right). It was built
 *    centred in the box. A person who draws a line at the left means the words
 *    start there. So a level line with words typed on it is given its side
 *    (left, centre or right) from where it sits in the box around it, codegen
 *    is told that side and the x the words start at, and the page is checked:
 *    the letters themselves (not the block) start where the line starts.
 * 2. "Ready when you are." was typed in the lower part of the CTA card, just
 *    above the drawn button, with no line under it. It was built at the top of
 *    the card. A note typed inside a big box has a spot: codegen is told where
 *    in the box it was typed (so copy sits there, a description of the box has
 *    no spot), and when its words are built on the page they are checked to sit
 *    near that height. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { shapeOf, type ShapeMark } from './shapemark.js'
import { rowBrief } from './rowspan.js'
import { BIG_WORD, isDisplay, lineAsksBig, spanFontPx } from './linespan.js'
import { spreadCentres } from './linespread.js'
import { outlinedOf } from './textlook.js'
import { bindTiltNotes } from './tiltwords.js'

interface NoteLike { text: string; focus?: string[]; at?: { x: number; y: number }; strokeIds?: string[] }
interface NodeLike { id: string; tag: string; rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface PlaceVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export type Side = 'left' | 'centre' | 'right'

const r1 = (v: number) => Math.round(v)
const isLevel = (m: ShapeMark) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2
const isBox = (m: ShapeMark) => m.shape === 'box' && m.box.w >= 40 && m.box.h >= 24

/** Words typed on the mark itself (its own note), not a note that merely shares its cluster. */
// (a note on a lone line has no focus: its whole cluster is that one line)
const ownNotes = (m: ShapeMark, notes: NoteLike[]) => notes.filter((n) => n.focus?.length
  ? n.focus.length === 1 && n.focus[0] === m.strokeId
  : n.strokeIds?.length === 1 && n.strokeIds[0] === m.strokeId)

/** Record the words typed on each level line, and where notes were typed inside each big box (in place). */
export function markTextPlaces(marks: ShapeMark[], notes: NoteLike[]): void {
  for (const m of marks) {
    if (isLevel(m)) {
      const n = ownNotes(m, notes)[0]
      if (n) m.words = n.text
      continue
    }
    // n59: a slanted line with its own note still stands for those words (a line on a turned ticket)
    if (m.shape === 'line' && !m.edge) {
      const n = ownNotes(m, notes)[0]
      if (n) m.carries = n.text
      continue
    }
    if (m.shape !== 'box' || m.area || m.solid || m.box.w < 120 || m.box.h < 100) continue
    const b = m.box
    const typed = ownNotes(m, notes)
      .filter((n) => n.at && n.at.x >= b.x - 4 && n.at.x <= b.x + b.w + 4 && n.at.y >= b.y - 4 && n.at.y <= b.y + b.h + 4)
      .map((n) => ({ text: n.text, x: r1(n.at!.x), y: r1(n.at!.y) }))
    if (typed.length) m.typed = typed
  }
  // n61: a note typed on a line inside a turned box is that line's words, though it is attached to several marks
  bindTiltNotes(marks, notes)
  linkSame(marks)
}

/**
 * n57: resolve "same" across the given lines, then flag hollow words. "SLOW, giant outlined letters" typed on a line:
 * the letters are hollow (before, only a box round a big word was). Run per action and again over every action's
 * marks (the line above is often another action).
 */
export function linkSame(marks: ShapeMark[]): void {
  resolveSame(marks)
  for (const m of marks) {
    if (!isLevel(m) || !m.words || m.outlined) continue
    const o = outlinedOf(m.words)
    if (o) m.outlined = o
  }
}

/** A note's words after its first comma ("WORK, same" -> "same"); null when it has no comma. */
const styleTail = (t: string): string | null => { const i = t.indexOf(','); return i === -1 ? null : t.slice(i + 1).trim() }
export const SAME = /^(same|the same|same style|same look|same as (above|before|the (line|one) above)|ditto|likewise)\.?$/i

/**
 * n57: "WORK, same" typed on the line under "SLOW, giant outlined letters" means the same look. Round 33 c2
 * (slow agency): WORK came out solid and smaller; "same" was read as nothing. A line whose note is its words
 * plus "same" takes the style part of the nearest level line above it that has words (within 320px).
 */
export function resolveSame(marks: ShapeMark[]): void {
  const lines = marks.filter((m) => isLevel(m) && m.words)
  for (const m of lines) {
    const tail = styleTail(m.words!)
    if (tail === null || !SAME.test(tail)) continue
    const above = lines.filter((o) => o !== m && o.box.y < m.box.y && m.box.y - o.box.y <= 320 && !SAME.test(styleTail(o.words!) ?? ''))
      .sort((p, q) => q.box.y - p.box.y)[0]
    const look = above ? styleTail(above.words!) : null
    if (!look) continue
    m.words = `${m.words!.slice(0, m.words!.indexOf(',')).trim()}, ${look}`
  }
}

/**
 * n56: a short line drawn centred right under (or just over) a ring or box is that mark's label: its words are
 * centred on the mark. Round 33 c4 (herb farm): "Basil" and "Sweet and leafy" were drawn centred under a
 * circle, but measured against the page they read as left lines and were built starting at the circle's left edge.
 * A line under another such label line (a second label row) counts too, through the first one.
 */
export function columnOf(line: ShapeMark, marks: ShapeMark[]): ShapeMark | null {
  const b = line.box
  const cx = b.x + b.w / 2
  const solidish = marks.filter((o) => o !== line && (o.shape === 'ellipse' || (o.shape === 'box' && !o.area)) && o.box.w >= 40 && o.box.h >= 24 && o.box.w <= 480)
  const fits = (o: ShapeMark, top: number, bottom: number) =>
    Math.abs(o.box.x + o.box.w / 2 - cx) <= Math.max(10, 0.1 * o.box.w) && b.w <= o.box.w * 1.6 &&
    ((b.y >= bottom - 4 && b.y - bottom <= 120) || (b.y <= top + 4 && top - b.y <= 60))
  const best = solidish.filter((o) => fits(o, o.box.y, o.box.y + o.box.h))
    .sort((p, q) => Math.abs(b.y - (p.box.y + p.box.h)) - Math.abs(b.y - (q.box.y + q.box.h)))[0]
  // inside the mark is the holder's business (a line in a card), not a label under it
  if (best && !(b.y > best.box.y + 4 && b.y < best.box.y + best.box.h - 4)) return best
  return null
}

/** The smallest drawn box holding the line, else the page. */
function holderOf(line: ShapeMark, boxes: ShapeMark[], viewport: { w: number; h: number }, dividers: ShapeMark[] = []): BBox {
  const b = line.box
  const hold = boxes.filter((o) => o.box.x <= b.x + 6 && o.box.x + o.box.w >= b.x + b.w - 6 && o.box.y <= b.y + 2 && o.box.y + o.box.h >= b.y - 2)
    .sort((p, q) => p.box.w * p.box.h - q.box.w * q.box.h)[0]
  let h = hold ? hold.box : { x: 0, y: 0, w: viewport.w, h: viewport.h }
  // n29: a drawn divider (an upright line across the line's height) is a column edge.
  // Round 31 e2: the title line sat at the left of the reading pane, right of the
  // divider; measured against the page it read as right-aligned and was built so.
  for (const v of dividers) {
    const vx = v.box.x + v.box.w / 2
    if (v.box.y > b.y + 2 || v.box.y + v.box.h < b.y - 2 || vx <= h.x || vx >= h.x + h.w) continue
    if (vx <= b.x + 6) h = { x: vx, y: h.y, w: h.x + h.w - vx, h: h.h }
    else if (vx >= b.x + b.w - 6) h = { x: h.x, y: h.y, w: vx - h.x, h: h.h }
  }
  return h
}

/**
 * Upright lines among all the strokes, cited by an action or not: a divider is often
 * drawn first and claimed by no action (round 31 e2), yet it still splits the page.
 */
export function strokeDividers(strokes: Array<{ id: string; points: Array<{ x: number; y: number }> }> | undefined): ShapeMark[] {
  return uprights((strokes ?? []).flatMap((st) => {
    const m = st.points.length > 1 ? shapeOf(st.points) : null
    return m ? [{ ...m, strokeId: st.id }] : []
  }))
}

/** Upright drawn lines: column dividers. */
const uprights = (marks: ShapeMark[]) => marks.filter((m) => m.shape === 'line' && !m.edge && !!m.from && !!m.to &&
  Math.abs(m.from.x - m.to.x) <= 4 && Math.abs(m.from.y - m.to.y) >= 120)

/** Which side of its box a line sits on: the gaps to the two edges decide. */
export function sideOf(line: BBox, holder: BBox): Side {
  const left = line.x - holder.x, right = holder.x + holder.w - (line.x + line.w)
  if (Math.abs(left - right) <= Math.max(24, holder.w * 0.08)) return 'centre'
  return left < right ? 'left' : 'right'
}

const where = (b: BBox, x: number, y: number): string => {
  const fy = (y - b.y) / b.h, fx = (x - b.x) / b.w
  const v = fy < 0.33 ? 'upper' : fy > 0.62 ? 'lower' : 'middle'
  const h = fx < 0.33 ? 'left' : fx > 0.67 ? 'right' : 'middle'
  const part = [v, h].filter((s) => s !== 'middle').join(' ') || 'middle'
  return `the ${part} part of the box, about ${r1(fy * 100)}% down`
}

type ActionLike = { shapeMarks?: ShapeMark[]; textSize?: Array<{ lines: number; strokes: string[] }> }

export function textPlaceBrief(actions: ActionLike[], viewport: { w: number; h: number }, dividers: ShapeMark[] = []): string {
  const all = actions.flatMap((a) => a.shapeMarks ?? [])
  const boxes = all.filter(isBox)
  const divs = [...uprights(all), ...dividers]
  const stacked = new Set(actions.flatMap((a) => (a.textSize ?? []).filter((t) => t.lines >= 2).flatMap((t) => t.strokes)))
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (isLevel(m) && m.words) {
        const col = columnOf(m, all)
        if (col) {
          const x0 = m.box.x, x1 = m.box.x + m.box.w, y = m.box.y
          const cx = r1(col.box.x + col.box.w / 2)
          lines.push(`- action ${i}: "${m.words}" is typed on the short line drawn from x ${x0} to ${x1} at y ${y}, centred ${y > col.box.y ? 'under' : 'over'} the ${col.shape === 'ellipse' ? 'ring' : 'box'} drawn at (${col.box.x},${col.box.y}) ${col.box.w}x${col.box.h}: ` +
            `it is that mark's label, so its words are CENTRED on x ${cx} (text-align: center on a block centred under the mark, as wide as the mark or wider), never starting at the mark's left edge.`)
          continue
        }
        // n71: short items spread over the line are told by lineSpreadBrief (never one centred group)
        if (spreadCentres(m.words, m.box.x, m.box.x + m.box.w)) continue
        // n56: a long line under a short phrase is a heading sized by the line (told here, checked by line-span)
        const len = m.box.w
        // n57: a giant word or two on a long line ("SLOW, giant outlined letters") is sized by the line as well
        if ((!stacked.has(m.strokeId) && !BIG_WORD.test(m.words) && lineAsksBig(m.words, len)) || isDisplay(m.words, len)) {
          lines.push(`- action ${i}: "${m.words}" is a short phrase typed on a long line (${r1(len)}px, x ${m.box.x} to ${m.box.x + m.box.w}, y ${m.box.y}): the line sets its SIZE. ` +
            `It is a big heading on ONE line (white-space: nowrap) whose letters run about the drawn ${r1(len)}px: font-size about ${spanFontPx(m.words, len)}px (adjust so the width matches), bold, letters sitting on y ${m.box.y}` +
            (isDisplay(m.words, len)
              ? `: the line is the letters' BASELINE, their bottom edge on y ${m.box.y}, not above it (with line-height 1 the block's top is about 0.85 of the font-size above y ${m.box.y}; never leave the space under the letters between them and the line; checked on the page).`
              : '.'))
        }
        const h = holderOf(m, boxes, viewport, divs)
        const side = sideOf(m.box, h)
        const x0 = m.box.x, x1 = m.box.x + m.box.w, y = m.box.y
        const inBox = h.w === viewport.w && h.x === 0 ? 'on the page' : `in the box (or column) at (${r1(h.x)},${r1(h.y)}) ${r1(h.w)}x${r1(h.h)}`
        lines.push(side === 'left'
          ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, ${r1(x0 - h.x)}px in from its LEFT edge: ` +
            `the words are LEFT-aligned and their first letter starts at x ${x0} (text-align: left; never centred in the box, no mx-auto or text-center on them).`
          : side === 'right'
            ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, near its RIGHT edge: ` +
              `the words are RIGHT-aligned and end at x ${x1} (text-align: right).`
            : `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, centred ${inBox}: centre the words on x ${r1((x0 + x1) / 2)}; ${rowBrief(m.words, x0, x1)}.`)
      }
      if (m.typed?.length) {
        for (const t of m.typed) {
          lines.push(`- action ${i}: the note "${t.text}" was typed at (${t.x},${t.y}), in ${where(m.box, t.x, t.y)} drawn at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}. ` +
            `If those words are copy shown on the page (a heading, a line, a label), they sit there, at about y ${t.y}, not at the top or the middle of the box by default; ` +
            `a note that only describes the box (its colours, what it holds) has no spot.`)
        }
      }
    }
  })
  return lines.length
    ? `WHERE THE WORDS SIT (deterministic, from where the lines were drawn and the notes typed; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’.,!?:;]/g, '').replace(/\s+/g, ' ').trim()

/** Built text whose words are the note's words (the note is the copy), nearest a y. */
function builtWords(text: string, after: Snap, y: number): NodeLike | null {
  const want = norm(text)
  if (want.length < 2) return null
  const hits = after.nodes.filter((n) => n.text && n.textBox && norm(n.text).includes(want))
  return hits.sort((a, b) => Math.abs(a.textBox!.y + a.textBox!.h / 2 - y) - Math.abs(b.textBox!.y + b.textBox!.h / 2 - y))[0] ?? null
}

/**
 * Words typed on a left or right line start (end) where the line does; copy typed at a
 * spot in a big box sits near that height. Notes that are not the copy (no built text
 * carries their words) are not judged.
 */
export function verifyTextPlace(marks: ShapeMark[], after: Snap, viewport: { w: number; h: number }, dividers: ShapeMark[] = []): PlaceVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const boxes = marks.filter(isBox)
  const divs = [...uprights(marks), ...dividers]
  const faults: string[] = []
  let judged = 0
  for (const m of marks) {
    if (isLevel(m) && m.words) {
      const col = columnOf(m, marks)
      if (col) {
        const t = builtWords(m.words, after, m.box.y)
        if (!t || Math.abs(t.textBox!.y + t.textBox!.h / 2 - m.box.y) > 80) continue
        judged++
        const cx = col.box.x + col.box.w / 2
        const tb = t.textBox!
        const got = tb.x + tb.w / 2
        if (Math.abs(got - cx) > Math.max(12, col.box.w * 0.12)) {
          faults.push(`"${m.words}" was drawn as the label centred ${m.box.y > col.box.y ? 'under' : 'over'} the mark at (${col.box.x},${col.box.y}) ${col.box.w}x${col.box.h}, centre x ${r1(cx)}; ` +
            `its letters run x ${r1(tb.x)} to ${r1(tb.x + tb.w)} (centre ${r1(got)}): centre them on x ${r1(cx)} (text-align: center on its block, the block centred on the mark); change nothing else`)
        }
        continue
      }
      const side = sideOf(m.box, holderOf(m, boxes, viewport, divs))
      if (side === 'centre') continue
      const t = builtWords(m.words, after, m.box.y)
      if (!t || Math.abs(t.textBox!.y + t.textBox!.h / 2 - m.box.y) > 80) continue
      judged++
      const x0 = m.box.x, x1 = m.box.x + m.box.w
      const tb = t.textBox!
      if (side === 'left' && Math.abs(tb.x - x0) > 24) {
        faults.push(`"${m.words}" was typed on a line drawn at the left, starting at x ${x0}; its letters start at x ${r1(tb.x)}` +
          `${tb.x > x0 ? ' (centred or pushed right)' : ''}: left-align them (text-align: left, drop any centring on it or its block) so the first letter starts at x ${x0}; change nothing else`)
      }
      if (side === 'right' && Math.abs(tb.x + tb.w - x1) > 24) {
        faults.push(`"${m.words}" was typed on a line drawn at the right, ending at x ${x1}; its letters end at x ${r1(tb.x + tb.w)}: right-align them so they end at x ${x1}; change nothing else`)
      }
    }
    for (const typed of m.typed ?? []) {
      const t = builtWords(typed.text, after, typed.y)
      if (!t) continue
      judged++
      const cy = t.textBox!.y + t.textBox!.h / 2
      const slack = Math.max(60, m.box.h * 0.2)
      if (Math.abs(cy - typed.y) > slack) {
        faults.push(`"${typed.text}" was typed at y ${typed.y} in the box drawn at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}, ` +
          `but its words sit at y ${r1(cy)} (${cy < typed.y ? 'too high' : 'too low'} by ${r1(Math.abs(cy - typed.y))}px): move them to about y ${typed.y} ` +
          `(e.g. push them down with mt-auto in a column, or put them just above what was drawn under them); change nothing else`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no placed words to check' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${judged} placed word${judged > 1 ? 's' : ''} where drawn` }
}

/** n29: a note typed in empty space, nothing drawn near it. */
export interface PlacedNote { text: string; x: number; y: number }

/** Which side of the page a spot is on (thirds). */
const pageSide = (x: number, w: number): Side => (x < w / 3 ? 'left' : x > (w * 2) / 3 ? 'right' : 'centre')

/**
 * Words typed where nothing is drawn sit where they were typed (n29). Round 31 e4: the
 * date typed at the top right, with no mark near, was a whole-sketch note and was built
 * under the city name; "Lisbon", typed above the sun, bound to the sun and sat inside it.
 */
export function placedBrief(notes: PlacedNote[] | undefined, viewport: { w: number; h: number }): string {
  if (!notes?.length) return ''
  const lines = notes.map((n) => {
    const side = pageSide(n.x, viewport.w)
    return `- "${n.text}" was typed at (${n.x},${n.y}) with nothing drawn near it. If those words are copy shown on the page, ` +
      `they sit right there: about y ${n.y}, ${side === 'left' ? `starting near x ${n.x}` : side === 'right' ? `on the right, around x ${n.x}` : `centred near x ${n.x}`}; ` +
      `never moved under or into another block. A note that only describes the page has no spot.`
  })
  return `WORDS TYPED IN EMPTY SPACE (deterministic, from where they were typed; checked on the page):\n${lines.join('\n')}\n\n`
}

/** Placed copy is built within reach of where it was typed. Notes whose words are not on the page are not judged. */
export function verifyPlaced(notes: PlacedNote[] | undefined, after: Snap): PlaceVerdict {
  if (!notes?.length) return { satisfied: true, unverifiable: true, reason: 'no placed notes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const n of notes) {
    const t = builtWords(n.text, after, n.y)
    if (!t) continue
    judged++
    const tb = t.textBox!
    const cy = tb.y + tb.h / 2
    const dx = n.x < tb.x ? tb.x - n.x : n.x > tb.x + tb.w ? n.x - (tb.x + tb.w) : 0
    if (Math.abs(cy - n.y) > 48 || dx > 120) {
      faults.push(`"${n.text}" was typed at (${n.x},${n.y}) with nothing drawn there, but its words sit at (${r1(tb.x)},${r1(cy)}): ` +
        `move them to about y ${n.y}${dx > 120 ? ` and x ${n.x}` : ''}; change nothing else`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no placed copy built' }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${judged} typed word${judged > 1 ? 's' : ''} where typed` }
}

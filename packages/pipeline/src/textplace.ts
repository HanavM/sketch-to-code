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
import { rowData } from './rowdata.js'
import { countedRow } from './countrow.js'
import { HEADING_LEFT_TOL_PX, type OpenRows } from './openrows.js'
import { listNote, type BBox } from '@s2c/ink'
import { shapeOf, type ShapeMark } from './shapemark.js'
import { rowBrief } from './rowspan.js'
import { BIG_WORD, isDisplay, lineAsksBig, spanFontPx } from './linespan.js'
import { labelValue, ruledRow, spreadCentres, whenLine } from './linespread.js'
import { outlinedOf } from './textlook.js'
import { bindTiltNotes } from './tiltwords.js'
import { lineEnds } from './lineends.js'

interface NoteLike { text: string; focus?: string[]; at?: { x: number; y: number }; strokeIds?: string[] }
interface NodeLike { id: string; tag: string; rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean; viewport?: { w: number; h: number } }
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

const BAR_LABEL_MIN_W = 280
/** n246: the end of a long thin bar its one short note was typed at; null when it has more notes, a list or a pair. */
export function barLabelSide(m: Pick<ShapeMark, 'box'>, own: NoteLike[]): { text: string; side: 'left' | 'right' } | null {
  const b = m.box
  if (b.w < BAR_LABEL_MIN_W || b.h > 100 || b.w < 3.5 * b.h || own.length !== 1) return null
  const n = own[0]!
  if (!n.at || n.at.y < b.y - 4 || n.at.y > b.y + b.h + 4 || n.at.x < b.x - 4 || n.at.x > b.x + b.w + 4) return null
  const text = n.text.trim()
  if (/[,;:\n·•|]/.test(text) || text.split(/\s+/).length > 5) return null
  const fx = (n.at.x - b.x) / b.w
  return fx <= 0.25 ? { text, side: 'left' } : fx >= 0.75 ? { text, side: 'right' } : null
}

/** Record the words typed on each level line, and where notes were typed inside each big box (in place). */
export function markTextPlaces(marks: ShapeMark[], notes: NoteLike[], pageW = 1280): void {
  for (const m of marks) {
    if (isLevel(m)) {
      const own = ownNotes(m, notes)
      // n81: notes typed at the different ends of a long line keep their sides (all of them, not the first)
      const ends = lineEnds(m, own, pageW)
      if (ends) { m.ends = ends; delete m.words; continue }
      const n = own[0]
      // n223: a count across with its items is told and checked as one row (countrow.ts): the line is only where it starts
      if (n && countedRow(n.text)) { delete m.words; m.rowStart = true; continue }
      if (n) { m.words = n.text; if (n.at) m.wordsAt = { x: r1(n.at.x), y: r1(n.at.y) } }
      continue
    }
    // n59: a slanted line with its own note still stands for those words (a line on a turned ticket)
    if (m.shape === 'line' && !m.edge) {
      const n = ownNotes(m, notes)[0]
      if (n) m.carries = n.text
      continue
    }
    // n246: a short label typed at one end of a long thin bar stays at that end (round 48 rota: "8 to 2" typed at a
    // shift bar's left came out centred in every bar, in both builds)
    if (m.shape === 'box' && !m.area && !m.stat) {
      const side = barLabelSide(m, ownNotes(m, notes))
      if (side) m.barLabel = side
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
  // n180: a line clearly shorter than the mark that starts (or ends) on the mark's edge is flush with that edge, not
  // centred over it (r43 pets: "18 dogs near you" drawn from x 330 to 560 over a card at 329-613 was told "CENTRED
  // on x 471", and every build indented the heading 40-60px).
  const flush = (o: ShapeMark) => b.w < o.box.w - 24 &&
    (Math.abs(b.x - o.box.x) <= 6 || Math.abs(b.x + b.w - (o.box.x + o.box.w)) <= 6)
  const fits = (o: ShapeMark, top: number, bottom: number) => !flush(o) &&
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
  // n146: a big drawn box beside the line (a photo left of a title) is a column edge too. Round 40 e2 recipe: the title
  // line sat at the left of the column right of the photo; measured against the page it read as right-aligned.
  for (const o of boxes) {
    const ob = o.box
    if (ob.w < 120 || ob.h < 80 || ob.y > b.y + 2 || ob.y + ob.h < b.y - 2) continue
    if (ob.x + ob.w <= b.x - 8 && ob.x + ob.w > h.x && ob.x + ob.w < h.x + h.w) h = { x: ob.x + ob.w, y: h.y, w: h.x + h.w - (ob.x + ob.w), h: h.h }
    else if (ob.x >= b.x + b.w + 8 && ob.x > h.x && ob.x < h.x + h.w) h = { x: h.x, y: h.y, w: ob.x - h.x, h: h.h }
  }
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
  const marks = (strokes ?? []).flatMap((st) => {
    const m = st.points.length > 1 ? shapeOf(st.points) : null
    return m ? [{ ...m, strokeId: st.id }] : []
  })
  // n219: a big box among the strokes is a column edge too, whichever action holds it. Round 41 c4 (chess night): the
  // checkerboard panel was read as an outline, so no action held a box, and "Every Thursday, 7pm" at the left of the
  // column right of it was measured against the page: told right-aligned, built at the far right or wrapped.
  return [...uprights(marks), ...marks.filter((m) => isBox(m) && m.box.w >= 120 && m.box.h >= 80)]
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
  const boxes = [...all.filter(isBox), ...dividers.filter(isBox)]
  const divs = [...uprights(all), ...uprights(dividers)]
  const stacked = new Set(actions.flatMap((a) => (a.textSize ?? []).filter((t) => t.lines >= 2).flatMap((t) => t.strokes)))
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      // n142: words typed over a full-width divider are told by ruleLabelBrief
      if (isLevel(m) && m.words && m.rule) continue
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
        // n170: a size word ("Year 9 Science big bold" on a 210px line) no longer skips this: the line still sets the
        // size (lines under 200px are the title cap's). Round 42 e5: built 261px long, fixed only by a repair.
        // n195: a line ruled in a list (one of 3+ alike lines stacked close) is a row, never sized up by its length
        const row = !BIG_WORD.test(m.words) && !stacked.has(m.strokeId) && (ruledRow(m, all) || (!!labelValue(m.words) && !whenLine(m.words)))
        if (!row && ((!stacked.has(m.strokeId) && lineAsksBig(m.words, len) && (!BIG_WORD.test(m.words) || len >= 200)) || isDisplay(m.words, len))) {
          lines.push(`- action ${i}: "${m.words}" is a short phrase typed on a long line (${r1(len)}px, x ${m.box.x} to ${m.box.x + m.box.w}, y ${m.box.y}): the line sets its SIZE. ` +
            `It is a big heading on ONE line (white-space: nowrap) whose letters run about the drawn ${r1(len)}px: font-size about ${spanFontPx(m.words, len)}px (adjust so the width matches), ${BIG_WORD.test(m.words) && !/\b(bold|heavy|black)\b/i.test(m.words) ? 'weight as its note says' : 'bold'}, letters sitting on y ${m.box.y}` +
            (isDisplay(m.words, len)
              ? `: the line is the letters' BASELINE, their bottom edge on y ${m.box.y}, not above it (with line-height 1 the block's top is about 0.85 of the font-size above y ${m.box.y}; never leave the space under the letters between them and the line; checked on the page).`
              : '.'))
        }
        const h = holderOf(m, boxes, viewport, divs)
        const side = sideOf(m.box, h)
        const x0 = m.box.x, x1 = m.box.x + m.box.w, y = m.box.y
        // n195: a list row: body size, its label at the line's left end and its value at the right end
        if (row) {
          const lv = labelValue(m.words)
          lines.push(`- action ${i}: "${m.words}" is typed on a ruled list line from x ${x0} to ${x1} at y ${y}: it is ONE ROW of a list, body size (about 15px, the same size as the other rows), never a heading. ` +
            (lv ? `Its label "${lv.label}" starts at x ${x0} (left) and its value "${lv.value}" ends at x ${x1} (right), on one line (flex, justify-content: space-between, the row as wide as the line).` : `Its words start at x ${x0} (left).`))
          continue
        }
        const inBox = h.w === viewport.w && h.x === 0 ? 'on the page' : `in the box (or column) at (${r1(h.x)},${r1(h.y)}) ${r1(h.w)}x${r1(h.h)}`
        lines.push(side === 'left'
          ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, ${r1(x0 - h.x)}px in from its LEFT edge: ` +
            `the words are LEFT-aligned and their first letter starts at x ${x0} (text-align: left; never centred in the box, no mx-auto or text-center on them).`
          : side === 'right'
            ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, near its RIGHT edge: ` +
              `the words are RIGHT-aligned and end at x ${x1} (text-align: right).`
            : `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, centred ${inBox}: centre the words on x ${r1((x0 + x1) / 2)}; ${rowBrief(m.words, x0, x1)}.`)
      }
      if (m.barLabel) {
        const l = m.barLabel, b = m.box
        lines.push(`- action ${i}: the words "${l.text}" were typed at the ${l.side.toUpperCase()} end of the long bar drawn at (${b.x},${b.y}) ${b.w}x${b.h}: inside the bar, on ONE line (white-space: nowrap), vertically centred, ` +
          (l.side === 'left' ? `starting about 12-16px in from its left edge (near x ${b.x + 14}), text-align: left; never centred in the bar.` : `ending about 12-16px in from its right edge (near x ${b.x + b.w - 14}), text-align: right; never centred in the bar.`))
      }
      if (m.typed?.length) {
        for (const t of m.typed) {
          lines.push(`- action ${i}: the note "${t.text}" was typed at (${t.x},${t.y}), in ${where(m.box, t.x, t.y)} drawn at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}. ` +
            `If those words are copy shown on the page (a heading, a line, a label), they sit there, at about y ${t.y}, not at the top or the middle of the box by default; ` +
            `a note that only describes the box (its colours, what it holds) has no spot.` +
            ((u) => u ? ` They are their OWN line just ABOVE the smaller box drawn at (${u.x},${u.y}) ${u.w}x${u.h} (that box has its own words): never put them inside that box.` : '')(boxUnder(m.box, t, all)))
        }
      }
    }
  })
  return lines.length
    ? `WHERE THE WORDS SIT (deterministic, from where the lines were drawn and the notes typed; checked on the page):\n${lines.join('\n')}\n\n`
    : ''
}

/**
 * n171: the smaller box drawn inside `holder` right under a spot typed in it: its top 4 to 70px below the spot, the
 * spot over its span, the spot outside it. Round 42 e3 (cart): "Total $199 bold" typed 37px above the Checkout button.
 */
export function boxUnder(holder: BBox, t: { x: number; y: number }, marks: readonly ShapeMark[]): BBox | null {
  const hits = marks.filter((b) => b.shape === 'box' && !b.area && b.box.w >= 40 && b.box.h >= 20 &&
    b.box.w * b.box.h < holder.w * holder.h * 0.6 &&
    b.box.x >= holder.x - 4 && b.box.y >= holder.y - 4 && b.box.x + b.box.w <= holder.x + holder.w + 4 && b.box.y + b.box.h <= holder.y + holder.h + 4 &&
    t.x >= b.box.x && t.x <= b.box.x + b.box.w && b.box.y - t.y >= 4 && b.box.y - t.y <= 70)
  return hits.sort((a, b) => a.box.y - b.box.y)[0]?.box ?? null
}

/** n171: the words of a note that are copy (capitalised, or with a digit): "Total $199 bold" gives total, $199. */
export function copyTokens(text: string): string[] {
  return text.split(/[\s,]+/).filter((w) => /\d|^[\p{Lu}$€£]/u.test(w)).map((w) => norm(w)).filter((w) => w.length >= 2)
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
  const boxes = [...marks.filter(isBox), ...dividers.filter(isBox)]
  const divs = [...uprights(marks), ...uprights(dividers)]
  const faults: string[] = []
  let judged = 0
  for (const m of marks) {
    if (isLevel(m) && m.words && m.rule) continue // n142: checked by rule-labels
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
    // n246: a bar's short label sits at the end it was typed at
    if (m.barLabel) {
      const b = m.box, want = copyTokens(m.barLabel.text).join(' ')
      const hit = !want ? undefined : after.nodes.filter((n) => n.textBox && n.textBox.w > 0 && copyTokens(n.text ?? '').join(' ') === want &&
        n.textBox.y + n.textBox.h > b.y - 4 && n.textBox.y < b.y + b.h + 4 && n.textBox.x + n.textBox.w > b.x && n.textBox.x < b.x + b.w)[0]
      if (hit) {
        judged++
        const tb = hit.textBox!
        if (m.barLabel.side === 'left' && tb.x > b.x + Math.max(40, b.w * 0.15)) faults.push(`"${m.barLabel.text}" was typed at the LEFT end of the bar at (${b.x},${b.y}) ${b.w}x${b.h}; its letters start at x ${r1(tb.x)}: left-align them so the first letter is near x ${b.x + 14} (drop centring); change nothing else`)
        if (m.barLabel.side === 'right' && tb.x + tb.w < b.x + b.w - Math.max(40, b.w * 0.15)) faults.push(`"${m.barLabel.text}" was typed at the RIGHT end of the bar at (${b.x},${b.y}) ${b.w}x${b.h}; its letters end at x ${r1(tb.x + tb.w)}: right-align them to end near x ${b.x + b.w - 14}; change nothing else`)
      }
    }
    for (const typed of m.typed ?? []) {
      // n171: words typed just above a smaller box inside this one (a button) never land inside that box
      const u = boxUnder(m.box, typed, marks)
      if (u) {
        const words = copyTokens(typed.text)
        const inBox = words.length ? after.nodes.filter((n) => n.text && n.textBox && norm(n.text).split(' ').every((w) => words.includes(w)) &&
          n.textBox.x + n.textBox.w / 2 >= u.x - 4 && n.textBox.x + n.textBox.w / 2 <= u.x + u.w + 4 &&
          n.textBox.y + n.textBox.h / 2 >= u.y - 4 && n.textBox.y + n.textBox.h / 2 <= u.y + u.h + 4) : []
        if (words.length) judged++
        if (inBox.length) {
          faults.push(`"${typed.text}" was typed at y ${typed.y}, ABOVE the box drawn at (${u.x},${u.y}) ${u.w}x${u.h}, but ${inBox.map((n) => `"${n.text}"`).join(', ')} sit${inBox.length > 1 ? '' : 's'} inside that box: ` +
            `take them out and make them their own line just above it (at about y ${typed.y}); the box keeps only its own words; change nothing else`)
        }
      }
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
export interface PlacedNote { text: string; x: number; y: number; openRows?: OpenRows; leftAt?: number; table?: import('./tablerows.js').TableRows }

/** n145: a list starts this far under the spot its heading was typed at. */
export const LIST_UNDER_HEADING_PX = 40

/**
 * n145: a list note typed in empty space below its heading starts right under that heading, not at the note's spot.
 * Round 40 e2: "Ingredients bold" was typed at y 322 and the checkbox list note under it at y 440 (a person types a
 * long note where there is room); the list was built from y 440, about 80px lower than the heading put it. The
 * heading is a short note (four words or fewer, no colon) typed 50 to 220px above it, within 160px of its left,
 * with no other note and no drawn mark between them (a mark between is where the list really starts). In place of
 * the note's y, the list is told and checked at heading y + 40. Other placed notes keep their spot.
 */
export function listUnderHeading(placed: PlacedNote[], notes: readonly PlacedNote[], marks: readonly BBox[]): PlacedNote[] {
  return placed.map((n) => {
    if (!listNote(n.text)) return n
    const heads = notes.filter((h) => h !== n && h.text !== n.text && !h.text.includes(':') &&
      h.text.trim().split(/\s+/).length <= 4 && n.y - h.y >= 50 && n.y - h.y <= 220 && Math.abs(h.x - n.x) <= 160)
      .sort((a, b) => b.y - a.y)
    const h = heads[0]
    if (!h) return n
    const x0 = Math.min(h.x, n.x) - 40, x1 = Math.max(h.x, n.x) + 300
    const between = notes.some((o) => o !== h && o !== n && o.text !== n.text && o.y > h.y + 8 && o.y < n.y - 8 && o.x >= x0 - 260 && o.x <= x1)
    const inside = (b: BBox, p: PlacedNote) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h
    const blocked = marks.some((b) => !(inside(b, h) && inside(b, n)) &&
      b.y + b.h > h.y + 14 && b.y < n.y - 14 && b.x + b.w > x0 && b.x < x1)
    if (between || blocked) return n
    return { ...n, y: h.y + LIST_UNDER_HEADING_PX }
  })
}

export const PLACED_ROW_X_TOL_PX = 16
export const PLACED_ROW_Y_TOL_PX = 28
/** n249: the first cells of a note typed in open space on the left that lists rows ("x6 down: Maya, Barista; Tom, Barista"), or null. */
export function placedRowsOf(n: { text: string; x: number }, viewW: number): string[] | null {
  if (n.x >= viewW / 3) return null
  const d = rowData(n.text)
  if (!d || d.rows.length < 2 || d.total !== null) return null
  return d.rows.map((r) => r[0]!)
}

/** Which side of the page a spot is on (thirds). */
const pageSide = (x: number, w: number): Side => (x < w / 3 ? 'left' : x > (w * 2) / 3 ? 'right' : 'centre')

/**
 * Words typed where nothing is drawn sit where they were typed (n29). Round 31 e4: the
 * date typed at the top right, with no mark near, was a whole-sketch note and was built
 * under the city name; "Lisbon", typed above the sun, bound to the sun and sat inside it.
 */
export function placedBrief(all: PlacedNote[] | undefined, viewport: { w: number; h: number }): string {
  // n158: an open rows note is told by its own brief (openrows.ts)
  const notes = all?.filter((n) => !n.openRows && !n.table)
  if (!notes?.length) return ''
  const lines = notes.map((n) => {
    // n168: a heading typed just above a list starts at the list's left edge
    if (n.leftAt != null) {
      return `- "${n.text}" was typed at (${n.x},${n.y}) just above the list that starts at x ${n.leftAt}: it is that list's heading. ` +
        `Its words sit at about y ${n.y} and START at x ${n.leftAt}, left-aligned with the list's left edge (the row marks' left), never indented right of the rows or centred.`
    }
    const side = pageSide(n.x, viewport.w)
    if (placedRowsOf(n, viewport.w)) {
      return `- "${n.text}" was typed at (${n.x},${n.y}) with nothing drawn near it: these are rows, and that spot is where they start. ` +
        `The first cell of every row STARTS at x ${n.x}, left-aligned, whatever else runs across the row; row 1's words are centred at about y ${n.y}, the next rows under it at the drawn pitch. ` +
        `Each cell's element is only as wide as its own words (a tap on a name picks that name), never a box the width of the row with padding pushing its words in; a row's divider is its own element.`
    }
    return `- "${n.text}" was typed at (${n.x},${n.y}) with nothing drawn near it. If those words are copy shown on the page, ` +
      `they sit right there: about y ${n.y}, ${side === 'left' ? `starting near x ${n.x}` : side === 'right' ? `on the right, around x ${n.x}` : `centred near x ${n.x}`}; ` +
      `never moved under or into another block. A note that only describes the page has no spot.`
  })
  return `WORDS TYPED IN EMPTY SPACE (deterministic, from where they were typed; checked on the page):\n${lines.join('\n')}\n\n`
}

/** Placed copy is built within reach of where it was typed. Notes whose words are not on the page are not judged. */
export function verifyPlaced(all: PlacedNote[] | undefined, after: Snap): PlaceVerdict {
  const notes = all?.filter((n) => !n.openRows && !n.table)
  if (!notes?.length) return { satisfied: true, unverifiable: true, reason: 'no placed notes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const n of notes) {
    // n249 (rota, n250): rows typed in open space start at the spot typed
    const rows = placedRowsOf(n, after.viewport?.w ?? 1280)
    if (rows) {
      const first = rows[0]!.toLowerCase()
      const hit = after.nodes.find((x) => (x.text ?? '').trim().toLowerCase() === first && x.textBox)
      if (hit) {
        judged++
        const tb = hit.textBox!
        const cy = tb.y + tb.h / 2
        const off = Math.abs(tb.x - n.x) > PLACED_ROW_X_TOL_PX
        if (off || Math.abs(cy - n.y) > PLACED_ROW_Y_TOL_PX) {
          faults.push(`the rows typed at (${n.x},${n.y}) start at x ${n.x}, row 1 at about y ${n.y}, but "${rows[0]}" sits at (${r1(tb.x)},${r1(cy)}): ` +
            `${off ? `start every row's first cell at x ${n.x}` : `move the rows' words so row 1 is at about y ${n.y}`}, each cell only as wide as its words; change nothing else`)
        }
        continue
      }
    }
    const t = builtWords(n.text, after, n.y)
    if (!t) continue
    judged++
    const tb = t.textBox!
    const cy = tb.y + tb.h / 2
    const dx = n.x < tb.x ? tb.x - n.x : n.x > tb.x + tb.w ? n.x - (tb.x + tb.w) : 0
    // n168: a list heading's words start at the list's left edge
    if (n.leftAt != null && Math.abs(cy - n.y) <= 48 && Math.abs(tb.x - n.leftAt) > HEADING_LEFT_TOL_PX) {
      faults.push(`"${n.text}" is the heading of the list under it, but its words start at x ${r1(tb.x)}, not at the list's left edge x ${n.leftAt}: ` +
        `move them ${tb.x > n.leftAt ? 'left' : 'right'} ${r1(Math.abs(tb.x - n.leftAt))}px so they start at x ${n.leftAt}; change nothing else`)
      continue
    }
    if (Math.abs(cy - n.y) > 48 || dx > 120) {
      faults.push(`"${n.text}" was typed at (${n.x},${n.y}) with nothing drawn there, but its words sit at (${r1(tb.x)},${r1(cy)}): ` +
        `move them to about y ${n.y}${dx > 120 ? ` and x ${n.x}` : ''}; change nothing else`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no placed copy built' }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${judged} typed word${judged > 1 ? 's' : ''} where typed` }
}

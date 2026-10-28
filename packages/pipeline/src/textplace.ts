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
import type { ShapeMark } from './shapemark.js'

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
    if (m.shape !== 'box' || m.area || m.solid || m.box.w < 120 || m.box.h < 100) continue
    const b = m.box
    const typed = ownNotes(m, notes)
      .filter((n) => n.at && n.at.x >= b.x - 4 && n.at.x <= b.x + b.w + 4 && n.at.y >= b.y - 4 && n.at.y <= b.y + b.h + 4)
      .map((n) => ({ text: n.text, x: r1(n.at!.x), y: r1(n.at!.y) }))
    if (typed.length) m.typed = typed
  }
}

/** The smallest drawn box holding the line, else the page. */
function holderOf(line: ShapeMark, boxes: ShapeMark[], viewport: { w: number; h: number }): BBox {
  const b = line.box
  const hold = boxes.filter((o) => o.box.x <= b.x + 6 && o.box.x + o.box.w >= b.x + b.w - 6 && o.box.y <= b.y + 2 && o.box.y + o.box.h >= b.y - 2)
    .sort((p, q) => p.box.w * p.box.h - q.box.w * q.box.h)[0]
  return hold ? hold.box : { x: 0, y: 0, w: viewport.w, h: viewport.h }
}

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

type ActionLike = { shapeMarks?: ShapeMark[] }

export function textPlaceBrief(actions: ActionLike[], viewport: { w: number; h: number }): string {
  const all = actions.flatMap((a) => a.shapeMarks ?? [])
  const boxes = all.filter(isBox)
  const lines: string[] = []
  actions.forEach((a, i) => {
    for (const m of a.shapeMarks ?? []) {
      if (isLevel(m) && m.words) {
        const h = holderOf(m, boxes, viewport)
        const side = sideOf(m.box, h)
        const x0 = m.box.x, x1 = m.box.x + m.box.w, y = m.box.y
        const inBox = h.w === viewport.w && h.x === 0 ? 'on the page' : `in the box at (${h.x},${h.y}) ${h.w}x${h.h}`
        lines.push(side === 'left'
          ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, ${r1(x0 - h.x)}px in from its LEFT edge: ` +
            `the words are LEFT-aligned and their first letter starts at x ${x0} (text-align: left; never centred in the box, no mx-auto or text-center on them).`
          : side === 'right'
            ? `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, ${inBox}, near its RIGHT edge: ` +
              `the words are RIGHT-aligned and end at x ${x1} (text-align: right).`
            : `- action ${i}: "${m.words}" is typed on the level line drawn from x ${x0} to ${x1} at y ${y}, centred ${inBox}: centre the words on x ${r1((x0 + x1) / 2)}.`)
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
export function verifyTextPlace(marks: ShapeMark[], after: Snap, viewport: { w: number; h: number }): PlaceVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const boxes = marks.filter(isBox)
  const faults: string[] = []
  let judged = 0
  for (const m of marks) {
    if (isLevel(m) && m.words) {
      const side = sideOf(m.box, holderOf(m, boxes, viewport))
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

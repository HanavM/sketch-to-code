/**
 * Words at the two ends of a long line keep their sides (n81).
 *
 * Round 35 e4 (pharmacy) and e5 (split bill), n77: a header was drawn as one rule right across the page, with
 * the logo typed above its left end ("wellcare, teal bold") and the links above its right end ("Prescriptions
 * Orders Help, grey"). A level line only kept its FIRST note as its words, and a line spanning the whole page
 * sits centred on it, so the build was told "centre the words on x 640": logo and links were built together in
 * the middle, and the header grew from the drawn 75px to 108px (sized as a heading by the long line). n77 needed
 * a fix note on both pages to put them back.
 *
 * A person who types words at the ends of a long line means those ends. Here, for a level line that runs most of
 * its holder (a rule, a bar's edge): every note typed on it keeps the side of the line it was typed at (left
 * third, middle, right third of the line), all of them, not only the first; such a line is never a heading
 * sized by its length; and when it sits near the top of the page with its words above it, it is the bottom
 * edge of a bar of that height. Told to the build and checked on the page: the left words start in the line's
 * left part, the right words end in its right part. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'

interface NoteLike { text: string; focus?: string[]; at?: { x: number; y: number }; strokeIds?: string[] }
interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface EndsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export type EndSide = 'left' | 'centre' | 'right'
export interface LineEnd { text: string; x: number; y: number; side: EndSide }

const r1 = (v: number) => Math.round(v)
const isLevel = (m: ShapeMark) => m.shape === 'line' && !m.edge && !!m.from && !!m.to && Math.abs(m.from.y - m.to.y) <= 2

/** A long line: most of the page (or at least 600px), the kind drawn as a bar's edge or a rule. */
export function isLongRule(m: ShapeMark, pageW: number): boolean {
  return isLevel(m) && m.box.w >= Math.min(600, pageW * 0.6)
}

/** Which part of the line a spot is over: its left third, middle or right third. */
export function endSide(x: number, x0: number, x1: number): EndSide {
  const f = (x - x0) / Math.max(1, x1 - x0)
  return f < 0.34 ? 'left' : f > 0.66 ? 'right' : 'centre'
}

/**
 * The notes typed on a long line, each with its side; null unless two or more sit at different parts of it.
 */
export function lineEnds(m: ShapeMark, own: NoteLike[], pageW: number): LineEnd[] | null {
  if (!isLongRule(m, pageW)) return null
  const x0 = m.box.x, x1 = m.box.x + m.box.w
  const placed = own.filter((n) => n.at).map((n) => ({ text: n.text, x: r1(n.at!.x), y: r1(n.at!.y), side: endSide(n.at!.x, x0, x1) }))
  // two or more notes at different parts of the line (a single note on a long line is a heading or a centred
  // label: textplace and linespan tell those)
  if (placed.length < 2 || new Set(placed.map((p) => p.side)).size < 2) return null
  return placed.sort((a, b) => a.x - b.x)
}

const copyOf = (t: string) => {
  const i = t.indexOf(',')
  return (i === -1 ? t : t.slice(0, i)).replace(/\s+/g, ' ').trim()
}
const q = (s: string) => `"${s}"`

type ActionLike = { shapeMarks?: ShapeMark[]; onScreen?: unknown }

/** A bar the line is the bottom edge of: near the top, its words typed above it. */
const barOf = (m: ShapeMark, ends: LineEnd[]) => m.box.y <= 160 && ends.every((e) => e.y <= m.box.y + 6) ? r1(m.box.y) : null

export function lineEndsBrief(actions: readonly ActionLike[]): string {
  const lines: string[] = []
  actions.forEach((a, i) => {
    if (a.onScreen) return
    for (const m of a.shapeMarks ?? []) {
      if (!m.ends?.length) continue
      const x0 = r1(m.box.x), x1 = r1(m.box.x + m.box.w), y = r1(m.box.y)
      const parts = m.ends.map((e) => e.side === 'left'
        ? `${q(e.text)} typed at its LEFT end (x ${String(e.x)}): left-aligned, its first letter near x ${String(Math.max(x0 + 16, Math.min(e.x, x0 + 48)))}, never centred`
        : e.side === 'right'
          ? `${q(e.text)} typed at its RIGHT end (x ${String(e.x)}): right-aligned, its last letter near x ${String(x1 - 32)}, pushed to the right (justify-content: space-between or margin-left: auto), never centred`
          : `${q(e.text)} typed over its middle (x ${String(e.x)}): centred on x ${String(e.x)}`)
      const bar = barOf(m, m.ends)
      lines.push(`- action ${String(i)}: the long line drawn from x ${String(x0)} to ${String(x1)} at y ${String(y)} has words typed at its ends, ONE row: ${parts.join('; ')}. ` +
        `They are separate groups at their own ends (a logo at the left and links at the right is the usual header), never one group centred together. ` +
        `Several words in one group separated by spaces (links, tabs) are each their own item in a row with gaps. ` +
        `The long line only places them; it never sizes them: normal header size (about 15-22px) unless a note says big. ` +
        (bar !== null ? `The line is the bottom edge of a bar about ${String(bar)}px tall from the top of the page (a header; a thin border there if the line was drawn as one), its words vertically centred in it; keep that height.` : `The words sit just above the line.`))
    }
  })
  return lines.length ? `WORDS AT THE ENDS OF A LONG LINE (deterministic, from where the notes were typed; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’.,!?:;]/g, '').replace(/\s+/g, ' ').trim()

/** The built text for an end's words, near the line: the leaf holding its first word (or all its words). */
function builtEnd(e: LineEnd, lineY: number, after: Snap): { x0: number; x1: number } | null {
  const words = norm(copyOf(e.text)).split(' ').filter((w) => w.length >= 2)
  if (!words.length) return null
  const near = after.nodes.filter((n) => n.textBox && (n.text ?? '').trim() && Math.abs(n.textBox.y + n.textBox.h / 2 - lineY) <= 120 && n.textBox.w > 0)
  const whole = near.filter((n) => norm(n.text!).includes(words.join(' '))).sort((a, b) => a.textBox!.w - b.textBox!.w)[0]
  if (whole) return { x0: whole.textBox!.x, x1: whole.textBox!.x + whole.textBox!.w }
  // links built as separate items: the span from the first word's item to the last word's
  const hits = words.map((w) => near.filter((n) => norm(n.text!).split(' ').includes(w)).sort((a, b) => a.textBox!.w - b.textBox!.w)[0])
  if (hits.some((h) => !h)) return null
  return { x0: Math.min(...hits.map((h) => h!.textBox!.x)), x1: Math.max(...hits.map((h) => h!.textBox!.x + h!.textBox!.w)) }
}

/** Left words start in the line's left part, right words end in its right part. */
export function verifyLineEnds(marks: readonly ShapeMark[], after: Snap): EndsVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const m of marks) {
    if (!m.ends?.length) continue
    const x0 = m.box.x, x1 = m.box.x + m.box.w, len = x1 - x0
    for (const e of m.ends) {
      if (e.side === 'centre') continue
      const t = builtEnd(e, m.box.y, after)
      if (!t) continue
      judged++
      if (e.side === 'left' && t.x0 > x0 + len * 0.25) {
        faults.push(`${q(copyOf(e.text))} was typed at the LEFT end of the line from x ${r1(x0)} to ${r1(x1)} (y ${r1(m.box.y)}) but starts at x ${r1(t.x0)}: ` +
          `put it at the left, first letter near x ${r1(Math.max(x0 + 16, Math.min(e.x, x0 + 48)))} (no centring of the row it is in; space-between with the right-end words)`)
      }
      if (e.side === 'right' && t.x1 < x1 - len * 0.25) {
        faults.push(`${q(copyOf(e.text))} was typed at the RIGHT end of the line from x ${r1(x0)} to ${r1(x1)} (y ${r1(m.box.y)}) but ends at x ${r1(t.x1)}: ` +
          `push it to the right so it ends near x ${r1(x1 - 32)} (margin-left: auto or justify-content: space-between; never centred with the left-end words)`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no words at the ends of a long line found' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '; change nothing else' }
    : { satisfied: true, reason: `${String(judged)} group${judged > 1 ? 's' : ''} of words kept at their end of a long line` }
}

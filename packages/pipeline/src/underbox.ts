/**
 * Words typed under a drawn box stay under it (n268).
 *
 * n266 library search: four tall covers drawn, and under each one a title, an author and a badge typed in the open
 * space below. The build took them for the box's words, was told "beside or inside", and put all of them inside
 * the covers. Two fixes moved them out and lost about 120 px of cover. Where a note is typed is the person's
 * layout: notes typed in open space under a box of real size are its caption block, below its bottom edge.
 * Told to the build and checked on the page. Small marks (a pill, a chip) are left out: a note under one can be
 * just where the note landed. Zero tokens.
 */
import type { ShapeMark } from './shapemark.js'
import { copyOf, looksOnly } from './rowwords.js'
import { wordsOf } from './ownwords.js'
import { nameList, noteParts, specNote, withoutLookTail } from './typedcopy.js'

interface NoteLike { text: string; at?: { x: number; y: number } }
interface NodeLike { text?: string; textBox?: { x: number; y: number; w: number; h: number } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface UnderVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const MIN_BOX_PX = 60
/** The first note starts this close under the bottom edge, and each next line this close under the last. */
const FIRST_GAP_PX = 40
const NEXT_GAP_PX = 50
const closedBox = (m: ShapeMark) => (m.shape === 'box' || m.shape === 'ellipse') && !m.glyph && !m.each

/** Record, on each box of real size, the notes typed in open space right under it (in place). */
export function markUnderWords(marks: ShapeMark[], notes: readonly NoteLike[]): void {
  for (const m of marks) {
    if (!closedBox(m) || m.box.w < MIN_BOX_PX || m.box.h < MIN_BOX_PX) continue
    const b = m.box, bottom = b.y + b.h
    const inColumn = notes.filter((n) => n.at && n.at.x >= b.x - 12 && n.at.x < b.x + b.w && n.at.y > bottom + 3)
      .sort((p, q) => p.at!.y - q.at!.y)
    const under: NonNullable<ShapeMark['under']> = []
    let last = bottom
    for (const n of inColumn) {
      if (n.at!.y - last > (under.length ? NEXT_GAP_PX : FIRST_GAP_PX)) break
      // something else drawn between the box and the note, or around the note, owns it
      const other = marks.some((o) => o !== m && o.box.y >= bottom - 2 && o.box.y <= n.at!.y && o.box.x < b.x + b.w && o.box.x + o.box.w > b.x) ||
        marks.some((o) => o !== m && closedBox(o) && n.at!.x >= o.box.x && n.at!.x <= o.box.x + o.box.w && n.at!.y >= o.box.y && n.at!.y <= o.box.y + o.box.h &&
          !(o.box.x <= b.x && o.box.y <= b.y && o.box.x + o.box.w >= b.x + b.w && o.box.y + o.box.h >= bottom))
      if (other) break
      last = n.at!.y
      if (looksOnly(n.text) || specNote(n.text) || nameList(n.text)) continue
      const copy = withoutLookTail(noteParts(copyOf(n.text)).copy || copyOf(n.text))
      under.push({ text: n.text, copy, y: n.at!.y })
    }
    if (under.length) m.under = under
  }
}

const where = (m: ShapeMark) => `(${String(m.box.x)},${String(m.box.y)}) ${String(m.box.w)}x${String(m.box.h)}`

export function underWordsBrief(actions: ReadonlyArray<{ shapeMarks?: ShapeMark[] }>): string {
  const lines = actions.flatMap((a) => a.shapeMarks ?? []).filter((m) => m.under?.length).map((m) => {
    const u = m.under!, bottom = m.box.y + m.box.h
    return `- the box at ${where(m)} ends at y ${String(bottom)}. ${u.map((t) => `"${t.copy}"`).join(', ')} ${u.length > 1 ? 'were' : 'was'} typed under it: ` +
      `they sit below that edge, outside the box, in its column from x ${String(m.box.x)}, in this order, starting at about y ${String(u[0]!.y)}. None of them inside the box. ` +
      `The box keeps exactly its drawn size, and its colour stops at its edge: it is not a card that wraps these words.`
  })
  return lines.length ? `WORDS TYPED UNDER A DRAWN BOX (deterministic, from where each note was typed; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

export function verifyUnderWords(marks: readonly ShapeMark[], after: Snap): UnderVerdict {
  const boxes = marks.filter((m) => m.under?.length)
  if (!boxes.length) return { satisfied: true, unverifiable: true, reason: 'no words typed under a drawn box' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  let judged = 0
  for (const m of boxes) {
    const b = m.box, bottom = b.y + b.h
    for (const u of m.under!) {
      const want = wordsOf(u.copy)
      if (!want.length) continue
      const hits = after.nodes.filter((n) => {
        const t = n.textBox
        if (!n.text || !t || t.w < 2 || t.h < 2 || t.x + t.w / 2 < b.x - 12 || t.x + t.w / 2 > b.x + b.w + 12) return false
        const got = new Set(wordsOf(n.text))
        return want.every((w) => got.has(w))
      })
      if (!hits.length) continue
      judged++
      const inside = hits.find((n) => { const cy = n.textBox!.y + n.textBox!.h / 2; return cy >= b.y && cy < bottom - 2 })
      if (inside && !hits.some((n) => n.textBox!.y + n.textBox!.h / 2 >= bottom - 2)) {
        faults.push(`"${u.copy}" was typed under the box at ${where(m)}, but it sits inside it at y ${String(Math.round(inside.textBox!.y))}: move it below y ${String(bottom)}, to about y ${String(u.y)}, outside the box; the box keeps exactly its drawn size`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'words typed under a box not found on the page' }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${String(judged)} typed word${judged > 1 ? 's' : ''} kept under their box` }
}

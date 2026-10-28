/**
 * One note for a group puts its contents on every member; a box noted as a quote mark is the glyph (n32).
 *
 * Round 31 c3 (hand, n27 and n31): "3 tilted stacked cards, white plastik top left, •••• 4 digits
 * bottom" reached all three cards after n31, but the logo and the digits were built on one card only.
 * A person who types a note about a group means each of them carries what it says. So every closed
 * mark the note's group covers is flagged `each`, codegen is told to repeat the note's contents on
 * every member in the same spot, and the page is checked: when one member holds text, every member
 * holds about as much. Round 31 c5: a small box with "big yellow quote mark" was built as a yellow box,
 * and the fix built a closing ” where the page opens a quote. A box or ring noted as a quote mark is the
 * glyph itself (opening “ unless the note says closing), told and checked on the page. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { groupCount } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'

interface NoteLike { text: string; focus?: string[]; strokeIds?: string[] }

const QUOTE = /\b(?:quot(?:e|ation)[\s-]*marks?|quotes?\s+glyph|big\s+(?:\w+\s+)?quotes?|open(?:ing)?\s+quotes?|clos(?:e|ing)\s+quotes?)\b|[“”❝❞]/i

/** The glyph a note asks a mark to be ("big yellow quote mark" → “), or null. */
export function glyphOf(text: string): { char: string; name: string } | null {
  if (!QUOTE.test(text)) return null
  if (/\bclos(?:e|ing)\b|”|❞|\bend(?:ing)?\b/i.test(text) && !/\bopen(?:ing)?\b|“|❝/i.test(text)) return { char: '”', name: 'closing quote mark' }
  return { char: '“', name: 'opening quote mark' }
}

/** Flag closed marks whose own note asks for a quote glyph (in place); run before markSolids. */
export function markGlyphs(marks: ShapeMark[], notes: NoteLike[]): void {
  const closed = marks.filter((m) => m.shape === 'box' || m.shape === 'ellipse')
  for (const m of closed) {
    const own = notes.filter((n) => (n.focus?.includes(m.strokeId) && n.focus.length <= 2) || (!n.focus?.length && n.strokeIds?.length === 1 && n.strokeIds[0] === m.strokeId))
    for (const n of own) {
      const g = glyphOf(n.text)
      if (g) { m.glyph = g; delete m.solid; break }
    }
  }
}

/** Flag the closed marks a group note covers (in place). */
export function markEach(marks: ShapeMark[], notes: NoteLike[]): void {
  for (const n of notes) {
    // the group is the note's focus; a note whose whole cluster is the group carries no focus, only its strokes
    const ids = n.focus?.length ? n.focus : n.strokeIds ?? []
    if (ids.length < 2 || groupCount(n.text) === null) continue
    const members = marks.filter((m) => (m.shape === 'box' || m.shape === 'ellipse') && ids.includes(m.strokeId))
    if (members.length < 2) continue
    for (const m of members) if (!m.each) m.each = { note: n.text, of: members.length }
  }
}

/** A quote mark's ink is about a third of its em: the font-size that makes it as tall as drawn. */
const glyphFont = (m: ShapeMark) => Math.round(m.box.h * 3)

const where = (m: ShapeMark) => m.tilt
  ? `the box turned ${Math.round(m.tilt.deg)} degrees centred at (${m.tilt.cx},${m.tilt.cy}), ${m.tilt.w}x${m.tilt.h}`
  : `the ${m.shape === 'ellipse' ? 'ring' : 'box'} at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}`

function groups(marks: ShapeMark[]): Map<string, ShapeMark[]> {
  const g = new Map<string, ShapeMark[]>()
  for (const m of marks) {
    if (!m.each) continue
    const l = g.get(m.each.note) ?? []
    if (!l.some((x) => x.strokeId === m.strokeId)) l.push(m)
    g.set(m.each.note, l)
  }
  for (const [k, l] of g) if (l.length < 2) g.delete(k)
  return g
}

export function eachBrief(actions: Array<{ shapeMarks?: ShapeMark[] }>): string {
  const marks = actions.flatMap((a) => a.shapeMarks ?? [])
  const lines: string[] = []
  for (const [note, l] of groups(marks)) {
    lines.push(`- "${note}" is about EACH of these ${l.length} marks: ${l.map(where).join('; ')}. Whatever it puts on one ` +
      `(words, a logo or name, numbers, dots, an icon) goes on EVERY one of them, in the same spot on each (top left on one = top left ` +
      `on all), inside that mark and turning with it; any style it names applies to each. Never only on the top or first one.`)
  }
  for (const m of marks) {
    if (!m.glyph) continue
    lines.push(`- ${where(m)} is not a box or a shape: it is the ${m.glyph.name} character ${m.glyph.char} as TEXT, its letters about ` +
      `${m.box.h}px tall filling the drawn spot (a quote mark's ink is only about a third of its font-size, so font-size about ${glyphFont(m)}px, line-height 1), in the colour noted, ` +
      `no background, border or shape behind it. Use exactly ${m.glyph.char}, not ${m.glyph.char === '“' ? '”' : '“'} or a straight ".`)
  }
  return lines.length ? `ONE NOTE FOR A GROUP, AND GLYPHS (deterministic, from the drawing; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

interface NodeLike { id: string; tag: string; text: string; rect: BBox; textBox?: BBox; style: { transform?: string; fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
type Verdict = { satisfied: boolean; unverifiable?: boolean; reason: string }

/** Is page point p inside the mark (its turned box when drawn turned)? */
function inside(m: ShapeMark, p: { x: number; y: number }): boolean {
  if (m.tilt) {
    const r = -m.tilt.deg * Math.PI / 180, dx = p.x - m.tilt.cx, dy = p.y - m.tilt.cy
    const ux = dx * Math.cos(r) - dy * Math.sin(r), uy = dx * Math.sin(r) + dy * Math.cos(r)
    return Math.abs(ux) <= m.tilt.w / 2 + 4 && Math.abs(uy) <= m.tilt.h / 2 + 4
  }
  const b = m.box
  return p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4
}

export function verifyEach(marks: ShapeMark[], after: Snap): Verdict {
  const gs = groups(marks)
  if (!gs.size) return { satisfied: true, unverifiable: true, reason: 'no group notes' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes.filter((n) => n.text.trim().length > 0 && n.rect.w > 0 && n.rect.h > 0)
  const faults: string[] = []
  let judged = 0
  for (const [note, l] of gs) {
    // a text counts for every member it sits in (a fanned stack overlaps); copies are counted by
    // their words with digits ignored, so "•••• 4821" on one card and "•••• 1111" on the next are the same thing
    const held = new Map<string, number>(l.map((m) => [m.strokeId, 0]))
    const copies = new Map<string, Set<string>>()
    for (const t of texts) {
      const b = t.textBox ?? t.rect
      const p = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
      const holders = l.filter((m) => inside(m, p))
      if (!holders.length) continue
      for (const m of holders) held.set(m.strokeId, held.get(m.strokeId)! + 1)
      const key = t.text.trim().toLowerCase().replace(/\d+/g, '#').slice(0, 24)
      copies.set(key, (copies.get(key) ?? new Set()).add(t.id))
    }
    if (!copies.size) continue
    judged++
    const short = [...copies].filter(([, ids]) => ids.size < l.length).map(([k]) => k)
    const empty = l.filter((m) => held.get(m.strokeId) === 0)
    if (empty.length || short.length > copies.size / 2) {
      faults.push(`"${note}" is about each of ${l.length} marks, but ${short.slice(0, 4).map((k) => `"${k}"`).join(', ')} ${short.length > 1 ? 'are' : 'is'} built fewer than ${l.length} times` +
        `${empty.length ? ` and ${empty.map(where).join('; ')} ${empty.length > 1 ? 'hold' : 'holds'} no text` : ''}: put the same contents on each mark, in the same spot on each, changing nothing else`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'group notes put no text on their marks' }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${judged} group note${judged > 1 ? 's' : ''} carried on every member` }
}

export function verifyGlyphs(marks: ShapeMark[], after: Snap): Verdict {
  const gl = marks.filter((m) => m.glyph)
  if (!gl.length) return { satisfied: true, unverifiable: true, reason: 'no glyph marks' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const m of gl) {
    const g = m.glyph!
    const pad = Math.max(40, m.box.h)
    const near = after.nodes.filter((n) => {
      const b = n.textBox ?? n.rect
      return n.text && b.x < m.box.x + m.box.w + pad && b.x + b.w > m.box.x - pad && b.y < m.box.y + m.box.h + pad && b.y + b.h > m.box.y - pad
    })
    const right = near.find((n) => n.text.includes(g.char) || (g.char === '“' && n.text.includes('❝')))
    if (right) {
      // n32 (c5 try 1): “ at font-size 103 for a 47px mark came out a third of the drawn size
      const fs = parseFloat(right.style.fontSize ?? '')
      if (fs && fs < glyphFont(m) * 0.75) faults.push(`${where(m)}: the ${g.char} is built at font-size ${Math.round(fs)}px, its ink about a third of that, much smaller than drawn: set font-size about ${glyphFont(m)}px, changing nothing else`)
      continue
    }
    const wrong = near.find((n) => /[“”"❝❞]/.test(n.text))
    faults.push(wrong
      ? `${where(m)} should be ${g.char} (${g.name}) but "${wrong.text.slice(0, 12)}" was built: use exactly ${g.char}, changing nothing else`
      : `${where(m)} should be the ${g.name} ${g.char} as text filling that spot (font-size about ${glyphFont(m)}px), no box behind it; none was built there`)
  }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${gl.length} glyph${gl.length > 1 ? 's' : ''} built as typed` }
}

/**
 * Short heading lines land on their drawn lines (n218).
 *
 * Round 41 c4 (chess night, n164): "CHECK / MATE huge bold caps, MATE outlined only" was typed on the first of two
 * level lines drawn 133px apart, 501 and 384px long. Nothing checked it: the stack check only judges text of three
 * words or more, and the words are one each. One build set CHECK at 60px (249px long, half the line) with MATE far
 * under it; the next got the size right and put MATE 55px low, over the date line. Likeness swung 79 to 83.
 *
 * Here a stack of drawn lines whose note says which words go on which line (a slash between them, or exactly one
 * word per line) is told line by line: each piece on its own line, letters' bottom on it, one size that makes the
 * longest drawn line run its drawn length. The page is checked piece by piece. Zero tokens.
 */
import type { ShapeMark } from './shapemark.js'
import { noteParts } from './typedcopy.js'

interface NodeLike { id: string; rect: { x: number; y: number; w: number; h: number }; text?: string; textBox?: { x: number; y: number; w: number; h: number }; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface StackWordsVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }
type ActionLike = { shapeMarks?: ShapeMark[]; notes?: string[] }

export interface StackPiece { text: string; x0: number; x1: number; y: number }
export interface WordStack { pieces: StackPiece[]; fontPx: number; pitch: number; note: string }

const clean = (s: string) => s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
/** Each piece of a stack is a few words: a sentence wrapping over its lines is the stack check's. */
const MAX_PIECE_WORDS = 3

/** Which words go on which of `lines` drawn lines: slash-separated, or one word each; null when the note doesn't say. */
export function piecesOf(words: string, lines: number): string[] | null {
  const copy = noteParts(words).copy
  const bySlash = copy.split(/\s+\/\s+|\s*\n\s*/).map(clean).filter(Boolean)
  if (bySlash.length === lines && bySlash.every((p) => p.split(/\s+/).length <= MAX_PIECE_WORDS)) return bySlash
  if (bySlash.length > 1) return null
  const byWord = copy.split(/\s+/).map(clean).filter(Boolean)
  return byWord.length === lines ? byWord : null
}

/** The font-size that makes the longest piece run its drawn length, held to what the drawn line spacing can carry. */
function stackFont(pieces: StackPiece[], pitch: number): number {
  const widest = pieces.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a))
  const caps = widest.text === widest.text.toUpperCase()
  const fit = (widest.x1 - widest.x0) / (Math.max(1, widest.text.length) * (caps ? 0.66 : 0.52))
  return Math.round(Math.min(fit, pitch * 1.1))
}

/**
 * Two or more level lines read as one heading: an action holding only those lines and one note saying which words go
 * on which (live, the note typed "on these 2 lines" sets no line's own words, and tall spacing forms no textSize), or
 * the same note kept as the first line's words.
 */
export function wordStacks(actions: readonly ActionLike[]): WordStack[] {
  const out: WordStack[] = []
  for (const a of actions) {
    const all = a.shapeMarks ?? []
    if (all.length < 2 || all.some((m) => m.shape !== 'line' || !m.from || !m.to || Math.abs(m.from.y - m.to.y) > 6)) continue
    const marks = all.slice().sort((p, q) => p.box.y - q.box.y)
    const worded = marks.filter((m) => m.words)
    const notes = a.notes ?? []
    const note = worded.length === 1 && worded[0] === marks[0] ? worded[0]!.words! : !worded.length && notes.length === 1 ? notes[0]! : null
    if (!note) continue
    const texts = piecesOf(note, marks.length)
    if (!texts) continue
    const pieces = marks.map((m, k) => ({ text: texts[k]!, x0: m.box.x, x1: m.box.x + m.box.w, y: m.box.y }))
    const pitch = Math.round((pieces[pieces.length - 1]!.y - pieces[0]!.y) / (pieces.length - 1))
    out.push({ pieces, pitch, fontPx: stackFont(pieces, pitch), note })
  }
  return out
}

export function stackWordsBrief(stacks: readonly WordStack[]): string {
  if (!stacks.length) return ''
  return stacks.map((s) => `HEADING LINES AS DRAWN (checked on the page): these words go line by line on the lines drawn for them, one size, about ${String(s.fontPx)}px, tuned so the longest runs its drawn length:\n` +
    s.pieces.map((p) => `- "${p.text}" on ONE line (white-space: nowrap), first letter at x ${String(p.x0)}, the letters' bottom edge on y ${String(p.y)}, drawn ${String(p.x1 - p.x0)}px long.`).join('\n') +
    `\nThe drawn lines are ${String(s.pitch)}px apart: that is the line height. Nothing else goes between them, and the text drawn under the last line stays under it.\n\n`).join('')
}

const boxOf = (n: NodeLike) => n.textBox ?? n.rect
const fontOf = (n: NodeLike) => parseFloat(n.style?.fontSize ?? '') || 0
/** The bottom of the letters on line k of `count` in a box. */
function bottomOf(n: NodeLike, k: number, count: number): number {
  const b = boxOf(n)
  const fs = fontOf(n)
  const lh = b.h / count
  return Math.round(b.y + lh * (k + 1) - Math.max(0, lh - fs) / 2 - 0.2 * fs)
}

export function verifyStackWords(stacks: readonly WordStack[], after: Snap): StackWordsVerdict {
  if (!stacks.length) return { satisfied: true, unverifiable: true, reason: 'no heading lines said word by word' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const s of stacks) {
    const hasFont = after.nodes.filter((n) => n.text && fontOf(n) > 0)
    const own = s.pieces.map((p) => hasFont.filter((n) => norm(n.text!) === norm(p.text))
      .sort((a, b) => Math.abs(bottomOf(a, 0, 1) - p.y) - Math.abs(bottomOf(b, 0, 1) - p.y))[0] ?? null)
    const whole = norm(s.pieces.map((p) => p.text).join(' '))
    const block = own.some((n) => !n) ? hasFont.filter((n) => norm(n.text!) === whole)
      .sort((a, b) => boxOf(a).h - boxOf(b).h)[0] ?? null : null
    if (own.some((n) => !n) && !block) continue
    judged++
    const widest = s.pieces.reduce((a, b) => (b.x1 - b.x0 > a.x1 - a.x0 ? b : a))
    const at = (k: number) => {
      const n = block ?? own[k]!
      return { n, bottom: block ? bottomOf(block, k, s.pieces.length) : bottomOf(own[k]!, 0, 1) }
    }
    s.pieces.forEach((p, k) => {
      const { n, bottom } = at(k)
      const room = Math.max(14, 0.2 * fontOf(n))
      if (Math.abs(bottom - p.y) > room) misses.push(`"${p.text}" has its letters' bottom edge at y ${String(bottom)}; it was drawn on the line at y ${String(p.y)}: move it there, change nothing else about it`)
      if (Math.abs(boxOf(n).x - p.x0) > Math.max(24, 0.2 * (p.x1 - p.x0)) && !block) misses.push(`"${p.text}" starts at x ${String(Math.round(boxOf(n).x))}; its drawn line starts at x ${String(p.x0)}: start it there`)
    })
    const k = s.pieces.indexOf(widest)
    const n = block ?? own[k]!
    const drawn = widest.x1 - widest.x0
    const built = boxOf(n).w
    if (!block && (built < drawn * 0.75 || built > drawn * 1.25)) {
      const fs = fontOf(n)
      misses.push(`"${widest.text}" runs ${String(Math.round(built))}px at font-size ${String(Math.round(fs))}px; its line was drawn ${String(drawn)}px long: set font-size about ${String(Math.round(fs * drawn / Math.max(1, built)))}px on all these heading lines`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'heading lines not found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: 'heading lines on their drawn lines at the drawn size' }
}

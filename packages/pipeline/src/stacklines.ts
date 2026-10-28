/**
 * Stacked text keeps its drawn lines (n33).
 *
 * Round 31 c5 (spotlight quote): a two-line centred quote drawn 60px apart was told its size and line
 * breaks, came out at the right size, but wrapped into three lines ("weekend," alone on the middle
 * line) and ran into the name under it. Nothing checked it. Here every stack the ink sized (textSize:
 * two or more drawn lines) is found on the page by its words' box crossing the drawn box at about the
 * drawn size, and fails when it is clearly taller than the lines drawn (one more line or more) or its
 * letters are far off the drawn size. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { TextStack } from './textmark.js'

interface NodeLike { id: string; rect: BBox; text?: string; textBox?: BBox; style?: { fontSize?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface StackVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const overlapH = (a: BBox, b: BBox) => Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const overlapW = (a: BBox, b: BBox) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))

export function verifyStackLines(stacks: TextStack[], after: Snap): StackVerdict {
  const multi = stacks.filter((s) => s.lines >= 2)
  if (!multi.length) return { satisfied: true, unverifiable: true, reason: 'no drawn multi-line text' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const misses: string[] = []
  let judged = 0
  for (const s of multi) {
    const b = s.box
    const cands = after.nodes.filter((n) => (n.text ?? '').trim().split(/\s+/).length >= 3).map((n) => {
      const r = n.textBox ?? n.rect
      const fs = parseFloat(n.style?.fontSize ?? '') || 0
      return { n, r, fs }
    }).filter(({ r, fs }) => fs >= s.fontPx * 0.45 && fs <= s.fontPx * 1.6 && overlapW(r, b) >= 0.4 * Math.min(r.w, b.w) && overlapH(r, b) > 0)
    if (!cands.length) continue
    // the block holding the most of the drawn box, the smallest such (a leaf, not its wrapper)
    cands.sort((p, q) => overlapH(q.r, b) - overlapH(p.r, b) || p.r.h - q.r.h)
    const { r, fs } = cands[0]!
    judged++
    const at = `the ${String(s.lines)}-line text drawn at x ${String(b.x)}, y ${String(b.y)} (${String(b.w)}x${String(b.h)}, lines ${String(s.linePitchPx)}px apart${s.lineWidths ? `, drawn ${s.lineWidths.join(' then ')}px long` : ''})`
    const built = Math.max(1, Math.round(r.h / s.linePitchPx))
    if (r.h >= b.h + 0.6 * s.linePitchPx) {
      misses.push(`${at} is built ${String(Math.round(r.h))}px tall, about ${String(built)} lines: it wrapped into more lines than drawn. Remove any forced line break (<br>) inside it: a forced break that leaves a line wider than the block wraps that line again. Give the block the drawn width (${String(b.w)}px or a little more), line-height ${String(s.linePitchPx)}px, and let the words wrap on their own into ${String(s.lines)} lines; if they still take more, take the font-size down a little (never under ${String(Math.round(s.fontPx * 0.85))}px)`)
    } else if (fs < s.fontPx * 0.75 || fs > s.fontPx * 1.35) {
      misses.push(`${at} has letters ${String(Math.round(fs))}px; drawn, they are about ${String(s.fontPx)}px: set font-size ${String(s.fontPx)}px, line-height ${String(s.linePitchPx)}px`)
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no drawn multi-line text found on the page' }
  return misses.length ? { satisfied: false, reason: misses.join('; ') } : { satisfied: true, reason: 'drawn lines kept' }
}

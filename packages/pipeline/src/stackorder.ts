/**
 * n241 / n254: two things a person had to type fix notes for, said once from the drawing.
 *
 * Stacking. Round 48 c4 (railway): cars drawn after the mountains were built behind them, through three builds and
 * two fix notes ("all 3 cars in front of mountains"). A person drawing on paper means the later thing is on top, so
 * closed marks drawn later that overlap an earlier one stand in front of it. A box lying wholly in a plain box says
 * nothing new (children paint on top anyway), so those pairs are left out.
 *
 * Flat. Fix notes in rounds 47 and 48 spent about one word in five taking back a look nobody drew: "flat one colour,
 * no shade, no black edge", "flat greyish beam", "white card, flat bars". What was not drawn or typed is not built.
 * A note that asks for a look keeps it.
 */
import type { Stroke } from '@s2c/ink'
import { isFillDot } from '@s2c/ink'

type StrokeLike = Pick<Stroke, 'id' | 'points' | 'color'>
interface Box { x: number; y: number; w: number; h: number }

const boxOf = (pts: ReadonlyArray<{ x: number; y: number }>): Box => {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
  const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}
const closed = (pts: ReadonlyArray<{ x: number; y: number }>): boolean => {
  if (pts.length < 4) return false
  const b = boxOf(pts)
  if (b.w < 30 || b.h < 30) return false
  const a = pts[0]!, z = pts[pts.length - 1]!
  return Math.hypot(a.x - z.x, a.y - z.y) <= Math.max(12, (b.w + b.h) * 0.08)
}
/** Shoelace area over the bounding box: a drawn box is near 1, a triangle near 0.5. */
const boxiness = (pts: ReadonlyArray<{ x: number; y: number }>, b: Box): number => {
  let a = 0
  for (let k = 0; k < pts.length; k++) { const p = pts[k]!, q = pts[(k + 1) % pts.length]!; a += p.x * q.y - q.x * p.y }
  return Math.abs(a) / 2 / Math.max(1, b.w * b.h)
}
const overlapArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
const within = (inner: Box, outer: Box): boolean =>
  inner.x >= outer.x - 4 && inner.y >= outer.y - 4 && inner.x + inner.w <= outer.x + outer.w + 4 && inner.y + inner.h <= outer.y + outer.h + 4

export interface StackPair { front: Box; back: Box }

export function stackPairs(strokes: readonly StrokeLike[] | undefined): StackPair[] {
  const marks = (strokes ?? []).filter((s) => !isFillDot(s) && closed(s.points)).map((s) => ({ s, box: boxOf(s.points) }))
  const out: StackPair[] = []
  for (let later = 1; later < marks.length; later++) {
    for (let early = 0; early < later; early++) {
      const f = marks[later]!, b = marks[early]!
      const shared = overlapArea(f.box, b.box)
      if (shared < 0.15 * Math.min(f.box.w * f.box.h, b.box.w * b.box.h)) continue
      // a wide band or plain panel holding it already paints behind it
      if (within(f.box, b.box) && boxiness(b.s.points, b.box) > 0.85) continue
      // a smaller box drawn over a big one it spills past is still in front; only a later box holding an earlier one is a frame
      if (within(b.box, f.box) && boxiness(f.s.points, f.box) > 0.85) continue
      out.push({ front: f.box, back: b.box })
    }
  }
  return out
}

const at = (b: Box): string => `(${String(Math.round(b.x))},${String(Math.round(b.y))}) ${String(Math.round(b.w))}x${String(Math.round(b.h))}`

export function stackBrief(strokes: readonly StrokeLike[] | undefined): string {
  const pairs = stackPairs(strokes)
  if (!pairs.length) return ''
  return `DRAWN ON TOP (from the drawing order): what was drawn later stands in front where they overlap, fully visible, never hidden behind ` +
    `the earlier part. Paint them in this order (later in the DOM, or a higher z-index):\n` +
    `${pairs.slice(0, 8).map((p) => `- the part drawn at ${at(p.front)} is IN FRONT of the part drawn at ${at(p.back)}`).join('\n')}\n\n`
}

/** A note that asks for a look keeps it. */
const ASKS_LOOK = /\b(fade[sd]?|fading|gradient|shad(?:e|ed|ow|ows|ing)|glow(?:s|ing)?|3d|soft|glass|frosted|blur(?:red)?|sheen|shiny|lit|raised|lifted|floating)\b/i

export function flatLookBrief(notes: readonly string[]): string {
  if (notes.some((n) => ASKS_LOOK.test(n))) return ''
  return `FLAT UNLESS ASKED: the person drew no shading. Every part is its one tapped or drawn colour, solid: no second tone on one side of a shape, no gradient, ` +
    `no drop shadow, no dark edge or outline it was not drawn with, no glow, no tint over it. A gradient only where this brief names one from the taps.\n\n`
}

/**
 * A tapped ring drawn inside another ring sits on that ring's centre (n225).
 *
 * Round 47 c5 (tattoo parlor, n221): a red disc drawn on the same centre as the cream ring around it came out about 20px
 * up and to the left. The ring has a thick border and the disc was placed from the border's inside corner by hand. The
 * fix note "centred in the ring" did not move it, and the place check passed, because it matched the outer ring's element
 * to both drawn rings. Told as a centre to hit, and checked on the disc's own element. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'
import { shapeOf } from './shapemark.js'
import { deltaE, parseCssColor } from './palette.js'

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { rect: Box; style?: { backgroundColor?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface InnerRing { cx: number; cy: number; d: number; colour: string; outer: Box }
export interface InnerRingVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const INNER_CENTRE_TOL_PX = 8
const r = Math.round

export function innerRings(strokes: readonly Stroke[]): InnerRing[] {
  const rings = strokes.filter((s) => s.points.length > 1).flatMap((s) => {
    const sh = shapeOf(s.points)
    return sh?.shape === 'ellipse' && sh.box ? [{ box: sh.box }] : []
  })
  // a tap is one spot: the overlay may record it as a point or two
  const taps = strokes.filter((s) => {
    if (!s.color || !s.points.length) return false
    const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y)
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) <= 6
  })
  const out: InnerRing[] = []
  for (const a of rings) {
    const cx = a.box.x + a.box.w / 2, cy = a.box.y + a.box.h / 2, d = (a.box.w + a.box.h) / 2
    const tap = taps.filter((t) => Math.hypot(t.points[0]!.x - cx, t.points[0]!.y - cy) < d / 2).pop()
    if (!tap) continue
    const outer = rings.find((b) => b !== a && b.box.w > a.box.w * 1.05 && b.box.w < a.box.w * 2 &&
      Math.hypot(b.box.x + b.box.w / 2 - cx, b.box.y + b.box.h / 2 - cy) <= 0.12 * b.box.w)
    if (outer) out.push({ cx: r(outer.box.x + outer.box.w / 2), cy: r(outer.box.y + outer.box.h / 2), d: r(d), colour: tap.color!, outer: outer.box })
  }
  return out
}

export function innerRingBrief(strokes: readonly Stroke[] | undefined): string {
  const list = innerRings(strokes ?? [])
  if (!list.length) return ''
  return `\n\nRING IN A RING (checked on the page): ${list.map((g) => `the ${g.colour} disc ${String(g.d)}px across goes on the exact centre of the ring around it, x=${String(g.cx)}, y=${String(g.cy)}`).join('; ')}. ` +
    `Place it with left: 50%; top: 50%; transform: translate(-50%, -50%), or as flex-centred child, never with px offsets, which the ring's border throws off.`
}

export function verifyInnerRings(strokes: readonly Stroke[] | undefined, after: Snap): InnerRingVerdict {
  const list = innerRings(strokes ?? [])
  if (!list.length) return { satisfied: true, unverifiable: true, reason: 'no ring in a ring' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const g of list) {
    const want = parseCssColor(g.colour)
    const disc = after.nodes.filter((n) => {
      if (Math.abs(n.rect.w - g.d) > g.d * 0.25 || Math.abs(n.rect.h - g.d) > g.d * 0.25) return false
      const b = parseCssColor(n.style?.backgroundColor ?? '')
      return !!b && !!want && deltaE(b, want) <= 14
    }).sort((a, b) => Math.hypot(a.rect.x + a.rect.w / 2 - g.cx, a.rect.y + a.rect.h / 2 - g.cy) - Math.hypot(b.rect.x + b.rect.w / 2 - g.cx, b.rect.y + b.rect.h / 2 - g.cy))[0]
    if (!disc) continue // an svg disc, or a missing one: the colour check speaks for those
    const x = r(disc.rect.x + disc.rect.w / 2), y = r(disc.rect.y + disc.rect.h / 2)
    if (Math.hypot(x - g.cx, y - g.cy) > INNER_CENTRE_TOL_PX) faults.push(`the disc inside the ring is centred at x=${String(x)}, y=${String(y)}; the ring's centre is x=${String(g.cx)}, y=${String(g.cy)}: centre it with left: 50%; top: 50%; transform: translate(-50%, -50%)`)
  }
  return faults.length ? { satisfied: false, reason: faults.join('; ') + '. Change nothing else' } : { satisfied: true, reason: `${String(list.length)} disc in its ring, centred` }
}

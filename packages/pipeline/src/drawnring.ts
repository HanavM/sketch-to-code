/**
 * A ring drawn in coloured arcs is a donut chart: its size, place and segments come from the drawing (n118).
 *
 * Round 38 e3 (budget, n108/n116): the sketcher drew the spending donut as four arcs that chain into one ring, each in
 * its own pen colour (orange from the top round to the lower right, teal along the bottom, indigo up the left, light grey
 * back to the top), and typed "thick donut; $2,340 big, of $2,800 under". The build made a donut, but of its own size and
 * place (about 40px lower and bigger than drawn) and with its own segment order (grey at the top, orange starting at one
 * o'clock): the drawn arcs, which say where each colour starts and how much of the ring it takes, were thrown away.
 *
 * A person who draws a ring as a chain of differently coloured arcs has drawn a chart's segments. Here, from the strokes
 * alone: 2 to 8 strokes with pen colours, each an arc (not a straight line), each starting within 30px of where the
 * previous one ended, together closing on themselves (the last ends within 30px of where the first started), going
 * round the centre at least 300 degrees, and about round (width and height within 40% of each other). Each arc's
 * colour, start angle (clockwise from 12 o'clock) and share of the turn are measured. The build is told the chart's
 * drawn box (its outer edge) and its segments in order; the page is checked for a square-ish element of about the drawn
 * size centred near the drawn centre. Zero tokens.
 */
import type { Stroke } from '@s2c/ink'

interface Box { x: number; y: number; w: number; h: number }
interface NodeLike { rect: Box; tag?: string; text?: string }
interface Snap { nodes: NodeLike[]; truncated?: boolean }

export interface RingSegment { colour: string; startDeg: number; sweepDeg: number; share: number }
export interface DrawnRing { box: Box; cx: number; cy: number; d: number; segments: RingSegment[]; strokeIds: string[] }
export interface DrawnRingVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

export const JOIN_PX = 30
export const RING_SIZE_TOL = 0.2
export const RING_CENTRE_TOL_PX = 25
const r = Math.round
type StrokeLike = Pick<Stroke, 'id' | 'points' | 'color'>

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)
const first = (s: StrokeLike) => s.points[0]!
const last = (s: StrokeLike) => s.points[s.points.length - 1]!
/** An arc bends: its middle sits off the chord between its ends. */
function bends(s: StrokeLike): boolean {
  if (s.points.length < 3) return false
  const a = first(s), b = last(s), chord = dist(a, b)
  if (chord < 4) return true
  const m = s.points[Math.floor(s.points.length / 2)]!
  const off = Math.abs((b.x - a.x) * (a.y - m.y) - (a.x - m.x) * (b.y - a.y)) / chord
  return off >= 0.08 * chord
}
/** Clockwise angle from 12 o'clock, degrees in [0, 360). */
const angle = (p: { x: number; y: number }, cx: number, cy: number) => ((Math.atan2(p.x - cx, -(p.y - cy)) * 180) / Math.PI + 360) % 360

/** Rings drawn as chains of coloured arcs, in drawing order. */
export function drawnRings(strokes: readonly StrokeLike[]): DrawnRing[] {
  const arcs = strokes.filter((s) => s.color && s.points.length >= 3 && bends(s))
  const used = new Set<string>()
  const out: DrawnRing[] = []
  for (let i = 0; i < arcs.length; i++) {
    if (used.has(arcs[i]!.id)) continue
    const chain = [arcs[i]!]
    for (let j = i + 1; j < arcs.length && chain.length < 8; j++) {
      const s = arcs[j]!
      if (used.has(s.id) || dist(last(chain[chain.length - 1]!), first(s)) > JOIN_PX) break
      chain.push(s)
      if (chain.length >= 2 && dist(last(s), first(chain[0]!)) <= JOIN_PX) break
    }
    if (chain.length < 2 || dist(last(chain[chain.length - 1]!), first(chain[0]!)) > JOIN_PX) continue
    if (new Set(chain.map((s) => s.color!.toLowerCase())).size < 2) continue
    const pts = chain.flatMap((s) => s.points)
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y)
    const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
    if (box.w < 40 || box.h < 40 || Math.max(box.w, box.h) > 1.4 * Math.min(box.w, box.h)) continue
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2
    // walk round: each arc's sweep is the sum of its small turns (clockwise positive)
    const sweeps = chain.map((s) => {
      let t = 0
      for (let k = 1; k < s.points.length; k++) {
        let d = angle(s.points[k]!, cx, cy) - angle(s.points[k - 1]!, cx, cy)
        if (d > 180) d -= 360
        if (d < -180) d += 360
        t += d
      }
      return t
    })
    const total = sweeps.reduce((a, b) => a + b, 0)
    if (Math.abs(total) < 300) continue
    const dir = Math.sign(total)
    const segs = chain.map((s, k) => ({ colour: s.color!.toLowerCase(), startDeg: r(angle(first(s), cx, cy)) % 360, sweepDeg: r(Math.abs(sweeps[k]!)), share: 0 }))
    // counter-clockwise drawing: the segment order round the clock is reversed and each starts at its own end
    if (dir < 0) {
      segs.reverse()
      for (const [k, s] of chain.slice().reverse().entries()) segs[k]!.startDeg = r(angle(last(s), cx, cy)) % 360
    }
    const sum = segs.reduce((a, s) => a + s.sweepDeg, 0) || 1
    for (const s of segs) s.share = Math.round((1000 * s.sweepDeg) / sum) / 10
    chain.forEach((s) => used.add(s.id))
    out.push({ box: { x: r(box.x), y: r(box.y), w: r(box.w), h: r(box.h) }, cx: r(cx), cy: r(cy), d: r((box.w + box.h) / 2), segments: segs, strokeIds: chain.map((s) => s.id) })
  }
  return out
}

export function drawnRingBrief(strokes: readonly StrokeLike[] | undefined): string {
  const rings = drawnRings(strokes ?? [])
  if (!rings.length) return ''
  const each = rings.map((g) =>
    `the ring drawn as ${g.segments.length} coloured arcs round x=${g.cx}, y=${g.cy} (outer edge ${g.d}px across, so its box is x=${r(g.cx - g.d / 2)}, y=${r(g.cy - g.d / 2)}, ${g.d}x${g.d}px) ` +
    `is a donut (or pie) chart: build it at exactly that size and centre as a PERFECT CIRCLE (an SVG circle, or a conic-gradient on a ${g.d}px square with border-radius:50%; never a clip-path or polygon traced from the drawn strokes), with these segments clockwise ` +
    `starting at ${g.segments[0]!.startDeg} degrees from 12 o'clock: ` +
    g.segments.map((s) => `${s.colour} about ${s.share}%`).join(', then ') +
    ` (if the notes give the amounts, use their exact shares in this same order and colours; a light grey or pale arc is the unspent remainder)`).join('; ')
  return `\n\nDRAWN CHARTS (the arcs ARE the chart: their colours, order, start and size are the user's, never your own palette or a default start): ${each}. ` +
    `Words typed on the ring go in its hole. Checked on the page: the chart within ${RING_SIZE_TOL * 100}% of its drawn size and its centre within ${RING_CENTRE_TOL_PX}px of the drawn centre.`
}

export function verifyDrawnRings(strokes: readonly StrokeLike[] | undefined, after: Snap): DrawnRingVerdict {
  const rings = drawnRings(strokes ?? [])
  if (!rings.length) return { satisfied: true, unverifiable: true, reason: 'no ring drawn in coloured arcs' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const seen = (after.nodes ?? []).filter((n) => n.rect.w > 0 && n.rect.h > 0)
  const faults: string[] = []
  for (const g of rings) {
    // the chart: a square-ish element whose centre is nearest the drawn centre, among those at least half the drawn size
    const cands = seen.filter((n) => Math.abs(n.rect.w - n.rect.h) <= 0.15 * Math.max(n.rect.w, n.rect.h) && n.rect.w >= 0.5 * g.d && n.rect.w <= 1.8 * g.d)
      .map((n) => ({ n, off: Math.hypot(n.rect.x + n.rect.w / 2 - g.cx, n.rect.y + n.rect.h / 2 - g.cy) }))
      .filter((c) => c.off <= g.d)
      .sort((a, b) => a.off - b.off || Math.abs(a.n.rect.w - g.d) - Math.abs(b.n.rect.w - g.d))
    const best = cands[0]
    if (!best) { faults.push(`no round chart about ${g.d}px across near x=${g.cx}, y=${g.cy} where the ring was drawn`); continue }
    const R = best.n.rect, bx = r(R.x + R.w / 2), by = r(R.y + R.h / 2)
    const bad: string[] = []
    if (Math.abs(R.w - g.d) > RING_SIZE_TOL * g.d) bad.push(`it is ${r(R.w)}px across, drawn ${g.d}px`)
    if (best.off > RING_CENTRE_TOL_PX) bad.push(`its centre is at x=${bx}, y=${by}, drawn at x=${g.cx}, y=${g.cy} (${r(by - g.cy)}px ${by > g.cy ? 'low' : 'high'})`)
    if (bad.length) faults.push(`the chart drawn as a ring is off: ${bad.join('; ')}: build it ${g.d}px square centred at x=${g.cx}, y=${g.cy}`)
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') + '. Change only the chart; keep its segments, colours and words' }
    : { satisfied: true, reason: `${rings.length} chart${rings.length > 1 ? 's' : ''} drawn as a ring at the drawn size and place` }
}

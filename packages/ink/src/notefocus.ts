/**
 * Which drawn marks a typed note is about.
 *
 * Lives here (not in the pipeline) so the overlay can run the very same rule
 * while you draw and show each note's mark before anything is built: what you
 * see bound is what the build is told.
 */
import type { BBox, Stroke } from './types.js'
import { textStacks } from './textmark.js'

/** A text stack at least this big (font px) is one display heading for note focus. */
export const GIANT_STACK_PX = 60

/** How far past the nearest stroke a stroke can sit and still be "right here". */
export const NOTE_FOCUS_SLACK_PX = 24

/**
 * Which of a note's strokes it is actually about. The overlay's own pick wins
 * (it knows the newest stroke for type-to-label); otherwise the strokes nearest
 * the point the note was typed at, within a small slack so the two lines of
 * one heading stay together. Undefined when that is all of them anyway.
 */
export function noteFocus(
  ids: string[],
  given: string[] | undefined,
  at: { x: number; y: number } | undefined,
  strokes: Stroke[],
): string[] | undefined {
  if (ids.length < 2) return undefined
  let focus: string[] = (given ?? []).filter((id) => ids.includes(id))
  if (focus.length === 0 && at && Number.isFinite(at.x) && Number.isFinite(at.y)) {
    const d = new Map<string, number>()
    const rects = new Map<string, BBox>()
    // closed outlines (not plain boxes) the point is inside, by their area
    const enclosed = new Map<string, number>()
    for (const st of strokes) {
      if (!ids.includes(st.id) || st.points.length === 0) continue
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (const p of st.points) {
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
      }
      const r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      rects.set(st.id, r)
      const ds = distToStroke(at, st.points, r)
      d.set(st.id, ds.d)
      if (ds.area !== undefined) enclosed.set(st.id, ds.area)
    }
    if (d.size === 0) return undefined
    const best = Math.min(...d.values())
    focus = ids.filter((id) => (d.get(id) ?? Infinity) <= best + NOTE_FOCUS_SLACK_PX)
    // Typed inside two drawn outlines, one within the other (a near ridge over a far one,
    // an inner ring): the note is about the innermost one, as with containers below.
    const boxed = boxes(strokes, ids)
    const outlines = focus.filter((id) => enclosed.has(id) && !boxed.has(id))
    if (outlines.length >= 2) {
      const inner = outlines.reduce((a, b) => (enclosed.get(b)! < enclosed.get(a)! ? b : a))
      focus = focus.filter((id) => !outlines.includes(id) || id === inner)
    }
    // Typed inside a drawn box, near or inside another box that crosses it (neither holds
    // the other: an arch over the edge of a dark half): the note is about the box it was
    // typed in (the smallest, if several). Round 4 c2: the portrait's gradient note, typed
    // 3px from the dark half's edge, also focused the dark half, which was built lavender.
    const boxesIn = focus.filter((id) => boxed.has(id) && enclosed.has(id))
    if (boxesIn.length > 0) {
      const area = (id: string) => rects.get(id)!.w * rects.get(id)!.h
      const small = boxesIn.reduce((a, b) => (area(b) < area(a) ? b : a))
      const sr = rects.get(small)!
      const crossing = focus.filter((id) => id !== small && boxed.has(id) &&
        !contains(rects.get(id)!, sr) && !contains(sr, rects.get(id)!))
      if (crossing.length > 0) focus = focus.filter((id) => !crossing.includes(id))
    }
    // Typed inside a drawn container (a panel box holding a heading and body
    // lines): the container is at distance 0, so distance alone can't tell a
    // note about the panel from one about its heading. Typed on (or between
    // the lines of) one of its contents → that block joins the focus;
    // otherwise the panel's contents leave it.
    // Before this, the slack pulled in whichever child sat within 24px and the
    // note's copy landed there (round 1 c3: the panel's headline copy went to
    // the body line under the heading).
    const container = innermostContainer(at, rects, boxes(strokes, ids))
    if (container) {
      const c = rects.get(container)!
      // the container's own X (an image box) shares its box: part of it, not contents
      const kids = ids.filter((id) => id !== container && rects.has(id) && contains(c, rects.get(id)!) && !sameBox(c, rects.get(id)!))
      const bestKid = Math.min(...kids.map((id) => d.get(id) ?? Infinity))
      const near = kids.filter((id) => (d.get(id) ?? Infinity) <= bestKid + NOTE_FOCUS_SLACK_PX)
      if (near.length > 0 && inside(at, union(near.map((id) => rects.get(id)!)), NOTE_ON_BLOCK_PX)) {
        focus = ids.filter((id) => focus.includes(id) || near.includes(id))
      } else focus = focus.filter((id) => !kids.includes(id))
    }
    // Typed inside a small box that sits inside a bigger one (a badge or a button on a
    // card): the note is about the small box only. n10, round 2 c3: the badge's and the
    // button's notes were "on these 2 boxes" and their words reached the card too.
    const holding = focus.filter((id) => boxed.has(id) && enclosed.has(id))
    if (holding.length >= 2) {
      const outer = holding.filter((o) => holding.some((i) => i !== o &&
        contains(rects.get(o)!, rects.get(i)!) && !sameBox(rects.get(o)!, rects.get(i)!)))
      if (outer.length && outer.length < holding.length) focus = focus.filter((id) => !outer.includes(id))
    }
  }
  // A note typed on one line of a giant heading is about all its lines: they sit ~150px
  // apart, past the slack, so typed on line 1, line 2 lost the note. Only giant stacks:
  // small ones also stack a title over a section heading, or a list of separate links.
  if (focus.length > 0) {
    for (const st of textStacks(strokes.filter((x) => ids.includes(x.id)))) {
      if (st.lines >= 2 && st.fontPx >= GIANT_STACK_PX && st.strokes.some((id) => focus.includes(id))) {
        focus = ids.filter((id) => focus.includes(id) || st.strokes.includes(id))
      }
    }
  }
  return focus.length > 0 && focus.length < ids.length ? focus : undefined
}

/** How far outside a block's own box a point may be and still count as typed on it. */
export const NOTE_ON_BLOCK_PX = 12

export const inside = (p: { x: number; y: number }, r: BBox, pad = 0): boolean =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

export const contains = (outer: BBox, r: BBox): boolean =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h

export const union = (rs: BBox[]): BBox => {
  const x0 = Math.min(...rs.map((r) => r.x)), y0 = Math.min(...rs.map((r) => r.y))
  const x1 = Math.max(...rs.map((r) => r.x + r.w)), y1 = Math.max(...rs.map((r) => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

const sameBox = (a: BBox, b: BBox, tol = 12): boolean =>
  Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol &&
  Math.abs(a.x + a.w - (b.x + b.w)) <= tol && Math.abs(a.y + a.h - (b.y + b.h)) <= tol

/**
 * Strokes drawn as a box: closed, and nearly every point on the edge of its own
 * bounding box. Rings, jagged shapes and diagonal lines also have a big bbox
 * that "holds" other ink, but they are not containers (layered pages put a
 * ring around a headline on purpose).
 */
export function boxes(strokes: Stroke[], ids: string[]): Set<string> {
  const out = new Set<string>()
  for (const st of strokes) {
    const pts = st.points
    if (!ids.includes(st.id) || pts.length < 8) continue
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    const w = x1 - x0, h = y1 - y0
    if (w < 40 || h < 40) continue
    const tol = Math.max(6, 0.06 * Math.min(w, h))
    const a = pts[0]!, b = pts[pts.length - 1]!
    if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(24, 0.1 * Math.min(w, h))) continue
    const onEdge = pts.filter((p) => Math.min(p.x - x0, x1 - p.x, p.y - y0, y1 - p.y) <= tol).length
    if (onEdge / pts.length >= 0.85) out.add(st.id)
  }
  return out
}

/** The smallest drawn box that holds the point and at least one other stroke. */
function innermostContainer(p: { x: number; y: number }, rects: Map<string, BBox>, boxIds: Set<string>): string | null {
  let best: string | null = null
  let area = Infinity
  for (const [id, r] of rects) {
    if (!boxIds.has(id) || !inside(p, r)) continue
    const holds = [...rects].some(([o, or]) => o !== id && contains(r, or) && !sameBox(r, or))
    if (holds && r.w * r.h < area) { best = id; area = r.w * r.h }
  }
  return best
}

/**
 * How far a typed point is from a stroke. A closed outline that is not a box (a jagged
 * cut-out, a ring) covers only its inside, not its whole bounding box: a point in the box
 * but outside the outline is as far as the nearest edge. Round 3 c1: the far ridge's box
 * runs to the page bottom and holds the near ridge, so a note typed on the near ridge
 * focused both and the colours swapped.
 */
const segDist = (p: { x: number; y: number }, u: { x: number; y: number }, v: { x: number; y: number }): number => {
  const vx = v.x - u.x, vy = v.y - u.y, L = vx * vx + vy * vy
  const t = L ? Math.max(0, Math.min(1, ((p.x - u.x) * vx + (p.y - u.y) * vy) / L)) : 0
  return Math.hypot(p.x - (u.x + t * vx), p.y - (u.y + t * vy))
}

const distToStroke = (p: { x: number; y: number }, pts: { x: number; y: number }[], r: BBox): { d: number; area?: number } => {
  const out = distToRect(p, r)
  if (out > 0 || pts.length < 8 || r.w < 16 || r.h < 16) return { d: out }
  const a = pts[0]!, b = pts[pts.length - 1]!
  // An open stroke whose box is wide AND tall (a diagonal, a long curve) covers only its
  // ink, not its box: n9, round 12 c4, a page-tall diagonal band's box swallowed every note
  // typed beside it, so "huge outlined 09" in the big box was also about the band.
  if (Math.hypot(a.x - b.x, a.y - b.y) > Math.max(24, 0.1 * Math.hypot(r.w, r.h))) {
    return { d: Math.min(...pts.slice(1).map((q, i) => segDist(p, pts[i]!, q))) }
  }
  let inside = false, edge = Infinity, area2 = 0
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]!, pj = pts[j]!
    if ((pi.y > p.y) !== (pj.y > p.y) && p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y) + pi.x) inside = !inside
    const vx = pj.x - pi.x, vy = pj.y - pi.y, L = vx * vx + vy * vy
    const t = L ? Math.max(0, Math.min(1, ((p.x - pi.x) * vx + (p.y - pi.y) * vy) / L)) : 0
    edge = Math.min(edge, Math.hypot(p.x - (pi.x + t * vx), p.y - (pi.y + t * vy)))
    area2 += pj.x * pi.y - pi.x * pj.y
  }
  return inside ? { d: 0, area: Math.abs(area2) / 2 } : { d: edge }
}

export const distToRect = (p: { x: number; y: number }, r: BBox): number => {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.w))
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.h))
  return Math.hypot(dx, dy)
}

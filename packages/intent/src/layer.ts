import {
  convexHull, pathLength, pointInPolygon, resampleBySpacing,
  type BBox, type InkNode, type Point, type Stroke,
} from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'

export interface OverlapInfo {
  /** Elements the stroke path genuinely TRAVERSES (enters and exits). */
  crosses: Array<{ srcLoc: string | null; tag: string; text: string }>
  /** Elements fully inside the (closed) stroke's convex hull. */
  contains: Array<{ srcLoc: string | null; tag: string; text: string }>
  /**
   * 'container'          — a closed shape deliberately drawn AROUND existing
   *                        content (grouping/wrapper).
   * 'background-overlay' — the path travels ACROSS existing content without
   *                        enclosing it: decoration behind/over the UI.
   * null                 — ordinary in-flow sketch (e.g. a widget drawn
   *                        inside a card).
   */
  layerHint: 'container' | 'background-overlay' | null
}

const pointInRect = (p: Point, r: BBox): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

const rectCorners = (r: BBox): Point[] => [
  { x: r.x, y: r.y, t: 0 },
  { x: r.x + r.w, y: r.y, t: 0 },
  { x: r.x + r.w, y: r.y + r.h, t: 0 },
  { x: r.x, y: r.y + r.h, t: 0 },
]

/**
 * TRAVERSAL test: the path must ENTER and EXIT the rect — a maximal run of
 * inside-points bounded by outside-points on both sides, whose chord is
 * substantial relative to the element. A stroke drawn entirely (or almost
 * entirely) inside an element never "crosses" it — that element is simply
 * where the sketch lives. (This distinction is what keeps an ordinary
 * widget-inside-a-card sketch in normal flow.)
 */
function pathTraverses(pts: Point[], r: BBox): boolean {
  const inside = pts.map((p) => pointInRect(p, r))
  const insideCount = inside.filter(Boolean).length
  if (insideCount === 0) return false
  // ≥90% inside → the stroke lives in this element; not a traversal
  if (insideCount / pts.length >= 0.9) return false

  const minChord = 0.5 * Math.min(r.w, r.h)
  let runStart = -1
  for (let i = 0; i < pts.length; i++) {
    if (inside[i] && runStart === -1) {
      runStart = i
    } else if (!inside[i] && runStart !== -1) {
      // run [runStart, i-1]; bounded on both sides by outside points?
      if (runStart > 0) {
        const a = pts[runStart]!
        const b = pts[i - 1]!
        if (Math.hypot(b.x - a.x, b.y - a.y) >= minChord) return true
      }
      runStart = -1
    }
  }
  return false // trailing run reaches the stroke end → not bounded both sides
}

/**
 * Path-based layer analysis (design mode). Uses the STROKE PATH and its
 * convex hull — never the bbox, which lies for elongated shapes (a ribbon's
 * bbox "contains" everything it merely passes near).
 */
export function analyzeOverlap(
  node: InkNode,
  strokes: Stroke[],
  snap: DomSnapshot,
  viewport: { w: number; h: number },
): OverlapInfo {
  const pts: Point[] = []
  let rawFirst: Point | null = null
  let rawLast: Point | null = null
  let totalLen = 0
  for (const s of strokes) {
    if (!node.strokeIds.includes(s.id)) continue
    const rs = resampleBySpacing(s.points, 6)
    pts.push(...rs)
    totalLen += pathLength(rs)
    if (!rawFirst && rs.length) rawFirst = rs[0]!
    if (rs.length) rawLast = rs[rs.length - 1]!
  }
  if (pts.length < 3) return { crosses: [], contains: [], layerHint: null }

  const hull = convexHull(pts)
  // geometric closedness of the drawn shape (not a kind whitelist — a wobbly
  // loop that classified as 'ink' still encloses)
  const closed =
    rawFirst && rawLast && totalLen > 0
      ? Math.hypot(rawLast.x - rawFirst.x, rawLast.y - rawFirst.y) / totalLen < 0.25
      : false

  const crosses: OverlapInfo['crosses'] = []
  const contains: OverlapInfo['contains'] = []
  const viewArea = viewport.w * viewport.h

  for (const el of snap.nodes) {
    const r = el.rect
    const area = r.w * r.h
    if (area > viewArea * 0.5) continue // page-scale containers
    if (area < 16) continue

    if (closed && rectCorners(r).every((c) => pointInPolygon(c, hull))) {
      contains.push({ srcLoc: el.srcLoc, tag: el.tag, text: el.text.slice(0, 30) })
      continue
    }
    if (pathTraverses(pts, r)) {
      crosses.push({ srcLoc: el.srcLoc, tag: el.tag, text: el.text.slice(0, 30) })
    }
  }

  // background-overlay needs either multiple traversals, or one traversal by
  // a stroke much larger than the traversed element (a ribbon passing under a
  // single badge) — a widget sketch grazing one neighbor stays in-flow.
  const strokeLong = Math.max(node.bbox.w, node.bbox.h)
  const singleCrossIsOverlay =
    crosses.length === 1 &&
    (() => {
      const el = snap.nodes.find(
        (n) => n.srcLoc === crosses[0]!.srcLoc && n.text.slice(0, 30) === crosses[0]!.text,
      )
      return el ? strokeLong >= 1.5 * Math.max(el.rect.w, el.rect.h) : false
    })()

  const layerHint =
    contains.length >= 1 && closed
      ? 'container'
      : crosses.length >= 2 || singleCrossIsOverlay
        ? 'background-overlay'
        : null

  return { crosses: crosses.slice(0, 10), contains: contains.slice(0, 10), layerHint }
}

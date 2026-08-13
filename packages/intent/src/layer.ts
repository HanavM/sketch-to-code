import {
  convexHull, pointInPolygon, resampleBySpacing,
  type BBox, type InkNode, type Point, type Stroke,
} from '@s2c/ink'
import type { DomNode, DomSnapshot } from '@s2c/dom'

export interface OverlapInfo {
  /** Elements whose rect the stroke PATH passes through (not merely bbox). */
  crosses: Array<{ srcLoc: string | null; tag: string; text: string }>
  /** Elements fully inside the stroke's convex hull (closed grouping sketch). */
  contains: Array<{ srcLoc: string | null; tag: string; text: string }>
  /**
   * 'container'          — the sketch encloses existing content (a card drawn
   *                        AROUND things): hull fully contains element(s).
   * 'background-overlay' — the path travels ACROSS existing content without
   *                        enclosing it: decoration behind/over the UI.
   */
  layerHint: 'container' | 'background-overlay' | null
}

const rectCorners = (r: BBox): Point[] => [
  { x: r.x, y: r.y, t: 0 },
  { x: r.x + r.w, y: r.y, t: 0 },
  { x: r.x + r.w, y: r.y + r.h, t: 0 },
  { x: r.x, y: r.y + r.h, t: 0 },
]

const pointInRect = (p: Point, r: BBox): boolean =>
  p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

/**
 * Path-based layer analysis (design mode). Uses the STROKE PATH and its convex
 * hull — never the bbox, whose emptiness makes it lie for elongated shapes
 * (a ribbon's bbox "contains" everything it merely passes near).
 */
export function analyzeOverlap(
  node: InkNode,
  strokes: Stroke[],
  snap: DomSnapshot,
  viewport: { w: number; h: number },
): OverlapInfo {
  const pts: Point[] = []
  for (const s of strokes) {
    if (!node.strokeIds.includes(s.id)) continue
    pts.push(...resampleBySpacing(s.points, 6))
  }
  if (pts.length < 3) return { crosses: [], contains: [], layerHint: null }
  const hull = convexHull(pts)

  const crosses: OverlapInfo['crosses'] = []
  const contains: OverlapInfo['contains'] = []
  const viewArea = viewport.w * viewport.h

  for (const el of snap.nodes) {
    const r = el.rect
    const area = r.w * r.h
    // skip page-scale containers (body/main/backdrops): they contain the
    // stroke rather than the reverse, and would match everything
    if (area > viewArea * 0.5) continue
    if (area < 16) continue

    const corners = rectCorners(r)
    const fullyInHull = corners.every((c) => pointInPolygon(c, hull))
    if (fullyInHull) {
      contains.push({ srcLoc: el.srcLoc, tag: el.tag, text: el.text.slice(0, 30) })
      continue
    }
    if (pts.some((p) => pointInRect(p, r))) {
      crosses.push({ srcLoc: el.srcLoc, tag: el.tag, text: el.text.slice(0, 30) })
    }
  }

  // Priority: full-hull containment = deliberate grouping (drawing around
  // things); path-crossing without containment = traveling across content.
  const closedish = ['rect', 'rounded-rect', 'ellipse', 'circle'].includes(node.kind)
  const layerHint =
    contains.length >= 1 && closedish
      ? 'container'
      : crosses.length >= 1
        ? 'background-overlay'
        : null

  return { crosses: crosses.slice(0, 10), contains: contains.slice(0, 10), layerHint }
}

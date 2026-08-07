import type { DomNode, DomSnapshot } from './types.js'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h)

export function intersection(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function iou(a: Box, b: Box): number {
  const i = intersection(a, b)
  const u = area(a) + area(b) - i
  return u > 0 ? i / u : 0
}

/** Fraction of `inner` covered by `outer`. */
export function coverage(inner: Box, outer: Box): number {
  const ai = area(inner)
  return ai > 0 ? intersection(inner, outer) / ai : 0
}

/**
 * Elements substantially enclosed by the gesture box (≥ coverThreshold of the
 * element inside), deepest-first so leaf targets rank before their containers.
 */
export function containedElements(
  snap: DomSnapshot,
  gesture: Box,
  coverThreshold = 0.7,
): DomNode[] {
  return snap.nodes
    .filter((n) => coverage(n.rect, gesture) >= coverThreshold)
    .sort((a, b) => b.depth - a.depth || area(a.rect) - area(b.rect))
}

/**
 * The tightest element that encloses the gesture box (≥ containThreshold of
 * the gesture inside the element). Smallest qualifying area wins.
 */
export function smallestContainingElement(
  snap: DomSnapshot,
  gesture: Box,
  containThreshold = 0.85,
): DomNode | null {
  let best: DomNode | null = null
  for (const n of snap.nodes) {
    if (coverage(gesture, n.rect) < containThreshold) continue
    if (!best || area(n.rect) < area(best.rect)) best = n
  }
  return best
}

/**
 * The most plausible single target of a gesture box: prefer a tight IoU match
 * (circled exactly one thing), then substantially-contained elements (take the
 * largest — circling a card should pick the card, not a glyph inside it), then
 * the smallest container.
 */
export function primaryTarget(snap: DomSnapshot, gesture: Box): DomNode | null {
  let bestIou: { n: DomNode; v: number } | null = null
  for (const n of snap.nodes) {
    const v = iou(n.rect, gesture)
    if (v > 0.45 && (!bestIou || v > bestIou.v)) bestIou = { n, v }
  }
  if (bestIou) return bestIou.n

  const contained = containedElements(snap, gesture)
  if (contained.length > 0) {
    return contained.reduce((a, b) => (area(b.rect) > area(a.rect) ? b : a))
  }
  return smallestContainingElement(snap, gesture)
}

/** Element whose rect contains the point, deepest/smallest first. */
export function elementAtPoint(snap: DomSnapshot, x: number, y: number): DomNode | null {
  let best: DomNode | null = null
  for (const n of snap.nodes) {
    const r = n.rect
    if (x < r.x || y < r.y || x > r.x + r.w || y > r.y + r.h) continue
    if (!best || n.depth > best.depth || (n.depth === best.depth && area(n.rect) < area(best.rect))) {
      best = n
    }
  }
  return best
}

export function byId(snap: DomSnapshot): Map<string, DomNode> {
  return new Map(snap.nodes.map((n) => [n.id, n]))
}

/** Nearest ancestor (inclusive) that carries a source location. */
export function nearestSourced(snap: DomSnapshot, node: DomNode): DomNode | null {
  const map = byId(snap)
  let cur: DomNode | null = node
  while (cur) {
    if (cur.srcLoc) return cur
    cur = cur.parent ? (map.get(cur.parent) ?? null) : null
  }
  return null
}

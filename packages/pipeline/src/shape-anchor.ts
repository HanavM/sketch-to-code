import type { DomNode, DomSnapshot } from '@s2c/dom'

/**
 * Drawn decorations land where they were drawn.
 *
 * The placement check (verifyDesignPlacement) passes an action when ANY new
 * element sits roughly in its region. On a page built from a drawing nearly
 * everything is new, so a ring drawn behind the headline passed on the strength
 * of the headline wrapper, or of the other ring, while the ring itself was built
 * 300px off (round-3 c3: rings centred with translate(-50%,-50%) and spun with
 * a rotate() keyframe, which replaces the translate, so both rings sat half
 * their size down and right; the planet landed top-left).
 *
 * This check looks only at what a decoration is built from: new, absolutely
 * placed (or svg) elements with no text in or under them, of about the drawn
 * size. Each one can stand for one drawn shape only. A shape passes when such
 * an element is centred on it; it fails when such elements exist but every
 * one of them is off. When no such element exists at all (the shape was built
 * in the page flow, or as part of a text block) it says nothing: the
 * ordinary placement check covers that. Zero tokens.
 */
export interface ShapeAnchorVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
  claimed?: string
}

type Box = { x: number; y: number; w: number; h: number }

const styleKey = (n: DomNode): string => JSON.stringify([n.tag, n.text, n.classes, n.style])
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'g', 'canvas', 'img'])

/** New nodes (style-key multiset diff, robust to srcLoc line shifts). */
function freshNodes(before: DomSnapshot, after: DomSnapshot): DomNode[] {
  const count = new Map<string, number>()
  for (const n of before.nodes) count.set(styleKey(n), (count.get(styleKey(n)) ?? 0) + 1)
  const out: DomNode[] = []
  for (const n of after.nodes) {
    const k = styleKey(n)
    const c = count.get(k) ?? 0
    if (c > 0) count.set(k, c - 1)
    else out.push(n)
  }
  return out
}

/** Ids of nodes that have text themselves or anywhere under them. */
function withText(snap: DomSnapshot): Set<string> {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const out = new Set<string>()
  for (const n of snap.nodes) {
    if (!n.text) continue
    let cur: DomNode | undefined = n
    while (cur && !out.has(cur.id)) {
      out.add(cur.id)
      cur = cur.parent ? byId.get(cur.parent) : undefined
    }
  }
  return out
}

/** Elements a drawn decoration can be built from. */
export function decorationCandidates(before: DomSnapshot, after: DomSnapshot): DomNode[] {
  const texty = withText(after)
  return freshNodes(before, after).filter((n) =>
    !texty.has(n.id) &&
    n.rect.w >= 4 && n.rect.h >= 4 &&
    (SVG_TAGS.has(n.tag) || n.style.position === 'absolute' || n.style.position === 'fixed'),
  )
}

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })

/**
 * How far off a candidate may sit: a fifth of the drawn size, at least 24px.
 * A spinning square's box grows to 1.41x while it turns, so the size band is
 * wide (0.4-2.5x the drawn area) but the centre is held tight.
 */
export function verifyShapeAnchor(
  candidates: DomNode[],
  region: Box,
  claimed: Set<string>,
): ShapeAnchorVerdict {
  const area = Math.max(1, region.w * region.h)
  const sized = candidates.filter((n) => {
    if (claimed.has(n.id)) return false
    const r = (n.rect.w * n.rect.h) / area
    return r >= 0.4 && r <= 2.5
  })
  if (!sized.length) {
    return { satisfied: true, unverifiable: true, reason: 'no free-standing decoration of that size to check' }
  }
  const c = centre(region)
  const tol = Math.max(24, 0.2 * Math.max(region.w, region.h))
  // concentric shapes share a centre: among those on it, the closest in size
  const dist = (n: DomNode) => Math.hypot(centre(n.rect).x - c.x, centre(n.rect).y - c.y)
  const misfit = (n: DomNode) => Math.abs(Math.log((n.rect.w * n.rect.h) / area))
  const on = sized.filter((n) => dist(n) <= tol).sort((a, b) => misfit(a) - misfit(b))
  const best = on[0] ?? [...sized].sort((a, b) => dist(a) - dist(b))[0]!
  const bestD = dist(best)
  const at = `<${best.tag}>${best.srcLoc ? ` ${best.srcLoc}` : ''} at (${Math.round(best.rect.x)},${Math.round(best.rect.y)}) ${Math.round(best.rect.w)}x${Math.round(best.rect.h)}`
  if (bestD <= tol) {
    return { satisfied: true, reason: `${at} sits on the drawn shape`, claimed: best.id }
  }
  const m = centre(best.rect)
  const dx = Math.round(m.x - c.x)
  const dy = Math.round(m.y - c.y)
  return {
    satisfied: false,
    reason:
      `the drawn shape at (${Math.round(region.x)},${Math.round(region.y)}) ${Math.round(region.w)}x${Math.round(region.h)} ` +
      `has no decoration on it: the nearest one, ${at}, is ${Math.round(bestD)}px off (centre moved ${dx >= 0 ? '+' : ''}${dx}, ${dy >= 0 ? '+' : ''}${dy}). ` +
      `Place it with left/top = the drawn box's top-left and width/height = its size. If it is animated with transform ` +
      `(spin, rotate, float), the keyframe's transform replaces any translate(-50%,-50%) used to centre it: do not centre with transform on an animated element.`,
  }
}

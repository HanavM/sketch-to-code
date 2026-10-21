import type { DomNode, DomSnapshot } from '@s2c/dom'

/**
 * Filled boxes that rendered with no area: a chart bar, swatch or progress
 * fill whose height (or width) collapsed to 0. The usual cause is a % size
 * inside a parent with no definite size (a % height in an auto-height flex
 * column is 0). Placement checks pass on these — the element exists where it
 * was asked for — but the user sees nothing. Zero tokens: read off the two
 * snapshots. Only collapses this edit introduced are reported.
 */
export interface CollapsedFill {
  srcLoc: string
  count: number
  axis: 'height' | 'width'
  sample: string
}

const TRANSPARENT = /^(transparent|rgba\(\s*0,\s*0,\s*0,\s*0\s*\))$/

export function paintsFill(n: DomNode): boolean {
  return !TRANSPARENT.test(n.style.backgroundColor.trim()) || !!n.style.backgroundImage
}

function collapsedAxis(n: DomNode): 'height' | 'width' | null {
  if (n.style.display === 'none' || n.style.display === 'contents') return null
  if (n.rect.h < 1 && n.rect.w >= 4) return 'height'
  if (n.rect.w < 1 && n.rect.h >= 4) return 'width'
  return null
}

function collapsedBySrc(snap: DomSnapshot): Map<string, { nodes: DomNode[]; axis: 'height' | 'width' }> {
  const out = new Map<string, { nodes: DomNode[]; axis: 'height' | 'width' }>()
  for (const n of snap.nodes) {
    if (!n.srcLoc || n.text) continue
    const axis = collapsedAxis(n)
    if (!axis || !paintsFill(n)) continue
    const e = out.get(n.srcLoc) ?? { nodes: [], axis }
    e.nodes.push(n)
    out.set(n.srcLoc, e)
  }
  return out
}

export function findCollapsedFills(before: DomSnapshot, after: DomSnapshot): CollapsedFill[] {
  const was = collapsedBySrc(before)
  const out: CollapsedFill[] = []
  for (const [srcLoc, { nodes, axis }] of collapsedBySrc(after)) {
    if ((was.get(srcLoc)?.nodes.length ?? 0) >= nodes.length) continue
    out.push({ srcLoc, count: nodes.length, axis, sample: nodes[0]!.classes.slice(0, 6).join(' ') })
  }
  return out
}

export function describeCollapsed(c: CollapsedFill): string {
  const what = c.count > 1 ? `${c.count} filled boxes render` : 'a filled box renders'
  return (
    `${c.srcLoc}: ${what} with 0 ${c.axis}, so nothing shows` +
    (c.sample ? ` (class "${c.sample}")` : '') +
    `. A % ${c.axis} inside a parent with no set ${c.axis} resolves to 0: give it an explicit px ${c.axis}, ` +
    `or give its direct parent a definite ${c.axis}. Leave it only if it is meant to start empty.`
  )
}

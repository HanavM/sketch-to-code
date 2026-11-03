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

/**
 * n124: a number shown as zero ("$0 of $300", "0%", "0 / 5", "0 of 12 done"). A bar whose own row
 * says that is right to be empty: flagging it cost round 38's budget page two repair rounds
 * (about 5 minutes and 100k tokens) on a bar that was correct.
 */
const ZERO = /(?:^|[^\d.,])(?:[$€£¥]\s?0(?:\.0+)?(?![\d.,])|0(?:\.0+)?\s*(?:%|\/\s*\d|of\b|out of\b))/i
export function readsZero(text: string): boolean {
  return ZERO.test(text)
}

/**
 * The words of the row a bar belongs to: the texts under the nearest ancestor (up to 4 levels up)
 * that holds any text, when that ancestor is row-sized (8 text nodes or fewer). When the nearest
 * texted ancestor is the whole panel, fall back to the text lines beside the bar's track: same
 * columns, nearest above and any on its own line, within 48px.
 */
export function rowText(snap: DomSnapshot, n: DomNode): string {
  const byId = new Map(snap.nodes.map((m) => [m.id, m]))
  const kids = new Map<string, DomNode[]>()
  for (const m of snap.nodes) if (m.parent) (kids.get(m.parent) ?? kids.set(m.parent, []).get(m.parent)!).push(m)
  // the texts under root, or null when root also holds another bar like this one (two rows, not one)
  const texts = (root: DomNode): DomNode[] | null => {
    const out: DomNode[] = []
    const stack = [...(kids.get(root.id) ?? [])]
    while (stack.length) {
      const m = stack.pop()!
      if (m.id === n.id) continue
      if (n.srcLoc && m.srcLoc === n.srcLoc) return null
      if (m.text) out.push(m)
      stack.push(...(kids.get(m.id) ?? []))
    }
    return out
  }
  let a = n.parent ? byId.get(n.parent) : undefined
  const track = a ?? n
  for (let lvl = 0; a && lvl < 4; lvl++, a = a.parent ? byId.get(a.parent) : undefined) {
    const t = texts(a)
    if (!t) break
    if (!t.length) continue
    if (t.length <= 8) return t.map((m) => m.text).join(' ')
    break
  }
  const x0 = track.rect.x, x1 = track.rect.x + Math.max(track.rect.w, n.rect.w)
  const cy = n.rect.y + n.rect.h / 2
  const near = snap.nodes.filter((m) => m.text && m.rect.x < x1 && m.rect.x + m.rect.w > x0)
  const sameLine = near.filter((m) => Math.abs(m.rect.y + m.rect.h / 2 - cy) <= Math.max(12, m.rect.h / 2))
  const above = near
    .filter((m) => m.rect.y + m.rect.h <= cy && cy - (m.rect.y + m.rect.h) <= 48)
    .sort((p, q) => q.rect.y + q.rect.h - (p.rect.y + p.rect.h))
  const top = above.length ? above.filter((m) => Math.abs(m.rect.y - above[0]!.rect.y) < 6) : []
  return [...top, ...sameLine].map((m) => m.text).join(' ')
}

export function findCollapsedFills(before: DomSnapshot, after: DomSnapshot, excused?: string[]): CollapsedFill[] {
  const was = collapsedBySrc(before)
  const out: CollapsedFill[] = []
  for (const [srcLoc, found] of collapsedBySrc(after)) {
    const axis = found.axis
    const nodes = found.nodes.filter((n) => {
      const row = rowText(after, n)
      if (!readsZero(row)) return true
      excused?.push(`${srcLoc}: empty on purpose, its row reads "${row.slice(0, 80)}"`)
      return false
    })
    if (!nodes.length) continue
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

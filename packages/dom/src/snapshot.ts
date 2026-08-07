import { S2C_ATTR, type DomNode, type DomSnapshot } from './types.js'

export interface SnapshotOptions {
  /** Elements to skip entirely (e.g. the overlay's own host element). */
  exclude?: (el: Element) => boolean
  maxNodes?: number
  maxTextLen?: number
}

/**
 * Walk the live DOM into a flat, serializable snapshot. Runs in the browser.
 * Deterministic: document order, page coordinates (scroll included).
 */
export function takeSnapshot(doc: Document, opts: SnapshotOptions = {}): DomSnapshot {
  const maxNodes = opts.maxNodes ?? 2000
  const maxTextLen = opts.maxTextLen ?? 120
  const win = doc.defaultView
  if (!win) throw new Error('document has no window')
  const sx = win.scrollX
  const sy = win.scrollY

  const nodes: DomNode[] = []
  let truncated = false
  let counter = 0
  const idOf = new Map<Element, string>()

  const visit = (el: Element, parentId: string | null, depth: number) => {
    if (nodes.length >= maxNodes) {
      truncated = true
      return
    }
    if (opts.exclude?.(el)) return
    const tag = el.tagName.toLowerCase()
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'noscript') return

    const cs = win.getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    // zero-size elements are still emitted when they carry a source stamp —
    // dropping them would make nearestSourced resolve to a wrong ancestor
    const hasStamp = el.getAttribute(S2C_ATTR) !== null
    const visible =
      cs.display !== 'none' &&
      cs.visibility !== 'hidden' &&
      ((rect.width >= 1 && rect.height >= 1) || hasStamp)
    // invisible subtrees are skipped wholesale (display:none children have no boxes)
    if (cs.display === 'none') return

    let myId = parentId
    if (visible) {
      myId = `e${counter++}`
      idOf.set(el, myId)

      // own text only: direct text children, so labels don't smear up the tree
      let text = ''
      for (const child of el.childNodes) {
        if (child.nodeType === 3 /* TEXT_NODE */) text += child.textContent ?? ''
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, maxTextLen)

      nodes.push({
        id: myId,
        tag,
        srcLoc: el.getAttribute(S2C_ATTR),
        rect: {
          x: rect.left + sx,
          y: rect.top + sy,
          w: rect.width,
          h: rect.height,
        },
        text,
        classes: typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 24) : [],
        style: {
          display: cs.display,
          position: cs.position,
          zIndex: cs.zIndex,
          flexDirection: cs.flexDirection,
          gap: cs.gap,
          padding: cs.padding,
          margin: cs.margin,
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          borderRadius: cs.borderRadius,
        },
        parent: parentId,
        depth,
      })
    }

    for (const child of el.children) visit(child, myId, visible ? depth + 1 : depth)
  }

  if (doc.body) visit(doc.body, null, 0)

  return {
    nodes,
    viewport: { w: win.innerWidth, h: win.innerHeight, scrollX: sx, scrollY: sy },
    url: win.location.href,
    takenAt: Date.now(),
    truncated,
  }
}

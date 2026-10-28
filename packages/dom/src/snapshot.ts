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
      // the runs of own text either side of an element child (s2c-046):
      // 'Edit <code>src/App.jsx</code> and save' is own text "Edit and save",
      // words that are not next to each other on the screen
      const runs: string[] = ['']
      for (const child of el.childNodes) {
        if (child.nodeType === 3 /* TEXT_NODE */) {
          text += child.textContent ?? ''
          runs[runs.length - 1] += child.textContent ?? ''
        } else if (
          // only a child with words of its own leaves a gap: a <br> or an icon doesn't
          child.nodeType === 1 /* ELEMENT_NODE */ && (child.textContent ?? '').trim() && runs[runs.length - 1]!.trim()
        ) runs.push('')
      }
      text = text.replace(/\s+/g, ' ').trim().slice(0, maxTextLen)
      const textRuns = runs.map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean)
      // n17: where the letters themselves sit (a block's rect can be far wider than its word)
      let textBox: { x: number; y: number; w: number; h: number } | undefined
      if (text) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const child of el.childNodes) {
          if (child.nodeType !== 3 || !(child.textContent ?? '').trim()) continue
          const range = doc.createRange()
          range.selectNodeContents(child)
          for (const r of range.getClientRects()) {
            if (r.width < 1 || r.height < 1) continue
            x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom)
          }
        }
        if (x1 > x0) textBox = { x: x0 + sx, y: y0 + sy, w: x1 - x0, h: y1 - y0 }
      }

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
        ...(textBox ? { textBox } : {}),
        ...(textRuns.length > 1 ? { textRuns: textRuns.map((r) => r.slice(0, maxTextLen)) } : {}),
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
          ...(cs.backgroundImage && cs.backgroundImage !== 'none' ? { backgroundImage: cs.backgroundImage.slice(0, 80) } : {}),
          ...(cs.clipPath && cs.clipPath !== 'none' ? { clipPath: cs.clipPath.slice(0, 160) } : {}),
          ...(cs.borderTopWidth && parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none' ? { border: `${cs.borderTopWidth} ${cs.borderTopColor}` } : {}),
          ...(cs.boxShadow && cs.boxShadow !== 'none' ? { boxShadow: cs.boxShadow.slice(0, 60) } : {}),
          ...(cs.opacity && Number(cs.opacity) < 1 ? { opacity: cs.opacity } : {}),
          ...(cs.filter && cs.filter !== 'none' ? { filter: cs.filter.slice(0, 60) } : {}),
          ...(parseFloat(cs.getPropertyValue('-webkit-text-stroke-width')) > 0 ? { textStroke: cs.getPropertyValue('-webkit-text-stroke-width') } : {}),
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

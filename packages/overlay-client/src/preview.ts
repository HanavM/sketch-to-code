/**
 * Pending previews at pen lift (goal loop, approach n1, step n7).
 *
 * A scribble and a coloured ring are plain enough to change the page outright
 * (optimistic.ts). An arrow (move), a caret (insert) and a box in empty space
 * (new section) are not: what lands is the model's call (which side of the
 * target, what the new thing says). So these show a PREVIEW, never a change:
 * a dashed, labelled "pending" ghost in the overlay's own layer, where the
 * result is expected to appear. The app's DOM is never touched. When the
 * code lands, the preview is removed and the real element (hot reloaded) is
 * what shows; when the run does something else or fails, it is just removed.
 *
 * Pure: reads strokes against a DomSnapshot (the one the run sends), returns
 * boxes in page coordinates. main.ts draws them.
 *
 * Restraint: one gesture, one reading, or nothing. Anything this declines
 * still runs the normal way, just without a preview.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { classifyStroke } from '@s2c/ink/classify'
import { analyzeStrokes } from '@s2c/ink/scene'
import { findInsertSlot, type InsertSlot } from './insert-slot-copy.js'
import { bboxOfPoints, isScribble, type Box, type QStroke } from './optimistic.js'

export type PreviewKind = 'move' | 'insert' | 'section'

export interface PreviewBox {
  rect: Box
  /** ghost: where the result should appear; from: what is moving. */
  role: 'ghost' | 'from'
}

export interface Preview {
  kind: PreviewKind
  /** Short words on the ghost, e.g. "move · pending". */
  label: string
  boxes: PreviewBox[]
  ink: Box
  /** Source location of the element moved, or the insert's container. */
  srcLoc: string | null
  slot?: InsertSlot
  /** move: the moved element's node id in the snapshot the preview was read from. */
  fromId?: string
}

/** Smallest box a new section may be: below this it's a mark, not a section. */
const SECTION_MIN_W = 60
const SECTION_MIN_H = 30
/** instant.ts MIN_SPAN: ink smaller than this is a slip. */
const MIN_SPAN = 24
/** A caret placeholder is never thinner than this, so it can be seen. */
const SLOT_MIN = 16

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h)
const inside = (b: Box, x: number, y: number) => x >= b.x && y >= b.y && x <= b.x + b.w && y <= b.y + b.h

function isWithin(byId: Map<string, DomNode>, n: DomNode, ancestorId: string): boolean {
  for (let cur: DomNode | undefined = n; cur; cur = cur.parent ? byId.get(cur.parent) : undefined) {
    if (cur.id === ancestorId) return true
  }
  return false
}

/** The smallest stamped element under a point (big layout boxes skipped). */
function elementAt(snap: DomSnapshot, x: number, y: number, viewArea: number): DomNode | null {
  let best: DomNode | null = null
  for (const n of snap.nodes) {
    if (!n.srcLoc || area(n.rect) < 16) continue
    if (viewArea > 0 && area(n.rect) > viewArea * 0.5) continue
    if (!inside(n.rect, x, y)) continue
    if (!best || area(n.rect) < area(best.rect)) best = n
  }
  return best
}

function top(st: QStroke) {
  return classifyStroke({ id: st.id, points: st.points }).candidates[0]
}

/** An arrow from one element to another: move the first, ghost at the head. */
function readMove(strokes: QStroke[], snap: DomSnapshot, viewArea: number): Preview | null {
  const scene = analyzeStrokes(strokes.map((s) => ({ id: s.id, points: s.points })))
  if (scene.arrows.length !== 1) return null
  const arrow = scene.arrows[0]!
  const node = scene.nodes.find((n) => n.id === arrow.nodeId)
  // every stroke drawn is part of the arrow: an arrow plus anything else is
  // the model's to read
  if (!node || node.strokeIds.length !== strokes.length) return null
  const from = elementAt(snap, arrow.from.x, arrow.from.y, viewArea)
  const to = elementAt(snap, arrow.to.x, arrow.to.y, viewArea)
  if (!from || !to || from.id === to.id) return null
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  // into itself is not a move
  if (isWithin(byId, to, from.id)) return null
  const r = from.rect
  const ghost = { x: arrow.to.x - r.w / 2, y: arrow.to.y - r.h / 2, w: r.w, h: r.h }
  return {
    kind: 'move', label: 'move · pending',
    boxes: [{ rect: { ...r }, role: 'from' }, { rect: ghost, role: 'ghost' }],
    ink: node.bbox, srcLoc: from.srcLoc, fromId: from.id,
  }
}

/** A caret in the gap between two siblings: a placeholder in that gap. */
function readInsert(strokes: QStroke[], snap: DomSnapshot): Preview | null {
  if (strokes.length !== 1) return null
  const st = strokes[0]!
  const t = top(st)
  if (!t || t.kind !== 'caret') return null
  const ink = bboxOfPoints(st.points)
  const slot = findInsertSlot(snap, ink)
  if (!slot) return null
  const a = slot.after.rect
  const b = slot.before.rect
  let rect: Box
  if (slot.axis === 'column') {
    const y0 = a.y + a.h
    const y1 = b.y
    const h = Math.max(SLOT_MIN, y1 - y0)
    const x = Math.min(a.x, b.x)
    rect = { x, y: (y0 + y1) / 2 - h / 2, w: Math.max(a.x + a.w, b.x + b.w) - x, h }
  } else {
    const x0 = a.x + a.w
    const x1 = b.x
    const w = Math.max(SLOT_MIN, x1 - x0)
    const y = Math.min(a.y, b.y)
    rect = { x: (x0 + x1) / 2 - w / 2, y, w, h: Math.max(a.y + a.h, b.y + b.h) - y }
  }
  return {
    kind: 'insert', label: 'new · pending', boxes: [{ rect, role: 'ghost' }],
    ink, srcLoc: slot.container.srcLoc, slot,
  }
}

/**
 * One box drawn in empty space: a new section there. "Empty" is looser than
 * instant.ts (which writes code, so the centre must be on nothing at all):
 * the box may sit inside a container, but no piece of content (an element
 * with words, or a stamped leaf) may be under its centre or mostly under it.
 */
function readSection(strokes: QStroke[], snap: DomSnapshot, viewArea: number): Preview | null {
  if (strokes.length !== 1) return null
  const st = strokes[0]!
  if (isScribble(st)) return null
  const t = top(st)
  if (!t || (t.kind !== 'rect' && t.kind !== 'rounded-rect') || t.confidence < 0.5) return null
  const ink = bboxOfPoints(st.points)
  if (Math.max(ink.w, ink.h) < MIN_SPAN || ink.w < SECTION_MIN_W || ink.h < SECTION_MIN_H) return null
  const cx = ink.x + ink.w / 2
  const cy = ink.y + ink.h / 2
  const parents = new Set<string>()
  for (const n of snap.nodes) if (n.parent && n.srcLoc) parents.add(n.parent)
  for (const n of snap.nodes) {
    const a = area(n.rect)
    if (a < 16 || (viewArea > 0 && a > viewArea * 0.5)) continue
    const content = !!n.text || !parents.has(n.id)
    if (!content) continue
    if (inside(n.rect, cx, cy) || overlap(n.rect, ink) / a >= 0.2) return null
  }
  return {
    kind: 'section', label: 'new section · pending', boxes: [{ rect: ink, role: 'ghost' }],
    ink, srcLoc: null,
  }
}

function overlap(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

/**
 * The preview the drawing asks for, or null. Typed words don't stop it, unlike
 * the instant change: they say WHAT goes in (the caret's "Blog"), not where,
 * and a preview that turns out wrong is only removed.
 */
export function previewReading(strokes: QStroke[], snap: DomSnapshot): Preview | null {
  if (strokes.length === 0 || snap.truncated) return null
  const viewArea = snap.viewport.w * snap.viewport.h
  return readMove(strokes, snap, viewArea) ?? readInsert(strokes, snap) ?? readSection(strokes, snap, viewArea)
}

// ---- goal loop n9: has the code's own result shown up yet? -------------------

/** What an element is, across a hot reload: its srcLoc line can shift, this can't. */
const sig = (n: { tag: string; text: string; classes?: string[] }) =>
  `${n.tag}|${n.text}|${(n.classes ?? []).join('.')}`
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** Stamped, visible nodes of `after` whose kind (tag, own text, classes) is more common than in `before`. */
function added(before: DomSnapshot, after: DomSnapshot): DomNode[] {
  const count = new Map<string, number>()
  for (const n of before.nodes) if (n.srcLoc && area(n.rect) > 0) count.set(sig(n), (count.get(sig(n)) ?? 0) + 1)
  const now = new Map<string, number>()
  for (const n of after.nodes) if (n.srcLoc && area(n.rect) > 0) now.set(sig(n), (now.get(sig(n)) ?? 0) + 1)
  return after.nodes.filter((n) => n.srcLoc && area(n.rect) > 0 && (now.get(sig(n)) ?? 0) > (count.get(sig(n)) ?? 0))
}

/** The node in `snap` that is the same element as `n`, nearest where it was. */
function sameAs(snap: DomSnapshot, n: { tag: string; text: string; rect: Box }): DomNode | null {
  let best: DomNode | null = null
  for (const m of snap.nodes) {
    if (m.tag !== n.tag || m.text !== n.text || area(m.rect) === 0) continue
    if (!best || dist(centre(m.rect), centre(n.rect)) < dist(centre(best.rect), centre(n.rect))) best = m
  }
  return best
}

/**
 * True once the page (`after`, as hot reload left it) shows what the preview
 * promised, read against the page the preview was drawn on (`before`):
 *   move    - the moved element now sits nearer the ghost than half its old distance
 *   insert  - a new element sits between the two neighbours of the caret's gap
 *   section - a new element sits where the box was drawn (a band of the box's
 *             height either side, since the new section flows into place)
 * The preview comes down at that moment instead of overlapping the real thing
 * until the run's checks finish. False is the safe answer: the preview then
 * stays until the run ends, which takes it down whatever the code did.
 */
export function previewLanded(p: Preview, before: DomSnapshot, after: DomSnapshot): boolean {
  const ghost = p.boxes.find((b) => b.role === 'ghost')?.rect
  if (!ghost || before.truncated || after.truncated) return false
  if (p.kind === 'move') {
    const from = before.nodes.find((n) => n.id === p.fromId)
    if (!from) return false
    const g = centre(ghost)
    const far = dist(centre(from.rect), g)
    const was = new Set(before.nodes.filter((n) => sig(n) === sig(from)).map((n) => centre(n.rect)))
    return after.nodes.some((n) => {
      if (sig(n) !== sig(from) || area(n.rect) === 0) return false
      if (Math.abs(n.rect.w - from.rect.w) > from.rect.w * 0.25 + 4 || Math.abs(n.rect.h - from.rect.h) > from.rect.h * 0.25 + 4) return false
      const c = centre(n.rect)
      // one already standing there before is not the moved element
      for (const w of was) if (dist(w, c) < 8) return false
      return dist(c, g) < far * 0.5
    })
  }
  const fresh = added(before, after)
  if (fresh.length === 0) return false
  if (p.kind === 'insert') {
    const slot = p.slot
    if (!slot) return false
    const a = sameAs(after, slot.after)
    const b = sameAs(after, slot.before)
    if (!a || !b) return false
    const ca = centre(a.rect)
    const cb = centre(b.rect)
    return fresh.some((n) => {
      if (n.id === a.id || n.id === b.id) return false
      const c = centre(n.rect)
      if (slot.axis === 'column') {
        return c.y > Math.min(ca.y, cb.y) && c.y < Math.max(ca.y, cb.y)
          && n.rect.x < Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w) && n.rect.x + n.rect.w > Math.min(a.rect.x, b.rect.x)
      }
      if (slot.axis === 'row') {
        return c.x > Math.min(ca.x, cb.x) && c.x < Math.max(ca.x, cb.x)
          && n.rect.y < Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h) && n.rect.y + n.rect.h > Math.min(a.rect.y, b.rect.y)
      }
      // grid: reading order, rows banded by the neighbour's height
      const band = Math.max(8, a.rect.h)
      const key = (q: { x: number; y: number }) => Math.floor(q.y / band) * 1e6 + q.x
      return key(c) > Math.min(key(ca), key(cb)) && key(c) < Math.max(key(ca), key(cb))
    })
  }
  // section
  return fresh.some((n) => {
    const c = centre(n.rect)
    return c.y >= ghost.y - ghost.h && c.y <= ghost.y + 2 * ghost.h
      && n.rect.x < ghost.x + ghost.w && n.rect.x + n.rect.w > ghost.x
  })
}

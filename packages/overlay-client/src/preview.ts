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
    ink: node.bbox, srcLoc: from.srcLoc,
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

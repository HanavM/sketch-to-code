import {
  bboxGap, type BBox, type InkNode, type InkScene,
} from '@s2c/ink'
import {
  elementAtPoint, nearestSourced, primaryTarget,
  type DomNode, type DomSnapshot,
} from '@s2c/dom'
import type { EditOp, EditPlan, EditTarget } from './types.js'

const CLOSED_SHAPES = new Set(['rect', 'rounded-rect', 'ellipse', 'circle', 'triangle', 'diamond'])
const DELETE_SHAPES = new Set(['scribble', 'strikethrough'])

function toTarget(snap: DomSnapshot, node: DomNode): EditTarget {
  // prefer the stamped element itself; else the nearest stamped ancestor's srcLoc
  const sourced = node.srcLoc ? node : nearestSourced(snap, node)
  return {
    domId: node.id,
    srcLoc: sourced?.srcLoc ?? null,
    tag: node.tag,
    text: node.text,
    classes: node.classes,
    rect: node.rect,
  }
}

function expand(b: BBox, px: number): BBox {
  return { x: b.x - px, y: b.y - px, w: b.w + 2 * px, h: b.h + 2 * px }
}

/**
 * Deterministic gesture → operation resolution (proofreader's marks):
 *   scribble/strikethrough over element  → DELETE
 *   closed shape around element(s)       → MODIFY
 *   closed shape in empty space          → ADD into its container
 *   arrow A→B                            → MOVE
 *   caret                                → INSERT
 *   handwriting                          → instruction text, attached to the
 *                                          nearest op, else MODIFY under it
 * Models never decide *where* — only what handwriting says (later) and
 * ambiguous ties the geometry can't break.
 */
export function buildEditPlan(scene: InkScene, snap: DomSnapshot): EditPlan {
  const ops: EditOp[] = []
  const unresolvedInkIds: string[] = []
  const warnings: string[] = []
  const opForInk = new Map<string, EditOp>()

  const arrowNodeIds = new Set(scene.arrows.map((a) => a.nodeId))

  for (const node of scene.nodes) {
    // arrows handled via scene.arrows below
    if (arrowNodeIds.has(node.id)) continue

    if (DELETE_SHAPES.has(node.kind)) {
      const target = primaryTarget(snap, node.bbox)
      if (target) {
        const op: EditOp = {
          op: 'DELETE', target: toTarget(snap, target), inkIds: [node.id], pendingTextIds: [],
        }
        ops.push(op)
        opForInk.set(node.id, op)
      } else {
        unresolvedInkIds.push(node.id)
        warnings.push(`scribble ${node.id} covers no element`)
      }
      continue
    }

    if (CLOSED_SHAPES.has(node.kind)) {
      const target = primaryTarget(snap, node.bbox)
      // "encloses something" vs "drawn in empty space": does the gesture box
      // actually contain the target, or merely sit inside it?
      const enclosesTarget =
        target !== null &&
        target.rect.x >= node.bbox.x - 12 &&
        target.rect.y >= node.bbox.y - 12 &&
        target.rect.x + target.rect.w <= node.bbox.x + node.bbox.w + 12 &&
        target.rect.y + target.rect.h <= node.bbox.y + node.bbox.h + 12

      if (target && enclosesTarget) {
        const op: EditOp = {
          op: 'MODIFY', target: toTarget(snap, target), inkIds: [node.id], pendingTextIds: [],
        }
        ops.push(op)
        opForInk.set(node.id, op)
      } else if (target) {
        // empty space inside `target` → sketching a new element there
        const op: EditOp = {
          op: 'ADD',
          container: toTarget(snap, target),
          sketch: { kind: node.kind, rect: node.bbox },
          inkIds: [node.id],
          pendingTextIds: [],
        }
        ops.push(op)
        opForInk.set(node.id, op)
      } else {
        unresolvedInkIds.push(node.id)
        warnings.push(`shape ${node.id} maps to no element or container`)
      }
      continue
    }

    if (node.kind === 'caret') {
      const apex = node.vertices?.[Math.floor((node.vertices.length - 1) / 2)] ??
        { x: node.bbox.x + node.bbox.w / 2, y: node.bbox.y, t: 0 }
      const container = elementAtPoint(snap, apex.x, apex.y)
      if (container) {
        const op: EditOp = {
          op: 'INSERT',
          container: toTarget(snap, container),
          at: { x: apex.x, y: apex.y },
          inkIds: [node.id],
          pendingTextIds: [],
        }
        ops.push(op)
        opForInk.set(node.id, op)
      } else {
        unresolvedInkIds.push(node.id)
      }
      continue
    }

    // strikethrough over a DOM element: a roughly-horizontal line through the
    // middle of a text-bearing element is a delete mark (proofreader's marks).
    // A line in empty space stays unresolved (could be a divider sketch — the
    // ambiguity we don't guess at).
    if (node.kind === 'line' || node.kind === 'strikethrough') {
      const cy = node.bbox.y + node.bbox.h / 2
      const target = primaryTarget(snap, expand(node.bbox, 4))
      const midBandOk =
        target !== null &&
        target.text.length > 0 &&
        cy >= target.rect.y + target.rect.h * 0.2 &&
        cy <= target.rect.y + target.rect.h * 0.8
      const widthOk =
        target !== null &&
        node.bbox.w >= target.rect.w * 0.55 &&
        node.bbox.w <= target.rect.w * 1.6
      const flatOk = node.bbox.h <= Math.max(24, (target?.rect.h ?? 0) * 1.2)
      if (target && midBandOk && widthOk && flatOk) {
        const op: EditOp = {
          op: 'DELETE', target: toTarget(snap, target), inkIds: [node.id], pendingTextIds: [],
        }
        ops.push(op)
        opForInk.set(node.id, op)
        continue
      }
    }

    // remaining lines / polylines / arcs / stray ink with no op semantics
    unresolvedInkIds.push(node.id)
  }

  // arrows → MOVE
  for (const arrow of scene.arrows) {
    const srcEl = elementAtPoint(snap, arrow.from.x, arrow.from.y)
    const dstEl = elementAtPoint(snap, arrow.to.x, arrow.to.y)
    if (!srcEl || !dstEl || srcEl.id === dstEl.id) {
      unresolvedInkIds.push(arrow.nodeId)
      warnings.push(`arrow ${arrow.id} endpoints don't resolve to two distinct elements`)
      continue
    }
    // position: pointing at a container (src not inside it) → into; else before/after by direction
    const dstIsContainer = dstEl.depth < srcEl.depth
    const vertical = Math.abs(arrow.to.y - arrow.from.y) >= Math.abs(arrow.to.x - arrow.from.x)
    const position = dstIsContainer
      ? 'into'
      : vertical
        ? (arrow.to.y < arrow.from.y ? 'before' : 'after')
        : (arrow.to.x < arrow.from.x ? 'before' : 'after')
    const op: EditOp = {
      op: 'MOVE',
      source: toTarget(snap, srcEl),
      dest: toTarget(snap, dstEl),
      position,
      inkIds: [arrow.nodeId],
      pendingTextIds: [],
    }
    ops.push(op)
    opForInk.set(arrow.nodeId, op)
  }

  // handwriting: attach to the nearest op's gesture ink; else MODIFY what's underneath
  const textRefs = scene.textRegions.map((t) => ({ id: t.id, bbox: t.bbox }))
  for (const t of scene.textRegions) {
    let best: { op: EditOp; gap: number } | null = null
    for (const node of scene.nodes) {
      const op = opForInk.get(node.id)
      if (!op) continue
      const gap = bboxGap(t.bbox, node.bbox)
      if (gap <= 140 && (!best || gap < best.gap)) best = { op, gap }
    }
    if (best) {
      best.op.pendingTextIds.push(t.id)
    } else {
      const under = primaryTarget(snap, expand(t.bbox, 8))
      if (under) {
        ops.push({
          op: 'MODIFY',
          target: toTarget(snap, under),
          inkIds: [],
          pendingTextIds: [t.id],
        })
      } else {
        warnings.push(`handwriting ${t.id} attaches to nothing`)
      }
    }
  }

  // merge ops hitting the same element with the same verb
  const merged: EditOp[] = []
  const byKey = new Map<string, EditOp>()
  for (const op of ops) {
    const key =
      op.op === 'MOVE'
        ? `MOVE:${op.source.domId}:${op.dest.domId}`
        : op.op === 'ADD'
          ? `ADD:${op.container.domId}:${op.inkIds.join()}`
          : op.op === 'INSERT'
            ? `INSERT:${op.container.domId}:${op.inkIds.join()}`
            : `${op.op}:${op.target.domId}`
    const existing = byKey.get(key)
    if (existing) {
      existing.inkIds.push(...op.inkIds)
      existing.pendingTextIds.push(...op.pendingTextIds)
    } else {
      byKey.set(key, op)
      merged.push(op)
    }
  }

  return { ops: merged, textRefs, unresolvedInkIds, warnings }
}

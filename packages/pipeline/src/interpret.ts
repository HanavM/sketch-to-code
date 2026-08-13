import { analyzeStrokes, type ShapeKind, type Stroke } from '@s2c/ink'
import type { DomSnapshot } from '@s2c/dom'
import { buildEditPlan } from '@s2c/intent'
import type { RunMode } from './codegen.js'

export interface InterpretShape {
  id: string
  kind: ShapeKind
  confidence: number
  /** Ranked alternatives the user can cycle through in the preview. */
  candidates: Array<{ kind: ShapeKind; confidence: number }>
  bbox: { x: number; y: number; w: number; h: number }
}

export interface InterpretOp {
  op: string
  targetTag?: string
  targetText?: string
  srcLoc?: string | null
  rect?: { x: number; y: number; w: number; h: number }
  /** Destructive + wide-reaching: the UI must make the user look at it. */
  needsConfirm: boolean
}

export interface InterpretResult {
  shapes: InterpretShape[]
  textRegions: Array<{ id: string; bbox: { x: number; y: number; w: number; h: number } }>
  arrows: Array<{ id: string; from: { x: number; y: number }; to: { x: number; y: number } }>
  ops: InterpretOp[]
  warnings: string[]
  /** gesture mode resolved nothing but ink exists → run would go to design. */
  escalatesToDesign: boolean
}

/**
 * Deterministic interpretation preview: exactly what a run WOULD do, with no
 * model calls, no git, no side effects. The overlay renders this back to the
 * user for confirmation/correction before any source file is touched — which
 * also serves as the unconditional confirmation gate for destructive ops.
 */
export function interpretStrokes(
  strokes: Stroke[],
  snapshot: DomSnapshot,
  mode: RunMode,
  overrides?: Record<string, string>,
): InterpretResult {
  const scene = analyzeStrokes(strokes)
  if (overrides) {
    scene.nodes = scene.nodes.filter((n) => overrides[n.id] !== 'ignore')
    scene.arrows = scene.arrows.filter((a) => scene.nodes.some((n) => n.id === a.nodeId))
    for (const node of scene.nodes) {
      const o = overrides[node.id]
      if (o && o !== node.kind) node.kind = o as ShapeKind
    }
  }

  const shapes: InterpretShape[] = scene.nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    confidence: n.candidates[0]?.confidence ?? 0.4,
    candidates: n.candidates.slice(0, 4),
    bbox: n.bbox,
  }))
  const textRegions = scene.textRegions.map((t) => ({ id: t.id, bbox: t.bbox }))
  const arrows = scene.arrows.map((a) => ({
    id: a.id,
    from: { x: a.from.x, y: a.from.y },
    to: { x: a.to.x, y: a.to.y },
  }))

  let ops: InterpretOp[] = []
  let warnings: string[] = []
  let escalatesToDesign = false

  if (mode === 'gesture') {
    const plan = buildEditPlan(scene, snapshot)
    warnings = plan.warnings
    const viewArea = snapshot.viewport.w * snapshot.viewport.h
    ops = plan.ops.map((op) => {
      const target = op.op === 'MOVE' ? op.source : op.op === 'ADD' || op.op === 'INSERT' ? op.container : op.target
      const inkNodes = scene.nodes.filter((n) => op.inkIds.includes(n.id))
      const inkArea = inkNodes.reduce((a, n) => a + n.bbox.w * n.bbox.h, 0)
      // how many distinct sizable elements does the gesture ink touch?
      const touched = new Set<string>()
      for (const n of inkNodes) {
        for (const el of snapshot.nodes) {
          const r = el.rect
          if (r.w * r.h < 400 || r.w * r.h > viewArea * 0.5) continue
          const ix = Math.min(n.bbox.x + n.bbox.w, r.x + r.w) - Math.max(n.bbox.x, r.x)
          const iy = Math.min(n.bbox.y + n.bbox.h, r.y + r.h) - Math.max(n.bbox.y, r.y)
          if (ix > 0 && iy > 0 && (ix * iy) / (r.w * r.h) > 0.4) touched.add(el.id)
        }
      }
      // destructive + wide: DELETE covering >35% of the viewport, a large
      // target, or ink sweeping >=3 elements — force attention regardless
      const needsConfirm =
        op.op === 'DELETE' &&
        (inkArea > viewArea * 0.35 ||
          target.rect.w * target.rect.h > viewArea * 0.35 ||
          touched.size >= 3)
      return {
        op: op.op,
        targetTag: target.tag,
        targetText: target.text.slice(0, 40),
        srcLoc: target.srcLoc,
        rect: target.rect,
        needsConfirm,
      }
    })
    escalatesToDesign = ops.length === 0 && shapes.length + textRegions.length > 0
  }

  return { shapes, textRegions, arrows, ops, warnings, escalatesToDesign }
}

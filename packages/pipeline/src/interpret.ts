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
      // destructive + wide: DELETE covering >35% of the viewport, or whose
      // target is large — force attention regardless of confidence
      const needsConfirm =
        op.op === 'DELETE' &&
        (inkArea > viewArea * 0.35 || target.rect.w * target.rect.h > viewArea * 0.35)
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

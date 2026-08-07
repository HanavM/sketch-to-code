import type { BBox, ShapeKind } from '@s2c/ink'

/** Slimmed DomNode reference carried inside an op — everything codegen needs. */
export interface EditTarget {
  domId: string
  /** 'src/components/Nav.tsx:42:7' or null when the element isn't stamped. */
  srcLoc: string | null
  tag: string
  text: string
  classes: string[]
  rect: BBox
}

export type EditOp =
  | {
      op: 'DELETE'
      target: EditTarget
      /** Ink node ids that produced this op. */
      inkIds: string[]
      instruction?: string
      pendingTextIds: string[]
    }
  | {
      op: 'MODIFY'
      target: EditTarget
      inkIds: string[]
      instruction?: string
      pendingTextIds: string[]
    }
  | {
      op: 'ADD'
      container: EditTarget
      /** What was sketched: shape kind + where it was drawn (page coords). */
      sketch: { kind: ShapeKind; rect: BBox }
      inkIds: string[]
      instruction?: string
      pendingTextIds: string[]
    }
  | {
      op: 'MOVE'
      source: EditTarget
      dest: EditTarget
      /** Geometric suggestion; codegen may refine. */
      position: 'before' | 'after' | 'into'
      inkIds: string[]
      instruction?: string
      pendingTextIds: string[]
    }
  | {
      op: 'INSERT'
      container: EditTarget
      at: { x: number; y: number }
      inkIds: string[]
      instruction?: string
      pendingTextIds: string[]
    }

export interface TextRef {
  id: string
  bbox: BBox
  /** Filled by the perception provider (handwriting transcription). */
  text?: string
}

export interface EditPlan {
  ops: EditOp[]
  /** All handwriting regions in the sketch, transcribed later. */
  textRefs: TextRef[]
  /** Ink nodes that produced no op (surfaced, never silently dropped). */
  unresolvedInkIds: string[]
  warnings: string[]
}

import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'

export interface OpVerdict {
  index: number
  op: EditOp['op']
  satisfied: boolean
  reason: string
}

export interface VerifyResult {
  verdicts: OpVerdict[]
  score: number
  satisfied: number
  total: number
}

const nodesAt = (snap: DomSnapshot, srcLoc: string | null): DomNode[] =>
  srcLoc ? snap.nodes.filter((n) => n.srcLoc === srcLoc) : []

const findByText = (snap: DomSnapshot, srcLoc: string | null, text: string): DomNode | undefined =>
  nodesAt(snap, srcLoc).find((n) => n.text === text)

/** Count of nodes whose rect center lies inside `rect`. */
const countWithin = (snap: DomSnapshot, rect: { x: number; y: number; w: number; h: number }): number =>
  snap.nodes.filter((n) => {
    const cx = n.rect.x + n.rect.w / 2
    const cy = n.rect.y + n.rect.h / 2
    return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h
  }).length

const styleKey = (n: DomNode): string =>
  JSON.stringify([n.text, n.classes, n.style])

/**
 * Deterministic per-op assertions comparing before/after snapshots.
 * "Did the requested edit actually happen" — no pixels, no models.
 */
export function verifyOps(ops: EditOp[], before: DomSnapshot, after: DomSnapshot): VerifyResult {
  const verdicts: OpVerdict[] = ops.map((op, index) => {
    switch (op.op) {
      case 'DELETE': {
        const wasN = nodesAt(before, op.target.srcLoc).length
        const isN = nodesAt(after, op.target.srcLoc).length
        const gone =
          op.target.text.length > 0
            ? !findByText(after, op.target.srcLoc, op.target.text)
            : isN < wasN
        return {
          index,
          op: op.op,
          satisfied: gone || isN < wasN,
          reason: gone || isN < wasN
            ? `target no longer present (${wasN}→${isN} at srcLoc)`
            : `element still present: ${op.target.srcLoc} "${op.target.text}"`,
        }
      }
      case 'MODIFY': {
        // the element (or its srcLoc family) must still exist AND something
        // about it must have changed: text, classes, or computed style
        const beforeNodes = nodesAt(before, op.target.srcLoc)
        const afterNodes = nodesAt(after, op.target.srcLoc)
        if (afterNodes.length === 0) {
          // srcLoc may shift when the file is edited — fall back to text match anywhere
          const byText = op.target.text
            ? after.nodes.some((n) => n.text === op.target.text || n.text.length > 0 && n.tag === op.target.tag)
            : false
          return {
            index, op: op.op, satisfied: byText,
            reason: byText ? 'element re-found by text after srcLoc shift' : 'target vanished after MODIFY',
          }
        }
        const beforeKeys = new Set(beforeNodes.map(styleKey))
        const changed = afterNodes.some((n) => !beforeKeys.has(styleKey(n)))
        return {
          index, op: op.op, satisfied: changed,
          reason: changed ? 'target changed' : 'no observable change on target',
        }
      }
      case 'ADD':
      case 'INSERT': {
        const container = op.op === 'ADD' ? op.container : op.container
        const wasN = nodesAt(before, container.srcLoc).length
        const isN = nodesAt(after, container.srcLoc).length
        // container subtree grew: count nodes within the container's rect region
        const wasInRect = countWithin(before, container.rect)
        const isInRect = countWithin(after, container.rect)
        const grew = after.nodes.length > before.nodes.length || isInRect > wasInRect || isN > wasN
        return {
          index, op: op.op, satisfied: grew,
          reason: grew
            ? `page grew (${before.nodes.length}→${after.nodes.length} nodes)`
            : 'no new elements appeared in the container',
        }
      }
      case 'MOVE': {
        const src = findByText(after, op.source.srcLoc, op.source.text) ?? nodesAt(after, op.source.srcLoc)[0]
        const dst = findByText(after, op.dest.srcLoc, op.dest.text) ?? nodesAt(after, op.dest.srcLoc)[0]
        if (!src || !dst) {
          return { index, op: op.op, satisfied: false, reason: 'source or dest not found after edit' }
        }
        const srcIdx = after.nodes.indexOf(src)
        const dstIdx = after.nodes.indexOf(dst)
        const beforeSrc = findByText(before, op.source.srcLoc, op.source.text) ?? nodesAt(before, op.source.srcLoc)[0]
        const beforeDst = findByText(before, op.dest.srcLoc, op.dest.text) ?? nodesAt(before, op.dest.srcLoc)[0]
        const beforeOrder = beforeSrc && beforeDst ? Math.sign(before.nodes.indexOf(beforeSrc) - before.nodes.indexOf(beforeDst)) : 0
        const afterOrder = Math.sign(srcIdx - dstIdx)
        const expected = op.position === 'before' ? -1 : op.position === 'after' ? 1 : afterOrder
        const moved = afterOrder === expected && (beforeOrder !== afterOrder || positionsShifted(beforeSrc, src))
        return {
          index, op: op.op, satisfied: moved,
          reason: moved ? `document order now source ${expected < 0 ? 'before' : 'after'} dest` : 'order unchanged',
        }
      }
    }
  })

  const satisfied = verdicts.filter((v) => v.satisfied).length
  return {
    verdicts,
    satisfied,
    total: verdicts.length,
    score: verdicts.length > 0 ? satisfied / verdicts.length : 1,
  }
}

function positionsShifted(a: DomNode | undefined, b: DomNode): boolean {
  if (!a) return true
  return Math.abs(a.rect.x - b.rect.x) > 4 || Math.abs(a.rect.y - b.rect.y) > 4
}

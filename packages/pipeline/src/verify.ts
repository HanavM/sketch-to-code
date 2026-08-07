import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { EditOp, EditTarget } from '@s2c/intent'

export interface OpVerdict {
  index: number
  op: EditOp['op']
  satisfied: boolean
  /** True when we could not decide either way (counted satisfied, flagged). */
  unverifiable?: boolean
  reason: string
}

export interface VerifyResult {
  verdicts: OpVerdict[]
  score: number
  satisfied: number
  total: number
}

/**
 * IMPORTANT: srcLoc stamps are positional (file:line:col). The first edit to a
 * file shifts every stamp below it, so `after`-snapshot srcLocs generally do
 * NOT equal plan-time srcLocs. Assertions therefore re-resolve targets
 * structurally (tag + text, then srcLoc FILE) rather than by exact srcLoc.
 */

const fileOf = (srcLoc: string | null): string | null => srcLoc?.split(':')[0] ?? null

const byTagText = (snap: DomSnapshot, tag: string, text: string): DomNode[] =>
  text.length > 0 ? snap.nodes.filter((n) => n.tag === tag && n.text === text) : []

const bySrcFile = (snap: DomSnapshot, srcLoc: string | null): DomNode[] => {
  const f = fileOf(srcLoc)
  return f ? snap.nodes.filter((n) => n.srcLoc !== null && n.srcLoc.startsWith(`${f}:`)) : []
}

/** Best-effort re-resolution of a plan-time target in a later snapshot. */
function resolveTarget(snap: DomSnapshot, t: EditTarget): DomNode | undefined {
  return (
    byTagText(snap, t.tag, t.text)[0] ??
    (t.srcLoc ? snap.nodes.find((n) => n.srcLoc === t.srcLoc) : undefined)
  )
}

const styleKey = (n: DomNode): string => JSON.stringify([n.tag, n.text, n.classes, n.style])

const centerIn = (n: DomNode, rect: { x: number; y: number; w: number; h: number }): boolean => {
  const cx = n.rect.x + n.rect.w / 2
  const cy = n.rect.y + n.rect.h / 2
  return cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h
}

/**
 * Deterministic per-op assertions comparing before/after snapshots.
 * "Did the requested edit actually happen" — no pixels, no models.
 * Bias: prefer marking a satisfied-looking op unverifiable over letting the
 * repair loop re-apply an op that actually landed (double-apply is the worst
 * failure mode — e.g. a second identical button).
 */
export function verifyOps(ops: EditOp[], before: DomSnapshot, after: DomSnapshot): VerifyResult {
  const truncated = before.truncated || after.truncated

  const verdicts: OpVerdict[] = ops.map((op, index) => {
    switch (op.op) {
      case 'DELETE': {
        // primary: the (tag, text) identity is gone from the whole document
        if (op.target.text.length > 0) {
          const still = byTagText(after, op.target.tag, op.target.text).length > 0
          return {
            index, op: op.op, satisfied: !still,
            reason: still
              ? `<${op.target.tag}> "${op.target.text}" still present`
              : `<${op.target.tag}> "${op.target.text}" gone`,
          }
        }
        // no text: fall back to same-source-FILE element count decreasing
        const wasN = bySrcFile(before, op.target.srcLoc).length
        const isN = bySrcFile(after, op.target.srcLoc).length
        if (wasN === 0) {
          return {
            index, op: op.op, satisfied: true, unverifiable: true,
            reason: 'target had no text and no stamped srcLoc — cannot verify',
          }
        }
        return {
          index, op: op.op, satisfied: isN < wasN,
          reason: isN < wasN ? `elements from ${fileOf(op.target.srcLoc)}: ${wasN}→${isN}` : 'no element count decrease',
        }
      }

      case 'MODIFY': {
        const beforeKeys = new Set(before.nodes.map(styleKey))
        const resolved = resolveTarget(after, op.target)
        if (resolved) {
          const changed = !beforeKeys.has(styleKey(resolved))
          if (changed) return { index, op: op.op, satisfied: true, reason: 'target observably changed' }
          // element identical — maybe the change landed on a descendant/ancestor
          // in the same source file
          const fileChanged = bySrcFile(after, op.target.srcLoc).some((n) => !beforeKeys.has(styleKey(n)))
          return {
            index, op: op.op, satisfied: fileChanged,
            reason: fileChanged
              ? 'change observed on same-file elements'
              : 'no observable change on target or its file',
          }
        }
        // the exact (tag,text) identity vanished — the model likely changed the
        // text itself, which is a modification
        const textGone =
          op.target.text.length > 0 && byTagText(after, op.target.tag, op.target.text).length === 0
        return {
          index, op: op.op, satisfied: textGone,
          reason: textGone ? 'target text changed (old text gone)' : 'target not found and old text still absent',
        }
      }

      case 'ADD':
      case 'INSERT': {
        if (truncated) {
          // capped snapshots can't see growth — never send the repair loop
          // chasing a phantom failure (double-apply risk)
          return {
            index, op: op.op, satisfied: true, unverifiable: true,
            reason: 'snapshot truncated at node cap — growth invisible',
          }
        }
        const container = op.container
        // region test against the container's CURRENT rect when re-resolvable,
        // falling back to its plan-time rect; expand downward since new content
        // usually grows the container
        const resolved = resolveTarget(after, container)
        const rect = resolved?.rect ?? container.rect
        const grown = { x: rect.x - 8, y: rect.y - 8, w: rect.w + 16, h: rect.h * 1.5 + 16 }
        const wasIn = before.nodes.filter((n) => centerIn(n, grown)).length
        const isIn = after.nodes.filter((n) => centerIn(n, grown)).length
        return {
          index, op: op.op, satisfied: isIn > wasIn,
          reason: isIn > wasIn
            ? `container region grew (${wasIn}→${isIn} elements)`
            : `no new elements in the container region (${wasIn}→${isIn})`,
        }
      }

      case 'MOVE': {
        const src = resolveTarget(after, op.source)
        const dst = resolveTarget(after, op.dest)
        if (!src || !dst) {
          return { index, op: op.op, satisfied: false, reason: 'source or dest not found after edit' }
        }
        if (op.position === 'into') {
          const inside = centerIn(src, dst.rect)
          return {
            index, op: op.op, satisfied: inside,
            reason: inside ? 'source now inside dest' : 'source not inside dest',
          }
        }
        const srcIdx = after.nodes.indexOf(src)
        const dstIdx = after.nodes.indexOf(dst)
        const afterOrder = Math.sign(srcIdx - dstIdx)
        const expected = op.position === 'before' ? -1 : 1
        const beforeSrc = resolveTarget(before, op.source)
        const beforeDst = resolveTarget(before, op.dest)
        const beforeOrder = beforeSrc && beforeDst
          ? Math.sign(before.nodes.indexOf(beforeSrc) - before.nodes.indexOf(beforeDst))
          : 0
        const shifted = beforeSrc
          ? Math.abs(beforeSrc.rect.x - src.rect.x) > 12 || Math.abs(beforeSrc.rect.y - src.rect.y) > 12
          : true
        const moved = afterOrder === expected && (beforeOrder !== expected || shifted)
        return {
          index, op: op.op, satisfied: moved,
          reason: moved
            ? `document order: source ${expected < 0 ? 'before' : 'after'} dest`
            : `order/position unchanged (order ${afterOrder}, expected ${expected})`,
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

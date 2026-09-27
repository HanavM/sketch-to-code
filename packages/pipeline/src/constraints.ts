/**
 * Drawn rules that keep watching.
 *
 * A sketch is normally an instruction: it says do this, it gets done, the ink
 * disappears. But half of what someone points at while looking at a page is
 * not an instruction at all — "these two stay aligned", "this never leaves
 * that card", "there's always a gap here". Those are INVARIANTS, and today
 * they have nowhere to live. A design tool can only record them as a comment,
 * which nothing enforces. A test suite can enforce them, but nobody writes a
 * test for an alignment they noticed in passing, and if they did it would be
 * invisible from the page it is about.
 *
 * This pipeline is in an unusual position: it already snapshots the live DOM
 * and already scores things against it after every edit. So a rule drawn on
 * the page can be evaluated exactly like any other assertion — on every run,
 * against reality, with a numeric complaint when it breaks.
 *
 * Anchoring is by build-time stamp rather than by coordinates, so a rule
 * survives the element moving, the page reflowing, and the component being
 * edited. What it deliberately does NOT survive is the element being deleted:
 * that is reported as a violation, because a rule about something that no
 * longer exists is exactly the kind of silent rot worth hearing about.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'

export type ConstraintKind =
  | 'aligned-left' | 'aligned-right' | 'aligned-top' | 'aligned-bottom'
  | 'same-width' | 'same-height'
  | 'inside'
  | 'gap'
  | 'order'
  | 'present'

export interface Constraint {
  id: string
  kind: ConstraintKind
  /** data-s2c stamps: one subject for 'present', two for everything else. */
  subjects: string[]
  /** The measured value when the rule was drawn (px) — 'gap' only. */
  value?: number
  /** How far reality may drift before this counts as broken (px). */
  tolerance: number
  /** Exactly what the user typed when they drew it. */
  note?: string
  createdAt: number
}

export interface Violation {
  id: string
  kind: ConstraintKind
  /** Numeric and actionable, in the same register as the composition notes. */
  message: string
  note?: string
}

const DEFAULT_TOLERANCE = 2

/** Human wording, used by the overlay and in failure text. */
export function describeConstraint(c: Constraint): string {
  const [a, b] = c.subjects
  const nameOf = (loc: string | undefined) => loc?.split('/').pop() ?? '?'
  switch (c.kind) {
    case 'present': return `${nameOf(a)} stays on the page`
    case 'inside': return `${nameOf(a)} stays inside ${nameOf(b)}`
    case 'gap': return `${nameOf(a)} and ${nameOf(b)} keep a ${String(Math.round(c.value ?? 0))}px gap`
    case 'order': return `${nameOf(a)} comes before ${nameOf(b)}`
    case 'same-width': return `${nameOf(a)} and ${nameOf(b)} stay the same width`
    case 'same-height': return `${nameOf(a)} and ${nameOf(b)} stay the same height`
    default: return `${nameOf(a)} and ${nameOf(b)} stay ${c.kind.replace('aligned-', '')}-aligned`
  }
}

/**
 * First element carrying a stamp. A stamp can render many times (a .map());
 * the first instance is a stable choice and the alternative — silently
 * checking a different instance each run — would be worse than arbitrary.
 */
const resolve = (snap: DomSnapshot, srcLoc: string): DomNode | undefined =>
  snap.nodes.find((n) => n.srcLoc === srcLoc)

const px = (v: number) => `${String(Math.round(v))}px`

/** Distance between two rects along whichever axis separates them. */
function gapBetween(a: DomNode['rect'], b: DomNode['rect']): number {
  const dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0)
  const dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0)
  // overlapping on both axes is a zero gap, not a negative one
  return Math.max(dx, dy)
}

export function evaluateConstraints(constraints: Constraint[], snap: DomSnapshot): Violation[] {
  const out: Violation[] = []
  for (const c of constraints) {
    const tol = c.tolerance > 0 ? c.tolerance : DEFAULT_TOLERANCE
    const [locA, locB] = c.subjects
    const a = locA ? resolve(snap, locA) : undefined
    const b = locB ? resolve(snap, locB) : undefined
    const fail = (message: string) => out.push({ id: c.id, kind: c.kind, message, note: c.note })

    if (!a) {
      fail(`the element this rule was drawn on is gone (${locA ?? '?'})`)
      continue
    }
    if (c.kind === 'present') {
      if (a.rect.w < 1 || a.rect.h < 1) fail(`${locA!} is on the page but renders nothing`)
      continue
    }
    if (!b) {
      fail(`the other element in this rule is gone (${locB ?? '?'})`)
      continue
    }

    switch (c.kind) {
      case 'aligned-left': {
        const d = Math.abs(a.rect.x - b.rect.x)
        if (d > tol) fail(`left edges are ${px(d)} apart (rule allows ${px(tol)})`)
        break
      }
      case 'aligned-right': {
        const d = Math.abs(a.rect.x + a.rect.w - (b.rect.x + b.rect.w))
        if (d > tol) fail(`right edges are ${px(d)} apart (rule allows ${px(tol)})`)
        break
      }
      case 'aligned-top': {
        const d = Math.abs(a.rect.y - b.rect.y)
        if (d > tol) fail(`top edges are ${px(d)} apart (rule allows ${px(tol)})`)
        break
      }
      case 'aligned-bottom': {
        const d = Math.abs(a.rect.y + a.rect.h - (b.rect.y + b.rect.h))
        if (d > tol) fail(`bottom edges are ${px(d)} apart (rule allows ${px(tol)})`)
        break
      }
      case 'same-width': {
        const d = Math.abs(a.rect.w - b.rect.w)
        if (d > tol) fail(`widths differ by ${px(d)} (${px(a.rect.w)} vs ${px(b.rect.w)})`)
        break
      }
      case 'same-height': {
        const d = Math.abs(a.rect.h - b.rect.h)
        if (d > tol) fail(`heights differ by ${px(d)} (${px(a.rect.h)} vs ${px(b.rect.h)})`)
        break
      }
      case 'inside': {
        const r = a.rect
        const o = b.rect
        const out1 = r.x < o.x - tol || r.y < o.y - tol ||
          r.x + r.w > o.x + o.w + tol || r.y + r.h > o.y + o.h + tol
        if (out1) {
          const over = Math.max(
            o.x - r.x, r.x + r.w - (o.x + o.w), o.y - r.y, r.y + r.h - (o.y + o.h),
          )
          fail(`it escapes its container by ${px(over)}`)
        }
        break
      }
      case 'gap': {
        const now = gapBetween(a.rect, b.rect)
        const want = c.value ?? 0
        if (Math.abs(now - want) > tol) {
          fail(`the gap is ${px(now)}, the rule says ${px(want)} (±${px(tol)})`)
        }
        break
      }
      case 'order': {
        // document order as the page reads: down, then across
        const first = a.rect.y < b.rect.y - tol || (Math.abs(a.rect.y - b.rect.y) <= tol && a.rect.x <= b.rect.x)
        if (!first) fail(`they are out of order — the first one now sits after the second`)
        break
      }
    }
  }
  return out
}

/** Where a project's rules live, next to its run bundles. */
export const constraintsPath = (root: string): string =>
  join(root, '.sketch2code', 'constraints.json')

export function loadConstraints(root: string): Constraint[] {
  const file = constraintsPath(root)
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    // validate rather than trust: a hand-edited or half-written file must not
    // take the checker down with it
    return raw.filter((c): c is Constraint => {
      const o = c as Partial<Constraint>
      return typeof o?.id === 'string' && typeof o.kind === 'string' &&
        Array.isArray(o.subjects) && o.subjects.every((s) => typeof s === 'string') &&
        o.subjects.length > 0
    }).map((c) => ({ ...c, tolerance: typeof c.tolerance === 'number' ? c.tolerance : DEFAULT_TOLERANCE }))
  } catch {
    return []
  }
}

export function saveConstraints(root: string, constraints: Constraint[]): void {
  const file = constraintsPath(root)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(constraints, null, 2)}\n`)
}

/**
 * Measure a rule from the page at the moment it is drawn, so 'gap' records
 * what the user was looking at rather than asking them for a number.
 */
export function measureConstraint(
  kind: ConstraintKind,
  subjects: string[],
  snap: DomSnapshot,
): { value?: number; error?: string } {
  const a = subjects[0] ? resolve(snap, subjects[0]) : undefined
  const b = subjects[1] ? resolve(snap, subjects[1]) : undefined
  if (!a) return { error: 'that element is not on the page' }
  if (kind !== 'present' && !b) return { error: 'a rule between two things needs two things' }
  if (kind === 'gap' && a && b) return { value: gapBetween(a.rect, b.rect) }
  return {}
}

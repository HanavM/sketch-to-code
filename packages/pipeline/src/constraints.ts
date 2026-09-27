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

/**
 * Human wording, used by the overlay and in failure text.
 *
 * `names` lets the caller say "a “Overview”" where this would otherwise say
 * "Navbar.tsx:7:11": the stamp is the right name in a failure a developer
 * reads next to a diff, and the wrong one in a panel next to the element.
 */
export function describeConstraint(c: Constraint, names?: string[]): string {
  const [a, b] = c.subjects
  const nameOf = (loc: string | undefined) => {
    const i = c.subjects.indexOf(loc ?? '')
    return names?.[i] ?? loc?.split('/').pop() ?? '?'
  }
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

// ── turning a drawn line into a rule ────────────────────────────────────────
// The gesture is the one people already use on a printout: draw a line down
// the edges that should line up, or across the gap that should stay. That is
// unambiguous about WHICH elements and WHICH axis, and nearly unambiguous
// about the rule — a line down two left edges says aligned-left, but it could
// mean same-width, and only the person drawing it knows.
//
// So this proposes rather than decides: the geometry produces a ranked set of
// readings, each already measured against the page, and the overlay shows them
// with the elements they are about. Nothing is saved from a guess.

/** The drawn segment, in page coordinates — the same space as node rects. */
export interface RuleLine { x0: number; y0: number; x1: number; y1: number }

export interface Proposal {
  kind: ConstraintKind
  subjects: string[]
  value?: number
  tolerance: number
  /** The rule in words, as it will read once saved. */
  desc: string
  /** What the page says right now, so a rule is never saved already broken. */
  reading: string
  /** Names of the elements this is about, for the confirmation. */
  labels: string[]
}

/** How far from an edge the line may sit and still be pointing at it. */
const EDGE_NEAR = 28
/** How far an endpoint may sit from an element it means, in the gap case. */
const ENDPOINT_NEAR = 60

const DEFAULT_TOL: Partial<Record<ConstraintKind, number>> = {
  gap: 4, // gaps move with wrapping and font metrics; edges do not
}

/** Something a person would recognise: the tag, plus its own words. */
export function nodeLabel(n: DomNode): string {
  const text = n.text.trim().replace(/\s+/g, ' ').slice(0, 18)
  return text ? `${n.tag} “${text}”` : n.tag
}

type Rect = DomNode['rect']

/** Does the segment cross the box? Liang–Barsky, so a grazing line counts. */
function crosses(l: RuleLine, r: Rect): boolean {
  const dx = l.x1 - l.x0
  const dy = l.y1 - l.y0
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0 // parallel: inside or nothing to clip
    const t = q / p
    if (p < 0) {
      if (t > t1) return false
      if (t > t0) t0 = t
    } else {
      if (t < t0) return false
      if (t < t1) t1 = t
    }
    return true
  }
  return clip(-dx, l.x0 - r.x) && clip(dx, r.x + r.w - l.x0) &&
    clip(-dy, l.y0 - r.y) && clip(dy, r.y + r.h - l.y0)
}

/** Shortest distance from a point to a segment. */
function distToSeg(x: number, y: number, l: RuleLine): number {
  const dx = l.x1 - l.x0
  const dy = l.y1 - l.y0
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - l.x0) * dx + (y - l.y0) * dy) / len2))
  return Math.hypot(x - (l.x0 + t * dx), y - (l.y0 + t * dy))
}

/**
 * Shortest distance from the drawn segment to a box, exactly.
 *
 * Crossing is NOT the test: someone tracing two left edges draws a line that
 * wanders a pixel either side of them, so it leaves and re-enters — and a
 * strict crossing test then sees the first card and misses the second, which
 * is the whole rule silently becoming a different one.
 */
function segRectDist(l: RuleLine, r: Rect): number {
  if (crosses(l, r)) return 0
  const corners: [number, number][] = [
    [r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h],
  ]
  return Math.min(
    distToRect(l.x0, l.y0, r),
    distToRect(l.x1, l.y1, r),
    ...corners.map(([cx, cy]) => distToSeg(cx, cy, l)),
  )
}

/** Shortest distance from a point to a box (0 inside it). */
function distToRect(x: number, y: number, r: Rect): number {
  const dx = Math.max(r.x - x, x - (r.x + r.w), 0)
  const dy = Math.max(r.y - y, y - (r.y + r.h), 0)
  return Math.hypot(dx, dy)
}

const nests = (a: Rect, b: Rect): boolean =>
  a.x <= b.x && a.y <= b.y && a.x + a.w >= b.x + b.w && a.y + a.h >= b.y + b.h

/** Stamped, rendered, and not the page itself. */
function subjects(snap: DomSnapshot): DomNode[] {
  return snap.nodes.filter((n) => n.srcLoc && n.rect.w >= 1 && n.rect.h >= 1)
}

/**
 * Two elements, chosen so the pick is defensible: nearest to what was drawn,
 * never one inside the other (a rule between a card and its own title is
 * almost always a mis-hit, and the containment case has its own kind).
 *
 * The tie-break is the whole game. A line down two form inputs' left edges is
 * ALSO exactly on the edge of each input's wrapper div, the <form>, and often
 * the section — layouts are full of boxes that share an edge because nothing
 * pads them apart. Ties therefore go to the SMALLEST box: it is the one whose
 * edge is actually visible, it is what the user was pointing at, and the rule
 * is the stronger statement (if two inputs stay aligned, so do their wrappers).
 * Preferring the largest instead makes every rule in a real app come out as a
 * statement about some <form> nobody was looking at.
 */
function pairBy(nodes: DomNode[], score: (n: DomNode) => number, limit: number): DomNode[] {
  const ranked = nodes
    .map((n) => ({ n, d: score(n) }))
    .filter((e) => e.d <= limit)
    .sort((a, b) => a.d - b.d || a.n.rect.w * a.n.rect.h - b.n.rect.w * b.n.rect.h)
  const out: DomNode[] = []
  for (const { n } of ranked) {
    if (out.some((o) => o.srcLoc === n.srcLoc)) continue
    // an ancestor or descendant of something already picked is the same
    // element as far as the drawn line is concerned
    if (out.some((o) => nests(o.rect, n.rect) || nests(n.rect, o.rect))) continue
    out.push(n)
    if (out.length === 2) break
  }
  return out
}

export function proposeConstraints(
  line: RuleLine,
  snap: DomSnapshot,
  /**
   * What the pointer was actually over at each end of the line, if the client
   * could tell. This settles the one question geometry cannot.
   *
   * Real layouts stack boxes on a shared edge: a form input, its wrapper div,
   * its label and the <form> can all have the SAME left edge, because nothing
   * pads them apart. A line down that edge is equally near all four, and the
   * choice matters enormously — a rule watching the labels stays quiet while
   * the inputs it was drawn about drift out of line. So when the page can say
   * what the line ran along, that wins: it respects stacking, visibility and
   * pointer-events, i.e. it is what the user could SEE.
   *
   * Ranked best-first and allowed to be longer than two, because entries that
   * turn out to nest each other are dropped here and something has to be left.
   */
  hint?: string[],
): { proposals: Proposal[]; error?: string } {
  const cands = subjects(snap)
  if (cands.length === 0) return { proposals: [], error: 'nothing on this page carries a source stamp' }

  const vertical = Math.abs(line.y1 - line.y0) > Math.abs(line.x1 - line.x0)
  const mx = (line.x0 + line.x1) / 2
  const my = (line.y0 + line.y1) / 2

  // ── what the pointer was on, when that is two separate things ──
  const hinted: DomNode[] = []
  for (const loc of hint ?? []) {
    const n = cands.find((c) => c.srcLoc === loc)
    if (!n) continue
    if (hinted.some((o) => o.srcLoc === n.srcLoc)) continue
    // both ends on the same element, or on a box and its own child, says
    // nothing about a relationship — let the geometry answer instead
    if (hinted.some((o) => nests(o.rect, n.rect) || nests(n.rect, o.rect))) continue
    hinted.push(n)
  }

  // ── the line runs down (or along) the edges it is about ──
  const nearby = cands.filter((n) => segRectDist(line, n.rect) <= EDGE_NEAR)
  const edgeDist = (n: DomNode): number =>
    vertical
      ? Math.min(Math.abs(mx - n.rect.x), Math.abs(mx - (n.rect.x + n.rect.w)))
      : Math.min(Math.abs(my - n.rect.y), Math.abs(my - (n.rect.y + n.rect.h)))
  let picked = hinted.length >= 2 ? hinted.slice(0, 2) : pairBy(nearby, edgeDist, EDGE_NEAR)
  let drawnAcrossGap = false

  // ── or spans the gap between them, touching neither ──
  if (picked.length < 2) {
    // Anything holding BOTH ends of the line is the space the rule is drawn
    // IN, not a party to it: the page, the section, the grid. Without this
    // they win on distance every time — a line drawn between two cards is
    // zero pixels from the wrapper containing it, and 2px from the cards.
    const between = cands.filter((n) =>
      !(distToRect(line.x0, line.y0, n.rect) === 0 && distToRect(line.x1, line.y1, n.rect) === 0))
    const byEnds = pairBy(
      between,
      (n) => Math.min(
        distToRect(line.x0, line.y0, n.rect),
        distToRect(line.x1, line.y1, n.rect),
      ),
      ENDPOINT_NEAR,
    )
    if (byEnds.length === 2) {
      picked = byEnds
      drawnAcrossGap = true
    }
  }

  if (picked.length === 0) {
    return {
      proposals: [],
      error: 'that line isn’t near anything — draw it down the edges, or across the gap, the rule is about',
    }
  }

  // ── one element: the rules that are about a thing, not a relation ──
  if (picked.length === 1) {
    const only = picked[0]!
    const out: Proposal[] = [
      make('present', [only], undefined, [only]),
    ]
    const parent = snap.nodes.find((n) => n.id === only.parent && n.srcLoc)
    if (parent) out.push(make('inside', [only, parent], undefined, [only, parent]))
    return { proposals: out }
  }

  const [a, b] = picked as [DomNode, DomNode]
  // Which edge was drawn along: whichever the line sits nearer to across BOTH.
  const near = (pick: (r: Rect) => number) =>
    Math.abs((vertical ? mx : my) - pick(a.rect)) + Math.abs((vertical ? mx : my) - pick(b.rect))
  const align: ConstraintKind = vertical
    ? (near((r) => r.x) <= near((r) => r.x + r.w) ? 'aligned-left' : 'aligned-right')
    : (near((r) => r.y) <= near((r) => r.y + r.h) ? 'aligned-top' : 'aligned-bottom')
  const other: ConstraintKind = vertical
    ? (align === 'aligned-left' ? 'aligned-right' : 'aligned-left')
    : (align === 'aligned-top' ? 'aligned-bottom' : 'aligned-top')
  const sameSize: ConstraintKind = vertical ? 'same-width' : 'same-height'

  const gapNow = gapBetween(a.rect, b.rect)
  const gap = make('gap', [a, b], gapNow, [a, b])
  // A line drawn across the space between two things is a statement about
  // that space; a line drawn down their edges is a statement about the edges.
  const ranked: Proposal[] = drawnAcrossGap
    ? [gap, make(align, [a, b], undefined, [a, b]), make(sameSize, [a, b], undefined, [a, b])]
    : [
        make(align, [a, b], undefined, [a, b]),
        make(sameSize, [a, b], undefined, [a, b]),
        make(other, [a, b], undefined, [a, b]),
        ...(gapNow > 0 ? [gap] : []),
      ]
  ranked.push(make('order', [a, b], undefined, [a, b]))
  return { proposals: ranked }

  function make(
    kind: ConstraintKind,
    nodes: DomNode[],
    value: number | undefined,
    labelled: DomNode[],
  ): Proposal {
    const c: Constraint = {
      id: 'proposed',
      kind,
      subjects: nodes.map((n) => n.srcLoc!),
      value,
      tolerance: DEFAULT_TOL[kind] ?? DEFAULT_TOLERANCE,
      createdAt: 0,
    }
    const broken = evaluateConstraints([c], snap)[0]
    return {
      kind,
      subjects: c.subjects,
      value,
      tolerance: c.tolerance,
      desc: describeConstraint(c, labelled.map(nodeLabel)),
      // A rule whose reading is already a violation is the interesting case:
      // it means "make this true", and saying so up front is the difference
      // between a rule and a surprise on the next run.
      reading: broken ? `right now: ${broken.message}` : 'holds right now',
      labels: labelled.map(nodeLabel),
    }
  }
}

// ── what the overlay draws ──────────────────────────────────────────────────

export interface RuleView {
  id: string
  kind: ConstraintKind
  subjects: string[]
  note?: string
  value?: number
  tolerance: number
  /** In the elements' own words, so a badge reads like a sentence. */
  desc: string
  broken: boolean
  message?: string
  /** Live page rects of the subjects, so the marker can be drawn. */
  rects: (DomNode['rect'] | null)[]
}

/**
 * Every rule, evaluated against the page as it is right now.
 *
 * This is the same evaluator the verification round uses — deliberately, so a
 * badge on the page and a failure in a run can never disagree about whether a
 * rule holds.
 */
export function checkConstraints(root: string, snap: DomSnapshot): RuleView[] {
  const rules = loadConstraints(root)
  const violations = new Map(evaluateConstraints(rules, snap).map((v) => [v.id, v]))
  return rules.map((c) => {
    const nodes = c.subjects.map((s) => resolve(snap, s) ?? null)
    const v = violations.get(c.id)
    return {
      id: c.id,
      kind: c.kind,
      subjects: c.subjects,
      note: c.note,
      value: c.value,
      tolerance: c.tolerance,
      desc: describeConstraint(c, nodes.map((n) => (n ? nodeLabel(n) : 'something that’s gone'))),
      broken: v != null,
      message: v?.message,
      rects: nodes.map((n) => n?.rect ?? null),
    }
  })
}

/** Save a new rule. Ids are time-ordered so the list reads chronologically. */
export function addConstraint(
  root: string,
  c: Omit<Constraint, 'id' | 'createdAt'>,
): { ok: boolean; rule?: Constraint; error?: string } {
  if (c.subjects.length === 0) return { ok: false, error: 'a rule needs something to be about' }
  const rules = loadConstraints(root)
  const rule: Constraint = {
    ...c,
    tolerance: c.tolerance > 0 ? c.tolerance : DEFAULT_TOLERANCE,
    id: `r${String(Date.now().toString(36))}${String(rules.length)}`,
    createdAt: Date.now(),
  }
  // the same rule twice is not two rules — it would just complain twice
  const same = rules.find((r) =>
    r.kind === rule.kind && r.subjects.join('|') === rule.subjects.join('|'))
  if (same) return { ok: false, error: 'that rule is already being watched' }
  saveConstraints(root, [...rules, rule])
  return { ok: true, rule }
}

export function removeConstraint(root: string, id: string): { ok: boolean; removed: boolean } {
  const rules = loadConstraints(root)
  const next = rules.filter((r) => r.id !== id)
  if (next.length === rules.length) return { ok: true, removed: false }
  saveConstraints(root, next)
  return { ok: true, removed: true }
}

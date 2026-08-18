/**
 * Direct-manipulation synthesis: geometry delta → minimal idiomatic source
 * edit. Deterministic, zero model calls. Scope: gap handle + padding ring,
 * child reorder, free MOVE (sibling-slot reorder → margin nudge → translate
 * escape hatch) and handle RESIZE (w-/h- utilities) — all on Tailwind
 * string-literal classNames.
 *
 * The srcLoc arrives from the LIVE DOM at commit time (post-HMR stamps are
 * current), which sidesteps positional staleness entirely.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export type ManipulateProp =
  | 'gap' | 'p' | 'pt' | 'pr' | 'pb' | 'pl'
  | 'ml' | 'mr' | 'mt' | 'mb'
  | 'w' | 'h'
  | 'translate-x' | 'translate-y'

export interface ManipulateRequest {
  /** From the live element's data-s2c at commit time: "src/File.tsx:LINE:COL". */
  srcLoc: string
  prop: ManipulateProp | 'reorder' | 'move' | 'resize'
  /** Target value in CSS pixels (spacing ops). */
  px?: number
  /** Reorder: child indices in DOM order. */
  from?: number
  to?: number
  /** Free-move displacement in CSS pixels (prop: 'move'). */
  dx?: number
  dy?: number
  /** Whether the element sits in normal flow (client-computed at drag start). */
  inFlow?: boolean
  /** Target size in CSS pixels (prop: 'resize'); omit an axis to leave it. */
  w?: number
  h?: number
  /**
   * Resize anchoring: which edge must stay fixed. 'right'/'bottom' mean the
   * user pulled the LEFT/TOP edge, so the committed size change needs a
   * position compensation (ml-/mt- in flow, else translate) computed from
   * the drag-start size — otherwise in-flow elements grow away from the
   * dragged edge and "the right side moves".
   */
  anchorX?: 'left' | 'right'
  anchorY?: 'top' | 'bottom'
  /** Size at drag start (px) — needed to size the compensation. */
  startW?: number
  startH?: number
  /**
   * Magnetic-guide snap flags. An axis marked exact was aligned to a guide in
   * the preview, so the committed value must be pixel-exact — no token
   * rounding (which drifts up to 2px and breaks the alignment).
   */
  exactX?: boolean
  exactY?: boolean
  exactW?: boolean
  exactH?: boolean
  /**
   * Shared-template guard: how many DOM instances the client counted for this
   * srcLoc, which one was grabbed, and the user's chosen scope. When the
   * stamp renders more than once (a .map()), a class edit on the template
   * silently moves every instance — so without a choice we refuse with a
   * structured shared:true response instead of editing.
   */
  instanceIndex?: number
  instanceCount?: number
  choice?: 'all' | 'just-this-one'
}

export interface ManipulateResult {
  ok: boolean
  file?: string
  /** e.g. "gap-4 → gap-6" */
  change?: string
  className?: { before: string; after: string }
  error?: string
  /** 409-style: the target renders N times and no scope was chosen. */
  shared?: boolean
  instanceCount?: number
  options?: Array<'all' | 'just-this-one'>
}

/** Default Tailwind spacing scale (rem*4 = px units per step). */
const SPACING_STEPS = [
  0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32,
]

/**
 * px → Tailwind spacing utility suffix. Token when within 2px of a scale
 * step (§7.3 ladder rung 2), else a token-adjacent arbitrary value (rung 5).
 */
export function snapSpacing(px: number): { suffix: string; snappedPx: number; onToken: boolean } {
  const clamped = Math.max(0, px)
  let best = SPACING_STEPS[0]!
  for (const s of SPACING_STEPS) {
    if (Math.abs(s * 4 - clamped) < Math.abs(best * 4 - clamped)) best = s
  }
  if (Math.abs(best * 4 - clamped) <= 2) {
    const suffix = Number.isInteger(best) ? String(best) : String(best)
    return { suffix, snappedPx: best * 4, onToken: true }
  }
  return { suffix: `[${Math.round(clamped)}px]`, snappedPx: Math.round(clamped), onToken: false }
}

/**
 * px → suffix with NO tolerance: token only when the value sits exactly on
 * the scale, else an arbitrary value at the exact pixel. Used for guide-
 * snapped axes, where 2px of token rounding would visibly break alignment.
 */
export function snapSpacingExact(px: number): { suffix: string; snappedPx: number; onToken: boolean } {
  const r = Math.round(Math.max(0, px))
  const step = r / 4
  if (SPACING_STEPS.includes(step)) return { suffix: String(step), snappedPx: r, onToken: true }
  return { suffix: `[${r}px]`, snappedPx: r, onToken: false }
}

/** Per-prop matcher for the existing utility class to replace. */
const CLASS_PATTERNS: Record<ManipulateProp, RegExp> = {
  // gap-4, gap-[26px] — but not gap-x-*/gap-y-*
  gap: /^gap-(?!x-|y-)\S+$/,
  p: /^p-\S+$/,
  pt: /^pt-\S+$/,
  pr: /^pr-\S+$/,
  pb: /^pb-\S+$/,
  pl: /^pl-\S+$/,
  // margins may already be negative in source (-ml-2); we replace either sign
  ml: /^-?ml-\S+$/,
  mr: /^-?mr-\S+$/,
  mt: /^-?mt-\S+$/,
  mb: /^-?mb-\S+$/,
  // w-40, w-[300px] — min-w-*/max-w-* start differently and never match
  w: /^w-\S+$/,
  h: /^h-\S+$/,
  'translate-x': /^-?translate-x-\S+$/,
  'translate-y': /^-?translate-y-\S+$/,
}

/** Rewrite a space-separated class string, replacing or appending the utility. */
export function rewriteClassList(
  classList: string,
  prop: ManipulateProp,
  suffix: string,
  negative = false,
): { after: string; replaced: string | null } {
  const next = `${negative ? '-' : ''}${prop}-${suffix}`
  const parts = classList.split(/\s+/).filter(Boolean)
  const pattern = CLASS_PATTERNS[prop]
  let replaced: string | null = null
  const out = parts.map((c) => {
    if (pattern.test(c)) {
      replaced = c
      return next
    }
    return c
  })
  if (!replaced) out.push(next)
  // dedupe in case the same utility appeared twice
  const seen = new Set<string>()
  const deduped = out.filter((c) => (seen.has(c) ? false : (seen.add(c), true)))
  return { after: deduped.join(' '), replaced }
}

/** One planned utility-class write. */
export interface ClassEdit {
  prop: ManipulateProp
  suffix: string
  negative: boolean
  /**
   * Set for RELATIVE edits (anchor compensation): the signed px delta. When
   * the class list already carries this utility, the delta ACCUMULATES with
   * its value instead of replacing it — a replace would rewrite an absolute
   * position with a relative shift and move the supposedly-fixed edge.
   */
  relativePx?: number
}

/** Signed px value of an existing utility class (-ml-10 → -40, mt-[33px] → 33). */
export function classPx(cls: string): number | null {
  const m = /^(-?)[a-z-]+-(?:\[(\d+(?:\.\d+)?)px\]|(\d+(?:\.\d+)?))$/.exec(cls)
  if (!m) return null
  const px = m[2] != null ? parseFloat(m[2]) : parseFloat(m[3]!) * 4
  return m[1] === '-' ? -px : px
}

/**
 * Apply a list of planned edits to a class string. Absolute edits replace or
 * append via rewriteClassList; relative edits fold their delta into any
 * existing value (an exact-zero total removes the class entirely). Existing
 * classes we can't parse (ml-auto, translate-x-1/2) fall back to replacement.
 */
export function applyClassEdits(
  classList: string,
  edits: ClassEdit[],
): { after: string; descr: string[] } {
  let cur = classList
  const descr: string[] = []
  for (const ed of edits) {
    let eff: ClassEdit = ed
    if (ed.relativePx != null) {
      const parts = cur.split(/\s+/).filter(Boolean)
      const existing = parts.find((c) => CLASS_PATTERNS[ed.prop].test(c))
      const basePx = existing ? classPx(existing) : 0
      if (basePx != null) {
        const total = basePx + ed.relativePx
        if (Math.abs(total) < 1) {
          if (existing) {
            cur = parts.filter((c) => c !== existing).join(' ')
            descr.push(`− ${existing}`)
          }
          continue
        }
        eff = { prop: ed.prop, suffix: snapSpacingExact(Math.abs(total)).suffix, negative: total < 0 }
      }
    }
    const { after, replaced } = rewriteClassList(cur, eff.prop, eff.suffix, eff.negative)
    const cls = `${eff.negative ? '-' : ''}${eff.prop}-${eff.suffix}`
    descr.push(replaced ? (replaced === cls ? `${cls} (unchanged)` : `${replaced} → ${cls}`) : `+ ${cls}`)
    cur = after
  }
  return { after: cur, descr }
}

/** Displacement below this (px) on an axis counts as "didn't move". */
const MOVE_MIN = 3
/** Cross-axis wobble below this (px) still counts as axis-aligned. */
const MOVE_AXIS_EPS = 6
/** Beyond this (px) a flow nudge stops reading as a margin tweak. */
const MOVE_MARGIN_MAX = 64

/**
 * Move ladder, rungs (b) and (c) — rung (a), sibling-slot reorder, is decided
 * client-side where the DOM geometry lives and arrives as prop:'reorder'.
 *  (b) small, axis-aligned, in flow → one LEADING-edge margin utility
 *      (ml/mt, negative for leftward/upward). Only leading margins move the
 *      element itself in LTR flow — mr/mb would push its siblings instead,
 *      leaving the dragged element exactly where it was.
 *  (c) anything else → translate-x/-y — the escape hatch that always works,
 *      flagged "(cosmetic transform)" in the receipt.
 * Returns null when the displacement is too small to mean anything.
 */
export function synthesizeMove(
  dx: number,
  dy: number,
  inFlow: boolean,
  exact?: { x?: boolean; y?: boolean },
): { edits: ClassEdit[]; cosmetic: boolean } | null {
  const ax = Math.abs(Math.round(dx))
  const ay = Math.abs(Math.round(dy))
  const snapX = exact?.x ? snapSpacingExact : snapSpacing
  const snapY = exact?.y ? snapSpacingExact : snapSpacing
  if (ax < MOVE_MIN && ay < MOVE_MIN) return null
  const axisAligned = (ax >= MOVE_MIN && ay < MOVE_AXIS_EPS) || (ay >= MOVE_MIN && ax < MOVE_AXIS_EPS)
  if (inFlow && axisAligned && Math.max(ax, ay) <= MOVE_MARGIN_MAX) {
    if (ax >= ay) {
      return { edits: [{ prop: 'ml', suffix: snapX(ax).suffix, negative: dx < 0 }], cosmetic: false }
    }
    return { edits: [{ prop: 'mt', suffix: snapY(ay).suffix, negative: dy < 0 }], cosmetic: false }
  }
  const edits: ClassEdit[] = []
  if (ax >= MOVE_MIN) edits.push({ prop: 'translate-x', suffix: snapX(ax).suffix, negative: dx < 0 })
  if (ay >= MOVE_MIN) edits.push({ prop: 'translate-y', suffix: snapY(ay).suffix, negative: dy < 0 })
  return { edits, cosmetic: true }
}

/**
 * Anchor compensation for west/north-edge resizes: shift the element so the
 * opposite edge stays pixel-fixed. Sized against the SNAPPED committed
 * dimension (shift = start − snapped), and always pixel-exact — a tolerant
 * token here would visibly move the anchored edge.
 */
export function synthesizeAnchorShift(req: {
  w?: number; h?: number
  exactW?: boolean; exactH?: boolean
  anchorX?: 'left' | 'right'; anchorY?: 'top' | 'bottom'
  startW?: number; startH?: number
  inFlow?: boolean
}): ClassEdit[] {
  const edits: ClassEdit[] = []
  if (req.anchorX === 'right' && req.w != null && req.startW != null) {
    const snapped = (req.exactW ? snapSpacingExact : snapSpacing)(req.w).snappedPx
    const shift = req.startW - snapped // negative → element moves left
    if (Math.abs(shift) >= 1) {
      edits.push({
        prop: req.inFlow ? 'ml' : 'translate-x',
        suffix: snapSpacingExact(Math.abs(shift)).suffix,
        negative: shift < 0,
        relativePx: shift,
      })
    }
  }
  if (req.anchorY === 'bottom' && req.h != null && req.startH != null) {
    const snapped = (req.exactH ? snapSpacingExact : snapSpacing)(req.h).snappedPx
    const shift = req.startH - snapped // negative → element moves up
    if (Math.abs(shift) >= 1) {
      edits.push({
        prop: req.inFlow ? 'mt' : 'translate-y',
        suffix: snapSpacingExact(Math.abs(shift)).suffix,
        negative: shift < 0,
        relativePx: shift,
      })
    }
  }
  return edits
}

/** Resize ladder: width → w-*, height → h-*, snapped to the spacing scale. */
export function synthesizeResize(
  w?: number,
  h?: number,
  exact?: { w?: boolean; h?: boolean },
): ClassEdit[] {
  const edits: ClassEdit[] = []
  if (w != null) edits.push({ prop: 'w', suffix: (exact?.w ? snapSpacingExact : snapSpacing)(w).suffix, negative: false })
  if (h != null) edits.push({ prop: 'h', suffix: (exact?.h ? snapSpacingExact : snapSpacing)(h).suffix, negative: false })
  return edits
}

/**
 * Apply a manipulation to the source file. Finds the JSX opening element at
 * the stamped line:col, edits its string-literal className in place (exact
 * character range — no reformatting of anything else).
 */
export function applyManipulation(root: string, req: ManipulateRequest): ManipulateResult {
  const m = /^(.+):(\d+):(\d+)$/.exec(req.srcLoc)
  if (!m) return { ok: false, error: `bad srcLoc "${req.srcLoc}"` }
  const [, rel, lineS, colS] = m
  const line = Number(lineS)
  const col = Number(colS)
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) return { ok: false, error: 'srcLoc escapes root' }

  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    return { ok: false, error: `cannot read ${rel}` }
  }

  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true })
  } catch {
    return { ok: false, error: `cannot parse ${rel}` }
  }

  let found: NodePath<t.JSXOpeningElement> | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === line && loc.start.column + 1 === col) {
        found = path
      }
    },
  })
  if (!found) return { ok: false, error: `no JSX element at ${rel}:${line}:${col} (stale stamp?)` }
  const targetPath = found as NodePath<t.JSXOpeningElement>
  const target: t.JSXOpeningElement = targetPath.node
  const targetParent = targetPath.parent as t.JSXElement

  if (req.prop === 'reorder') {
    return applyReorder(code, file, rel!, targetPath, targetParent, req.from ?? 0, req.to ?? 0)
  }

  // plan the class writes: a single spacing utility, or a move/resize synthesis
  let edits: ClassEdit[]
  let cosmetic = false
  if (req.prop === 'move') {
    const plan = synthesizeMove(req.dx ?? 0, req.dy ?? 0, req.inFlow ?? false, { x: req.exactX, y: req.exactY })
    if (!plan) return { ok: true, file: rel, change: 'no change (displacement too small)' }
    edits = plan.edits
    cosmetic = plan.cosmetic
  } else if (req.prop === 'resize') {
    edits = [
      ...synthesizeResize(req.w, req.h, { w: req.exactW, h: req.exactH }),
      ...synthesizeAnchorShift(req),
    ]
    if (edits.length === 0) return { ok: true, file: rel, change: 'no change (no axis given)' }
  } else {
    edits = [{ prop: req.prop, suffix: snapSpacing(req.px ?? 0).suffix, negative: false }]
  }
  const cosmeticNote = cosmetic ? ' (cosmetic transform)' : ''
  const clsOf = (ed: ClassEdit) => `${ed.negative ? '-' : ''}${ed.prop}-${ed.suffix}`

  // shared-template guard: this stamp renders more than once, and the planned
  // edit is a class write on the shared template (move/resize gestures).
  if ((req.prop === 'move' || req.prop === 'resize') && (req.instanceCount ?? 1) > 1) {
    if (req.choice === 'just-this-one') {
      return applyPerInstance(
        code, file, rel!, targetPath, edits,
        req.instanceIndex ?? 0, req.instanceCount ?? 1, cosmeticNote,
      )
    }
    if (req.choice !== 'all') {
      return {
        ok: false,
        shared: true,
        instanceCount: req.instanceCount,
        options: ['all', 'just-this-one'],
        error: `this element renders ${req.instanceCount} times — editing the template moves them all; choose a scope`,
      }
    }
    // choice === 'all': deliberate — fall through to the shared-template edit
  }

  const attr = (target as t.JSXOpeningElement).attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
  )

  if (!attr) {
    // element has no className: insert one right after the tag name
    const name = (target as t.JSXOpeningElement).name
    if (name.type !== 'JSXIdentifier' || name.end == null) {
      return { ok: false, error: 'unsupported element name node' }
    }
    const classes = edits.map(clsOf).join(' ')
    const insertion = ` className="${classes}"`
    const next = code.slice(0, name.end) + insertion + code.slice(name.end)
    writeFileSync(file, next)
    return {
      ok: true, file: rel,
      change: `+ ${classes}${cosmeticNote}`,
      className: { before: '', after: classes },
    }
  }

  if (!attr.value || attr.value.type !== 'StringLiteral') {
    // one deliberate exception: OUR generated per-item hook template
    // (`...static ${item.className ?? ''}`) stays editable in 'all' scope by
    // rewriting its static part — otherwise 'just this one' would be a
    // one-way door out of template edits
    const hookQuasi = perItemHookQuasi(attr.value ?? null)
    if (hookQuasi && hookQuasi.start != null && hookQuasi.end != null) {
      const raw = hookQuasi.value.raw
      const trailing = /\s*$/.exec(raw)?.[0] ?? ''
      const staticBefore = raw.trim()
      const appliedQ = applyClassEdits(staticBefore, edits)
      const curStatic = appliedQ.after
      const parts = appliedQ.descr
      if (curStatic === staticBefore) {
        return { ok: true, file: rel, change: 'no change (already at value)', className: { before: staticBefore, after: curStatic } }
      }
      const next2 = code.slice(0, hookQuasi.start) + escTemplate(curStatic) + (trailing || ' ') + code.slice(hookQuasi.end)
      writeFileSync(file, next2)
      return {
        ok: true, file: rel,
        change: `${parts.join(' · ')}${cosmeticNote}`,
        className: { before: staticBefore, after: curStatic },
      }
    }
    // clsx()/template/dynamic className — out of deterministic scope, honestly
    return {
      ok: false,
      error: 'className is dynamic (clsx/template) — use the ink path for this element',
    }
  }

  const before = attr.value.value
  const applied = applyClassEdits(before, edits)
  const cur = applied.after
  const descr = applied.descr
  if (cur === before) {
    return { ok: true, file: rel, change: 'no change (already at value)', className: { before, after: cur } }
  }
  if (attr.value.start == null || attr.value.end == null) {
    return { ok: false, error: 'missing attribute location' }
  }
  const quote = code[attr.value.start] ?? '"'
  const next = code.slice(0, attr.value.start) + quote + cur + quote + code.slice(attr.value.end)
  writeFileSync(file, next)
  return {
    ok: true, file: rel,
    change: `${descr.join(' · ')}${cosmeticNote}`,
    className: { before, after: cur },
  }
}

export function manipulateRunDir(root: string): string {
  return join(root, '.sketch2code', 'manipulations.log')
}


/** Move a range-list element from→to, preserving the original separators. */
function reorderRanges(
  code: string,
  ranges: Array<{ start: number; end: number }>,
  from: number,
  to: number,
): string {
  const seps: string[] = []
  for (let i = 0; i < ranges.length - 1; i++) seps.push(code.slice(ranges[i]!.end, ranges[i + 1]!.start))
  const parts = ranges.map((r) => code.slice(r.start, r.end))
  const moved = parts.splice(from, 1)[0]!
  parts.splice(to, 0, moved)
  let out = ''
  for (let i = 0; i < parts.length; i++) out += parts[i]! + (i < seps.length ? seps[i]! : '')
  return code.slice(0, ranges[0]!.start) + out + code.slice(ranges[ranges.length - 1]!.end)
}

/**
 * Reorder a container's children — the structural edit a drag detents into.
 * Two honest cases:
 *  (a) static JSX children → reorder the JSX nodes
 *  (b) a single {ARRAY.map(...)} child with a same-file array literal →
 *      reorder the DATA (DOM index maps 1:1 to array index)
 * Anything else is refused with a pointer to the ink path.
 */
function applyReorder(
  code: string,
  file: string,
  rel: string,
  targetPath: NodePath<t.JSXOpeningElement>,
  parent: t.JSXElement | null,
  from: number,
  to: number,
): ManipulateResult {
  if (!parent || parent.type !== 'JSXElement') return { ok: false, error: 'container has no JSX body' }
  if (from === to) return { ok: true, file: rel, change: 'no change' }

  const jsxKids = parent.children.filter(
    (c): c is t.JSXElement => c.type === 'JSXElement',
  )
  if (jsxKids.length > Math.max(from, to)) {
    const ranges = jsxKids.map((k) => ({ start: k.start!, end: k.end! }))
    writeFileSync(file, reorderRanges(code, ranges, from, to))
    return { ok: true, file: rel, change: `moved child ${from + 1} → position ${to + 1}` }
  }

  // .map() case: find {X.map(...)} and reorder X's array literal
  const exprKids = parent.children.filter((c) => c.type === 'JSXExpressionContainer')
  for (const ek of exprKids) {
    const expr = (ek as t.JSXExpressionContainer).expression
    if (
      expr.type === 'CallExpression' &&
      expr.callee.type === 'MemberExpression' &&
      expr.callee.property.type === 'Identifier' &&
      expr.callee.property.name === 'map' &&
      expr.callee.object.type === 'Identifier'
    ) {
      const arrName = expr.callee.object.name
      const arr = resolveArrayLiteral(targetPath, arrName)
      if (!arr) return { ok: false, error: `'${arrName}' is not a same-file array literal — use the ink path` }
      const els = arr.elements.filter((e): e is t.Expression => e !== null)
      if (els.length <= Math.max(from, to)) return { ok: false, error: 'index out of range for data array' }
      const ranges = els.map((e) => ({ start: e.start!, end: e.end! }))
      writeFileSync(file, reorderRanges(code, ranges, from, to))
      return {
        ok: true, file: rel,
        change: `moved '${arrName}' entry ${from + 1} → position ${to + 1} (renders in that order)`,
      }
    }
  }
  return { ok: false, error: 'children are dynamic — use the ink path for this reorder' }
}

/**
 * Resolve NAME through babel's scope chain at `at` and return its array
 * literal initializer, or null. Scope-aware on purpose: a whole-file name
 * walk would happily return a DIFFERENT component's identically-named array
 * and corrupt unrelated data.
 */
function resolveArrayLiteral(at: NodePath, name: string): t.ArrayExpression | null {
  const binding = at.scope.getBinding(name)
  const node = binding?.path.node as t.Node | undefined
  if (node?.type !== 'VariableDeclarator') return null
  const decl = node as t.VariableDeclarator
  if (decl.init?.type !== 'ArrayExpression') return null
  return decl.init
}

/** Does `obj.prop` appear anywhere inside this expression tree? */
function hasMemberExpr(node: unknown, obj: string, prop: string): boolean {
  if (!node || typeof node !== 'object') return false
  const n = node as { type?: string } & Record<string, unknown>
  if (
    n.type === 'MemberExpression' &&
    (n.object as t.Node | undefined)?.type === 'Identifier' &&
    (n.object as t.Identifier).name === obj &&
    !(n as unknown as t.MemberExpression).computed &&
    (n.property as t.Node | undefined)?.type === 'Identifier' &&
    (n.property as t.Identifier).name === prop
  ) return true
  for (const k of Object.keys(n)) {
    const v = n[k]
    if (Array.isArray(v)) {
      if (v.some((c) => hasMemberExpr(c, obj, prop))) return true
    } else if (v && typeof v === 'object' && (v as { type?: string }).type) {
      if (hasMemberExpr(v, obj, prop)) return true
    }
  }
  return false
}

/**
 * Recognize the per-item hook template this module generates:
 * {`STATIC ${item.className ?? ''}`} — one expression, member `.className`
 * (optionally behind ??). Returns the static quasi so it can be edited.
 */
function perItemHookQuasi(v: t.JSXAttribute['value'] | null): t.TemplateElement | null {
  if (!v || v.type !== 'JSXExpressionContainer') return null
  const ex = v.expression
  if (ex.type !== 'TemplateLiteral' || ex.expressions.length !== 1 || ex.quasis.length !== 2) return null
  const isHook = (n: t.Node): boolean =>
    (n.type === 'MemberExpression' && !n.computed &&
      n.object.type === 'Identifier' &&
      n.property.type === 'Identifier' && n.property.name === 'className') ||
    (n.type === 'LogicalExpression' && n.operator === '??' && isHook(n.left))
  return isHook(ex.expressions[0] as t.Node) ? ex.quasis[0]! : null
}

const escTemplate = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
const escSingle = (s: string): string => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/**
 * Per-instance class edit for a shared .map() template ('just this one').
 * Works only when the target is rendered from `NAME.map((item) => ...)` over
 * a same-file array literal whose items are object literals:
 *   - the chosen item gains/extends a `className` string field
 *   - the template's className grows a `${item.className ?? ''}` spread
 *     (a string literal deliberately becomes a template literal here —
 *     the one sanctioned crossing of the dynamic-className line)
 * Other instances read `undefined ?? ''` and are pixel-for-pixel unchanged.
 * Anything else refuses honestly.
 */
function applyPerInstance(
  code: string,
  file: string,
  rel: string,
  targetPath: NodePath<t.JSXOpeningElement>,
  edits: ClassEdit[],
  instanceIndex: number,
  instanceCount: number,
  cosmeticNote: string,
): ManipulateResult {
  // the enclosing NAME.map(...) call, if any
  const mapPath = targetPath.findParent((p) => {
    const n = p.node as t.Node
    return (
      n.type === 'CallExpression' &&
      n.callee.type === 'MemberExpression' &&
      !n.callee.computed &&
      n.callee.property.type === 'Identifier' &&
      n.callee.property.name === 'map' &&
      n.callee.object.type === 'Identifier'
    )
  })
  if (!mapPath) {
    return {
      ok: false,
      error: "can't isolate this instance — it isn't rendered from a same-file .map(); apply to all or use the ink path",
    }
  }
  const call = mapPath.node as t.CallExpression
  const arrName = ((call.callee as t.MemberExpression).object as t.Identifier).name
  const cb = call.arguments[0]
  if (
    !cb ||
    (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression') ||
    cb.params[0]?.type !== 'Identifier'
  ) {
    return {
      ok: false,
      error: `'${arrName}.map' callback has no simple item parameter — can't add a per-item hook`,
    }
  }
  const param = cb.params[0].name

  const arr = resolveArrayLiteral(mapPath, arrName)
  if (!arr) {
    return { ok: false, error: `'${arrName}' is not a same-file array literal — can't edit one item; apply to all or use the ink path` }
  }
  const els = arr.elements
  if (els.length !== instanceCount) {
    return {
      ok: false,
      error: `DOM shows ${instanceCount} instances but '${arrName}' has ${els.length} items — refusing a per-item edit`,
    }
  }
  const item = els[instanceIndex]
  if (!item || item.type !== 'ObjectExpression') {
    return { ok: false, error: `'${arrName}' item ${instanceIndex + 1} is not an object literal — can't add a className field` }
  }

  // merge the planned utilities into the item's existing className (if any)
  const clsProp = item.properties.find(
    (p): p is t.ObjectProperty =>
      p.type === 'ObjectProperty' &&
      !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === 'className') ||
        (p.key.type === 'StringLiteral' && p.key.value === 'className')),
  )
  if (clsProp && clsProp.value.type !== 'StringLiteral') {
    return { ok: false, error: `'${arrName}' item ${instanceIndex + 1} has a non-string className — can't merge` }
  }
  const before = clsProp ? (clsProp.value as t.StringLiteral).value : ''
  const appliedI = applyClassEdits(before, edits)
  const cur = appliedI.after
  const descr = appliedI.descr
  if (cur === before) {
    return { ok: true, file: rel, change: 'no change (already at value)', className: { before, after: cur } }
  }

  const attr = targetPath.node.attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
  )
  // refuse when the template itself already pins one of these utilities on
  // every instance: Tailwind resolves conflicting utilities by stylesheet
  // order, not class order, so a per-item override could silently lose
  const templateStatic =
    attr?.value?.type === 'StringLiteral'
      ? attr.value.value
      : attr?.value?.type === 'JSXExpressionContainer' && attr.value.expression.type === 'TemplateLiteral'
        ? attr.value.expression.quasis.map((q) => q.value.raw).join(' ')
        : ''
  const conflict = templateStatic.split(/\s+/).filter(Boolean)
    .find((c) => edits.some((ed) => CLASS_PATTERNS[ed.prop].test(c)))
  if (conflict) {
    return {
      ok: false,
      error: `the template already sets '${conflict}' on every instance — a per-item override would clash; apply to all instead`,
    }
  }

  const textEdits: Array<{ start: number; end: number; text: string }> = []

  // 1) template hook: className must end up reading `${param}.className`
  let hookNote = ''
  if (!attr) {
    const name = targetPath.node.name
    if (name.type !== 'JSXIdentifier' || name.end == null) {
      return { ok: false, error: 'unsupported element name node' }
    }
    textEdits.push({ start: name.end, end: name.end, text: ` className={${param}.className}` })
    hookNote = ' (added per-item className hook)'
  } else if (attr.value?.type === 'StringLiteral') {
    if (attr.value.start == null || attr.value.end == null) {
      return { ok: false, error: 'missing attribute location' }
    }
    textEdits.push({
      start: attr.value.start,
      end: attr.value.end,
      text: `{\`${escTemplate(attr.value.value)} \${${param}.className ?? ''}\`}`,
    })
    hookNote = ' (added per-item className hook)'
  } else if (attr.value?.type === 'JSXExpressionContainer' && hasMemberExpr(attr.value.expression, param, 'className')) {
    // hook already present (a previous 'just this one' edit) — data-only edit
  } else {
    return {
      ok: false,
      error: "className is dynamic and has no per-item hook — apply to all or use the ink path",
    }
  }

  // 2) data edit: set/extend the item's className field
  if (clsProp) {
    const v = clsProp.value as t.StringLiteral
    if (v.start == null || v.end == null) return { ok: false, error: 'missing item location' }
    const quote = code[v.start] ?? "'"
    const escaped = quote === '"' ? cur.replace(/\\/g, '\\\\').replace(/"/g, '\\"') : escSingle(cur)
    textEdits.push({ start: v.start, end: v.end, text: `${quote}${escaped}${quote}` })
  } else if (item.properties.length > 0) {
    const last = item.properties[item.properties.length - 1]!
    if (last.end == null) return { ok: false, error: 'missing item location' }
    textEdits.push({ start: last.end, end: last.end, text: `, className: '${escSingle(cur)}'` })
  } else {
    if (item.start == null) return { ok: false, error: 'missing item location' }
    textEdits.push({ start: item.start + 1, end: item.start + 1, text: ` className: '${escSingle(cur)}' ` })
  }

  textEdits.sort((a, b) => b.start - a.start)
  let next = code
  for (const te of textEdits) next = next.slice(0, te.start) + te.text + next.slice(te.end)
  writeFileSync(file, next)
  return {
    ok: true,
    file: rel,
    change: `just this one — '${arrName}' item ${instanceIndex + 1} of ${instanceCount}: ${descr.join(' · ')}${cosmeticNote}${hookNote}`,
    className: { before, after: cur },
  }
}

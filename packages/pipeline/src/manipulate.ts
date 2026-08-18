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
}

export interface ManipulateResult {
  ok: boolean
  file?: string
  /** e.g. "gap-4 → gap-6" */
  change?: string
  className?: { before: string; after: string }
  error?: string
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
 *  (b) small, axis-aligned, in flow → one margin utility (ml/mr/mt/mb)
 *  (c) anything else → translate-x/-y — the escape hatch that always works,
 *      flagged "(cosmetic transform)" in the receipt.
 * Returns null when the displacement is too small to mean anything.
 */
export function synthesizeMove(
  dx: number,
  dy: number,
  inFlow: boolean,
): { edits: ClassEdit[]; cosmetic: boolean } | null {
  const ax = Math.abs(Math.round(dx))
  const ay = Math.abs(Math.round(dy))
  if (ax < MOVE_MIN && ay < MOVE_MIN) return null
  const axisAligned = (ax >= MOVE_MIN && ay < MOVE_AXIS_EPS) || (ay >= MOVE_MIN && ax < MOVE_AXIS_EPS)
  if (inFlow && axisAligned && Math.max(ax, ay) <= MOVE_MARGIN_MAX) {
    if (ax >= ay) {
      return { edits: [{ prop: dx > 0 ? 'ml' : 'mr', suffix: snapSpacing(ax).suffix, negative: false }], cosmetic: false }
    }
    return { edits: [{ prop: dy > 0 ? 'mt' : 'mb', suffix: snapSpacing(ay).suffix, negative: false }], cosmetic: false }
  }
  const edits: ClassEdit[] = []
  if (ax >= MOVE_MIN) edits.push({ prop: 'translate-x', suffix: snapSpacing(ax).suffix, negative: dx < 0 })
  if (ay >= MOVE_MIN) edits.push({ prop: 'translate-y', suffix: snapSpacing(ay).suffix, negative: dy < 0 })
  return { edits, cosmetic: true }
}

/** Resize ladder: width → w-*, height → h-*, snapped to the spacing scale. */
export function synthesizeResize(w?: number, h?: number): ClassEdit[] {
  const edits: ClassEdit[] = []
  if (w != null) edits.push({ prop: 'w', suffix: snapSpacing(w).suffix, negative: false })
  if (h != null) edits.push({ prop: 'h', suffix: snapSpacing(h).suffix, negative: false })
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

  let target: t.JSXOpeningElement | null = null
  let targetParent: t.JSXElement | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === line && loc.start.column + 1 === col) {
        target = path.node
        targetParent = path.parent as t.JSXElement
      }
    },
  })
  if (!target) return { ok: false, error: `no JSX element at ${rel}:${line}:${col} (stale stamp?)` }

  if (req.prop === 'reorder') {
    return applyReorder(code, file, rel!, targetParent, req.from ?? 0, req.to ?? 0)
  }

  // plan the class writes: a single spacing utility, or a move/resize synthesis
  let edits: ClassEdit[]
  let cosmetic = false
  if (req.prop === 'move') {
    const plan = synthesizeMove(req.dx ?? 0, req.dy ?? 0, req.inFlow ?? false)
    if (!plan) return { ok: true, file: rel, change: 'no change (displacement too small)' }
    edits = plan.edits
    cosmetic = plan.cosmetic
  } else if (req.prop === 'resize') {
    edits = synthesizeResize(req.w, req.h)
    if (edits.length === 0) return { ok: true, file: rel, change: 'no change (no axis given)' }
  } else {
    edits = [{ prop: req.prop, suffix: snapSpacing(req.px ?? 0).suffix, negative: false }]
  }
  const cosmeticNote = cosmetic ? ' (cosmetic transform)' : ''
  const clsOf = (ed: ClassEdit) => `${ed.negative ? '-' : ''}${ed.prop}-${ed.suffix}`

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
    // clsx()/template/dynamic className — out of deterministic scope, honestly
    return {
      ok: false,
      error: 'className is dynamic (clsx/template) — use the ink path for this element',
    }
  }

  const before = attr.value.value
  let cur = before
  const descr: string[] = []
  for (const ed of edits) {
    const { after, replaced } = rewriteClassList(cur, ed.prop, ed.suffix, ed.negative)
    const cls = clsOf(ed)
    descr.push(replaced ? (replaced === cls ? `${cls} (unchanged)` : `${replaced} → ${cls}`) : `+ ${cls}`)
    cur = after
  }
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
      // find `const arrName = [ ... ]` at top level of the same file
      const re = new RegExp(`(?:const|let|var)\\s+${arrName}\\s*(?::[^=]+)?=`, 'g')
      const m2 = re.exec(code)
      if (!m2) return { ok: false, error: `'${arrName}' is not a same-file array — use the ink path` }
      // parse again to find the ArrayExpression precisely
      const ast2 = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true })
      let arr: t.ArrayExpression | null = null
      const walk = (node: unknown): void => {
        if (!node || typeof node !== 'object') return
        const n = node as { type?: string; id?: t.Node; init?: t.Node } & Record<string, unknown>
        if (
          n.type === 'VariableDeclarator' &&
          (n.id as t.Identifier | undefined)?.type === 'Identifier' &&
          (n.id as t.Identifier).name === arrName &&
          (n.init as t.Node | undefined)?.type === 'ArrayExpression'
        ) {
          arr = n.init as t.ArrayExpression
          return
        }
        for (const k of Object.keys(n)) {
          const v = n[k]
          if (Array.isArray(v)) v.forEach(walk)
          else if (v && typeof v === 'object' && (v as { type?: string }).type) walk(v)
        }
      }
      walk((ast2 as unknown as { program: t.Node }).program)
      if (!arr) return { ok: false, error: `'${arrName}' array literal not found — use the ink path` }
      const els = (arr as t.ArrayExpression).elements.filter((e): e is t.Expression => e !== null)
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

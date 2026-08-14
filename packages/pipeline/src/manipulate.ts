/**
 * Direct-manipulation synthesis: geometry delta → minimal idiomatic source
 * edit. Deterministic, zero model calls. Phase 1 scope: the two affordances
 * that produce single-declaration diffs by construction — the GAP handle and
 * the PADDING ring — on Tailwind string-literal classNames.
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

export type ManipulateProp = 'gap' | 'p' | 'pt' | 'pr' | 'pb' | 'pl'

export interface ManipulateRequest {
  /** From the live element's data-s2c at commit time: "src/File.tsx:LINE:COL". */
  srcLoc: string
  prop: ManipulateProp
  /** Target value in CSS pixels (already what the user saw in preview). */
  px: number
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
}

/** Rewrite a space-separated class string, replacing or appending the utility. */
export function rewriteClassList(
  classList: string,
  prop: ManipulateProp,
  suffix: string,
): { after: string; replaced: string | null } {
  const next = `${prop}-${suffix}`
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
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === line && loc.start.column + 1 === col) {
        target = path.node
      }
    },
  })
  if (!target) return { ok: false, error: `no JSX element at ${rel}:${line}:${col} (stale stamp?)` }

  const attr = (target as t.JSXOpeningElement).attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
  )
  const { suffix } = snapSpacing(req.px)

  if (!attr) {
    // element has no className: insert one right after the tag name
    const name = (target as t.JSXOpeningElement).name
    if (name.type !== 'JSXIdentifier' || name.end == null) {
      return { ok: false, error: 'unsupported element name node' }
    }
    const insertion = ` className="${req.prop}-${suffix}"`
    const next = code.slice(0, name.end) + insertion + code.slice(name.end)
    writeFileSync(file, next)
    return {
      ok: true, file: rel,
      change: `+ ${req.prop}-${suffix}`,
      className: { before: '', after: `${req.prop}-${suffix}` },
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
  const { after, replaced } = rewriteClassList(before, req.prop, suffix)
  if (after === before) {
    return { ok: true, file: rel, change: 'no change (already at value)', className: { before, after } }
  }
  if (attr.value.start == null || attr.value.end == null) {
    return { ok: false, error: 'missing attribute location' }
  }
  const quote = code[attr.value.start] ?? '"'
  const next = code.slice(0, attr.value.start) + quote + after + quote + code.slice(attr.value.end)
  writeFileSync(file, next)
  return {
    ok: true, file: rel,
    change: replaced ? `${replaced} → ${req.prop}-${suffix}` : `+ ${req.prop}-${suffix}`,
    className: { before, after },
  }
}

export function manipulateRunDir(root: string): string {
  return join(root, '.sketch2code', 'manipulations.log')
}

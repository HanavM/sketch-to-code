/**
 * Responsive by demonstration.
 *
 * Breakpoints are the one part of layout nobody can see while they work. You
 * type `md:flex-col`, guess, reload at a different window size, guess again.
 * But the gesture people actually want is the obvious one: drag the window to
 * the width you care about, rearrange the thing with the manipulation you
 * already have, and have the edit mean "like this, at this width".
 *
 * The reason that needs a real engine rather than a string prefix is that
 * Tailwind is mobile-first. An unprefixed utility applies at EVERY width;
 * `md:flex-col` applies from 768px up. So a demonstration at a WIDE width is
 * easy — prefix it and stop — while a demonstration at a NARROW width is the
 * exact opposite shape: the new value has to become the unprefixed base, and
 * whatever was unprefixed before has to be pushed UP into the next band so
 * that wide screens keep the layout they already had. Writing `sm:flex-col`
 * because the user was on a phone is the failure mode this file exists to
 * prevent: it silently changes every breakpoint and looks plausible in the
 * diff.
 *
 * Two consequences worth stating, because they shape every refusal below:
 *
 *  1. To move an unprefixed value out of the way we must know what wide
 *     screens should keep. Usually that is the class that was already there.
 *     When no class pinned the value, we can only fall back to the family's
 *     CSS default IF that default is expressible as a utility (`flex-row`,
 *     `w-auto`, `gap-0`). For inherited properties — text size, colour,
 *     alignment — it is not, so a narrow demonstration is REFUSED rather than
 *     quietly allowed to leak upward.
 *
 *  2. Re-prefixing the wrong class is worse than doing nothing, so the
 *     utility → family classification is an explicit table plus a narrow,
 *     shape-based fallback that reports its own uncertainty. Anything it
 *     cannot place is a refusal, never a guess.
 *
 * The plan is a pure function over a className string (`planResponsive`) so
 * the overlay can preview it, and `applyResponsive` is the thin AST wrapper
 * that resolves a data-s2c stamp and writes the file.
 *
 * Deliberately out of scope: the shared-template (.map) instance gate. A
 * responsive edit is an ordinary className rewrite, so whichever gesture
 * produced the utility owns that question — duplicating the choice here would
 * mean asking the user twice.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

// ── breakpoints ─────────────────────────────────────────────────────────────

/** Tailwind's own screens, which is what a project without a theme gets. */
const DEFAULT_SCREENS: Record<string, number> = {
  sm: 640, md: 768, lg: 1024, xl: 1280, '2xl': 1536,
}

export interface Screens {
  /** name → min-width in CSS pixels. Read smallest-first via `bandOrder`. */
  screens: Record<string, number>
  /**
   * Where these came from, in words, because the overlay shows it. A user who
   * is told "md" must never be wrong about which pixel width that is.
   */
  source: string
}

const CONFIG_NAMES = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.cjs', 'tailwind.config.mjs']

/** '640px' | '40rem' | '640' → 640. Anything else is not statically readable. */
function lengthPx(raw: string): number | null {
  const m = /^(-?\d+(?:\.\d+)?)(px|rem|em)?$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n) || n < 0) return null
  return m[2] === 'rem' || m[2] === 'em' ? n * 16 : n
}

/** Smallest-first band names, with the unprefixed band at the front. */
export function bandOrder(screens: Record<string, number>): string[] {
  return ['base', ...Object.keys(screens).sort((a, b) => screens[a]! - screens[b]!)]
}

/**
 * The band a demonstrated viewport width falls in: the largest screen whose
 * min-width it has reached, else the unprefixed band.
 */
export function bandFor(width: number, screens: Record<string, number>): string {
  if (!Number.isFinite(width)) return 'base'
  let band = 'base'
  let best = -1
  for (const [name, min] of Object.entries(screens)) {
    if (width >= min && min > best) {
      band = name
      best = min
    }
  }
  return band
}

/** Property of an ObjectExpression by name, or undefined. */
function prop(obj: t.ObjectExpression, name: string): t.Node | undefined {
  for (const p of obj.properties) {
    if (p.type !== 'ObjectProperty' || p.computed) continue
    const k = p.key
    const key = k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : null
    if (key === name) return p.value
  }
  return undefined
}

/** Peel `satisfies Config` / `as const` / `defineConfig(...)` off a value. */
function unwrap(node: t.Node | undefined): t.Node | undefined {
  let cur = node
  for (let i = 0; cur && i < 6; i++) {
    if (cur.type === 'TSAsExpression' || cur.type === 'TSSatisfiesExpression') { cur = cur.expression; continue }
    if (cur.type === 'CallExpression' && cur.arguments[0]?.type === 'ObjectExpression') { cur = cur.arguments[0]; continue }
    break
  }
  return cur
}

/** The config object a tailwind config file exports, however it exports it. */
function exportedObject(ast: t.File): t.ObjectExpression | null {
  const body = ast.program.body
  const named = new Map<string, t.Node>()
  for (const stmt of body) {
    if (stmt.type !== 'VariableDeclaration') continue
    for (const d of stmt.declarations) {
      if (d.id.type === 'Identifier' && d.init) named.set(d.id.name, d.init)
    }
  }
  const asObject = (n: t.Node | undefined): t.ObjectExpression | null => {
    let v = unwrap(n)
    if (v?.type === 'Identifier') v = unwrap(named.get(v.name))
    return v?.type === 'ObjectExpression' ? v : null
  }
  for (const stmt of body) {
    if (stmt.type === 'ExportDefaultDeclaration') {
      const o = asObject(stmt.declaration as t.Node)
      if (o) return o
    }
    if (
      stmt.type === 'ExpressionStatement' &&
      stmt.expression.type === 'AssignmentExpression' &&
      stmt.expression.left.type === 'MemberExpression'
    ) {
      // module.exports = { … } / exports.default = { … }
      const o = asObject(stmt.expression.right)
      if (o) return o
    }
  }
  return null
}

/**
 * Read a `screens` object literal. Returns null the moment anything is not a
 * plain static min-width — a spread, a require(), a `{ max: … }` band, a raw
 * media query. Half-reading a theme would be worse than not reading it: the
 * user would be told a number the browser disagrees with.
 */
function readScreens(node: t.Node | undefined): Record<string, number> | null {
  if (!node || node.type !== 'ObjectExpression') return null
  const out: Record<string, number> = {}
  for (const p of node.properties) {
    if (p.type !== 'ObjectProperty' || p.computed) return null
    const k = p.key
    const name = k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : null
    if (!name) return null
    const v = p.value
    if (v.type === 'StringLiteral') {
      const px = lengthPx(v.value)
      if (px == null) return null
      out[name] = px
      continue
    }
    if (v.type === 'NumericLiteral') {
      out[name] = v.value
      continue
    }
    // { min: '640px' } is readable; { max: … } / { raw: … } is not a min-width
    if (v.type === 'ObjectExpression') {
      const keys = v.properties.map((q) =>
        q.type === 'ObjectProperty' && q.key.type === 'Identifier' ? q.key.name : '?')
      const min = prop(v, 'min')
      if (keys.length === 1 && min?.type === 'StringLiteral') {
        const px = lengthPx(min.value)
        if (px == null) return null
        out[name] = px
        continue
      }
    }
    return null
  }
  return out
}

/** Files worth looking in for a v4 `@theme` block. */
function appCssFiles(root: string): string[] {
  const skip = new Set(['node_modules', 'dist', 'build', '.git', '.next', '.sketch2code', 'coverage'])
  const out: string[] = []
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || out.length > 200) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (skip.has(name) || name.startsWith('.')) continue
      const abs = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(abs).isDirectory()
      } catch {
        continue
      }
      if (isDir) walk(abs, depth + 1)
      else if (name.endsWith('.css')) out.push(abs)
    }
  }
  walk(root, 0)
  return out
}

const BREAKPOINT_DECL = /--breakpoint-([A-Za-z0-9_][\w.-]*)\s*:\s*([^;}]+)/g

/**
 * Breakpoints for a project, smallest first, and an honest account of where
 * they came from. Order of authority: a v3-style tailwind.config, then a v4
 * `@theme` block in the app's own CSS, then Tailwind's defaults.
 */
export function screensFor(root: string): Screens {
  const abs = resolve(root)

  // ── tailwind.config.* ──
  for (const name of CONFIG_NAMES) {
    const file = join(abs, name)
    let code: string
    try {
      code = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    let ast: t.File
    try {
      ast = parse(code, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'], errorRecovery: true })
    } catch {
      return { screens: { ...DEFAULT_SCREENS }, source: `Tailwind defaults — ${name} could not be parsed` }
    }
    const cfg = exportedObject(ast)
    const theme = cfg ? unwrap(prop(cfg, 'theme')) : undefined
    if (!theme || theme.type !== 'ObjectExpression') {
      if (!cfg) {
        return { screens: { ...DEFAULT_SCREENS }, source: `Tailwind defaults — ${name} does not export a plain config object` }
      }
      return { screens: { ...DEFAULT_SCREENS }, source: `Tailwind defaults (${name} declares no theme.screens)` }
    }
    const own = prop(theme, 'screens')
    if (own) {
      const read = readScreens(unwrap(own))
      if (!read) {
        return {
          screens: { ...DEFAULT_SCREENS },
          source: `Tailwind defaults — ${name} declares theme.screens, but not as plain min-widths this can read`,
        }
      }
      if (Object.keys(read).length === 0) {
        return { screens: {}, source: `${name} (theme.screens is empty — this project has no breakpoints)` }
      }
      return { screens: read, source: `${name} (theme.screens — replaces Tailwind's defaults)` }
    }
    const ext = unwrap(prop(theme, 'extend'))
    const extScreens = ext?.type === 'ObjectExpression' ? prop(ext, 'screens') : undefined
    if (extScreens) {
      const read = readScreens(unwrap(extScreens))
      if (!read) {
        return {
          screens: { ...DEFAULT_SCREENS },
          source: `Tailwind defaults — ${name} extends theme.screens, but not with plain min-widths this can read`,
        }
      }
      return { screens: { ...DEFAULT_SCREENS, ...read }, source: `${name} (theme.extend.screens, merged with Tailwind's defaults)` }
    }
    return { screens: { ...DEFAULT_SCREENS }, source: `Tailwind defaults (${name} declares no theme.screens)` }
  }

  // ── Tailwind v4: @theme { --breakpoint-md: 900px } ──
  const css = appCssFiles(abs)
  const declaring: string[] = []
  const imports: string[] = []
  let cleared = false
  let unreadable: { file: string; decl: string } | null = null
  const fromCss: Record<string, number> = {}
  for (const file of css) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    if (/@import\s+["']tailwindcss|@tailwind\s+utilities/.test(text)) imports.push(relative(abs, file))
    if (!text.includes('@theme')) continue
    if (/--breakpoint-\*\s*:\s*initial/.test(text)) cleared = true
    let hit = false
    for (const m of text.matchAll(BREAKPOINT_DECL)) {
      const name = m[1]!
      if (name === '*') continue
      const px = lengthPx(m[2]!)
      if (px == null) {
        unreadable ??= { file: relative(abs, file), decl: `--breakpoint-${name}: ${m[2]!.trim()}` }
        continue
      }
      fromCss[name] = px
      hit = true
    }
    if (hit || cleared) declaring.push(relative(abs, file))
  }
  if (unreadable) {
    return {
      screens: { ...DEFAULT_SCREENS },
      source: `Tailwind defaults — ${unreadable.file} sets "${unreadable.decl}", which is not a width this can read statically`,
    }
  }
  if (Object.keys(fromCss).length > 0 || cleared) {
    const merged = cleared ? { ...fromCss } : { ...DEFAULT_SCREENS, ...fromCss }
    const where = declaring.join(', ')
    return {
      screens: merged,
      source: cleared
        ? `${where} (@theme --breakpoint-*, which replaces Tailwind's defaults)`
        : `${where} (@theme --breakpoint-*, merged with Tailwind's defaults)`,
    }
  }
  if (imports.length > 0) {
    return {
      screens: { ...DEFAULT_SCREENS },
      source: `Tailwind defaults — ${imports[0]!} imports Tailwind and declares no @theme breakpoints`,
    }
  }
  return { screens: { ...DEFAULT_SCREENS }, source: 'Tailwind defaults — no tailwind.config and no @theme breakpoints found' }
}

// ── which family is this utility in? ────────────────────────────────────────
//
// This is the load-bearing table. A demonstrated change has to find the class
// it conflicts with and re-prefix THAT one; pointing at an unrelated class
// would silently restyle something nobody touched. So: exact answers for the
// families this repo actually writes (manipulate.ts's spacing/size/translate
// props, plus the layout utilities the demo app uses), then a narrow
// shape-based fallback that marks itself uncertain, then null.

/** Whole-utility keywords — these carry no value to split off. */
const KEYWORD_FAMILY: Record<string, string> = {
  block: 'display', 'inline-block': 'display', inline: 'display', flex: 'display',
  'inline-flex': 'display', grid: 'display', 'inline-grid': 'display', table: 'display',
  contents: 'display', 'flow-root': 'display', hidden: 'display',

  'flex-row': 'flex-direction', 'flex-row-reverse': 'flex-direction',
  'flex-col': 'flex-direction', 'flex-col-reverse': 'flex-direction',

  'flex-wrap': 'flex-wrap', 'flex-nowrap': 'flex-wrap', 'flex-wrap-reverse': 'flex-wrap',

  'flex-1': 'flex', 'flex-auto': 'flex', 'flex-initial': 'flex', 'flex-none': 'flex',

  static: 'position', relative: 'position', absolute: 'position', fixed: 'position', sticky: 'position',

  'items-start': 'align-items', 'items-end': 'align-items', 'items-center': 'align-items',
  'items-baseline': 'align-items', 'items-stretch': 'align-items',

  'justify-start': 'justify-content', 'justify-end': 'justify-content',
  'justify-center': 'justify-content', 'justify-between': 'justify-content',
  'justify-around': 'justify-content', 'justify-evenly': 'justify-content',

  'text-left': 'text-align', 'text-center': 'text-align', 'text-right': 'text-align',
  'text-justify': 'text-align', 'text-start': 'text-align', 'text-end': 'text-align',

  'col-auto': 'col-span', 'row-auto': 'row-span', 'basis-auto': 'flex-basis',
  'rounded-none': 'border-radius', 'inset-auto': 'inset',
}

/** `<stem>-<value>` families. Longest stem wins, so `min-w` beats nothing. */
const STEM_FAMILY: Record<string, string> = {
  p: 'padding', px: 'padding-x', py: 'padding-y',
  pt: 'padding-top', pr: 'padding-right', pb: 'padding-bottom', pl: 'padding-left',
  m: 'margin', mx: 'margin-x', my: 'margin-y',
  mt: 'margin-top', mr: 'margin-right', mb: 'margin-bottom', ml: 'margin-left',
  gap: 'gap', 'gap-x': 'gap-x', 'gap-y': 'gap-y',
  w: 'width', h: 'height',
  'min-w': 'min-width', 'max-w': 'max-width', 'min-h': 'min-height', 'max-h': 'max-height',
  'grid-cols': 'grid-template-columns', 'grid-rows': 'grid-template-rows',
  'col-span': 'col-span', 'row-span': 'row-span',
  'translate-x': 'translate-x', 'translate-y': 'translate-y',
  basis: 'flex-basis', rounded: 'border-radius',
  inset: 'inset', 'inset-x': 'inset-x', 'inset-y': 'inset-y',
  top: 'top', right: 'right', bottom: 'bottom', left: 'left',
  font: 'font-weight',
}

/** Canonical stem per family, for narrowing a shorthand (padding → pt). */
const FAMILY_STEM: Record<string, string> = {
  padding: 'p', 'padding-x': 'px', 'padding-y': 'py',
  'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
  margin: 'm', 'margin-x': 'mx', 'margin-y': 'my',
  'margin-top': 'mt', 'margin-right': 'mr', 'margin-bottom': 'mb', 'margin-left': 'ml',
  gap: 'gap', 'gap-x': 'gap-x', 'gap-y': 'gap-y',
  inset: 'inset', 'inset-x': 'inset-x', 'inset-y': 'inset-y',
  top: 'top', right: 'right', bottom: 'bottom', left: 'left',
}

/**
 * Shorthand → the families it also sets. Needed because `p-4` really does
 * govern padding-top: pushing `pt-0` up to keep "what wide screens had" would
 * be a lie when a `p-4` was doing the work.
 */
const FAMILY_CHILDREN: Record<string, string[]> = {
  padding: ['padding-x', 'padding-y', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'padding-x': ['padding-left', 'padding-right'],
  'padding-y': ['padding-top', 'padding-bottom'],
  margin: ['margin-x', 'margin-y', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'margin-x': ['margin-left', 'margin-right'],
  'margin-y': ['margin-top', 'margin-bottom'],
  gap: ['gap-x', 'gap-y'],
  inset: ['inset-x', 'inset-y', 'top', 'right', 'bottom', 'left'],
  'inset-x': ['left', 'right'],
  'inset-y': ['top', 'bottom'],
}

/**
 * The utility that restores a family's CSS default, when one exists. Used for
 * exactly one thing: a narrow demonstration on an element where NO class
 * pinned the value, so something has to hold wide screens at the default.
 *
 * Absent on purpose for inherited or element-dependent properties — display
 * (a div's default is block, a span's is inline), font size, font weight,
 * colour, text alignment. There is no utility that means "whatever it was",
 * so those demonstrations are refused instead of half-done.
 */
const FAMILY_DEFAULT: Record<string, string> = {
  'flex-direction': 'flex-row', 'flex-wrap': 'flex-nowrap', flex: 'flex-initial',
  'align-items': 'items-stretch', 'justify-content': 'justify-start', position: 'static',
  gap: 'gap-0', 'gap-x': 'gap-x-0', 'gap-y': 'gap-y-0',
  padding: 'p-0', 'padding-x': 'px-0', 'padding-y': 'py-0',
  'padding-top': 'pt-0', 'padding-right': 'pr-0', 'padding-bottom': 'pb-0', 'padding-left': 'pl-0',
  margin: 'm-0', 'margin-x': 'mx-0', 'margin-y': 'my-0',
  'margin-top': 'mt-0', 'margin-right': 'mr-0', 'margin-bottom': 'mb-0', 'margin-left': 'ml-0',
  width: 'w-auto', height: 'h-auto', 'max-width': 'max-w-none', 'max-height': 'max-h-none',
  'grid-template-columns': 'grid-cols-none', 'grid-template-rows': 'grid-rows-none',
  'col-span': 'col-auto', 'row-span': 'row-auto',
  'translate-x': 'translate-x-0', 'translate-y': 'translate-y-0',
  'flex-basis': 'basis-auto', 'border-radius': 'rounded-none',
  inset: 'inset-auto', 'inset-x': 'inset-x-auto', 'inset-y': 'inset-y-auto',
  top: 'top-auto', right: 'right-auto', bottom: 'bottom-auto', left: 'left-auto',
}

/** How a family reads in a sentence a user sees. */
const FAMILY_LABEL: Record<string, string> = {
  'flex-direction': 'the flex direction', 'flex-wrap': 'wrapping', flex: 'the flex shorthand',
  'align-items': 'cross-axis alignment', 'justify-content': 'main-axis alignment',
  display: 'the display mode', gap: 'the gap',
  padding: 'padding', 'padding-x': 'side padding', 'padding-y': 'vertical padding',
  'padding-top': 'top padding', 'padding-right': 'right padding',
  'padding-bottom': 'bottom padding', 'padding-left': 'left padding',
  margin: 'margin', 'margin-x': 'side margins', 'margin-y': 'vertical margins',
  'margin-top': 'top margin', 'margin-right': 'right margin',
  'margin-bottom': 'bottom margin', 'margin-left': 'left margin',
  width: 'width', height: 'height', 'font-size': 'the text size',
  'font-weight': 'the font weight', 'text-color': 'the text colour',
  'text-align': 'text alignment', 'grid-template-columns': 'the column count',
  'border-radius': 'the corner radius',
}

const label = (family: string): string => FAMILY_LABEL[family] ?? family.replace(/-/g, ' ')

const FONT_SIZES = new Set([
  'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl', '8xl', '9xl',
])
const COLOR_WORDS = new Set([
  'inherit', 'current', 'transparent', 'black', 'white',
  'slate', 'gray', 'grey', 'zinc', 'neutral', 'stone', 'red', 'orange', 'amber', 'yellow',
  'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose',
])

/** Value shapes the fallback is willing to treat as "a value of a stem". */
const VALUE_SHAPE = /^(?:\d+(?:\.\d+)?|\d+\/\d+|\[.*\]|auto|full|screen|min|max|fit|px|none|dvh|lvh|svh|dvw|lvw|svw|xs|sm|md|lg|xl|[2-9]xl)$/

interface Classified {
  family: string | null
  /**
   * False when the family came from the shape fallback rather than the table.
   * An uncertain family is never used to REPLACE a class — only to notice that
   * two classes might be about the same thing, which is a refusal.
   */
  certain: boolean
}

/** Bracket-aware split at the last top-level hyphen: p-[calc(1rem-2px)] → p. */
function stemSplit(util: string): { stem: string; value: string } | null {
  let depth = 0
  let at = -1
  for (let i = 0; i < util.length; i++) {
    const ch = util[i]!
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    else if (ch === '-' && depth === 0) at = i
  }
  if (at <= 0 || at === util.length - 1) return null
  return { stem: util.slice(0, at), value: util.slice(at + 1) }
}

/** Strip Tailwind's leading markers so lookups see the bare utility. */
function bare(utility: string): { body: string; negative: boolean } {
  let body = utility.trim()
  while (body.startsWith('!')) body = body.slice(1)
  const negative = body.startsWith('-')
  if (negative) body = body.slice(1)
  return { body, negative }
}

function classify(utility: string): Classified {
  const { body } = bare(utility)
  if (!body) return { family: null, certain: false }
  const kw = KEYWORD_FAMILY[body]
  if (kw) return { family: kw, certain: true }

  // longest matching table stem
  let stem: string | null = null
  for (const s of Object.keys(STEM_FAMILY)) {
    if (body.startsWith(`${s}-`) && (!stem || s.length > stem.length)) stem = s
  }
  if (stem) {
    const value = body.slice(stem.length + 1)
    if (stem === 'font') {
      // font-bold is a weight; font-sans is a family; font-[…] could be either
      return /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\d{3})$/.test(value)
        ? { family: 'font-weight', certain: true }
        : { family: null, certain: false }
    }
    return { family: STEM_FAMILY[stem]!, certain: true }
  }

  // `text-*` is two families wearing one prefix, so it is decided by value
  if (body.startsWith('text-')) {
    const v = body.slice(5)
    // a `/…` modifier is line-height or opacity — it never changes the family
    const head = v.split('/')[0]!
    if (FONT_SIZES.has(head) || /^\d+(?:\.\d+)?$/.test(head)) return { family: 'font-size', certain: true }
    if (/^\[.*(?:px|rem|em|%|ch|vw|vh|pt)\]$/.test(v)) return { family: 'font-size', certain: true }
    if (/^\[(?:#|rgb|hsl|oklch|var|color)/.test(v)) return { family: 'text-color', certain: true }
    if (COLOR_WORDS.has(head.split('-')[0]!)) return { family: 'text-color', certain: true }
    return { family: null, certain: false }
  }

  // ── conservative fallback ──
  // A utility shaped `<stem>-<plain value>` is treated as belonging to family
  // `<stem>`, marked uncertain. That is enough to SPOT a possible clash (and
  // refuse), never enough to rewrite a class. Bare words (`truncate`,
  // `uppercase`) and multi-segment values (`bg-red-500`) stay unclassified.
  const split = stemSplit(body)
  if (split && VALUE_SHAPE.test(split.value)) return { family: split.stem, certain: false }
  return { family: null, certain: false }
}

/**
 * Which Tailwind family a utility belongs to, or null when it cannot be
 * classified. Callers must refuse on null rather than risk re-prefixing an
 * unrelated class.
 */
export function utilityFamily(utility: string): string | null {
  return classify(utility).family
}

/** Is `a` a shorthand that also sets `b`? */
function covers(a: string, b: string): boolean {
  const seen = new Set<string>()
  const stack = [...(FAMILY_CHILDREN[a] ?? [])]
  while (stack.length) {
    const f = stack.pop()!
    if (f === b) return true
    if (seen.has(f)) continue
    seen.add(f)
    stack.push(...(FAMILY_CHILDREN[f] ?? []))
  }
  return false
}

const firstSeg = (utility: string): string => bare(utility).body.split('-')[0]!

type Relation = 'same' | 'covers' | 'covered' | 'maybe' | 'none'

/**
 * How an existing class relates to the demonstrated one.
 *  'same'    — same family: this is the class to replace or push up
 *  'covers'  — a shorthand that also sets our property (p-4 vs pt-8)
 *  'covered' — a narrower class our shorthand would not fully override
 *  'maybe'   — might be the same thing; at least one side is unclassified or
 *              only guessed, so the only safe move is to refuse
 */
function relate(demonstrated: string, existing: string): Relation {
  const a = classify(demonstrated)
  const b = classify(existing)
  if (a.family && b.family && a.family === b.family) return 'same'
  if (a.family && b.family) {
    if (covers(b.family, a.family)) return 'covers'
    if (covers(a.family, b.family)) return 'covered'
  }
  const uncertain = !a.family || !b.family || !a.certain || !b.certain
  if (uncertain && firstSeg(demonstrated) === firstSeg(existing)) return 'maybe'
  return 'none'
}

// ── the plan ────────────────────────────────────────────────────────────────

export interface ResponsivePlan {
  ok: boolean
  /** The full replacement className, when the plan succeeded. */
  className?: string
  /** What will now happen at which widths, in plain words. */
  change?: string
  error?: string
}

/** Bracket-aware variant split: `[&:hover]:md:p-4` → ['[&:hover]','md','p-4']. */
function splitVariants(token: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of token) {
    if (ch === '[' || ch === '(') depth++
    else if (ch === ']' || ch === ')') depth--
    if (ch === ':' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur)
  return out
}

/**
 * A variant that narrows by WIDTH but isn't a plain breakpoint: max-md,
 * min-[900px], container queries, raw media queries. These interact with what
 * we are about to write and we do not model them, so a same-family one is a
 * refusal rather than a silent miscalculation.
 */
const isWidthVariant = (v: string): boolean =>
  /^(?:min|max)-/.test(v) || v.startsWith('@') || /width/i.test(v)

interface Tok {
  raw: string
  util: string
  /** 'base' or a screen name — set only for plain, width-only classes. */
  band: string | null
  /** A width variant we don't model, when this class carries one. */
  widthVariant: string | null
}

function parseToken(raw: string, screens: Record<string, number>): Tok {
  const parts = splitVariants(raw)
  const util = parts[parts.length - 1]!
  let band = 'base'
  let widthVariant: string | null = null
  let stateful = false
  for (const v of parts.slice(0, -1)) {
    if (Object.prototype.hasOwnProperty.call(screens, v)) {
      if (band === 'base') band = v
      else widthVariant = v // two breakpoints on one class: not ours to reason about
    } else if (isWidthVariant(v)) widthVariant = v
    else stateful = true
  }
  return { raw, util, band: widthVariant || stateful ? null : band, widthVariant }
}

const px = (n: number): string => `${String(Math.round(n))}px`

/**
 * Place a demonstrated utility so that it wins in the band it was
 * demonstrated in and every other width keeps exactly what it had.
 *
 * Mobile-first is taken at its word: a band means "this width and up". So a
 * demonstration at `md` writes `md:` and wide screens follow along (which is
 * what someone widening a window to 900px and rearranging is asking for),
 * while a demonstration at `base` writes the unprefixed class and moves the
 * old value up one band so that everything from the first breakpoint onward is
 * untouched.
 */
export function planResponsive(
  className: string,
  utility: string,
  band: string,
  screens: Record<string, number>,
): ResponsivePlan {
  const util = utility.trim()
  if (!util) return { ok: false, error: 'there is no utility to place at this width' }
  if (/\s/.test(util)) {
    return { ok: false, error: `'${util}' is more than one class — demonstrate one utility at a time` }
  }
  if (splitVariants(util).length > 1) {
    return {
      ok: false,
      error: `'${util}' already carries a variant, so there is nothing to work out — write it into the className directly`,
    }
  }

  const order = bandOrder(screens)
  if (band !== 'base' && !Object.prototype.hasOwnProperty.call(screens, band)) {
    const names = order.slice(1).join(', ')
    return {
      ok: false,
      error: names
        ? `'${band}' is not one of this project's breakpoints (${names})`
        : `'${band}' is not a breakpoint — this project declares none`,
    }
  }
  const demoIdx = order.indexOf(band)
  const bIdx = (name: string | null): number | null => {
    if (name == null) return null
    const i = order.indexOf(name)
    return i < 0 ? null : i
  }
  const minOf = (name: string): number => screens[name] ?? 0
  /** "below 640px" / "from 768px up" — the only two shapes a band ever has. */
  const window_ = (idx: number): string =>
    idx === 0
      ? order.length > 1
        ? `below ${px(minOf(order[1]!))}`
        : 'at every width'
      : `from ${px(minOf(order[idx]!))} up`

  const toks = className.split(/\s+/).filter(Boolean).map((r) => parseToken(r, screens))
  const family = classify(util).family

  // ── an unclassifiable demonstration can only be placed where nothing else
  //    could possibly be in the way, and even then not unprefixed ──
  if (!family) {
    const plain = toks.filter((t2) => t2.band != null)
    if (plain.length > 0) {
      return {
        ok: false,
        error: `I can't tell which Tailwind family '${util}' belongs to, so I can't tell what it would override at other widths — add it in source with the prefix you want`,
      }
    }
    if (demoIdx === 0) {
      return {
        ok: false,
        error: `I can't tell which Tailwind family '${util}' belongs to, so I can't say what wider screens should keep — add it in source with the prefix you want`,
      }
    }
    return {
      ok: true,
      className: [...toks.map((t2) => t2.raw), `${band}:${util}`].join(' '),
      change: `${util} ${window_(demoIdx)}`,
    }
  }

  // ── classify the neighbourhood ──
  const sames: Tok[] = []
  const shorthands: Tok[] = []
  for (const tok of toks) {
    const rel = relate(util, tok.util)
    if (rel === 'none' || rel === 'covered') continue
    if (tok.widthVariant) {
      return {
        ok: false,
        error: `'${tok.raw}' narrows ${label(family)} by width in a way this doesn't model (${tok.widthVariant}:) — sort that class out by hand first`,
      }
    }
    if (tok.band == null) continue // hover:/dark:/etc — a state, not a width
    if (rel === 'maybe') {
      return {
        ok: false,
        error: `I can't tell whether '${tok.raw}' and '${util}' style the same thing, and re-prefixing the wrong one would change this element at every width — add '${util}' in source with the prefix you want`,
      }
    }
    if (rel === 'same') sames.push(tok)
    else shorthands.push(tok)
  }

  // two classes of the same family at the same width: Tailwind picks between
  // them by stylesheet order, not class order, so there is no honest answer
  for (const a of sames) {
    for (const b of sames) {
      if (a !== b && a.band === b.band) {
        return {
          ok: false,
          error: `this element sets both '${a.raw}' and '${b.raw}' ${window_(bIdx(a.band)!)} — Tailwind picks between them by stylesheet order, so remove one before demonstrating`,
        }
      }
    }
  }

  // a shorthand that also sets our property, at a band of its own, would fight
  // whatever we write there in a way that depends on stylesheet order
  for (const sh of shorthands) {
    if (sh.band !== 'base') {
      return {
        ok: false,
        error: `'${sh.raw}' also sets ${label(family)} ${window_(bIdx(sh.band)!)} — replace it with the individual sides you mean (${FAMILY_STEM[family] ?? family}-…) and demonstrate again`,
      }
    }
  }

  const sameAt = (idx: number): Tok | undefined => sames.find((s) => bIdx(s.band) === idx)
  // a class one band up from a narrow demonstration is reported by the push
  // logic below instead, which has more to say about it
  const higher = sames.filter(
    (s) => (bIdx(s.band) ?? 0) > demoIdx && !(demoIdx === 0 && bIdx(s.band) === 1),
  )
  const notes: string[] = []
  const out = [...toks]
  const replaceRaw = (tok: Tok, raw: string): void => {
    out[out.indexOf(tok)] = { ...tok, raw }
  }
  /** Keep classes in ascending-band order, the way people write them. */
  const insertRaw = (raw: string, idx: number): void => {
    let at = -1
    for (let i = 0; i < out.length; i++) {
      const b = bIdx(out[i]!.band)
      if (b != null && b <= idx) at = i
    }
    if (at >= 0) {
      out.splice(at + 1, 0, { raw, util: raw, band: order[idx]!, widthVariant: null })
      return
    }
    for (let i = 0; i < out.length; i++) {
      const b = bIdx(out[i]!.band)
      if (b != null && b > idx) {
        out.splice(i, 0, { raw, util: raw, band: order[idx]!, widthVariant: null })
        return
      }
    }
    out.push({ raw, util: raw, band: order[idx]!, widthVariant: null })
  }
  const finish = (change: string): ResponsivePlan => {
    const seen = new Set<string>()
    const raws = out.map((t2) => t2.raw).filter((r) => (seen.has(r) ? false : (seen.add(r), true)))
    return { ok: true, className: raws.join(' '), change: [change, ...notes].join(' · ') }
  }
  for (const h of higher) {
    notes.push(`'${h.raw}' still wins ${window_(bIdx(h.band)!)}`)
  }

  const here = sameAt(demoIdx)
  if (here && bare(here.util).body === bare(util).body) {
    return {
      ok: true,
      className,
      change: `no change — ${util} already applies ${window_(demoIdx)}`,
    }
  }

  // ── the wide direction: prefix it, lower bands keep theirs ──
  if (demoIdx > 0) {
    const prefixed = `${band}:${util}`
    if (here) replaceRaw(here, prefixed)
    else insertRaw(prefixed, demoIdx)
    const below = sames.filter((s) => (bIdx(s.band) ?? 0) < demoIdx).sort((a, b) => bIdx(b.band)! - bIdx(a.band)!)[0]
    if (below) {
      notes.unshift(
        bIdx(below.band) === 0
          ? `below ${px(minOf(band))} it keeps '${below.raw}'`
          : `'${below.raw}' still holds between ${px(minOf(below.band!))} and ${px(minOf(band))}`,
      )
    }
    return finish(here ? `${here.raw} → ${prefixed} ${window_(demoIdx)}` : `${util} ${window_(demoIdx)}`)
  }

  // ── the narrow direction: this is where getting it backwards bites ──
  // The new utility has to become the unprefixed base, so whatever the element
  // showed at wider widths must be pinned into the first band above us.
  const nextIdx = 1
  const shadow = sameAt(nextIdx)

  if (here) replaceRaw(here, util)
  else insertRaw(util, 0)

  if (shadow) {
    // the old unprefixed value governed nothing above this breakpoint anyway
    return finish(
      here
        ? `${here.raw} → ${util} ${window_(0)}, and '${shadow.raw}' already governs ${window_(nextIdx)}`
        : `${util} ${window_(0)}, and '${shadow.raw}' already governs ${window_(nextIdx)}`,
    )
  }

  if (order.length < 2) {
    return {
      ok: false,
      error: `this project declares no breakpoints, so ${label(family)} has nowhere wider to move to and wide screens would change too — add breakpoints to your Tailwind theme, then demonstrate again`,
    }
  }

  let keep: string
  if (here) {
    keep = here.raw
  } else {
    const sh = shorthands.find((s) => s.band === 'base')
    if (sh) {
      // p-4 is doing the work for padding-top: keep pt-4, not pt-0
      const stem = FAMILY_STEM[family]
      const shStem = Object.keys(STEM_FAMILY).find(
        (s) => bare(sh.util).body.startsWith(`${s}-`) && STEM_FAMILY[s] === classify(sh.util).family,
      )
      if (!stem || !shStem) {
        return {
          ok: false,
          error: `'${sh.raw}' sets ${label(family)} for every width and this can't narrow it — replace it with the individual sides you mean and demonstrate again`,
        }
      }
      const { body, negative } = bare(sh.util)
      keep = `${negative ? '-' : ''}${stem}-${body.slice(shStem.length + 1)}`
    } else {
      const fallback = FAMILY_DEFAULT[family]
      if (!fallback) {
        return {
          ok: false,
          error: `nothing on this element sets ${label(family)}, so '${util}' ${window_(0)} would change every width with it — set what wider screens should keep first (for example '${order[1]!}:…'), then demonstrate again`,
        }
      }
      keep = fallback
    }
  }

  const pushed = `${order[nextIdx]!}:${keep}`
  insertRaw(pushed, nextIdx)
  return finish(
    `${util} ${window_(0)} · ${keep} ${window_(nextIdx)} (wider screens unchanged)`,
  )
}

// ── writing it ──────────────────────────────────────────────────────────────

export interface ResponsiveRequest {
  /** From the live element's data-s2c at commit time: "src/File.tsx:LINE:COL". */
  srcLoc: string
  /** The utility the direct manipulation produced, e.g. 'flex-col', 'w-[300px]'. */
  utility: string
  /** The viewport width the user was demonstrating at, in CSS pixels. */
  width: number
}

export interface ResponsiveResult {
  ok: boolean
  file?: string
  change?: string
  band?: string
  screens?: Record<string, number>
  /** Where those breakpoints came from — shown so nobody is misled. */
  screensSource?: string
  className?: { before: string; after: string }
  error?: string
}

/**
 * Resolve a stamp, read its className, plan the responsive edit, write it.
 * The write is a character-range swap of the className string literal, so
 * nothing else in the file is reformatted, and the result is re-parsed before
 * it is committed.
 */
export function applyResponsive(root: string, req: ResponsiveRequest): ResponsiveResult {
  const info = screensFor(root)
  const band = bandFor(req.width, info.screens)
  const meta = { band, screens: info.screens, screensSource: info.source }

  const m = /^(.+):(\d+):(\d+)$/.exec(req.srcLoc)
  if (!m) return { ok: false, ...meta, error: `bad srcLoc "${req.srcLoc}"` }
  const [, rel, lineS, colS] = m
  const line = Number(lineS)
  const col = Number(colS)
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) return { ok: false, ...meta, error: 'srcLoc escapes the app root' }

  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    return { ok: false, ...meta, error: `cannot read ${rel}` }
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true })
  } catch {
    return { ok: false, ...meta, error: `cannot parse ${rel}` }
  }

  let found: t.JSXOpeningElement | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === line && loc.start.column + 1 === col) found = path.node
    },
  })
  if (!found) return { ok: false, ...meta, error: `no JSX element at ${rel}:${String(line)}:${String(col)} (stale stamp?)` }
  const el = found as t.JSXOpeningElement

  const attr = el.attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
  )
  if (attr && attr.value && attr.value.type !== 'StringLiteral') {
    // A computed className hides what applies at which width, and a breakpoint
    // edit that guessed wrong there would be invisible until someone resized.
    return {
      ok: false,
      ...meta,
      error: `this element's className is built at runtime (clsx/template literal), so this can't tell what applies at which width — add '${band === 'base' ? req.utility : `${band}:${req.utility}`}' to its static classes yourself`,
    }
  }

  const before = attr?.value?.type === 'StringLiteral' ? attr.value.value : ''
  const plan = planResponsive(before, req.utility, band, info.screens)
  if (!plan.ok || plan.className == null) return { ok: false, ...meta, error: plan.error }
  if (plan.className === before && attr) {
    return { ok: true, file: rel, ...meta, change: plan.change, className: { before, after: before } }
  }

  let next: string
  if (!attr) {
    const name = el.name
    if (name.type !== 'JSXIdentifier' || name.end == null) {
      return { ok: false, ...meta, error: 'unsupported element name node' }
    }
    next = `${code.slice(0, name.end)} className="${plan.className}"${code.slice(name.end)}`
  } else if (!attr.value) {
    // className with no value at all (`<div className>`) — not something to edit
    return { ok: false, ...meta, error: 'that className has no value to edit' }
  } else {
    if (attr.value.start == null || attr.value.end == null) {
      return { ok: false, ...meta, error: 'missing attribute location' }
    }
    const quote = code[attr.value.start] ?? '"'
    next = code.slice(0, attr.value.start) + quote + plan.className + quote + code.slice(attr.value.end)
  }

  try {
    parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, ...meta, error: `the edit would not parse (${String(err)})` }
  }
  writeFileSync(file, next)
  return { ok: true, file: rel, ...meta, change: plan.change, className: { before, after: plan.className } }
}

/**
 * Recolour one element in source: its text, or its fill. Deterministic, zero
 * tokens (s2c-050).
 *
 * Row 7 of the visual language: a ring drawn in a pen colour round an element,
 * with no words, means "make it this colour". The plain reader decides that
 * reading without a model; this applies it without one. Before, the reading
 * was free and the write still opened a codegen session to add one style.
 *
 * Two idioms, picked by the project, never mixed in one write:
 *   - Tailwind (the page renders colour utilities and the element's className
 *     is a plain string): swap the element's text-/bg- colour utility for the
 *     palette token the drawn colour snapped to, or `text-[#hex]` when none
 *     is close. Other utilities (text-sm, bg-cover) are kept.
 *   - Otherwise: an inline `style={{ color: '#hex' }}` (or backgroundColor),
 *     merged into an existing static style object when there is one.
 *
 * It refuses, and the run hands the action to codegen as before, whenever the
 * write is not a single obvious literal: a component tag (className may not
 * reach the DOM), a dynamic className or style, a template rendered more than
 * once (one ring, every instance recoloured), a stale stamp.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@babel/parser'
import type { ColorMatch } from './palette.js'

export interface RecolorRequest {
  /** data-s2c stamp of the ringed element: "src/App.jsx:LINE:COL". */
  srcLoc: string
  color: ColorMatch
  /** Which colour: the words (a heading) or the fill (a button). */
  prop: 'color' | 'backgroundColor'
  /** The page renders Tailwind colour utilities (appPalette non-empty). */
  tailwind: boolean
  /** How many elements on the page carry this stamp. */
  instanceCount?: number
}

export interface RecolorResult {
  ok: boolean
  file?: string
  change?: string
  error?: string
}

interface Loc { line: number; column: number }
interface AstNode {
  type: string
  start?: number | null
  end?: number | null
  loc?: { start: Loc } | null
  [k: string]: unknown
}

const PREFIX = { color: 'text-', backgroundColor: 'bg-' } as const
const CSS_KEY = { color: 'color', backgroundColor: 'backgroundColor' } as const

/** Utilities that set text colour; text-sm, text-center, text-balance do not. */
export function isTextColorClass(cls: string): boolean {
  return isColorUtility(cls, 'text-')
}

/** A colour utility for this prefix: bg-red-500 yes, bg-cover / bg-gradient-to-r no. */
export function isColorUtility(cls: string, prefix: 'text-' | 'bg-'): boolean {
  if (!cls.startsWith(prefix)) return false
  const rest = cls.slice(prefix.length)
  if (/^\[(#|rgb|hsl|oklch|color:)/.test(rest)) return true
  if (/^[a-z]+-\d{2,3}(\/\d+)?$/.test(rest)) return true
  return ['white', 'black', 'transparent', 'current', 'inherit'].includes(rest)
}

/**
 * The class to write: the snapped token when it is this kind of colour, the
 * same palette shade under the other prefix (text-green-600 ⇄ bg-green-600 are
 * one Tailwind colour), else the drawn colour as an arbitrary value.
 */
export function colorClass(m: ColorMatch, prefix: 'text-' | 'bg-' = 'text-'): string {
  const tok = m.nearest?.token
  const other = prefix === 'text-' ? 'bg-' : 'text-'
  if (tok && isColorUtility(tok, prefix)) return tok
  if (tok && tok.startsWith(other) && /^[a-z]+-\d{2,3}$/.test(tok.slice(other.length))) return prefix + tok.slice(other.length)
  return `${prefix}[${m.drawn}]`
}
export const textColorClass = (m: ColorMatch): string => colorClass(m, 'text-')

function findOpening(ast: AstNode, line: number, col: number): AstNode | null {
  let found: AstNode | null = null
  const walk = (n: unknown): void => {
    if (found || !n || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const node = n as AstNode
    if (node.type === 'JSXOpeningElement' && node.loc && node.loc.start.line === line && node.loc.start.column + 1 === col) {
      found = node
      return
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue
      const v = node[k]
      if (v && typeof v === 'object') walk(v)
    }
  }
  walk(ast)
  return found
}

const attrNamed = (opening: AstNode, name: string): AstNode | undefined =>
  (opening.attributes as AstNode[]).find(
    (a) => a.type === 'JSXAttribute' && (a.name as AstNode).type === 'JSXIdentifier' && (a.name as AstNode).name === name,
  )

export function recolorElement(root: string, req: RecolorRequest): RecolorResult {
  const prefix = PREFIX[req.prop]
  const key = CSS_KEY[req.prop]
  const m = /^(.+):(\d+):(\d+)$/.exec(req.srcLoc)
  if (!m) return { ok: false, error: `bad srcLoc "${req.srcLoc}"` }
  const [, rel, lineS, colS] = m
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) return { ok: false, error: 'srcLoc escapes root' }
  if ((req.instanceCount ?? 1) > 1) {
    return { ok: false, error: `this element renders ${req.instanceCount} times; recolouring its template would change them all` }
  }
  const hex = req.color.drawn
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return { ok: false, error: `unreadable colour "${hex}"` }

  let code: string
  try { code = readFileSync(file, 'utf8') } catch { return { ok: false, error: `cannot read ${rel}` } }
  let ast: AstNode
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) as unknown as AstNode
  } catch {
    return { ok: false, error: `cannot parse ${rel}` }
  }
  const opening = findOpening(ast, Number(lineS), Number(colS))
  if (!opening) return { ok: false, error: `no JSX element at ${req.srcLoc} (stale stamp?)` }
  const name = opening.name as AstNode
  if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(String(name.name)) || name.end == null) {
    return { ok: false, error: 'a component, not an HTML element: its colour is set inside it' }
  }

  const write = (next: string, change: string): RecolorResult => {
    try {
      parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    } catch (err) {
      return { ok: false, error: `the edit would not parse (${err instanceof Error ? err.message : String(err)})` }
    }
    writeFileSync(file, next)
    return { ok: true, file: rel, change }
  }

  const classAttr = attrNamed(opening, 'className')
  const classValue = classAttr?.value as AstNode | null | undefined
  if (req.tailwind && classValue?.type === 'StringLiteral' && classValue.start != null && classValue.end != null) {
    const before = String(classValue.value)
    const want = colorClass(req.color, prefix)
    const kept = before.split(/\s+/).filter((c) => c && !isColorUtility(c, prefix))
    const removed = before.split(/\s+/).filter((c) => c && isColorUtility(c, prefix))
    if (removed.length === 1 && removed[0] === want) return { ok: true, file: rel, change: 'no change (already that colour)' }
    const after = [...kept, want].join(' ')
    const q = code[classValue.start] ?? '"'
    return write(
      code.slice(0, classValue.start) + q + after + q + code.slice(classValue.end),
      removed.length ? `${removed.join(' ')} → ${want}` : `+ ${want}`,
    )
  }
  if (req.tailwind && classAttr) {
    return { ok: false, error: 'className is dynamic (clsx/template): the model edits this one' }
  }

  const styleAttr = attrNamed(opening, 'style')
  const literal = `'${hex}'`
  if (!styleAttr) {
    return write(
      code.slice(0, name.end) + ` style={{ ${key}: ${literal} }}` + code.slice(name.end),
      `${key} → ${hex}`,
    )
  }
  const container = styleAttr.value as AstNode | null
  const obj = container?.type === 'JSXExpressionContainer' ? (container.expression as AstNode) : null
  if (!obj || obj.type !== 'ObjectExpression' || obj.start == null || obj.end == null) {
    return { ok: false, error: 'style is not a plain object here: the model edits this one' }
  }
  const props = obj.properties as AstNode[]
  const keyName = (p: AstNode): string | null => {
    if (p.type !== 'ObjectProperty' || p.computed) return null
    const k = p.key as AstNode
    return k.type === 'Identifier' ? String(k.name) : k.type === 'StringLiteral' ? String(k.value) : null
  }
  const existing = props.filter((p) => keyName(p) === key)
  if (existing.length > 1) return { ok: false, error: `style sets ${key} twice` }
  // the shorthand would fight a backgroundColor written after it only by order
  if (key === 'backgroundColor' && props.some((p) => keyName(p) === 'background')) {
    return { ok: false, error: 'style sets the background shorthand: the model edits this one' }
  }
  const prop = existing[0]
  if (prop) {
    const v = prop.value as AstNode
    if (v.start == null || v.end == null) return { ok: false, error: 'missing location' }
    const was = code.slice(v.start, v.end)
    if (was === literal || was === `"${hex}"`) return { ok: true, file: rel, change: 'no change (already that colour)' }
    return write(code.slice(0, v.start) + literal + code.slice(v.end), `${key} ${was} → ${hex}`)
  }
  // a later key wins in an object literal, so appending after a spread is right
  const last = props[props.length - 1]
  const next = last && last.end != null
    ? code.slice(0, last.end) + `, ${key}: ${literal}` + code.slice(last.end)
    : code.slice(0, obj.start) + `{ ${key}: ${literal} }` + code.slice(obj.end)
  return write(next, `${key} → ${hex}`)
}

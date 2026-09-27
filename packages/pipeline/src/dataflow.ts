/**
 * Drag the data.
 *
 * On a running page you can SEE a value — the $48,210 in a stat card, a row's
 * total in a table — and very often the thing you want is simply "put that
 * value here too". In an editor that wish turns into four separate acts of
 * archaeology: find which expression produces it, work out whether the
 * identifiers that expression depends on even exist where you want it, thread
 * them through if they don't, and only then type anything. On the page it is
 * one drag, because everything that made it hard is already known — both ends
 * carry a build-time stamp, so the expression behind the value is a node
 * rather than a guess, and the scope question is decidable from the AST.
 *
 * It COPIES rather than moves, and that is a deliberate refusal to be clever.
 * The source element still has to render something: it is part of the page the
 * user is looking at while dragging, often the only reason they knew the value
 * existed. Emptying it to fill somewhere else would break the very view that
 * made the gesture make sense, and it would do so silently, one gesture away
 * from where the user was looking. "Move" is two gestures — this, then delete.
 *
 * The scope half is where this earns its keep, and where it says no. A
 * `.map((s) => …)` parameter dragged out of its list cannot resolve; neither
 * can a local of another component in the same file. Both are settled by
 * asking babel for the binding at the DESTINATION and checking it is the same
 * binding the copied expression referenced. That single test also catches the
 * nastiest case, an identifier that does resolve there but to something else:
 * the copy would render a plausible, wrong value, which is worse than a
 * refusal because nothing would look broken.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type Binding, type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface MoveDataRequest {
  /** 'src/components/StatCards.tsx:13:11' — the element whose value to copy. */
  from: string
  /** The element that should render that value too. */
  to: string
}

export interface MoveDataResult {
  ok: boolean
  file?: string
  change?: string
  error?: string
}

const STAMP = /^(.+):(\d+):(\d+)$/

/** Host elements that cannot hold children — React refuses them outright. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

type JsxChild = t.JSXElement['children'][number]

/** Indentation between children is not something the page renders. */
const blank = (c: JsxChild): boolean => c.type === 'JSXText' && c.value.trim() === ''
const rendered = (el: t.JSXElement): JsxChild[] => el.children.filter((c) => !blank(c))

const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim()
const clip = (s: string, n = 36): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** What a child IS, so a refusal can say what was actually found. */
function describeChild(c: JsxChild): string {
  switch (c.type) {
    case 'JSXText':
      return 'text'
    case 'JSXExpressionContainer':
      return c.expression.type === 'JSXEmptyExpression' ? 'a comment' : 'an expression'
    case 'JSXSpreadChild':
      return 'a spread'
    case 'JSXFragment':
      return 'a fragment'
    default: {
      const n = c.openingElement.name
      return n.type === 'JSXIdentifier' ? `<${n.name}>` : 'an element'
    }
  }
}

const listOf = (parts: string[]): string =>
  parts.length <= 1
    ? (parts[0] ?? 'nothing')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`

/** The enclosing function's name, when it has one worth quoting. */
function fnName(p: NodePath | null | undefined): string | null {
  const fn = p?.isFunction() ? p : p?.getFunctionParent()
  if (!fn) return null
  const n = fn.node
  if ((n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression') && n.id) return n.id.name
  const parent = fn.parentPath
  if (parent?.isVariableDeclarator() && parent.node.id.type === 'Identifier') return parent.node.id.name
  return null
}

/**
 * Where a binding lives, named the way the user would point at it.
 *
 * "the {stats.map(…)} list" rather than "an arrow function parameter": the
 * list is the thing they can see on the page, and it is also exactly where
 * they have to drop instead. A refusal that names a scope nobody can point at
 * is a refusal nobody can act on.
 */
function scopeOf(binding: Binding, code: string): string {
  if (binding.kind === 'param') {
    const fn = binding.path.parentPath
    const call = fn?.parentPath
    if (fn && call?.isCallExpression() && (call.node.arguments as t.Node[]).includes(fn.node)) {
      const callee = call.node.callee
      if (callee.type === 'MemberExpression' && callee.start != null && callee.end != null) {
        return `the {${code.slice(callee.start, callee.end)}(…)} list`
      }
    }
  }
  if (binding.scope.block.type === 'Program') return 'this file'
  const name = fnName(binding.scope.path)
  return name ? `${name}()` : 'the function it is declared in'
}

/**
 * Every identifier the copied expression actually references.
 *
 * `isReferencedIdentifier` is what keeps `{total.toFixed(2)}` down to `total`:
 * property keys and member properties are names, not references, and treating
 * them as things to resolve would refuse perfectly good drags. The root is
 * checked by hand because `traverse` does not visit the path it starts from,
 * and `{total}` — a bare identifier — is the single most common case there is.
 */
function referenced(exprPath: NodePath<t.Node>): Map<string, NodePath> {
  const refs = new Map<string, NodePath>()
  const add = (name: string, p: NodePath) => {
    if (!refs.has(name)) refs.set(name, p)
  }
  if (exprPath.isIdentifier()) add(exprPath.node.name, exprPath)
  exprPath.traverse({
    Identifier(id: NodePath<t.Identifier>) {
      if (id.isReferencedIdentifier()) add(id.node.name, id)
    },
    JSXIdentifier(id: NodePath<t.JSXIdentifier>) {
      // <Badge /> inside the value: the tag is a reference like any other
      if (id.parentPath?.isJSXOpeningElement()) add(id.node.name, id)
    },
  })
  return refs
}

export function moveData(root: string, req: MoveDataRequest): MoveDataResult {
  const fromM = STAMP.exec(req.from ?? '')
  if (!fromM) return { ok: false, error: `bad source location "${String(req.from)}"` }
  const toM = STAMP.exec(req.to ?? '')
  if (!toM) return { ok: false, error: `bad source location "${String(req.to)}"` }
  if (req.from === req.to) {
    return { ok: false, error: 'that is the same element — drop the value somewhere else' }
  }

  const rel = fromM[1]!
  const relTo = toM[1]!
  if (rel !== relTo) {
    // Same discipline as extracting a component: one file, or refuse. Across
    // files the value is not in scope by construction, and the honest fix is a
    // prop — which is a decision about a component's interface, not a drag.
    return {
      ok: false,
      error: `the value lives in ${rel} and you dropped it in ${relTo} — copying across files means passing it in as a prop; drop it somewhere in ${rel} instead`,
    }
  }

  const file = resolvePath(root, rel)
  if (!file.startsWith(resolvePath(root))) return { ok: false, error: 'that source location escapes the app root' }

  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    return { ok: false, error: `cannot read ${rel}` }
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return { ok: false, error: `cannot parse ${rel}` }
  }

  const found = new Map<string, NodePath<t.JSXElement>>()
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (!loc) return
      const key = `${rel}:${String(loc.start.line)}:${String(loc.start.column + 1)}`
      if (key === req.from || key === req.to) {
        found.set(key, path.parentPath as NodePath<t.JSXElement>)
      }
    },
  })
  const src = found.get(req.from)
  const dst = found.get(req.to)
  if (!src) return { ok: false, error: `no element at ${req.from} (stale stamp?)` }
  if (!dst) return { ok: false, error: `no element at ${req.to} (stale stamp?)` }

  // ── what does the source element render? ──
  const kids = rendered(src.node)
  if (kids.length === 0) {
    return { ok: false, error: 'that element renders nothing — drag from one that actually shows a value' }
  }
  if (kids.length > 1) {
    return {
      ok: false,
      error: `that element renders ${listOf(kids.map(describeChild))} — drag from one that renders a single value, i.e. one {expression} or one piece of text`,
    }
  }
  const only = kids[0]!
  if (only.type !== 'JSXExpressionContainer' && only.type !== 'JSXText') {
    return {
      ok: false,
      error: `that element renders ${describeChild(only)}, not a value — drag from the element that shows the value itself`,
    }
  }
  if (only.type === 'JSXExpressionContainer' && only.expression.type === 'JSXEmptyExpression') {
    return { ok: false, error: 'that element renders only a comment, not a value' }
  }
  if (only.start == null || only.end == null) {
    return { ok: false, error: 'the value has no source positions — reload the page and try again' }
  }
  const isExpr = only.type === 'JSXExpressionContainer'
  // The container's own source, braces and all: it is exactly what has to
  // appear at the destination, formatting and any comments included.
  const valueText = isExpr ? code.slice(only.start, only.end) : collapse(only.value)

  // ── can the destination hold it? ──
  const open = dst.node.openingElement
  if (open.name.type !== 'JSXIdentifier') {
    return { ok: false, error: 'the drop target is not a host element — only host elements carry stamps (stale stamp?)' }
  }
  const tag = open.name.name
  if (VOID.has(tag)) {
    return { ok: false, error: `<${tag}> cannot hold text — drop the value on an element that renders text` }
  }
  const dstKids = rendered(dst.node)
  const held = dstKids.filter((c) => c.type === 'JSXElement' || c.type === 'JSXFragment')
  if (held.length) {
    return {
      ok: false,
      error: `<${tag}> contains ${listOf(held.map(describeChild))} — putting a value there would replace ${held.length > 1 ? 'them' : 'it'}; drop it on an element that renders text, or on an empty one`,
    }
  }

  // ── does the value still mean the same thing over there? ──
  if (isExpr) {
    const childPaths = src.get('children')
    const idx = src.node.children.indexOf(only)
    const childPath = Array.isArray(childPaths) ? childPaths[idx] : undefined
    if (!childPath?.isJSXExpressionContainer()) {
      return { ok: false, error: 'cannot resolve that value in the source — reload the page and try again' }
    }
    const exprPath = childPath.get('expression')
    for (const [name, at] of referenced(exprPath)) {
      const binding = at.scope.getBinding(name)
      // No binding at all is a global — Math, JSON, a browser API. Those
      // resolve everywhere, including at the destination.
      if (!binding) continue
      // Bound inside the value itself (`{rows.map((r) => r.n)}`): it travels
      // with the expression, so the destination never has to provide it.
      if (binding.path === exprPath || binding.path.findParent((q) => q === exprPath)) continue

      const there = dst.scope.getBinding(name)
      if (there === binding) continue
      if (there) {
        return {
          ok: false,
          error: `\`${name}\` means something else where you dropped it: the one you dragged belongs to ${scopeOf(binding, code)}, the one there to ${scopeOf(there, code)}. The copy would render a different value than the one you can see — drop it inside ${scopeOf(binding, code)}, or pass this value in as a prop.`,
        }
      }
      return {
        ok: false,
        error: `the value comes from \`${name}\`, which only exists inside ${scopeOf(binding, code)} — drop it on something inside ${scopeOf(binding, code)}, or pass the value in as a prop`,
      }
    }
  }

  // ── write it ──
  const openEnd = open.end
  if (openEnd == null) return { ok: false, error: 'missing source positions for the drop target' }
  let next: string
  let replaced = ''
  if (open.selfClosing) {
    // `<em />` has nowhere to put children, so it is reopened: the tag stays,
    // its attributes stay, it simply gains a body.
    const reopened = code.slice(dst.node.start ?? openEnd, openEnd).replace(/\s*\/\s*>$/, '>')
    next = code.slice(0, dst.node.start ?? openEnd) + reopened + valueText + `</${tag}>` + code.slice(openEnd)
  } else {
    const closeStart = dst.node.closingElement?.start
    if (closeStart == null) return { ok: false, error: 'missing source positions for the drop target' }
    replaced = collapse(code.slice(openEnd, closeStart))
    if (replaced === collapse(valueText)) {
      return { ok: true, file: rel, change: 'no change (it already renders that)' }
    }
    next = code.slice(0, openEnd) + valueText + code.slice(closeStart)
  }

  try {
    parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, error: `the edit would not parse (${String(err)})` }
  }
  writeFileSync(file, next)

  const shown = isExpr ? `\`${clip(valueText)}\`` : `“${clip(valueText)}”`
  return {
    ok: true,
    file: rel,
    // The replaced half matters more than the rest: it is the one thing the
    // user is about to lose, and they never asked for it to go.
    change: `${shown} now also renders in <${tag}>${replaced ? ` · replaced “${clip(replaced)}”` : ''}`,
  }
}

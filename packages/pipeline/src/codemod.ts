/**
 * Structural codemods for grounded ink actions: delete / move / swap resolved
 * to exact AST sites and applied as text edits — zero model calls.
 *
 * Every one of these arrives with a verified stamp, and most reduce to "remove
 * or reorder a JSX child / array entry". Spending an agent session (system
 * prompt + tool schemas re-read every turn, Read/Grep to find what the stamp
 * already names) on that is where ink runs burned 100k+ tokens. Anything this
 * module can't resolve unambiguously is refused with a reason and goes to the
 * agent exactly as before — refusal is cheap, a wrong structural edit is not.
 *
 * All edits in a run are planned against the ORIGINAL text (stamps are
 * positional: the first edit to a file would stale every later one), checked
 * for overlap, and re-parsed before anything is written.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { GroundedAction, GroundedTarget } from './intent2.js'
import { reorderRanges, resolveArrayLiteral } from './manipulate.js'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface CodemodPlan {
  /** Post-edit source per root-relative file. Nothing is written yet. */
  files: Map<string, string>
  handled: Array<{ index: number; file: string; change: string }>
  refused: Array<{ index: number; reason: string }>
}

/**
 * Where an element lives in source, as something we can remove or reorder:
 * one JSX child among its siblings, or one entry of a same-file data array
 * that a `.map()` renders.
 */
type Site =
  | { kind: 'jsx'; file: string; container: number; siblings: t.JSXElement[]; index: number }
  | { kind: 'entry'; file: string; container: number; array: t.ArrayExpression; name: string; index: number }

interface Parsed {
  code: string
  ast: t.File
}

interface TextEdit {
  start: number
  end: number
  text: string
  actions: number[]
}

const STRUCTURAL = new Set(['delete', 'move', 'swap'])

export function planStructuralEdits(
  root: string,
  actions: GroundedAction[],
  snap: DomSnapshot,
): CodemodPlan {
  const plan: CodemodPlan = { files: new Map(), handled: [], refused: [] }
  const parsed = new Map<string, Parsed | null>()
  const load = (rel: string): Parsed | null => {
    if (!parsed.has(rel)) {
      const abs = resolve(root, rel)
      let entry: Parsed | null = null
      if (abs.startsWith(resolve(root))) {
        try {
          const code = readFileSync(abs, 'utf8')
          entry = { code, ast: parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) }
        } catch { /* unreadable or unparseable: every site in it refuses */ }
      }
      parsed.set(rel, entry)
    }
    return parsed.get(rel)!
  }

  const refuse = (index: number, reason: string) => plan.refused.push({ index, reason })

  // a truncated walk can't count instances, and instance counts are what make
  // a .map() delete target one entry instead of all of them
  if (snap.truncated) {
    actions.forEach((a, i) => { if (STRUCTURAL.has(a.kind)) refuse(i, 'DOM snapshot was truncated') })
    return plan
  }

  const ctx: ResolveCtx = { root, snap, load }
  const edits = new Map<string, TextEdit[]>()
  const addEdit = (file: string, e: TextEdit) => {
    const list = edits.get(file) ?? []
    list.push(e)
    edits.set(file, list)
  }
  const changes = new Map<number, { file: string; change: string }[]>()
  const note = (index: number, file: string, change: string) => {
    const list = changes.get(index) ?? []
    list.push({ file, change })
    changes.set(index, list)
  }
  // entry deletes are grouped per array: two deleted neighbours would
  // otherwise produce overlapping separator edits
  const entryDeletes = new Map<string, { site: Extract<Site, { kind: 'entry' }>; indices: Set<number>; actions: Set<number> }>()

  for (const [i, a] of actions.entries()) {
    if (!STRUCTURAL.has(a.kind)) continue
    const sites: Site[] = []
    let failed: string | null = null
    for (const target of a.targets) {
      const s = resolveSite(ctx, target)
      if (typeof s === 'string') { failed = s; break }
      sites.push(s)
    }
    if (failed) { refuse(i, failed); continue }

    if (a.kind === 'delete') {
      for (const site of sites) {
        if (site.kind === 'entry') {
          const key = `${site.file}@${site.container}`
          const group = entryDeletes.get(key) ?? { site, indices: new Set(), actions: new Set() }
          group.indices.add(site.index)
          group.actions.add(i)
          entryDeletes.set(key, group)
          note(i, site.file, `removed '${site.name}' entry ${site.index + 1}`)
        } else {
          const { code } = load(site.file)!
          const el = site.siblings[site.index]!
          addEdit(site.file, { ...ownLineRange(code, el.start!, el.end!), text: '', actions: [i] })
          note(i, site.file, `removed <${jsxName(el)}> (child ${site.index + 1})`)
        }
      }
      continue
    }

    if (a.kind === 'swap') {
      const [x, y] = sites as [Site, Site]
      if (!sameContainer(x, y)) { refuse(i, 'swap targets are not siblings in one container'); continue }
      if (x.index === y.index) { refuse(i, 'swap targets resolve to the same source node'); continue }
      const { code } = load(x.file)!
      const [lo, hi] = x.index < y.index ? [x, y] : [y, x]
      const a0 = rangeOf(lo)
      const b0 = rangeOf(hi)
      addEdit(x.file, {
        start: a0.start,
        end: b0.end,
        text: code.slice(b0.start, b0.end) + code.slice(a0.end, b0.start) + code.slice(a0.start, a0.end),
        actions: [i],
      })
      note(i, x.file, `swapped ${describe(lo)} ↔ ${describe(hi)}`)
      continue
    }

    // move
    if (sites.length !== 1 || !a.dest) { refuse(i, 'move needs exactly one source and a destination'); continue }
    if (a.position !== 'before' && a.position !== 'after') {
      refuse(i, `move position '${a.position ?? 'none'}' is not a sibling reorder`)
      continue
    }
    const dest = resolveSite(ctx, a.dest)
    if (typeof dest === 'string') { refuse(i, `destination: ${dest}`); continue }
    const src = sites[0]!
    if (!sameContainer(src, dest)) { refuse(i, 'source and destination are not siblings in one container'); continue }
    const from = src.index
    const d = dest.index
    const to = a.position === 'after' ? (from < d ? d : d + 1) : (from < d ? d - 1 : d)
    if (from === to) {
      note(i, src.file, `${describe(src)} already ${a.position} ${describe(dest)}`)
      continue
    }
    const ranges = siblingRanges(src)
    const { code } = load(src.file)!
    const moved = reorderRanges(code, ranges, from, to)
    const start = ranges[0]!.start
    const end = ranges[ranges.length - 1]!.end
    // reorderRanges rewrites the sibling run in place (same total length);
    // keep only that slice so it composes with other edits to the file
    addEdit(src.file, { start, end, text: moved.slice(start, end), actions: [i] })
    note(i, src.file, `moved ${describe(src)} ${a.position} ${describe(dest)}`)
  }

  for (const { site, indices, actions: acts } of entryDeletes.values()) {
    const { code } = load(site.file)!
    addEdit(site.file, { ...deleteEntries(code, site.array, indices), actions: [...acts] })
  }

  // commit per file: an overlap or a parse failure hands every action that
  // touched the file back to the agent — partial structural edits to one
  // file are not worth reasoning about
  const blocked = new Map<number, string>()
  const next = new Map<string, string>()
  for (const [file, list] of edits) {
    const sorted = [...list].sort((p, q) => p.start - q.start)
    let reason: string | null = null
    if (sorted.some((e, k) => k > 0 && e.start < sorted[k - 1]!.end)) {
      reason = `conflicting structural edits in ${file}`
    } else {
      let code = load(file)!.code
      for (const e of [...sorted].reverse()) code = code.slice(0, e.start) + e.text + code.slice(e.end)
      try {
        parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
        next.set(file, code)
      } catch (err) {
        reason = `edit to ${file} would not parse (${err instanceof Error ? err.message : String(err)})`
      }
    }
    if (reason) for (const e of list) for (const idx of e.actions) if (!blocked.has(idx)) blocked.set(idx, reason)
  }
  // an action spanning several files must not half-land: dropping one of its
  // files blocks every other action sharing those files, until stable
  for (let changed = true; changed;) {
    changed = false
    for (const [file, list] of edits) {
      if (!next.has(file) || !list.some((e) => e.actions.some((idx) => blocked.has(idx)))) continue
      next.delete(file)
      changed = true
      for (const e of list) {
        for (const idx of e.actions) if (!blocked.has(idx)) blocked.set(idx, `shares ${file} with an edit that was refused`)
      }
    }
  }

  plan.files = next
  for (const [index, reason] of blocked) refuse(index, reason)
  for (const [index, list] of changes) {
    if (!blocked.has(index)) plan.handled.push({ index, file: list[0]!.file, change: list.map((c) => c.change).join('; ') })
  }
  plan.handled.sort((p, q) => p.index - q.index)
  plan.refused.sort((p, q) => p.index - q.index)
  return plan
}

export function commitPlan(root: string, plan: CodemodPlan): string[] {
  for (const [rel, code] of plan.files) writeFileSync(resolve(root, rel), code)
  return [...plan.files.keys()]
}

// ---------- site resolution ----------

interface ResolveCtx {
  root: string
  snap: DomSnapshot
  load: (rel: string) => Parsed | null
}

function splitLoc(srcLoc: string): { file: string; line: number; col: number } | null {
  const m = /^(.+):(\d+):(\d+)$/.exec(srcLoc)
  return m ? { file: m[1]!, line: Number(m[2]), col: Number(m[3]) } : null
}

function elementAt(ast: t.File, line: number, col: number): NodePath<t.JSXElement> | null {
  let found: NodePath<t.JSXElement> | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === line && loc.start.column + 1 === col) {
        found = path.parentPath as NodePath<t.JSXElement>
      }
    },
  })
  return found
}

function resolveSite(ctx: ResolveCtx, target: GroundedTarget): Site | string {
  // the grounded srcLoc may be borrowed from an ancestor (nearestSourced);
  // only the element's OWN stamp says which node the user marked
  const node = ctx.snap.nodes.find((n) => n.id === target.domId)
  if (!node?.srcLoc) return `<${target.tag}> has no source stamp of its own`
  const loc = splitLoc(node.srcLoc)
  if (!loc) return `bad srcLoc "${node.srcLoc}"`
  const src = ctx.load(loc.file)
  if (!src) return `cannot read or parse ${loc.file}`
  const el = elementAt(src.ast, loc.line, loc.col)
  if (!el) return `no JSX element at ${node.srcLoc} (stale stamp?)`

  const instances = ctx.snap.nodes.filter((n) => n.srcLoc === node.srcLoc)
  const parent = el.parentPath

  const call = mapCallOf(el)
  if (call) {
    const c = call.node
    const name = ((c.callee as t.MemberExpression).object as t.Identifier).name
    const arr = resolveArrayLiteral(call, name)
    if (!arr) return `'${name}' is not a same-file array literal`
    if (arr.elements.some((e) => !e || e.type === 'SpreadElement')) return `'${name}' has holes or spreads`
    if (arr.elements.length !== instances.length) {
      return `DOM shows ${instances.length} instances but '${name}' has ${arr.elements.length} entries`
    }
    return {
      kind: 'entry', file: loc.file, container: arr.start!, array: arr, name,
      index: instances.findIndex((n) => n.id === node.id),
    }
  }

  if (instances.length !== 1) {
    return `<${jsxName(el.node)}> renders ${instances.length} times from one template — editing it would hit every instance`
  }

  if (parent?.isJSXElement() || parent?.isJSXFragment()) {
    const siblings = parent.node.children.filter((k): k is t.JSXElement => k.type === 'JSXElement')
    return { kind: 'jsx', file: loc.file, container: parent.node.start!, siblings, index: siblings.indexOf(el.node) }
  }

  if (isFunctionRoot(el)) return callSite(ctx, node, loc.file)
  return `<${jsxName(el.node)}> is rendered conditionally or through an expression`
}

/** `NAME.map(cb)` when `el` is exactly what the callback returns. */
function mapCallOf(el: NodePath<t.JSXElement>): NodePath<t.CallExpression> | null {
  const fn = functionReturning(el)
  const call = fn?.parentPath
  if (!fn || !call?.isCallExpression()) return null
  const c = call.node
  if (c.arguments[0] !== fn.node) return null
  const callee = c.callee
  if (
    callee.type !== 'MemberExpression' || callee.computed ||
    callee.property.type !== 'Identifier' || callee.property.name !== 'map' ||
    callee.object.type !== 'Identifier'
  ) return null
  return call
}

/** The function whose unconditional result is `el` (arrow body or top-level return). */
function functionReturning(el: NodePath<t.JSXElement>): NodePath | null {
  const p = el.parentPath
  if (p?.isArrowFunctionExpression() && p.node.body === el.node) return p
  if (p?.isReturnStatement()) {
    const block = p.parentPath
    const fn = block?.parentPath
    if (block?.isBlockStatement() && fn && (fn.isFunction())) return fn
  }
  return null
}

const isFunctionRoot = (el: NodePath<t.JSXElement>): boolean => functionReturning(el) !== null

/**
 * A component's root element is stamped in the component's own file, but the
 * thing to remove or reorder is its call site. Find it through the DOM parent:
 * its JSX children must map 1:1 onto its DOM children, and the call site's
 * component must actually be defined in the root's file.
 */
function callSite(ctx: ResolveCtx, node: DomNode, rootFile: string): Site | string {
  const parentNode = ctx.snap.nodes.find((n) => n.id === node.parent)
  if (!parentNode?.srcLoc) return 'component root whose parent has no source stamp'
  if (ctx.snap.nodes.filter((n) => n.srcLoc === parentNode.srcLoc).length !== 1) {
    return 'component is rendered inside a repeated template'
  }
  const loc = splitLoc(parentNode.srcLoc)
  if (!loc) return `bad srcLoc "${parentNode.srcLoc}"`
  const src = ctx.load(loc.file)
  if (!src) return `cannot read or parse ${loc.file}`
  const pel = elementAt(src.ast, loc.line, loc.col)
  if (!pel) return `no JSX element at ${parentNode.srcLoc} (stale stamp?)`

  const kids = pel.node.children.filter((k) => !(k.type === 'JSXText' && k.value.trim() === ''))
  if (kids.some((k) => k.type !== 'JSXElement')) return 'component is rendered among dynamic children'
  const siblings = kids as t.JSXElement[]
  const domKids = ctx.snap.nodes.filter((n) => n.parent === parentNode.id)
  if (domKids.length !== siblings.length) {
    return `call site's ${siblings.length} JSX children don't map 1:1 onto ${domKids.length} rendered children`
  }
  const index = domKids.findIndex((n) => n.id === node.id)
  const site = siblings[index]!
  const name = site.openingElement.name
  if (name.type !== 'JSXIdentifier') return 'call site is not a plain component reference'

  const binding = pel.scope.getBinding(name.name)
  const decl = binding?.path.parentPath?.node
  if (binding?.kind === 'module' && decl?.type === 'ImportDeclaration') {
    const spec = decl.source.value
    if (!spec.startsWith('.')) return `<${name.name}> is imported from a package`
    const imported = resolve(dirname(resolve(ctx.root, loc.file)), spec)
    const actual = resolve(ctx.root, rootFile).replace(/\.[jt]sx?$/, '')
    if (imported !== actual && `${imported}/index` !== actual) {
      return `<${name.name}> at the call site is not the component in ${rootFile}`
    }
  } else if (!binding || loc.file !== rootFile) {
    return `cannot confirm <${name.name}> is the component in ${rootFile}`
  }
  return { kind: 'jsx', file: loc.file, container: pel.node.start!, siblings, index }
}

// ---------- text edits ----------

const sameContainer = (a: Site, b: Site): boolean =>
  a.kind === b.kind && a.file === b.file && a.container === b.container

function siblingRanges(site: Site): Array<{ start: number; end: number }> {
  const nodes = site.kind === 'entry' ? (site.array.elements as t.Expression[]) : site.siblings
  return nodes.map((n) => ({ start: n.start!, end: n.end! }))
}

const rangeOf = (site: Site) => siblingRanges(site)[site.index]!

const describe = (site: Site): string =>
  site.kind === 'entry'
    ? `'${site.name}' entry ${site.index + 1}`
    : `<${jsxName(site.siblings[site.index]!)}>`

function jsxName(el: t.JSXElement): string {
  const n = el.openingElement.name
  return n.type === 'JSXIdentifier' ? n.name : 'element'
}

/** Widen a removal to its whole line(s) when the node sits alone on them. */
function ownLineRange(code: string, start: number, end: number): { start: number; end: number } {
  let s = start
  while (s > 0 && (code[s - 1] === ' ' || code[s - 1] === '\t')) s--
  let e = end
  while (e < code.length && (code[e] === ' ' || code[e] === '\t')) e++
  const alone = (s === 0 || code[s - 1] === '\n') && (e === code.length || code[e] === '\n' || code[e] === '\r')
  if (!alone) return { start, end }
  if (code[e] === '\r') e++
  if (code[e] === '\n') e++
  return { start: s, end: e }
}

/**
 * Remove entries from an array literal, keeping each survivor's original
 * trailing separator so indentation and trailing-comma style carry over.
 */
function deleteEntries(code: string, arr: t.ArrayExpression, drop: Set<number>): { start: number; end: number; text: string } {
  const els = arr.elements as t.Expression[]
  const kept = els.map((_, k) => k).filter((k) => !drop.has(k))
  if (kept.length === 0) return { start: arr.start! + 1, end: arr.end! - 1, text: '' }
  let text = ''
  kept.forEach((k, m) => {
    text += code.slice(els[k]!.start!, els[k]!.end!)
    if (m < kept.length - 1) text += code.slice(els[k]!.end!, els[k + 1]!.start!)
  })
  return { start: els[0]!.start!, end: els[els.length - 1]!.end!, text }
}

/**
 * Extract a component by pointing at it.
 *
 * "These three things belong together" is a thought people have while LOOKING
 * at a page, and then have to re-express by finding the file, selecting the
 * right lines, cutting them, naming a function, working out which variables
 * came from outside, and threading them back as props. The drawing gesture —
 * circle them — says it perfectly, and every part of the mechanical half is
 * decidable from the AST.
 *
 * So this takes the source locations the overlay already knows (every JSX host
 * element carries its own file:line:col) and performs the refactor: move the
 * selected siblings into a new component, work out which identifiers they
 * depend on from the surrounding scope, pass those as props, and leave a call
 * site behind.
 *
 * It refuses rather than guesses. Elements from different files, or from
 * different parents, or that are not siblings, are not a component — they are
 * a selection someone made by accident, and quietly inventing a wrapper for
 * them would be worse than saying no.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface ExtractRequest {
  /** data-s2c stamps of the elements to extract, any order. */
  srcLocs: string[]
  /** Component name; defaults to something neutral. */
  name?: string
}

export interface ExtractResult {
  ok: boolean
  /** New component file, relative to the app root. */
  file?: string
  name?: string
  /** File the call site now lives in. */
  from?: string
  /** Identifiers the extracted JSX needed from its old scope. */
  props?: string[]
  error?: string
}

const IDENT = /^[A-Za-z_$][\w$]*$/

/** PascalCase, valid identifier, never colliding with an existing file. */
function componentName(raw: string | undefined, dir: string, root: string): string {
  const base = (raw ?? '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')
  let name = IDENT.test(base) && /^[A-Z]/.test(base) ? base : 'Extracted'
  let n = 2
  while (existsSync(join(root, dir, `${name}.tsx`))) {
    name = `${name.replace(/\d+$/, '')}${n++}`
  }
  return name
}

export function extractComponent(root: string, req: ExtractRequest): ExtractResult {
  const locs = [...new Set(req.srcLocs ?? [])]
  if (locs.length === 0) return { ok: false, error: 'nothing selected' }

  const parsed = locs.map((l) => /^(.+):(\d+):(\d+)$/.exec(l))
  if (parsed.some((m) => !m)) return { ok: false, error: 'a selection has a malformed source location' }
  const files = new Set(parsed.map((m) => m![1]!))
  if (files.size > 1) {
    return { ok: false, error: `those elements live in ${String(files.size)} different files — extract from one at a time` }
  }
  const rel = [...files][0]!
  const abs = resolve(root, rel)
  if (!abs.startsWith(resolve(root))) return { ok: false, error: 'selection escapes the app root' }

  let code: string
  try {
    code = readFileSync(abs, 'utf8')
  } catch {
    return { ok: false, error: `cannot read ${rel}` }
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return { ok: false, error: `cannot parse ${rel}` }
  }

  // ── find the selected elements ──
  const wanted = new Map<string, NodePath<t.JSXElement>>()
  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const loc = path.node.loc
      if (!loc) return
      const key = `${rel}:${String(loc.start.line)}:${String(loc.start.column + 1)}`
      if (locs.includes(key)) wanted.set(key, path.parentPath as NodePath<t.JSXElement>)
    },
  })
  const missing = locs.filter((l) => !wanted.has(l))
  if (missing.length) return { ok: false, error: `no element at ${missing[0]!} (stale stamp?)` }

  const picked = [...wanted.values()]
  // ── they must be siblings, or this is not a component ──
  const parent = picked[0]!.parentPath
  if (!parent || !picked.every((p) => p.parentPath === parent)) {
    return { ok: false, error: 'those elements are not siblings — select things that sit side by side' }
  }
  const container = parent.node as t.JSXElement | t.JSXFragment
  if (container.type !== 'JSXElement' && container.type !== 'JSXFragment') {
    return { ok: false, error: 'the selection is not inside a JSX container' }
  }
  const siblings = container.children.filter((c): c is t.JSXElement => c.type === 'JSXElement')
  const indices = picked.map((p) => siblings.indexOf(p.node)).sort((a, b) => a - b)
  if (indices.some((i) => i < 0)) return { ok: false, error: 'the selection is nested, not a set of siblings' }
  // contiguity keeps the surrounding JSX intact: a gap would mean moving
  // elements PAST siblings that stay, which changes render order
  if (indices[indices.length - 1]! - indices[0]! !== indices.length - 1) {
    return { ok: false, error: 'those elements have others between them — select a contiguous run' }
  }
  const ordered = indices.map((i) => siblings[i]!)

  // ── what do they need from the scope they are leaving? ──
  const owner = picked[0]!.getFunctionParent()
  const props = new Set<string>()
  for (const p of picked) {
    p.traverse({
      Identifier(id: NodePath<t.Identifier>) {
        const name = id.node.name
        // only real references: not property keys, not JSX attribute names
        if (!id.isReferencedIdentifier()) return
        const binding = id.scope.getBinding(name)
        if (!binding) return // a global, or an import that moves with us
        // bound inside the selection itself: travels with the JSX
        if (binding.path.findParent((q) => q === p)) return
        // bound outside the component entirely (module scope: imports,
        // constants): the new file can import or re-declare it, and treating
        // it as a prop would be noise
        if (!owner || !binding.path.findParent((q) => q === owner)) return
        props.add(name)
      },
      JSXIdentifier(id: NodePath<t.JSXIdentifier>) {
        // <Card /> where Card is a local component
        const name = id.node.name
        if (!/^[A-Z]/.test(name)) return
        if (id.parentPath?.isJSXClosingElement()) return
        const binding = id.scope.getBinding(name)
        if (!binding || !owner) return
        if (!binding.path.findParent((q) => q === owner)) return
        props.add(name)
      },
    })
  }

  // ── module-scope things the new file needs: imports it references ──
  const moduleDeps = new Set<string>()
  for (const p of picked) {
    p.traverse({
      Identifier(id: NodePath<t.Identifier>) {
        if (!id.isReferencedIdentifier()) return
        const binding = id.scope.getBinding(id.node.name)
        if (binding?.kind === 'module') moduleDeps.add(id.node.name)
      },
      JSXIdentifier(id: NodePath<t.JSXIdentifier>) {
        const binding = id.scope.getBinding(id.node.name)
        if (binding?.kind === 'module') moduleDeps.add(id.node.name)
      },
    })
  }

  // ── build the new component ──
  const dir = /\/components$/.test(dirname(rel)) ? dirname(rel) : join(dirname(rel), 'components')
  const name = componentName(req.name, dir, root)
  const propList = [...props].sort()

  const start = ordered[0]!.start!
  const end = ordered[ordered.length - 1]!.end!
  const body = code.slice(start, end)
  const indented = body.split('\n').map((l, i) => (i === 0 ? l : `    ${l}`)).join('\n')
  const wrapped = ordered.length > 1 ? `<>\n      ${indented}\n    </>` : indented

  const imports = [...moduleDeps].sort().map((d) => importFor(code, d, abs, join(root, dir))).filter(Boolean)
  const signature = propList.length
    ? `({ ${propList.join(', ')} }: { ${propList.map((p) => `${p}: any`).join('; ')} })`
    : '()'
  const newFile =
    (imports.length ? `${imports.join('\n')}\n\n` : '') +
    (propList.length
      // the types are placeholders on purpose: what these actually are lives
      // in the call site's own types, and guessing narrower would be wrong
      ? `// props lifted from the original scope — tighten these types when you know them\n`
      : '') +
    `export default function ${name}${signature} {\n` +
    `  return (\n    ${wrapped}\n  )\n}\n`

  const newAbs = join(root, dir, `${name}.tsx`)
  try {
    parse(newFile, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, error: `the extracted component would not parse (${String(err)})` }
  }

  // ── replace the original with a call site ──
  const attrs = propList.map((p) => ` ${p}={${p}}`).join('')
  const callSite = `<${name}${attrs} />`
  const spec = relative(dirname(abs), newAbs).replace(/\\/g, '/').replace(/\.tsx?$/, '')
  const importLine = `import ${name} from '${spec.startsWith('.') ? spec : `./${spec}`}'\n`
  const lastImport = [...code.matchAll(/^import [^\n]*\n/gm)].pop()
  const at = lastImport ? lastImport.index! + lastImport[0].length : 0

  // replace first (higher offset), then insert the import
  const replaced = code.slice(0, start) + callSite + code.slice(end)
  const next = replaced.slice(0, at) + importLine + replaced.slice(at)
  try {
    parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, error: `the edit would not parse (${String(err)})` }
  }

  mkdirSync(dirname(newAbs), { recursive: true })
  writeFileSync(newAbs, newFile)
  writeFileSync(abs, next)
  return { ok: true, file: join(dir, `${name}.tsx`), name, from: rel, props: propList }
}

/** Re-point an import from the old file's directory to the new one's. */
function importFor(code: string, local: string, fromAbs: string, toDir: string): string {
  const re = new RegExp(`^import\\s+(?:([\\w$]+)|\\{[^}]*\\b${local}\\b[^}]*\\})[^\\n]*from\\s+['"]([^'"]+)['"]`, 'm')
  const m = re.exec(code)
  if (!m) return ''
  const line = m[0]
  const spec = m[2]!
  if (!spec.startsWith('.')) return line // a package: same specifier everywhere
  const abs = resolve(dirname(fromAbs), spec)
  const next = relative(toDir, abs).replace(/\\/g, '/')
  return line.replace(spec, next.startsWith('.') ? next : `./${next}`)
}

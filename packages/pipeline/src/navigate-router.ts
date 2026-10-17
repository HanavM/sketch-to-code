/**
 * Draw a link in an app that already uses react-router (s2c-041).
 *
 * navigate.ts writes hash screens for apps with no router and refuses apps
 * that have one, because their routes are the truth about their screens. Most
 * Vite + React apps past a starter do have one, so the arrow failed exactly
 * where it would be used. This writes into react-router's own route table.
 *
 * Same contract as linkToScreen: the model says which button and what the
 * screen is called; this decides everything else the same way every time,
 * plans every write before making any, and refuses in plain words with
 * nothing changed when the app's shape isn't one it can read.
 *
 * Decisions (docs/navigation.md has the long form):
 *
 * - **Which table.** Exactly one place in src/ that lists the routes:
 *   `createBrowserRouter/createHashRouter/createMemoryRouter([...])` or
 *   `useRoutes([...])` (the array inline, or a `const` in the same file), or a
 *   JSX `<Routes>` with `<Route>` children, or
 *   `createRoutesFromElements(<Route>…)`. None, or two, is refused: guessing
 *   between two route lists is how a page ends up on the wrong one.
 * - **Where in it.** Beside the home page: the shallowest list holding an
 *   index route or a `/` page. In a layout app that is the layout's children,
 *   so the new screen keeps the app's nav bar and footer, like every other
 *   page the user already has. No home page found: the top of the table.
 * - **The path** is the slug under that list's parent paths. A path that
 *   already exists only gets the link (two buttons can open one screen).
 * - **The screen file** goes in `src/pages/` if the app has one (its own
 *   convention), else `src/screens/`. Its "← Back" goes back when the user
 *   came from inside the app (react-router keeps an `idx` in history.state)
 *   and home when they opened the page directly — exact, unlike the hash
 *   version's counter.
 * - **The trigger.** `<a href="#">` becomes `<Link to="/pricing">`. A button
 *   gets `onClick={() => navigate('/pricing')}`, with `const navigate =
 *   useNavigate()` at the top of its component. A button in the component that
 *   renders the router itself can't call that hook, so it's refused.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import { importAnchor } from './imports.js'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

const parseTs = (code: string): ReturnType<typeof parse> =>
  parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

export interface RouterLinkInput {
  root: string
  /** Repo-relative file of the trigger, its parsed opening element, and the file's text. */
  rel: string
  abs: string
  code: string
  open: NodePath<t.JSXOpeningElement>
  tag: 'a' | 'button'
  /** 'react-router-dom' or 'react-router', whichever the app depends on. */
  pkg: string
  slug: string
  component: string
  title: string
}

export interface RouterLinkResult {
  ok: boolean
  route?: string
  screenFile?: string
  screenAt?: string
  files?: string[]
  reused?: boolean
  title?: string
  change?: string
  error?: string
}

const ROUTER_PKGS = ['react-router-dom', 'react-router']
const ARRAY_FACTORIES = new Set(['createBrowserRouter', 'createHashRouter', 'createMemoryRouter', 'useRoutes'])
const HASH_MARKERS = /\b(createHashRouter|HashRouter)\b/

interface Edit { start: number; end: number; text: string }

/** One route as the table writes it. */
interface RouteInfo {
  path: string | null
  index: boolean
  /** Absolute path this route matches ('/' for an index under '/'). */
  full: string
  children: Container | null
  node: t.Node
}

/** A list of sibling routes: an array literal, or the <Route> children of a JSX element. */
interface Container {
  kind: 'array' | 'jsx'
  /** The array, or the JSX parent whose children are <Route>s. */
  node: t.ArrayExpression | t.JSXElement
  /** The absolute path the routes in it are relative to. */
  base: string
  top: boolean
  routes: RouteInfo[]
}

interface Table { file: string; abs: string; code: string; ast: ReturnType<typeof parse>; top: Container; hash?: boolean }

const joinPath = (base: string, p: string): string => {
  if (p.startsWith('/')) return p.replace(/\/+$/, '') || '/'
  const b = base.replace(/\/+$/, '')
  return `${b}/${p}`.replace(/\/+/g, '/').replace(/\/+$/, '') || '/'
}

// ───────────────────────── reading the table ─────────────────────────

const propNamed = (o: t.ObjectExpression, name: string): t.ObjectProperty | null => {
  for (const p of o.properties) {
    if (p.type === 'ObjectProperty' && !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === name) || (p.key.type === 'StringLiteral' && p.key.value === name))) return p
  }
  return null
}

const jsxAttr = (open: t.JSXOpeningElement, name: string): t.JSXAttribute | null => {
  for (const a of open.attributes) {
    if (a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name) return a
  }
  return null
}

const jsxName = (el: t.JSXElement): string | null => {
  const n = el.openingElement.name
  return n.type === 'JSXIdentifier' ? n.name : null
}

function readArray(arr: t.ArrayExpression, base: string, top: boolean): Container {
  const c: Container = { kind: 'array', node: arr, base, top, routes: [] }
  for (const el of arr.elements) {
    if (!el || el.type !== 'ObjectExpression') continue
    const pathProp = propNamed(el, 'path')
    const path = pathProp?.value.type === 'StringLiteral' ? pathProp.value.value : null
    const idx = propNamed(el, 'index')
    const index = !!idx && idx.value.type === 'BooleanLiteral' && idx.value.value
    const full = path != null ? joinPath(base, path) : base
    const kids = propNamed(el, 'children')
    const children = kids?.value.type === 'ArrayExpression' ? readArray(kids.value, full, false) : null
    c.routes.push({ path, index, full, children, node: el })
  }
  return c
}

function readJsx(parent: t.JSXElement, base: string, top: boolean, only?: t.JSXElement): Container {
  const c: Container = { kind: 'jsx', node: parent, base, top, routes: [] }
  const kids = only ? [only] : parent.children.filter((k): k is t.JSXElement => k.type === 'JSXElement' && jsxName(k) === 'Route')
  for (const el of kids) {
    const pathAttr = jsxAttr(el.openingElement, 'path')
    const path = pathAttr?.value?.type === 'StringLiteral' ? pathAttr.value.value : null
    const idxAttr = jsxAttr(el.openingElement, 'index')
    const index = !!idxAttr && (idxAttr.value == null ||
      (idxAttr.value.type === 'JSXExpressionContainer' && idxAttr.value.expression.type === 'BooleanLiteral' && idxAttr.value.expression.value))
    const full = path != null ? joinPath(base, path) : base
    const hasKids = el.children.some((k) => k.type === 'JSXElement' && jsxName(k) === 'Route')
    const children = hasKids ? readJsx(el, full, false) : null
    c.routes.push({ path, index, full, children, node: el })
  }
  return c
}

/** A table passed by a name imported from another file: `createBrowserRouter(routes)`. */
interface ImportedRef { local: string; imported: string; source: string }

/** Every route table in one file. */
function tablesIn(ast: ReturnType<typeof parse>, refs: ImportedRef[] = []): Container[] {
  const found: Container[] = []
  const consts = new Map<string, t.ArrayExpression>()
  const imported = new Map<string, ImportedRef>()
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      const source = path.node.source.value
      if (!source.startsWith('.')) return
      for (const sp of path.node.specifiers) {
        if (sp.type === 'ImportSpecifier') {
          imported.set(sp.local.name, { local: sp.local.name, imported: sp.imported.type === 'Identifier' ? sp.imported.name : sp.imported.value, source })
        } else if (sp.type === 'ImportDefaultSpecifier') {
          imported.set(sp.local.name, { local: sp.local.name, imported: 'default', source })
        }
      }
    },
  })
  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      const { id, init } = path.node
      if (id.type === 'Identifier' && init) {
        const arr = init.type === 'TSAsExpression' || init.type === 'TSSatisfiesExpression' ? init.expression : init
        if (arr.type === 'ArrayExpression') consts.set(id.name, arr)
      }
    },
  })
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const callee = path.node.callee
      const name = callee.type === 'Identifier' ? callee.name
        : callee.type === 'MemberExpression' && callee.property.type === 'Identifier' ? callee.property.name : null
      if (!name) return
      const arg = path.node.arguments[0]
      if (ARRAY_FACTORIES.has(name)) {
        if (arg?.type === 'ArrayExpression') found.push(readArray(arg, '/', true))
        else if (arg?.type === 'Identifier' && consts.has(arg.name)) found.push(readArray(consts.get(arg.name)!, '/', true))
        else if (arg?.type === 'Identifier' && imported.has(arg.name)) refs.push(imported.get(arg.name)!)
        else if (arg?.type === 'CallExpression' && arg.callee.type === 'Identifier' && arg.callee.name === 'createRoutesFromElements') { /* read below */ }
        else found.push({ kind: 'array', node: { type: 'ArrayExpression', elements: [] } as unknown as t.ArrayExpression, base: '/', top: true, routes: [] })
      }
      if (name === 'createRoutesFromElements' && arg?.type === 'JSXElement' && jsxName(arg) === 'Route') {
        // a single root <Route>; its siblings would be ours to add beside — but
        // there is no parent element to add into, so the root's own children are
        // the top list when it is a pathless or '/' layout.
        found.push(readJsx(arg, '/', true, arg))
      }
    },
    JSXElement(path: NodePath<t.JSXElement>) {
      if (jsxName(path.node) === 'Routes') found.push(readJsx(path.node, '/', true))
    },
  })
  return found
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  let names: string[]
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.')) continue
    const p = join(dir, n)
    let s
    try { s = statSync(p) } catch { continue }
    if (s.isDirectory()) sourceFiles(p, out)
    else if (/\.[jt]sx?$/.test(n) && !/\.(test|spec|d)\.[jt]sx?$/.test(n)) out.push(p)
  }
  return out
}

/** The array an imported name refers to, read from the file it's exported from. */
function importedTable(fromAbs: string, ref: ImportedRef): Omit<Table, 'file'> | null {
  const base = resolve(dirname(fromAbs), ref.source)
  const abs = [base, ...['.tsx', '.ts', '.jsx', '.js'].map((e) => base + e), ...['.tsx', '.ts', '.jsx', '.js'].map((e) => join(base, 'index' + e))]
    .find((f) => existsSync(f) && statSync(f).isFile())
  if (!abs) return null
  const code = readFileSync(abs, 'utf8')
  let ast
  try { ast = parseTs(code) } catch { return null }
  let arr: t.ArrayExpression | null = null
  const unwrap = (n: t.Node | null | undefined): t.Node | null | undefined =>
    n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression') ? n.expression : n
  const local = new Map<string, t.ArrayExpression>()
  traverse(ast, {
    VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
      const init = unwrap(path.node.init)
      if (path.node.id.type === 'Identifier' && init?.type === 'ArrayExpression') local.set(path.node.id.name, init)
    },
  })
  traverse(ast, {
    ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
      const d = path.node.declaration
      if (d?.type === 'VariableDeclaration') {
        for (const v of d.declarations) {
          if (v.id.type === 'Identifier' && v.id.name === ref.imported) {
            const init = unwrap(v.init)
            if (init?.type === 'ArrayExpression') arr = init
          }
        }
      }
      for (const sp of path.node.specifiers) {
        if (sp.type === 'ExportSpecifier' && (sp.exported.type === 'Identifier' ? sp.exported.name : sp.exported.value) === ref.imported) {
          arr = local.get(sp.local.name) ?? arr
        }
      }
    },
    ExportDefaultDeclaration(path: NodePath<t.ExportDefaultDeclaration>) {
      if (ref.imported !== 'default') return
      const d = unwrap(path.node.declaration as t.Node)
      if (d?.type === 'ArrayExpression') arr = d
      else if (d?.type === 'Identifier') arr = local.get(d.name) ?? null
    },
  })
  if (!arr) return null
  return { abs, code, ast, top: readArray(arr, '/', true) }
}

export function findRouteTable(root: string): Table | { error: string } {
  const tables: Table[] = []
  for (const abs of sourceFiles(join(root, 'src'))) {
    const code = readFileSync(abs, 'utf8')
    if (!/\b(Routes|createBrowserRouter|createHashRouter|createMemoryRouter|useRoutes|createRoutesFromElements)\b/.test(code)) continue
    let ast
    try { ast = parseTs(code) } catch { continue }
    const refs: ImportedRef[] = []
    for (const top of tablesIn(ast, refs)) tables.push({ file: relative(root, abs).replace(/\\/g, '/'), abs, code, ast, top, hash: HASH_MARKERS.test(code) })
    for (const ref of refs) {
      const t2 = importedTable(abs, ref)
      if (t2) tables.push({ ...t2, file: relative(root, t2.abs).replace(/\\/g, '/'), hash: HASH_MARKERS.test(code) })
      else tables.push({ file: relative(root, abs).replace(/\\/g, '/'), abs, code, ast, top: { kind: 'array', node: { type: 'ArrayExpression', elements: [] } as unknown as t.ArrayExpression, base: '/', top: true, routes: [] } })
    }
  }
  if (tables.length === 0) {
    return { error: 'this app uses react-router, but I couldn\'t find its list of pages (a <Routes> block or createBrowserRouter([...]) in src/). Nothing was changed.' }
  }
  if (tables.length > 1) {
    const where = [...new Set(tables.map((x) => x.file))].join(' and ')
    return { error: `this app lists its pages in more than one place (${where}), and I won't guess which one a new page belongs in. Nothing was changed.` }
  }
  const only = tables[0]!
  if (only.top.routes.length === 0) {
    return { error: `this app's list of pages in ${only.file} is built in code (not written out route by route), so I can't add one to it safely. Nothing was changed.` }
  }
  return only
}

/** The shallowest list holding the home page; the top list when there's none. */
function homeList(top: Container): Container {
  const queue: Container[] = [top]
  while (queue.length) {
    const c = queue.shift()!
    if (c.routes.some((r) => (r.index || r.full === '/') && !r.children)) return c
    for (const r of c.routes) if (r.children) queue.push(r.children)
  }
  return top
}

function allRoutes(c: Container, out: RouteInfo[] = []): RouteInfo[] {
  for (const r of c.routes) {
    out.push(r)
    if (r.children) allRoutes(r.children, out)
  }
  return out
}

/** The line's leading whitespace at `pos`. */
const indentAt = (code: string, pos: number): string => {
  const ls = code.lastIndexOf('\n', pos - 1) + 1
  return /^[ \t]*/.exec(code.slice(ls))![0]
}

/** Where and what to insert for the new route in its list. */
function routeEdit(code: string, list: Container, path: string, el: string): Edit | { error: string } {
  const routes = list.routes
  const catchAll = routes.find((r) => r.path === '*')
  const anchor = catchAll ?? routes[routes.length - 1]
  if (!anchor || anchor.node.start == null || anchor.node.end == null) {
    return { error: 'the app\'s list of pages is empty where the new page would go, so I left it alone. Nothing was changed.' }
  }
  const ind = indentAt(code, anchor.node.start)
  const entry = list.kind === 'array'
    ? `{ path: '${path}', element: ${el} }`
    : `<Route path="${path}" element={${el}} />`
  const sep = list.kind === 'array' ? ',' : ''
  if (catchAll) {
    return { start: anchor.node.start, end: anchor.node.start, text: `${entry}${sep}\n${ind}` }
  }
  return { start: anchor.node.end, end: anchor.node.end, text: `${sep}\n${ind}${entry}` }
}

// ───────────────────────── imports ─────────────────────────

/**
 * The local name `name` is imported under from react-router(-dom), adding the
 * import when it isn't there. Returns the edit (or none) and the local name.
 */
function ensureNamedImport(code: string, ast: ReturnType<typeof parse>, pkg: string, name: string): { edit: Edit | null; local: string } {
  let local: string | null = null
  let into: t.ImportDeclaration | null = null
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      if (!ROUTER_PKGS.includes(path.node.source.value) || path.node.importKind === 'type') return
      for (const s of path.node.specifiers) {
        if (s.type === 'ImportSpecifier') {
          const imported = s.imported.type === 'Identifier' ? s.imported.name : s.imported.value
          if (imported === name) local = s.local.name
        }
      }
      if (!into && path.node.specifiers.some((s) => s.type === 'ImportSpecifier')) into = path.node
    },
  })
  if (local) return { edit: null, local }
  const decl = into as t.ImportDeclaration | null
  if (decl) {
    const named = decl.specifiers.filter((s) => s.type === 'ImportSpecifier')
    const last = named[named.length - 1]!
    return { edit: { start: last.end!, end: last.end!, text: `, ${name}` }, local: name }
  }
  const at = importAnchor(ast, code)
  const nl = at > 0 && code[at - 1] !== '\n' ? '\n' : ''
  return { edit: { start: at, end: at, text: `${nl}import { ${name} } from '${pkg}'\n` }, local: name }
}

function defaultImportEdit(code: string, ast: ReturnType<typeof parse>, local: string, spec: string): Edit {
  const at = importAnchor(ast, code)
  const nl = at > 0 && code[at - 1] !== '\n' ? '\n' : ''
  return { start: at, end: at, text: `${nl}import ${local} from '${spec}'\n` }
}

const apply = (code: string, edits: Edit[]): string =>
  edits.slice().sort((a, b) => b.start - a.start || b.end - a.end)
    .reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), code)

function specifierFor(fromDir: string, toAbs: string): string {
  const spec = relative(fromDir, toAbs).replace(/\\/g, '/').replace(/\.[jt]sx?$/, '').replace(/\/index$/, '')
  return spec.startsWith('.') ? spec : `./${spec}`
}

// ───────────────────────── the trigger ─────────────────────────

const isComponentName = (n: string | null | undefined): boolean => !!n && /^[A-Z]/.test(n)

/** The function component the trigger sits in: the nearest enclosing function named like a component. */
function enclosingComponent(open: NodePath<t.JSXOpeningElement>): NodePath<t.Function> | null {
  let p: NodePath | null = open.getFunctionParent()
  while (p) {
    const fn = p as NodePath<t.Function>
    const node = fn.node
    let name: string | null = null
    if (node.type === 'FunctionDeclaration') name = node.id?.name ?? (fn.parentPath?.isExportDefaultDeclaration() ? 'Default' : null)
    else {
      // const X = () => …, const X = memo(() => …), export default () => …
      let up: NodePath | null = fn.parentPath
      while (up && up.isCallExpression()) up = up.parentPath
      if (up?.isVariableDeclarator() && up.node.id.type === 'Identifier') name = up.node.id.name
      else if (up?.isExportDefaultDeclaration()) name = 'Default'
    }
    if (isComponentName(name)) return fn
    p = fn.getFunctionParent()
  }
  return null
}

/** Does this component render the router itself (so hooks in it run outside it)? */
function rendersRouter(fn: NodePath<t.Function>): boolean {
  let hit = false
  fn.traverse({
    JSXOpeningElement(p: NodePath<t.JSXOpeningElement>) {
      const n = p.node.name
      if (n.type === 'JSXIdentifier' && /^(BrowserRouter|HashRouter|MemoryRouter|RouterProvider|Router)$/.test(n.name)) hit = true
    },
  })
  return hit
}

function triggerEdits(
  inp: RouterLinkInput, ast: ReturnType<typeof parse>, full: string,
): Edit[] | { error: string } {
  const { code, open, tag, pkg } = inp
  const edits: Edit[] = []
  if (tag === 'a') {
    const { edit, local } = ensureNamedImport(code, ast, pkg, 'Link')
    if (edit) edits.push(edit)
    const node = open.node
    const nameNode = node.name
    edits.push({ start: nameNode.start!, end: nameNode.end!, text: local })
    const href = jsxAttr(node, 'href')
    if (href) edits.push({ start: href.start!, end: href.end!, text: `to="${full}"` })
    else edits.push({ start: nameNode.end!, end: nameNode.end!, text: ` to="${full}"` })
    const closing = (open.parentPath.node as t.JSXElement).closingElement
    if (closing) edits.push({ start: closing.name.start!, end: closing.name.end!, text: local })
    return edits
  }
  // a button: navigate() from the component's own hook
  const comp = enclosingComponent(open)
  if (!comp) {
    return { error: 'that button isn\'t inside a component I can read (a function whose name starts with a capital letter), so I can\'t make it open a page. Nothing was changed.' }
  }
  if (rendersRouter(comp)) {
    return { error: 'that button is in the same component that sets up the app\'s pages, where it can\'t open one. Draw the arrow from a button inside a page or the nav bar. Nothing was changed.' }
  }
  // reuse an existing `const x = useNavigate()` in that component
  let navName: string | null = null
  comp.traverse({
    VariableDeclarator(p: NodePath<t.VariableDeclarator>) {
      const init = p.node.init
      if (p.node.id.type === 'Identifier' && init?.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name.endsWith('useNavigate') &&
        p.getFunctionParent()?.node === comp.node) navName = p.node.id.name
    },
  })
  const { edit: imp, local: hook } = ensureNamedImport(code, ast, pkg, 'useNavigate')
  if (!navName) {
    navName = 'navigate'
    for (const cand of ['navigate', 'goTo', 'openPage']) {
      navName = cand
      if (!open.scope.hasBinding(cand)) break
    }
    if (open.scope.hasBinding(navName)) {
      return { error: 'that component already uses every name I\'d give the page opener, so I left it alone. Nothing was changed.' }
    }
    if (imp) edits.push(imp)
    const body = comp.node.body
    if (body.type === 'BlockStatement') {
      const first = body.body[0]
      const ind = first?.start != null ? indentAt(code, first.start) : '  '
      edits.push({ start: body.start! + 1, end: body.start! + 1, text: `\n${ind}const ${navName} = ${hook}()` })
    } else {
      // `() => (<nav>…</nav>)`: babel's body starts inside the parentheses, so
      // take them along, or the new block would open inside them
      const outer = indentAt(code, comp.node.start!)
      const ind = outer + '  '
      const extra = (body as { extra?: { parenthesized?: boolean; parenStart?: number } }).extra
      let start = body.start!
      let end = body.end!
      if (extra?.parenthesized && extra.parenStart != null) {
        start = extra.parenStart
        const close = code.indexOf(')', end)
        if (close < 0 || code.slice(end, close).trim() !== '') {
          return { error: 'I couldn\'t read where that component\'s body ends, so I left it alone. Nothing was changed.' }
        }
        end = close + 1
      }
      // two insertions, not one replace: the onClick edit lands between them
      edits.push({ start, end: start, text: `{\n${ind}const ${navName} = ${hook}()\n${ind}return ` })
      edits.push({ start: end, end, text: `\n${outer}}` })
    }
  }
  // the attribute, on its own line when the attributes are stacked
  const node = open.node
  const attr = `onClick={() => ${navName}('${full}')}`
  const first = node.attributes[0]
  if (first && first.start != null) {
    const ls = code.lastIndexOf('\n', first.start - 1) + 1
    const before = code.slice(ls, first.start)
    if (before.trim() === '') {
      edits.push({ start: first.start, end: first.start, text: `${attr}\n${before}` })
      return edits
    }
  }
  edits.push({ start: node.name.end!, end: node.name.end!, text: ` ${attr}` })
  return edits
}

// ───────────────────────── the screen ─────────────────────────

function screenSource(component: string, heading: string, tailwind: boolean, pkg: string): string {
  const cls = (c: string) => (tailwind ? ` className="${c}"` : '')
  return `import { useNavigate } from '${pkg}'

export default function ${component}() {
  const navigate = useNavigate()
  // back to where the user came from, or home when they opened this page directly
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'))
  return (
    <main${cls('mx-auto max-w-3xl px-6 py-12')}>
      <button type="button" onClick={goBack}${cls('text-sm underline')}>
        ← Back
      </button>
      <h1${cls('mt-6 text-3xl font-bold')}>${heading}</h1>
    </main>
  )
}
`
}

// ───────────────────────── the engine ─────────────────────────

export function linkToRouterScreen(inp: RouterLinkInput, tailwind: boolean): RouterLinkResult {
  const { root, slug, title } = inp
  const table = findRouteTable(root)
  if ('error' in table) return { ok: false, error: table.error }

  const list = homeList(table.top)
  const writtenPath = list.top ? `/${slug}` : slug
  const full = joinPath(list.base, slug)
  const hash = !!table.hash
  const route = hash ? `#${full}` : full

  const existing = allRoutes(table.top).find((r) => r.full === full && !r.children)
  const reused = !!existing

  const pagesDir = existsSync(join(root, 'src/pages')) && statSync(join(root, 'src/pages')).isDirectory() ? 'src/pages' : 'src/screens'
  const screenRel = `${pagesDir}/${inp.component}.tsx`
  const screenAbs = join(root, screenRel)
  if (!reused && existsSync(screenAbs)) {
    return { ok: false, error: `${screenRel} already exists, so I won't overwrite it. Give the new page a different name. Nothing was changed.` }
  }

  // ── plan every edit, per file, against each file's original text ──
  const perFile = new Map<string, { abs: string; code: string; edits: Edit[] }>()
  const editsFor = (rel: string, abs: string, code: string) => {
    if (!perFile.has(rel)) perFile.set(rel, { abs, code, edits: [] })
    return perFile.get(rel)!.edits
  }

  if (!reused) {
    let local = inp.component
    if (new RegExp(`\\b${local}\\b`).test(table.code)) local = `${inp.component}Page`
    if (new RegExp(`\\b${local}\\b`).test(table.code)) {
      return { ok: false, error: `${table.file} already uses the names ${inp.component} and ${inp.component}Page, so I left it alone. Nothing was changed.` }
    }
    const re = routeEdit(table.code, list, writtenPath, `<${local} />`)
    if ('error' in re) return { ok: false, error: re.error }
    const tEdits = editsFor(table.file, table.abs, table.code)
    tEdits.push(re)
    tEdits.push(defaultImportEdit(table.code, table.ast, local, specifierFor(dirname(table.abs), screenAbs)))
    if (list.kind === 'jsx') {
      const { edit } = ensureNamedImport(table.code, table.ast, inp.pkg, 'Route')
      if (edit) tEdits.push(edit)
    }
  }

  // the trigger: plan against the table's parse when it's the same file, so offsets agree
  const sameFile = resolve(inp.abs) === resolve(table.abs)
  const tAst = sameFile ? table.ast : parseTs(inp.code)
  let open = inp.open
  if (sameFile) {
    // re-find the opening element in the table's AST (same text, same offsets)
    const want = inp.open.node.start
    traverse(tAst, {
      JSXOpeningElement(p: NodePath<t.JSXOpeningElement>) { if (p.node.start === want) open = p },
    })
  }
  const trig = triggerEdits({ ...inp, open }, tAst, full)
  if (!Array.isArray(trig)) return { ok: false, error: trig.error }
  editsFor(inp.rel, inp.abs, inp.code).push(...trig)

  // ── write ──
  const writes: Array<{ abs: string; rel: string; text: string }> = []
  if (!reused) writes.push({ abs: screenAbs, rel: screenRel, text: screenSource(inp.component, title, tailwind, inp.pkg) })
  for (const [rel, f] of perFile) {
    // de-duplicate the same import planned twice (route + trigger in one file)
    const seen = new Set<string>()
    const edits = f.edits.filter((e) => {
      const k = `${e.start}:${e.end}:${e.text}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const merged = mergeImportEdits(edits)
    const text = apply(f.code, merged)
    try { parseTs(text) } catch (err) {
      return { ok: false, error: `the change to ${rel} wouldn't parse (${err instanceof Error ? err.message : String(err)}), so I left everything alone. Nothing was changed.` }
    }
    writes.push({ abs: f.abs, rel, text })
  }
  for (const w of writes) {
    mkdirSync(dirname(w.abs), { recursive: true })
    writeFileSync(w.abs, w.text)
  }
  const what = inp.tag === 'a' ? 'link' : 'button'
  const screenAt = reused ? undefined : screenRel
  return {
    ok: true,
    route,
    screenFile: screenAt,
    screenAt,
    title,
    files: writes.map((w) => w.rel),
    reused,
    change: reused
      ? `pointed the ${what} at the "${title}" page that was already there (${full})`
      : `added a "${title}" page (${screenRel}) to the app's pages in ${table.file} and made the ${what} open it (${full})`,
  }
}

/**
 * Two new `import { X } from 'react-router-dom'` lines planned at the same
 * spot (Route for the table, useNavigate for the trigger, one file) become one.
 */
function mergeImportEdits(edits: Edit[]): Edit[] {
  const re = /^(\n?)import \{ ([^}]+) \} from '([^']+)'\n$/
  const out: Edit[] = []
  for (const e of edits) {
    const m = re.exec(e.text)
    const prev = m ? out.find((o) => o.start === e.start && o.end === e.end && re.exec(o.text)?.[3] === m[3]) : undefined
    if (m && prev) {
      const pm = re.exec(prev.text)!
      const names = [...new Set([...pm[2]!.split(', '), ...m[2]!.split(', ')])]
      prev.text = `${pm[1]}import { ${names.join(', ')} } from '${m[3]}'\n`
      continue
    }
    out.push({ ...e })
  }
  return out
}

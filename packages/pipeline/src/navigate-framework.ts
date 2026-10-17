/**
 * Draw a link in a React Router framework-mode app (s2c-044).
 *
 * `npx create-react-router` scaffolds framework mode: no src/, no
 * createBrowserRouter, no <Routes>. The pages are listed in `app/routes.ts`
 * with route()/index()/layout()/prefix() from `@react-router/dev/routes`, or
 * found on disk by `flatRoutes()`. navigate-router.ts looks for a table in
 * src/ and refused these apps with a sentence pointing at a folder that
 * doesn't exist. This writes into routes.ts instead.
 *
 * Same contract as linkToRouterScreen: plan every write, then make them all;
 * refuse in plain words with nothing changed when the shape isn't readable.
 *
 * Decisions:
 *
 * - **Which app folder.** `appDirectory` from react-router.config.* when it's
 *   a plain string, else `app`. Framework mode = that folder has a routes.ts
 *   (or .tsx/.js/.jsx/.mjs) and the app depends on @react-router/dev or has a
 *   react-router.config.*.
 * - **The list.** routes.ts's default export: an array (inline, `satisfies`
 *   or `as` RouteConfig, or a const), or `flatRoutes()`. Anything else
 *   (a function call, a spread of one, a variable built in code) is refused:
 *   adding beside a list that's partly computed is how two pages end up on
 *   one address.
 * - **Where in it.** Beside the home page, as in navigate-router: the
 *   shallowest list holding index() or route('') / route('/'), so a page
 *   added in a layout() keeps the app's nav bar. The path is written relative
 *   (`route("pricing", …)`), which is how framework mode writes them.
 * - **The screen file** is `app/routes/<slug>.tsx`, the starter's own
 *   convention (`routes/home.tsx`): a route module whose default export is
 *   the page, with a `meta` title and an exact Back. With flatRoutes the file
 *   is the whole change: its name is its address.
 * - **The trigger** is navigate-router's: `<a href="#">` → `<Link>`, a button
 *   → `useNavigate()`, imported from react-router.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import type { NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import {
  type Edit, type RouterLinkInput, type RouterLinkResult,
  apply, indentAt, joinPath, mergeImportEdits, parseTs, traverse, triggerEdits,
} from './navigate-router.js'

const ROUTES_PKG = '@react-router/dev/routes'
const FS_ROUTES_PKG = '@react-router/fs-routes'
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs']

export interface FrameworkApp {
  /** Repo-relative app folder ('app'). */
  appDir: string
  /** Repo-relative routes file ('app/routes.ts'). */
  routesRel: string
}

const readJson = (p: string): Record<string, unknown> | null => {
  try { return JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown> } catch { return null }
}

/** The app folder and routes file when this is a framework-mode app, else null. */
export function frameworkApp(root: string): FrameworkApp | null {
  const config = ['react-router.config.ts', 'react-router.config.js', 'react-router.config.mjs']
    .map((f) => join(root, f)).find((f) => existsSync(f))
  const pkg = readJson(join(root, 'package.json'))
  const deps = { ...(pkg?.dependencies as object | undefined), ...(pkg?.devDependencies as object | undefined) }
  if (!config && !('@react-router/dev' in deps)) return null
  let appDir = 'app'
  if (config) {
    const m = /\bappDirectory\s*:\s*(['"`])([^'"`$]+)\1/.exec(readFileSync(config, 'utf8'))
    if (m) appDir = m[2]!.replace(/^\.\//, '').replace(/\/+$/, '')
  }
  const routes = EXTS.map((e) => `${appDir}/routes${e}`).find((f) => existsSync(join(root, f)))
  return routes ? { appDir, routesRel: routes } : null
}

// ───────────────────────── reading routes.ts ─────────────────────────

interface FRoute {
  kind: 'index' | 'route' | 'layout'
  /** The path as written ('' for index/layout). */
  path: string
  /** Absolute path it matches. */
  full: string
  /** The module file as written, relative to the app folder. */
  file: string | null
  children: FList | null
  node: t.CallExpression
  /** The list element itself when it sits directly in its list (not inside a ...prefix()). */
  at: t.Node | null
}

interface FList {
  node: t.ArrayExpression
  base: string
  routes: FRoute[]
  /** A spread or call it can't read sits in this list. */
  computed: boolean
}

const unwrap = (n: t.Node | null | undefined): t.Node | null | undefined =>
  n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression') ? unwrap(n.expression) : n

const str = (n: t.Node | null | undefined): string | null =>
  n?.type === 'StringLiteral' ? n.value
    : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0]!.value.cooked ?? null : null

/** Local name → helper ('route' | 'index' | 'layout' | 'prefix' | 'flatRoutes'). */
type Helpers = Map<string, string>

function readList(arr: t.ArrayExpression, base: string, helpers: Helpers): FList {
  const list: FList = { node: arr, base, routes: [], computed: false }
  for (const raw of arr.elements) {
    if (!raw) continue
    if (raw.type === 'SpreadElement') {
      // ...prefix("docs", [ ... ]): its routes are under base/docs, but there
      // is no list of its own to add beside here, so only read it for paths
      const call = unwrap(raw.argument)
      if (call?.type === 'CallExpression' && call.callee.type === 'Identifier' && helpers.get(call.callee.name) === 'prefix') {
        const p = str(call.arguments[0])
        const kids = unwrap(call.arguments[1] as t.Node)
        if (p != null && kids?.type === 'ArrayExpression') {
          const inner = readList(kids, joinPath(base, p), helpers)
          list.routes.push(...inner.routes.map((r) => ({ ...r, at: null })))
          if (inner.computed) list.computed = true
          continue
        }
      }
      list.computed = true
      continue
    }
    const el = unwrap(raw)
    if (el?.type !== 'CallExpression' || el.callee.type !== 'Identifier') { list.computed = true; continue }
    const kind = helpers.get(el.callee.name)
    const args = el.arguments.map((a) => unwrap(a as t.Node))
    const lastArray = (from: number): t.ArrayExpression | null => {
      for (let i = args.length - 1; i >= from; i--) if (args[i]?.type === 'ArrayExpression') return args[i] as t.ArrayExpression
      return null
    }
    if (kind === 'index') {
      list.routes.push({ kind: 'index', path: '', full: base, file: str(args[0]), children: null, node: el, at: raw })
    } else if (kind === 'route') {
      const p = str(args[0])
      if (p == null) { list.computed = true; continue }
      const full = joinPath(base, p)
      const kids = lastArray(2)
      list.routes.push({ kind: 'route', path: p, full, file: str(args[1]), children: kids ? readList(kids, full, helpers) : null, node: el, at: raw })
    } else if (kind === 'layout') {
      const kids = lastArray(1)
      list.routes.push({ kind: 'layout', path: '', full: base, file: str(args[0]), children: kids ? readList(kids, base, helpers) : null, node: el, at: raw })
    } else {
      list.computed = true
    }
  }
  return list
}

type Parsed =
  | { flat: false; list: FList; helpers: Helpers; ast: ReturnType<typeof parseTs> }
  | { flat: true; rootDirectory: string }
  | { error: string }

function readRoutesFile(code: string, routesRel: string): Parsed {
  let ast
  try { ast = parseTs(code) } catch {
    return { error: `I couldn't read ${routesRel} (it doesn't parse), so I left it alone. Nothing was changed.` }
  }
  const helpers: Helpers = new Map()
  const consts = new Map<string, t.Node>()
  let exported: t.Node | null | undefined = null
  traverse(ast, {
    ImportDeclaration(p: NodePath<t.ImportDeclaration>) {
      const src = p.node.source.value
      if (src !== ROUTES_PKG && src !== FS_ROUTES_PKG) return
      for (const sp of p.node.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.importKind === 'type') continue
        const imported = sp.imported.type === 'Identifier' ? sp.imported.name : sp.imported.value
        helpers.set(sp.local.name, imported)
      }
    },
    VariableDeclarator(p: NodePath<t.VariableDeclarator>) {
      if (p.node.id.type === 'Identifier' && p.parentPath.parentPath?.isProgram()) consts.set(p.node.id.name, unwrap(p.node.init) as t.Node)
    },
    ExportDefaultDeclaration(p: NodePath<t.ExportDefaultDeclaration>) {
      exported = unwrap(p.node.declaration as t.Node)
    },
  })
  let top = exported as t.Node | null | undefined
  if (top?.type === 'Identifier') top = consts.get(top.name)
  if (top?.type === 'AwaitExpression') top = unwrap(top.argument)
  const builtInCode = `the list of pages in ${routesRel} is built in code (not written out route by route), so I can't add one to it safely. Nothing was changed.`
  if (top?.type === 'CallExpression' && top.callee.type === 'Identifier' && helpers.get(top.callee.name) === 'flatRoutes') {
    const opts = unwrap(top.arguments[0] as t.Node)
    let rootDirectory = 'routes'
    if (opts?.type === 'ObjectExpression') {
      for (const pr of opts.properties) {
        if (pr.type === 'ObjectProperty' && pr.key.type === 'Identifier' && pr.key.name === 'rootDirectory') {
          const v = str(pr.value)
          if (v == null) return { error: builtInCode }
          rootDirectory = v.replace(/^\.\//, '').replace(/\/+$/, '')
        }
      }
    }
    return { flat: true, rootDirectory }
  }
  if (top?.type !== 'ArrayExpression') return { error: builtInCode }
  const list = readList(top, '/', helpers)
  if (list.computed && !list.routes.length) return { error: builtInCode }
  return { flat: false, list, helpers, ast }
}

/** The shallowest list holding the home page; the top list when there's none. */
function homeList(top: FList): FList {
  const queue: FList[] = [top]
  while (queue.length) {
    const c = queue.shift()!
    if (c.routes.some((r) => (r.kind === 'index' || (r.kind === 'route' && r.full === '/')) && !r.children)) return c
    for (const r of c.routes) if (r.children) queue.push(r.children)
  }
  return top
}

function allRoutes(c: FList, out: FRoute[] = []): FRoute[] {
  for (const r of c.routes) {
    out.push(r)
    if (r.children) allRoutes(r.children, out)
  }
  return out
}

/** The quote the file already uses for strings. */
const quoteOf = (code: string): string => {
  const d = (code.match(/"/g) ?? []).length
  const s = (code.match(/'/g) ?? []).length
  return d > s ? '"' : "'"
}

// ───────────────────────── the screen ─────────────────────────

function screenSource(component: string, heading: string, tailwind: boolean, pkg: string, q: string): string {
  const cls = (c: string) => (tailwind ? ` className="${c}"` : '')
  return `import { useNavigate } from ${q}${pkg}${q};

export function meta() {
  return [{ title: ${JSON.stringify(heading)} }];
}

export default function ${component}() {
  const navigate = useNavigate();
  // back to where the user came from, or home when they opened this page directly
  const goBack = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate(${q}/${q}));
  return (
    <main${cls('mx-auto max-w-3xl px-6 py-12')}>
      <button type="button" onClick={goBack}${cls('text-sm underline')}>
        ← Back
      </button>
      <h1${cls('mt-6 text-3xl font-bold')}>${heading}</h1>
    </main>
  );
}
`
}

// ───────────────────────── the engine ─────────────────────────

export function linkToFrameworkScreen(inp: RouterLinkInput, fw: FrameworkApp, tailwind: boolean): RouterLinkResult {
  const { root, slug, title } = inp
  const routesAbs = join(root, fw.routesRel)
  const routesCode = readFileSync(routesAbs, 'utf8')
  const parsed = readRoutesFile(routesCode, fw.routesRel)
  if ('error' in parsed) return { ok: false, error: parsed.error }
  const q = quoteOf(routesCode)

  let full: string
  let reused = false
  let screenRel: string
  const tableEdits: Edit[] = []

  if (parsed.flat) {
    // the file is the route: app/routes/pricing.tsx is /pricing
    full = `/${slug}`
    const dir = `${fw.appDir}/${parsed.rootDirectory}`
    const existing = ['.tsx', '.ts', '.jsx', '.js'].flatMap((e) => [`${dir}/${slug}${e}`, `${dir}/${slug}/route${e}`])
      .find((f) => existsSync(join(root, f)))
    reused = !!existing
    screenRel = existing ?? `${dir}/${slug}.tsx`
  } else {
    const list = homeList(parsed.list)
    full = joinPath(list.base, slug)
    const hit = allRoutes(parsed.list).find((r) => r.kind !== 'layout' && r.full === full && !r.children)
    reused = !!hit
    const moduleRel = `routes/${slug}.tsx`
    screenRel = hit?.file ? `${fw.appDir}/${hit.file}` : `${fw.appDir}/${moduleRel}`
    if (!reused) {
      if (list.computed) {
        return { ok: false, error: `the part of ${fw.routesRel} where the new page would go is partly built in code, so I can't add one to it safely. Nothing was changed.` }
      }
      // the local name route() is imported under, adding it when missing
      let routeLocal = [...parsed.helpers].find(([, v]) => v === 'route')?.[0] ?? null
      if (!routeLocal) {
        let decl: t.ImportDeclaration | null = null
        let taken = false
        traverse(parsed.ast, {
          ImportDeclaration(p: NodePath<t.ImportDeclaration>) {
            if (p.node.source.value === ROUTES_PKG && !decl && p.node.importKind !== 'type') decl = p.node
          },
          Program(p: NodePath<t.Program>) { taken = p.scope.hasBinding('route') },
        })
        if (taken) {
          return { ok: false, error: `${fw.routesRel} already uses the name route for something else, so I left it alone. Nothing was changed.` }
        }
        const d = decl as t.ImportDeclaration | null
        const named = d?.specifiers.filter((s) => s.type === 'ImportSpecifier') ?? []
        if (!d || !named.length) {
          return { ok: false, error: `${fw.routesRel} doesn't import its helpers from ${ROUTES_PKG} the way I expect, so I left it alone. Nothing was changed.` }
        }
        const last = named[named.length - 1]!
        tableEdits.push({ start: last.end!, end: last.end!, text: ', route' })
        routeLocal = 'route'
      }
      const entry = `${routeLocal}(${q}${slug}${q}, ${q}${moduleRel}${q})`
      const catchAll = list.routes.find((r) => r.at && r.path === '*')
      // after the list's last element (a ...prefix() included), or before a catch-all
      const last = [...list.node.elements].reverse().find((e) => e != null) ?? null
      const anchor = catchAll?.at ?? last
      if (!anchor || anchor.start == null || anchor.end == null) {
        return { ok: false, error: `the list of pages in ${fw.routesRel} is empty where the new page would go, so I left it alone. Nothing was changed.` }
      }
      // one-line lists (the starter: `[index("routes/home.tsx")]`) stay one line
      const oneLine = !routesCode.slice(list.node.start!, list.node.end!).includes('\n')
      const ind = indentAt(routesCode, anchor.start)
      if (catchAll) {
        tableEdits.push({ start: anchor.start, end: anchor.start, text: oneLine ? `${entry}, ` : `${entry},\n${ind}` })
      } else {
        tableEdits.push({ start: anchor.end, end: anchor.end, text: oneLine ? `, ${entry}` : `,\n${ind}${entry}` })
      }
    }
  }

  const screenAbs = join(root, screenRel)
  if (!reused && existsSync(screenAbs)) {
    return { ok: false, error: `${screenRel} already exists, so I won't overwrite it. Give the new page a different name. Nothing was changed.` }
  }

  // ── the trigger ──
  const tAst = parseTs(inp.code)
  let open = inp.open
  const want = inp.open.node.start
  traverse(tAst, { JSXOpeningElement(p: NodePath<t.JSXOpeningElement>) { if (p.node.start === want) open = p } })
  const trig = triggerEdits({ ...inp, open }, tAst, full)
  if (!Array.isArray(trig)) return { ok: false, error: trig.error }

  // ── plan, check, write ──
  const writes: Array<{ abs: string; rel: string; text: string }> = []
  if (!reused) writes.push({ abs: screenAbs, rel: screenRel, text: screenSource(inp.component, title, tailwind, inp.pkg, q) })
  const plan: Array<[string, string, string, Edit[]]> = [[inp.rel, inp.abs, inp.code, trig]]
  if (tableEdits.length) plan.push([fw.routesRel, routesAbs, routesCode, tableEdits])
  for (const [rel, abs, code, edits] of plan) {
    const text = apply(code, mergeImportEdits(edits))
    try { parseTs(text) } catch (err) {
      return { ok: false, error: `the change to ${rel} wouldn't parse (${err instanceof Error ? err.message : String(err)}), so I left everything alone. Nothing was changed.` }
    }
    writes.push({ abs, rel, text })
  }
  for (const w of writes) {
    mkdirSync(dirname(w.abs), { recursive: true })
    writeFileSync(w.abs, w.text)
  }
  const what = inp.tag === 'a' ? 'link' : 'button'
  const screenAt = reused ? undefined : screenRel
  const where = parsed.flat ? `${relative(root, dirname(screenAbs)).replace(/\\/g, '/')}/ (its file name is its address)` : fw.routesRel
  return {
    ok: true,
    route: full,
    screenFile: screenAt,
    screenAt,
    title,
    files: writes.map((w) => w.rel),
    reused,
    change: reused
      ? `pointed the ${what} at the "${title}" page that was already there (${full})`
      : `added a "${title}" page (${screenRel}) to the app's pages in ${where} and made the ${what} open it (${full})`,
  }
}

import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { parse } from '@babel/parser'
import { linkToScreen } from '../src/navigate.js'
import { frameworkApp } from '../src/navigate-framework.js'

/**
 * s2c-044: an arrow to a named box in a React Router framework-mode app (what
 * `npx create-react-router` makes) adds a route() to app/routes.ts instead of
 * being refused with a sentence about src/.
 */

// create-react-router 8.4.0, verbatim
const STARTER_ROUTES = `import { type RouteConfig, index } from "@react-router/dev/routes";

export default [index("routes/home.tsx")] satisfies RouteConfig;
`
const HOME = `import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [{ title: "New React Router App" }];
}

export default function Home() {
  return <Welcome />;
}
`
//  line 4: <button> col 7    line 5: <a href="#"> col 7
const WELCOME = `export function Welcome() {
  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <button className="btn">See pricing</button>
      <a href="#">Docs</a>
    </main>
  );
}
`
const LAYOUT_ROUTES = `import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
    route("about", "routes/about.tsx"),
  ]),
  route("*", "routes/missing.tsx"),
] satisfies RouteConfig;
`
const PREFIX_ROUTES = `import { type RouteConfig, index, prefix, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  ...prefix("docs", [index("routes/docs.tsx"), route("intro", "routes/intro.tsx")]),
] satisfies RouteConfig;
`
const FLAT_ROUTES = `import { type RouteConfig } from "@react-router/dev/routes";
import { flatRoutes } from "@react-router/fs-routes";

export default flatRoutes() satisfies RouteConfig;
`
const COMPUTED_ROUTES = `import { type RouteConfig, index, route } from "@react-router/dev/routes";
import { pages } from "./pages";

export default [index("routes/home.tsx"), ...pages.map((p) => route(p, \`routes/\${p}.tsx\`))] satisfies RouteConfig;
`
const BUILT_ROUTES = `import { type RouteConfig } from "@react-router/dev/routes";
import { makeRoutes } from "./make";

export default makeRoutes() satisfies RouteConfig;
`

function app(routes: string, extra: Record<string, string> = {}, opts: { config?: string } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-rrfw-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    name: 'x',
    dependencies: { react: '^19', 'react-router': '^8.4.0' },
    devDependencies: { '@react-router/dev': '^8.4.0', tailwindcss: '^4' },
  }))
  writeFileSync(join(root, 'react-router.config.ts'), opts.config ?? 'export default { ssr: true }\n')
  const dir = /appDirectory:\s*"([^"]+)"/.exec(opts.config ?? '')?.[1] ?? 'app'
  const all: Record<string, string> = {
    [`${dir}/routes.ts`]: routes,
    [`${dir}/routes/home.tsx`]: HOME,
    [`${dir}/welcome/welcome.tsx`]: WELCOME,
    [`${dir}/root.tsx`]: 'export default function App() { return null }\n',
    ...extra,
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}
const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf8')
const parses = (code: string) => parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(root, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(root)
  return out
}

describe('frameworkApp', () => {
  it('finds app/routes.ts, or the configured appDirectory, and nothing in a plain Vite app', () => {
    expect(frameworkApp(app(STARTER_ROUTES))).toEqual({ appDir: 'app', routesRel: 'app/routes.ts' })
    expect(frameworkApp(app(STARTER_ROUTES, {}, { config: 'export default { appDirectory: "web" }\n' })))
      .toEqual({ appDir: 'web', routesRel: 'web/routes.ts' })
    const spa = mkdtempSync(join(tmpdir(), 's2c-rrfw-'))
    writeFileSync(join(spa, 'package.json'), JSON.stringify({ dependencies: { 'react-router': '^7' } }))
    mkdirSync(join(spa, 'app'))
    writeFileSync(join(spa, 'app/routes.ts'), 'export default []\n') // a file named routes.ts is not enough
    expect(frameworkApp(spa)).toBeNull()
  })
})

describe('linkToScreen in a React Router framework-mode app (s2c-044)', () => {
  it('the create-react-router starter: route() beside index(), a route module, and the button navigates', () => {
    const root = app(STARTER_ROUTES)
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/pricing')
    expect(out.screenAt).toBe('app/routes/pricing.tsx')
    expect(out.files!.sort()).toEqual(['app/routes.ts', 'app/routes/pricing.tsx', 'app/welcome/welcome.tsx'])
    expect(out.change).toMatch(/added a "Pricing" page \(app\/routes\/pricing.tsx\) to the app's pages in app\/routes.ts/)
    // one line stays one line; the file's own quotes; route joins the existing import
    expect(read(root, 'app/routes.ts')).toBe(`import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [index("routes/home.tsx"), route("pricing", "routes/pricing.tsx")] satisfies RouteConfig;
`)
    const welcome = read(root, 'app/welcome/welcome.tsx')
    expect(welcome).toMatch(/^import \{ useNavigate \} from 'react-router'\n/)
    expect(welcome).toContain('const navigate = useNavigate()')
    expect(welcome).toContain(`<button onClick={() => navigate('/pricing')} className="btn">See pricing</button>`)
    const page = read(root, 'app/routes/pricing.tsx')
    expect(page).toContain('import { useNavigate } from "react-router";')
    expect(page).toContain('export function meta() {\n  return [{ title: "Pricing" }];')
    expect(page).toContain('export default function Pricing() {')
    expect(page).toContain('navigate(-1)')
    expect(page).toContain('className="mt-6 text-3xl font-bold">Pricing</h1>') // tailwind app
    expect(existsSync(join(root, 'src'))).toBe(false) // nothing from the SPA engines
    for (const f of out.files!) expect(() => parses(read(root, f))).not.toThrow()
  })

  it('<a href="#"> becomes a <Link> from react-router', () => {
    const root = app(STARTER_ROUTES)
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:5:7', screen: 'docs' })
    expect(out.ok, out.error).toBe(true)
    const welcome = read(root, 'app/welcome/welcome.tsx')
    expect(welcome).toContain('<Link to="/docs">Docs</Link>')
    expect(welcome).toMatch(/^import \{ Link \} from 'react-router'\n/)
    expect(read(root, 'app/routes/docs.tsx')).toContain('<h1 className="mt-6 text-3xl font-bold">Docs</h1>')
  })

  it('a layout(): the page goes inside it beside home (keeps the nav bar), and before a catch-all only at its own level', () => {
    const root = app(LAYOUT_ROUTES)
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/pricing')
    expect(read(root, 'app/routes.ts')).toContain(`    route("about", "routes/about.tsx"),
    route("pricing", "routes/pricing.tsx"),
  ]),
  route("*", "routes/missing.tsx"),`)
    // route was already imported: the import line is untouched
    expect(read(root, 'app/routes.ts')).toMatch(/^import \{ type RouteConfig, index, layout, route \} from/)
  })

  it('a top-level catch-all: the new route goes before it', () => {
    const root = app(`import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("*", "routes/missing.tsx"),
] satisfies RouteConfig;
`)
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(read(root, 'app/routes.ts')).toContain(`  index("routes/home.tsx"),
  route("pricing", "routes/pricing.tsx"),
  route("*", "routes/missing.tsx"),`)
  })

  it('...prefix() is read for paths; an existing route only gets the link', () => {
    const root = app(PREFIX_ROUTES)
    const before = read(root, 'app/routes.ts')
    // "docs" already exists as prefix("docs", [index(...)])
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Docs' })
    expect(out.ok, out.error).toBe(true)
    expect(out.reused).toBe(true)
    expect(out.route).toBe('/docs')
    expect(out.files).toEqual(['app/welcome/welcome.tsx'])
    expect(read(root, 'app/routes.ts')).toBe(before)
    // a new one goes after the spread, as a sibling of index()
    const root2 = app(PREFIX_ROUTES)
    const out2 = linkToScreen(root2, { srcLoc: 'app/welcome/welcome.tsx:5:7', screen: 'Team' })
    expect(out2.ok, out2.error).toBe(true)
    expect(read(root2, 'app/routes.ts')).toContain(`  ...prefix("docs", [index("routes/docs.tsx"), route("intro", "routes/intro.tsx")]),
  route("team", "routes/team.tsx"),
] satisfies`)
  })

  it('flatRoutes(): the file is the whole change (its name is its address)', () => {
    const root = app(FLAT_ROUTES)
    const before = read(root, 'app/routes.ts')
    const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/pricing')
    expect(out.files!.sort()).toEqual(['app/routes/pricing.tsx', 'app/welcome/welcome.tsx'])
    expect(read(root, 'app/routes.ts')).toBe(before)
    expect(out.change).toMatch(/app\/routes\/ \(its file name is its address\)/)
    // and a page that's already a file there is reused
    // (the import and the hook pushed the <a> down two lines)
    const again = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:7:7', screen: 'pricing' })
    expect(again.ok, again.error).toBe(true)
    expect(again.reused).toBe(true)
    expect(again.files).toEqual(['app/welcome/welcome.tsx'])
    expect(read(root, 'app/welcome/welcome.tsx')).toContain('<Link to="/pricing">Docs</Link>')
  })

  it('a configured appDirectory is used for routes.ts and the new module', () => {
    const root = app(STARTER_ROUTES, {}, { config: 'export default { appDirectory: "web" }\n' })
    const out = linkToScreen(root, { srcLoc: 'web/welcome/welcome.tsx:4:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.screenAt).toBe('web/routes/pricing.tsx')
    expect(read(root, 'web/routes.ts')).toContain('route("pricing", "routes/pricing.tsx")')
  })

  describe('refusals change nothing and say why, naming routes.ts', () => {
    it('a list partly built in code', () => {
      const root = app(COMPUTED_ROUTES, { 'app/pages.ts': 'export const pages = ["a"]\n' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
      expect(out.ok).toBe(false)
      expect(out.error).toMatch(/part of app\/routes.ts where the new page would go is partly built in code/)
      expect(out.error).not.toMatch(/src\//)
      expect(snapshot(root)).toEqual(before)
    })
    it('a list built entirely in code', () => {
      const root = app(BUILT_ROUTES, { 'app/make.ts': 'export const makeRoutes = () => []\n' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
      expect(out.error).toMatch(/list of pages in app\/routes.ts is built in code/)
      expect(snapshot(root)).toEqual(before)
    })
    it('a module file that already exists for a different route', () => {
      const root = app(STARTER_ROUTES, { 'app/routes/pricing.tsx': 'export default function X() { return null }\n' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'app/welcome/welcome.tsx:4:7', screen: 'Pricing' })
      expect(out.error).toMatch(/app\/routes\/pricing.tsx already exists/)
      expect(snapshot(root)).toEqual(before)
    })
  })
})

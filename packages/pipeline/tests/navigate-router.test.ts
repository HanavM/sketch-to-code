import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { parse } from '@babel/parser'
import { linkToScreen } from '../src/navigate.js'

/**
 * s2c-041: an arrow to a named box in an app that already uses react-router
 * writes into the app's own route table instead of being refused.
 */

const MAIN_PROVIDER = `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/about', element: <About /> },
  { path: '*', element: <p>Not found</p> },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
`

const MAIN_PLAIN = `import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
`

const APP_JSX = `import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import About from './pages/About'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  )
}
`

const ROUTES_NESTED = `import type { RouteObject } from 'react-router'
import Layout from './Layout'
import Home from './pages/Home'
import About from './pages/About'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'about', element: <About /> },
    ],
  },
]
`
const MAIN_NESTED = `import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { routes } from './routes'

createRoot(document.getElementById('root')!).render(<RouterProvider router={createBrowserRouter(routes)} />)
`

//  line 5: <button> col 7    line 6: <a href="#"> col 7   line 7: <button onClick> col 7
const HOME = `export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <button className="btn">See pricing</button>
      <a href="#">Docs</a>
      <button onClick={() => alert(1)}>Busy</button>
    </main>
  )
}
`
//  line 4: <button> col 5 (an arrow-bodied component, already importing Link)
const NAV = `import { Link } from 'react-router-dom'

const Nav = () => (
  <nav><Link to="/">Home</Link>
    <button>Pricing</button>
  </nav>
)
export default Nav
`
const ABOUT = 'export default function About() { return <h1>About</h1> }\n'
const LAYOUT = `import { Outlet } from 'react-router'\nexport default function Layout() { return <div><Outlet /></div> }\n`

function app(files: Record<string, string>, deps: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-rr-'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'x', dependencies: { react: '^19', ...deps } }))
  const all = { 'src/pages/Home.tsx': HOME, 'src/pages/About.tsx': ABOUT, 'src/Nav.tsx': NAV, ...files }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  return root
}
const read = (root: string, rel: string) => readFileSync(join(root, rel), 'utf8')
const parses = (code: string) => parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

/** Every file under src, as text: a refusal must leave this byte-identical. */
function snapshot(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else out[relative(root, p)] = readFileSync(p, 'utf8')
    }
  }
  walk(join(root, 'src'))
  return out
}

describe('linkToScreen in a react-router app (s2c-041)', () => {
  it('createBrowserRouter([...]): a route before the catch-all, a page, and the button navigates', () => {
    const root = app({ 'src/main.tsx': MAIN_PROVIDER }, { 'react-router-dom': '^7' })
    const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/pricing')
    expect(out.screenAt).toBe('src/pages/Pricing.tsx') // the app's own pages/ folder
    expect(out.files!.sort()).toEqual(['src/main.tsx', 'src/pages/Home.tsx', 'src/pages/Pricing.tsx'])
    expect(out.change).toMatch(/added a "Pricing" page .* in src\/main.tsx/)

    const main = read(root, 'src/main.tsx')
    expect(main).toContain(`  { path: '/about', element: <About /> },\n  { path: '/pricing', element: <Pricing /> },\n  { path: '*', element: <p>Not found</p> },`)
    expect(main).toContain(`import Pricing from './pages/Pricing'`)
    const home = read(root, 'src/pages/Home.tsx')
    expect(home).toContain(`<button onClick={() => navigate('/pricing')} className="btn">See pricing</button>`)
    expect(home).toMatch(/^import \{ useNavigate \} from 'react-router-dom'\n/)
    expect(home).toContain(`export default function Home() {\n  const navigate = useNavigate()\n  return (`)
    const page = read(root, 'src/pages/Pricing.tsx')
    expect(page).toContain(`import { useNavigate } from 'react-router-dom'`)
    expect(page).toContain('<h1>Pricing</h1>')
    expect(page).toContain('navigate(-1)')
    expect(existsSync(join(root, 'src/lib'))).toBe(false) // none of the hash-screen machinery
    for (const f of out.files!) expect(() => parses(read(root, f))).not.toThrow()
  })

  it('<Routes><Route> in JSX: a <Route> after the last, and <a href="#"> becomes a <Link>', () => {
    const root = app({ 'src/main.tsx': MAIN_PLAIN, 'src/App.tsx': APP_JSX }, { 'react-router-dom': '^6' })
    const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:6:7', screen: 'Docs' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/docs')
    const appCode = read(root, 'src/App.tsx')
    expect(appCode).toContain(`        <Route path="/about" element={<About />} />\n        <Route path="/docs" element={<Docs />} />\n      </Routes>`)
    expect(appCode).toContain(`import Docs from './pages/Docs'`)
    const home = read(root, 'src/pages/Home.tsx')
    expect(home).toContain('<Link to="/docs">Docs</Link>')
    expect(home).toMatch(/^import \{ Link \} from 'react-router-dom'\n/)
    expect(home).not.toContain('useNavigate')
    for (const f of out.files!) expect(() => parses(read(root, f))).not.toThrow()
  })

  it('a nested layout route: the page goes beside home, inside the layout, with a relative path', () => {
    const root = app({ 'src/main.tsx': MAIN_NESTED, 'src/routes.tsx': ROUTES_NESTED, 'src/Layout.tsx': LAYOUT }, { 'react-router': '^7' })
    const out = linkToScreen(root, { srcLoc: 'src/Nav.tsx:5:5', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('/pricing')
    const routes = read(root, 'src/routes.tsx')
    expect(routes).toContain(`      { path: 'about', element: <About /> },\n      { path: 'pricing', element: <Pricing /> },\n    ],`)
    expect(read(root, 'src/pages/Pricing.tsx')).toContain(`from 'react-router'`)
    // arrow-bodied component: gets a block body; the existing router import gains the hook
    const nav = read(root, 'src/Nav.tsx')
    expect(nav).toContain(`import { Link, useNavigate } from 'react-router-dom'`)
    expect(nav).toContain('const navigate = useNavigate()')
    expect(nav).toContain(`<button onClick={() => navigate('/pricing')}>Pricing</button>`)
    for (const f of out.files!) expect(() => parses(read(root, f))).not.toThrow()
  })

  it('a path that already exists only gets the link', () => {
    const root = app({ 'src/main.tsx': MAIN_PROVIDER }, { 'react-router-dom': '^7' })
    const before = read(root, 'src/main.tsx')
    const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'About' })
    expect(out.ok, out.error).toBe(true)
    expect(out.reused).toBe(true)
    expect(out.files).toEqual(['src/pages/Home.tsx'])
    expect(read(root, 'src/main.tsx')).toBe(before)
    expect(read(root, 'src/pages/Home.tsx')).toContain(`navigate('/about')`)
  })

  it('a button in the component that renders <Routes> and a <Route> in one file: one import line each, still parses', () => {
    const withButton = APP_JSX.replace('    <BrowserRouter>', '    <BrowserRouter>\n      <Nav />').replace(
      "import About from './pages/About'", "import About from './pages/About'\nimport Nav from './Nav'")
    const root = app({ 'src/main.tsx': MAIN_PLAIN, 'src/App.tsx': withButton }, { 'react-router-dom': '^6' })
    const out = linkToScreen(root, { srcLoc: 'src/Nav.tsx:5:5', screen: 'Team' })
    expect(out.ok, out.error).toBe(true)
    expect(read(root, 'src/App.tsx')).toContain('<Route path="/team" element={<Team />} />')
  })

  it('a hash router reports a hash route', () => {
    const root = app({ 'src/main.tsx': MAIN_PROVIDER.replace(/createBrowserRouter/g, 'createHashRouter') }, { 'react-router-dom': '^7' })
    const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'Pricing' })
    expect(out.ok, out.error).toBe(true)
    expect(out.route).toBe('#/pricing')
  })

  describe('refusals change nothing and say why', () => {
    it('two route lists', () => {
      const root = app({ 'src/main.tsx': MAIN_PROVIDER, 'src/App.tsx': APP_JSX }, { 'react-router-dom': '^7' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'Pricing' })
      expect(out.ok).toBe(false)
      expect(out.error).toMatch(/more than one place .*won't guess/)
      expect(snapshot(root)).toEqual(before)
    })
    it('no route list it can read', () => {
      const root = app({ 'src/main.tsx': MAIN_PROVIDER.replace(/createBrowserRouter\(\[[\s\S]*?\]\)/, 'createBrowserRouter(makeRoutes())') }, { 'react-router-dom': '^7' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'Pricing' })
      expect(out.error).toMatch(/built in code/)
      expect(snapshot(root)).toEqual(before)
    })
    it('a button in the component that sets up the router', () => {
      const own = APP_JSX.replace('    <BrowserRouter>', '    <BrowserRouter>\n      <button>Go</button>')
      const root = app({ 'src/main.tsx': MAIN_PLAIN, 'src/App.tsx': own }, { 'react-router-dom': '^6' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'src/App.tsx:8:7', screen: 'Pricing' })
      expect(out.error).toMatch(/sets up the app's pages/)
      expect(snapshot(root)).toEqual(before)
    })
    it('the same refusals as the hash version: a button that already does something', () => {
      const root = app({ 'src/main.tsx': MAIN_PROVIDER }, { 'react-router-dom': '^7' })
      const before = snapshot(root)
      const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:7:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already does something/)
      expect(snapshot(root)).toEqual(before)
    })
    it('other routers are still refused by name', () => {
      const root = app({ 'src/main.tsx': MAIN_PLAIN }, { '@tanstack/react-router': '^1' })
      const out = linkToScreen(root, { srcLoc: 'src/pages/Home.tsx:5:7', screen: 'Pricing' })
      expect(out.error).toMatch(/already uses @tanstack\/react-router/)
    })
  })
})

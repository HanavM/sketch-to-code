// s2c-041: the react-router engine on a real Vite + React + react-router app.
//
// Zero tokens. For each of the three route-table shapes the unit tests cover
// (createBrowserRouter([...]) inline, <Routes><Route> JSX, a nested layout
// route imported from routes.tsx), this:
//   1. writes a small app into a temp dir with real react-router-dom 7 installed,
//   2. runs linkToScreen exactly as a run would (the trigger's data-s2c stamp),
//   3. type-checks the result with tsc --strict and builds it with vite,
//   4. opens the built app in Chromium and does what a person would: click the
//      trigger -> the page's address and heading; "← Back" -> home again;
//      open the new page's address directly, "← Back" -> home (not off-site).
// The unit tests prove the text; this proves the text runs.
//
// Needs network for one `npm i` (cached per run in a temp dir).
// Usage: node tests/e2e/navigate-router-real.mjs
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { linkToScreen, judgeProbe } = await import(join(repo, 'packages/pipeline/dist/index.js'))
// the run's own navigate probe, exactly as the overlay runs it in the page
const ts = (await import('typescript')).default
const probeJs = ts.transpileModule(readFileSync(join(repo, 'packages/overlay-client/src/probe-exec.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText + '\nwindow.__s2cRunProbe = runProbe\n'

const deps = join(mkdtempSync(join(tmpdir(), 's2c-rr-deps-')), 'deps')
mkdirSync(deps, { recursive: true })
writeFileSync(join(deps, 'package.json'), JSON.stringify({
  name: 'deps', private: true, type: 'module',
  dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0', 'react-router-dom': '^7.9.0' },
  devDependencies: { vite: '^7.1.0', '@vitejs/plugin-react': '^5.0.0', typescript: '^5.6.0', '@types/react': '^19.1.0', '@types/react-dom': '^19.1.0' },
}))
console.log('installing react-router-dom 7 + vite …')
execFileSync('npm', ['i', '--no-audit', '--no-fund', '--silent'], { cwd: deps, stdio: 'inherit' })

const COMMON = {
  'index.html': `<!doctype html><html><head><meta charset="utf-8"><title>rr</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
  'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({ plugins: [react()] })\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, noUncheckedIndexedAccess: true, noEmit: true, skipLibCheck: true, lib: ['ES2022', 'DOM'] }, include: ['src'] }),
  'src/pages/About.tsx': 'export default function About() { return <h1>About</h1> }\n',
}
// line 5 col 7: the button; line 6 col 7: the link
const HOME = `export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <button className="btn">See pricing</button>
      <a href="#">Docs</a>
    </main>
  )
}
`

const SHAPES = [
  {
    name: 'createBrowserRouter([...]) inline, a button',
    pkg: 'react-router-dom',
    trigger: 'src/pages/Home.tsx:5:7', screen: 'Pricing', path: '/pricing', click: 'See pricing',
    files: {
      'src/pages/Home.tsx': HOME,
      'src/main.tsx': `import { StrictMode } from 'react'
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
`,
    },
  },
  {
    name: '<Routes><Route> JSX, an <a href="#">',
    pkg: 'react-router-dom',
    trigger: 'src/pages/Home.tsx:6:7', screen: 'Docs', path: '/docs', click: 'Docs',
    files: {
      'src/pages/Home.tsx': HOME,
      'src/main.tsx': `import { createRoot } from 'react-dom/client'\nimport App from './App'\n\ncreateRoot(document.getElementById('root')!).render(<App />)\n`,
      'src/App.tsx': `import { BrowserRouter, Routes, Route } from 'react-router-dom'
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
`,
    },
  },
  {
    name: 'nested layout route from routes.tsx, a button in an arrow-bodied nav',
    pkg: 'react-router',
    trigger: 'src/Nav.tsx:5:5', screen: 'Pricing', path: '/pricing', click: 'Pricing', navStays: true,
    files: {
      'src/pages/Home.tsx': HOME,
      'src/Nav.tsx': `import { Link } from 'react-router'

const Nav = () => (
  <nav><Link to="/">Home</Link>
    <button>Pricing</button>
  </nav>
)
export default Nav
`,
      'src/Layout.tsx': `import { Outlet } from 'react-router'\nimport Nav from './Nav'\nexport default function Layout() { return <div><Nav /><Outlet /></div> }\n`,
      'src/routes.tsx': `import type { RouteObject } from 'react-router'
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
`,
      'src/main.tsx': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import { routes } from './routes'

createRoot(document.getElementById('root')!).render(<RouterProvider router={createBrowserRouter(routes)} />)
`,
    },
  },
]

const failures = []
const check = (shape, ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(`${shape}: ${what}`)
}

// a pinned Chromium (e.g. the cloud container's /opt/pw-browsers/chromium) when playwright's own isn't downloaded
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
let port = 5310
for (const s of SHAPES) {
  console.log(`\n▸ ${s.name}`)
  const root = mkdtempSync(join(tmpdir(), 's2c-rr-app-'))
  const files = { ...COMMON, ...s.files, 'package.json': JSON.stringify({ name: 'app', private: true, type: 'module', dependencies: { react: '^19', [s.pkg]: '^7' } }) }
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), text)
  }
  symlinkSync(join(deps, 'node_modules'), join(root, 'node_modules'), 'dir')

  const out = linkToScreen(root, { srcLoc: s.trigger, screen: s.screen })
  check(s.name, out.ok, `engine: ${out.ok ? out.change : out.error}`)
  if (!out.ok) continue
  check(s.name, out.route === s.path, `route ${out.route}`)

  // the dev plugin stamps elements with data-s2c; a production build has no
  // plugin, so stamp the trigger by hand (a <Link> passes it to its <a>)
  {
    const rel = s.trigger.split(':')[0]
    const code = readFileSync(join(root, rel), 'utf8')
    const at = code.indexOf(`>${s.click}<`)
    writeFileSync(join(root, rel), code.slice(0, at) + ' data-s2c="T"' + code.slice(at))
  }

  let typed = true
  try { execFileSync(join(deps, 'node_modules/.bin/tsc'), ['-p', root], { cwd: root, stdio: 'pipe' }) } catch (e) {
    typed = false
    console.log(String(e.stdout ?? e))
  }
  check(s.name, typed, 'tsc --strict --noUncheckedIndexedAccess clean')
  let built = true
  try { execFileSync(join(deps, 'node_modules/.bin/vite'), ['build', '--logLevel', 'error'], { cwd: root, stdio: 'pipe' }) } catch (e) {
    built = false
    console.log(String(e.stderr ?? e))
  }
  check(s.name, built, 'vite build')
  if (!built) continue

  const p = port++
  const server = spawn(join(deps, 'node_modules/.bin/vite'), ['preview', '--port', String(p), '--strictPort'], { cwd: root, stdio: 'pipe' })
  await new Promise((r) => { server.stdout.on('data', (d) => { if (String(d).includes(String(p))) r() }); setTimeout(r, 8000) })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const base = `http://localhost:${p}`
  const heading = (name) => page.getByRole('heading', { name, exact: true })
  try {
    await page.goto(base + '/')
    await heading('Home').waitFor({ timeout: 5000 })
    await page.getByText(s.click, { exact: true }).click()
    await heading(s.screen).waitFor({ timeout: 5000 }).catch(() => {})
    check(s.name, new URL(page.url()).pathname === s.path, `click -> address ${new URL(page.url()).pathname}`)
    check(s.name, await heading(s.screen).isVisible(), `"${s.screen}" heading shows`)
    check(s.name, !(await heading('Home').isVisible()), 'home page is gone')
    if (s.navStays) check(s.name, await page.locator('nav').isVisible(), 'the layout (nav) is still there: the page went inside the layout')
    await page.getByText('← Back').click()
    await heading('Home').waitFor({ timeout: 5000 }).catch(() => {})
    check(s.name, new URL(page.url()).pathname === '/' && await heading('Home').isVisible(), '← Back -> home')
    // opened directly: Back must stay in the app
    await page.goto(base + s.path)
    await heading(s.screen).waitFor({ timeout: 5000 })
    await page.getByText('← Back').click()
    await heading('Home').waitFor({ timeout: 5000 }).catch(() => {})
    check(s.name, page.url().startsWith(base) && new URL(page.url()).pathname === '/', `opened directly, ← Back -> home (${page.url()})`)
    // the run's own probe: what a real run would report for this edit
    await page.goto(base + '/')
    await heading('Home').waitFor({ timeout: 5000 })
    await page.addScriptTag({ type: 'module', content: probeJs })
    await page.waitForFunction(() => typeof window.__s2cRunProbe === 'function')
    const spec = { actionIndex: 0, kind: 'navigate', trigger: { srcLoc: 'T', label: `"${s.click}"` }, screen: { route: out.route, heading: s.screen }, claim: '' }
    const obs = await page.evaluate((sp) => window.__s2cRunProbe(sp), spec)
    const verdict = judgeProbe(spec, obs, { changed: [], restored: true })
    check(s.name, verdict.status === 'passed', `the run's probe: ${verdict.status}: ${verdict.reason}`)
    check(s.name, new URL(page.url()).pathname === '/' && await heading('Home').isVisible(), 'the probe left the page where it was')
    // not hollow: the same probe for a page the link doesn't open fails
    const wrong = { ...spec, screen: { route: '/nowhere', heading: 'Nowhere' } }
    const wv = judgeProbe(wrong, await page.evaluate((sp) => window.__s2cRunProbe(sp), wrong), { changed: [], restored: true })
    check(s.name, wv.status === 'failed', `a probe for a page it doesn't open fails: ${wv.reason}`)
    check(s.name, errors.length === 0, `no page errors${errors.length ? ': ' + errors.join('; ') : ''}`)
  } catch (e) {
    check(s.name, false, `browser: ${e.message}`)
  } finally {
    await page.close()
    server.kill()
    rmSync(root, { recursive: true, force: true })
  }
}
await browser.close()
rmSync(dirname(deps), { recursive: true, force: true })
console.log(failures.length ? `\nFAILED ${failures.length}:\n  ${failures.join('\n  ')}` : '\nall green')
process.exit(failures.length ? 1 : 0)

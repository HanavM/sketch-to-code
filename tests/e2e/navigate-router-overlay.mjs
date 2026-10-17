/**
 * s2c-041, the last part of done_when: a FULL overlay run of "draw a link" on a
 * Vite + React + react-router app that the repo did not set up for itself.
 *
 * Zero tokens. What is scripted is only the model's reading: `navigate` on the
 * nav bar's "Pricing" button, screen "Pricing" (what it should read from an
 * arrow off the button with the word Pricing). Everything else is the product,
 * the way a person meets it:
 *
 *   1. a react-router-dom 7 app (layout route from src/routes.tsx, a button in
 *      the layout's nav) is written to a temp dir, installed and committed,
 *   2. `sketch-to-code init --yes --no-install` sets it up, then one install;
 *      doctor says healthy,
 *   3. its own vite dev server boots (in this process so the model is scripted),
 *   4. in Chromium: an arrow is drawn off the button and "Pricing" is typed,
 *   5. the run ends on ✓, its receipt names the page, and its OWN probe (the
 *      verify file in .sketch2code/runs) passed, which means the run clicked the
 *      button in the real page and saw /pricing with the nav still there,
 *   6. by hand: the button opens /pricing inside the layout, ← Back comes home,
 *   7. one Ctrl+Z puts every tracked file back byte for byte and removes the
 *      new page; the button goes nowhere again,
 *   and: the model was asked once (interpret), never for code; no page errors.
 *
 * Needs network for one `npm i` (installed with --ignore-scripts).
 * Usage: node tests/e2e/navigate-router-overlay.mjs [--keep]
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { penMode } from './lib/pen.mjs'

const REPO = realpathSync(new URL('../../', import.meta.url).pathname)
const CLI = join(REPO, 'packages', 'cli', 'dist', 'bin.js')
const KEEP = process.argv.includes('--keep')
const log = (...a) => console.log('[nav-router-overlay]', ...a)
const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', timeout: 300_000, ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}

const FILES = {
  'package.json': JSON.stringify({
    name: 'rr-app', private: true, type: 'module',
    scripts: { dev: 'vite', build: 'tsc -b && vite build' },
    dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0', 'react-router-dom': '^7.9.0' },
    devDependencies: { vite: '^7.1.0', '@vitejs/plugin-react': '^5.0.0', typescript: '^5.6.0', '@types/react': '^19.1.0', '@types/react-dom': '^19.1.0' },
  }, null, 2) + '\n',
  '.gitignore': 'node_modules\ndist\n',
  'index.html': '<!doctype html>\n<html lang="en">\n  <head><meta charset="UTF-8" /><title>Acme</title></head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n',
  'vite.config.ts': "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n",
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true, lib: ['ES2022', 'DOM'] }, include: ['src'] }, null, 2) + '\n',
  'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import { routes } from './routes'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
  </StrictMode>,
)
`,
  'src/routes.tsx': `import type { RouteObject } from 'react-router-dom'
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
  'src/Layout.tsx': `import { Outlet } from 'react-router-dom'
import Nav from './Nav'

export default function Layout() {
  return (
    <div>
      <Nav />
      <Outlet />
    </div>
  )
}
`,
  'src/Nav.tsx': `import { Link } from 'react-router-dom'

export default function Nav() {
  return (
    <nav style={{ display: 'flex', gap: 24, padding: 16 }}>
      <Link to="/">Acme</Link>
      <Link to="/about">About</Link>
      <button>Pricing</button>
    </nav>
  )
}
`,
  'src/pages/Home.tsx': "export default function Home() {\n  return (\n    <main style={{ padding: 16 }}>\n      <h1>Welcome to Acme</h1>\n      <p>We make things.</p>\n    </main>\n  )\n}\n",
  'src/pages/About.tsx': "export default function About() {\n  return <h1>About us</h1>\n}\n",
}

const work = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-rr-overlay-')))
const dir = join(work, 'app')
const git = (...a) => run('git', a, { cwd: dir })
const commit = (msg) => {
  git('add', '-A')
  git('-c', 'user.email=dev@acme.test', '-c', 'user.name=dev', 'commit', '-qm', msg)
}
const install = () => run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--silent'], { cwd: dir })
const tracked = () => Object.fromEntries(git('ls-files').out.trim().split('\n').map((f) => [f, readFileSync(join(dir, f), 'utf8')]))

const providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
const calls = []
let menuSeen = null
providers.setScriptedModel({
  onCall: (kind) => calls.push(kind),
  interpret: (req) => {
    const ev = JSON.parse(req.brief)
    menuSeen = ev.elementMenu
    const btn = ev.elementMenu.find((e) => e.tag === 'button' && /Pricing/.test(e.text))
    return {
      reading: 'The Pricing button opens a Pricing page.',
      actions: [{
        kind: 'navigate', elements: [btn?.id], destElement: null, position: null, screen: 'Pricing',
        instruction: 'clicking this opens the Pricing page', strokes: ev.strokes.map((s) => s.id), layer: null, depicts: null, fidelity: null,
      }],
      unclear: null,
    }
  },
  codegen: () => 'Done.',
})

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
let server = null
try {
  // ── 1. the app ─────────────────────────────────────────────────────────────
  for (const [rel, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  log('installing react-router-dom 7 + vite 7 …')
  const i0 = install()
  if (!check('npm install', i0.code === 0, i0.code === 0 ? '' : i0.out.slice(-600))) throw new Error('install failed')
  git('init', '-q')
  commit('initial')

  // ── 2. init ────────────────────────────────────────────────────────────────
  // --no-install, then our own install with --ignore-scripts: init's verify step
  // rightly says the plugin isn't resolvable yet, so its exit code is not the
  // check here; what it wrote is, and doctor after the install is.
  const init = run('node', [CLI, 'init', dir, '--yes', '--no-install'])
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const wired = !!pkg.devDependencies?.['@s2c/vite-plugin'] && /sketch2code\(/.test(readFileSync(join(dir, 'vite.config.ts'), 'utf8'))
  if (!check('init added the plugin and wired vite.config.ts', wired, `init exit ${init.code}`)) console.log(init.out.slice(-1500))
  const i1 = install() // links the local plugin init added
  check('npm install after init', i1.code === 0, i1.code === 0 ? '' : i1.out.slice(-600))
  if (git('status', '--porcelain').out.trim()) commit('sketch-to-code')
  check('tree clean before the sketch', git('status', '--porcelain').out.trim() === '')
  const doctor = run('node', [CLI, 'doctor', dir])
  if (!check('doctor is healthy', doctor.code === 0, `code ${doctor.code}`)) console.log(doctor.out.slice(-1500))
  const before = tracked()

  // ── 3. boot ────────────────────────────────────────────────────────────────
  const req = createRequire(join(dir, 'package.json'))
  const vite = await import(pathToFileURL(req.resolve('vite')).href)
  const PORT = 5480
  server = await vite.createServer({ root: dir, configFile: join(dir, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true } })
  await server.listen()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15_000 })
  check('the overlay is on the page', true)
  const btnStamp = await page.evaluate(() => document.querySelector('nav button')?.getAttribute('data-s2c') ?? null)
  check('the Pricing button is stamped to source', !!btnStamp && btnStamp.startsWith('src/Nav.tsx:'), String(btnStamp))

  // ── 4. the sketch: an arrow off the button, the word Pricing ───────────────
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const ink = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('ink')?.querySelectorAll('path').length ?? 0).catch(() => 0)
  const b = await page.evaluate(() => { const r = document.querySelector('nav button').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const x0 = b.x + b.w + 6; const y0 = b.y + b.h / 2
  const shaft = Array.from({ length: 16 }, (_, k) => [x0 + k * 14, y0 + 40 + k * 9 + (k % 3) - 1])
  const tip = shaft.at(-1)
  const n0 = await ink()
  const stroke = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(120)
  }
  await stroke(shaft)
  await stroke([[tip[0] - 22, tip[1] - 2], tip, [tip[0] - 6, tip[1] - 22]])
  check('the pen drew the arrow', (await ink()) > n0, `${(await ink()) - n0} stroke(s)`)
  const runsDir = join(dir, '.sketch2code', 'runs')
  const runsBefore = new Set(existsSync(runsDir) ? readdirSync(runsDir) : [])
  await page.keyboard.type('Pricing', { delay: 25 })
  await page.keyboard.press('Enter')

  // ── 5. the run ─────────────────────────────────────────────────────────────
  const seen = []
  let quiet = 0
  const t0 = Date.now()
  while (Date.now() - t0 < 60_000) {
    await page.waitForTimeout(200)
    const s = await status()
    if (s === seen.at(-1)) quiet++
    else { quiet = 0; if (s) seen.push(s) }
    if (quiet >= 12 && /✓|✗|⚠|failed|stopped|could not|couldn’t|didn’t|refus/i.test(s)) break
  }
  for (const s of seen) console.log(`      │ ${s}`)
  const receipt = seen.at(-1) ?? ''
  check('the run ends on ✓', /^✓ /.test(receipt), receipt)
  check('the receipt names the page', /Pricing/.test(receipt), receipt)
  check('the receipt does not say it went untested', !/didn't try|not tested|couldn't test/i.test(receipt))
  const routes = readFileSync(join(dir, 'src/routes.tsx'), 'utf8')
  check('routes.tsx gained the page inside the layout', /children: \[[\s\S]*path: 'pricing'[\s\S]*\][\s\S]*\]/.test(routes), routes.match(/.*pricing.*/)?.[0] ?? 'no pricing route')
  check('the page file was written', existsSync(join(dir, 'src/pages/Pricing.tsx')))
  const nav = readFileSync(join(dir, 'src/Nav.tsx'), 'utf8')
  check('the button navigates', /useNavigate/.test(nav) && /\/pricing/.test(nav))
  const fresh = (existsSync(runsDir) ? readdirSync(runsDir) : []).filter((r) => !runsBefore.has(r)).sort()
  check('one new run on disk', fresh.length === 1, `${fresh.length}`)
  if (fresh.length) {
    const rd = join(runsDir, fresh.at(-1))
    const verifies = readdirSync(rd).filter((f) => /^verify-.*\.json$/.test(f)).sort()
    const v = verifies.length ? JSON.parse(readFileSync(join(rd, verifies.at(-1)), 'utf8')) : null
    const details = Array.isArray(v) ? v : Array.isArray(v?.detail) ? v.detail : []
    const beh = details.filter((d) => d?.kind === 'behaviour')
    log('probe:', beh.map((d) => `${d.status}: ${d.reason}`).join(' | ') || JSON.stringify(v)?.slice(0, 300))
    check("the run's own probe passed", beh.length === 1 && beh[0].status === 'passed', beh[0] ? `${beh[0].status}: ${beh[0].reason}` : 'no behaviour verdict')
  }
  check('the probe left the page at home', await page.evaluate(() => location.pathname) === '/')

  // ── 6. by hand ─────────────────────────────────────────────────────────────
  await page.evaluate(() => sessionStorage.clear()).catch(() => {})
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15_000 })
  for (let k = 0; k < 3 && (await penMode(page)) === 'draw'; k++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  await page.click('nav button')
  await page.waitForFunction(() => location.pathname === '/pricing', null, { timeout: 5000 }).catch(() => {})
  check('click → /pricing', await page.evaluate(() => location.pathname) === '/pricing')
  check('"Pricing" heading shows', await page.getByRole('heading', { name: 'Pricing', exact: true }).isVisible().catch(() => false))
  check('the nav is still there (inside the layout)', await page.locator('nav').isVisible())
  check('home is gone', !(await page.getByRole('heading', { name: 'Welcome to Acme' }).isVisible()))
  await page.getByText('← Back').click()
  await page.waitForFunction(() => location.pathname === '/', null, { timeout: 5000 }).catch(() => {})
  check('← Back → home', await page.evaluate(() => location.pathname) === '/' && await page.getByRole('heading', { name: 'Welcome to Acme' }).isVisible())

  // ── 7. one undo ────────────────────────────────────────────────────────────
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, null, { timeout: 15_000 })
  await page.waitForTimeout(400)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  const tu = Date.now()
  let undoMsg = ''
  while (Date.now() - tu < 20_000) {
    undoMsg = await status()
    if (/undid|nothing to undo/i.test(undoMsg)) break
    await page.waitForTimeout(250)
  }
  check('undo answered', /undid/i.test(undoMsg), undoMsg)
  await page.waitForTimeout(1500)
  const after = tracked()
  const changed = Object.keys(before).filter((f) => after[f] !== before[f])
  check('every tracked file is back byte for byte', changed.length === 0, changed.join(', '))
  check('the new page is gone', !existsSync(join(dir, 'src/pages/Pricing.tsx')))
  const stray = git('status', '--porcelain').out.trim()
  check('git status is clean after undo', stray === '', stray.replace(/\n/g, '; '))
  await page.evaluate(() => sessionStorage.clear()).catch(() => {})
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  for (let k = 0; k < 3 && (await penMode(page)) === 'draw'; k++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  await page.click('nav button')
  await page.waitForTimeout(800)
  check('after undo the button goes nowhere', await page.evaluate(() => location.pathname) === '/')

  check('the model read once and never wrote code', calls.filter((c) => c === 'interpret').length === 1 && !calls.includes('codegen'), calls.join(','))
  check('the menu the model saw had the button', !!menuSeen?.some((e) => e.tag === 'button'))
  const real = errs.filter((e) => !/ResizeObserver/.test(e))
  check('no page errors', real.length === 0, real.slice(0, 2).join(' | '))
  await page.close()
} catch (err) {
  failures++
  console.error('  ✗ aborted:', err.message ?? err)
} finally {
  providers.setScriptedModel(null)
  await browser.close().catch(() => {})
  await server?.close().catch(() => {})
  if (KEEP) log('keeping', work)
  else rmSync(work, { recursive: true, force: true })
}
console.log(failures === 0 ? '\n[nav-router-overlay] ALL CHECKS PASSED' : `\n[nav-router-overlay] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

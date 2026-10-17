// s2c-044: the framework-mode engine on React Router's own starter.
//
// Zero tokens. Scaffolds `create-react-router@8.4.0` (framework mode: SSR,
// app/routes.ts, no src/, no index.html), installs it once, then for each
// route-list shape:
//   1. copies the starter, rewrites app/routes.ts to the shape, and adds a
//      trigger to app/welcome/welcome.tsx (the starter has no button or # link),
//   2. runs linkToScreen exactly as a run would,
//   3. runs the app's own `npm run typecheck` (react-router typegen && tsc),
//   4. starts `react-router dev` and in Chromium: click the trigger -> the
//      address and heading; "← Back" -> home; open the page's address directly
//      (a server render), "← Back" -> home, not off-site; the run's own probe
//      passes and a probe for a page the link doesn't open fails.
//
// Needs network for the scaffold and one `npm i`.
// Usage: node tests/e2e/navigate-framework-real.mjs
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const { linkToScreen, judgeProbe } = await import(join(repo, 'packages/pipeline/dist/index.js'))
const ts = (await import('typescript')).default
const probeJs = ts.transpileModule(readFileSync(join(repo, 'packages/overlay-client/src/probe-exec.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText + '\nwindow.__s2cRunProbe = runProbe\n'

const work = mkdtempSync(join(tmpdir(), 's2c-rrfw-'))
const starter = process.env.S2C_RR_STARTER ?? join(work, 'starter')
if (!process.env.S2C_RR_STARTER) {
  console.log('scaffolding create-react-router@8.4.0 + installing …')
  execFileSync('npx', ['-y', 'create-react-router@8.4.0', 'starter', '--yes', '--no-git-init', '--no-install'], { cwd: work, stdio: 'pipe' })
  execFileSync('npm', ['i', '--no-audit', '--no-fund', '--silent'], { cwd: starter, stdio: 'inherit' })
  execFileSync('npm', ['i', '--no-audit', '--no-fund', '--silent', '@react-router/fs-routes@^8.4.0'], { cwd: starter, stdio: 'inherit' })
}

const IMPORTS = 'import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";\n'
const SHAPES = [
  {
    name: 'the starter\'s own routes.ts (one index(), one line), a button',
    routes: null,
    trigger: '<button className="btn">See pricing</button>', click: 'See pricing', screen: 'Pricing', path: '/pricing',
  },
  {
    name: 'a layout() around home + a top-level catch-all, an <a href="#">',
    routes: `${IMPORTS}
export default [
  layout("routes/shell.tsx", [
    index("routes/home.tsx"),
  ]),
  route("*", "routes/missing.tsx"),
] satisfies RouteConfig;
`,
    extra: {
      'app/routes/shell.tsx': 'import { Outlet } from "react-router";\nexport default function Shell() {\n  return <div><nav>Shell nav</nav><Outlet /></div>;\n}\n',
      'app/routes/missing.tsx': 'export default function Missing() {\n  return <h1>Not found</h1>;\n}\n',
    },
    trigger: '<a href="#">Docs</a>', click: 'Docs', screen: 'Docs', path: '/docs', navStays: true,
  },
  {
    name: 'flatRoutes(): the new file is the route, a button',
    routes: 'import { type RouteConfig } from "@react-router/dev/routes";\nimport { flatRoutes } from "@react-router/fs-routes";\n\nexport default flatRoutes() satisfies RouteConfig;\n',
    rename: ['app/routes/home.tsx', 'app/routes/_index.tsx'],
    trigger: '<button className="btn">Team</button>', click: 'Team', screen: 'Team', path: '/team',
  },
]

const failures = []
const check = (shape, ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`)
  if (!ok) failures.push(`${shape}: ${what}`)
}

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
let port = 5410
for (const s of SHAPES) {
  console.log(`\n▸ ${s.name}`)
  // a real node_modules (hard links, so it's instant): a symlink resolves to a
  // path outside Vite's file-serving allow list, the client entry is refused,
  // and the page never hydrates
  const root = mkdtempSync(join(work, 'app-'))
  for (const n of readdirSync(starter)) {
    if (!/^(node_modules|\.react-router|build|package-lock\.json)$/.test(n)) cpSync(join(starter, n), join(root, n), { recursive: true })
  }
  execFileSync('cp', ['-al', join(starter, 'node_modules'), join(root, 'node_modules')])
  if (s.routes) writeFileSync(join(root, 'app/routes.ts'), s.routes)
  for (const [rel, text] of Object.entries(s.extra ?? {})) writeFileSync(join(root, rel), text)
  if (s.rename) {
    writeFileSync(join(root, s.rename[1]), readFileSync(join(root, s.rename[0]), 'utf8').replace('./+types/home', './+types/_index'))
    rmSync(join(root, s.rename[0]))
  }
  // the trigger, in the starter's "What's next?" card
  const wRel = 'app/welcome/welcome.tsx'
  const w = readFileSync(join(root, wRel), 'utf8')
  const anchor = 'What&apos;s next?\n            </p>\n'
  if (!w.includes(anchor)) { check(s.name, false, 'starter welcome.tsx changed shape'); continue }
  const withTrigger = w.replace(anchor, `${anchor}            ${s.trigger}\n`)
  writeFileSync(join(root, wRel), withTrigger)
  const before = withTrigger.slice(0, withTrigger.indexOf(s.trigger))
  const line = before.split('\n').length
  const col = before.length - before.lastIndexOf('\n')

  const out = linkToScreen(root, { srcLoc: `${wRel}:${line}:${col}`, screen: s.screen })
  check(s.name, out.ok, `engine: ${out.ok ? out.change : out.error}`)
  if (!out.ok) continue
  check(s.name, out.route === s.path, `route ${out.route}`)
  console.log(`    routes.ts: ${readFileSync(join(root, 'app/routes.ts'), 'utf8').split('\n').filter((l) => /pricing|docs|team/.test(l)).join(' | ').trim() || '(unchanged)'}`)

  // the dev plugin would stamp data-s2c; this app has no plugin, so stamp the trigger by hand
  {
    const code = readFileSync(join(root, wRel), 'utf8')
    const at = code.indexOf(`>${s.click}<`)
    writeFileSync(join(root, wRel), code.slice(0, at) + ' data-s2c="T"' + code.slice(at))
  }

  let typed = true
  try { execFileSync('npm', ['run', 'typecheck', '--silent'], { cwd: root, stdio: 'pipe' }) } catch (e) {
    typed = false
    console.log(String(e.stdout ?? '') + String(e.stderr ?? e))
  }
  check(s.name, typed, 'npm run typecheck (react-router typegen && tsc --strict)')

  const p = port++
  const server = spawn(join(root, 'node_modules/.bin/react-router'), ['dev', '--port', String(p), '--strictPort'], { cwd: root, stdio: 'pipe' })
  let log = ''
  await new Promise((r) => {
    const on = (d) => { log += String(d); if (log.includes(`:${p}`)) r() }
    server.stdout.on('data', on); server.stderr.on('data', on); setTimeout(r, 30000)
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && /hydrat/i.test(m.text())) errors.push(m.text()) })
  const base = `http://localhost:${p}`
  const heading = (name) => page.getByRole('heading', { name, exact: true })
  const onHome = () => page.getByText('What’s next?').or(page.getByText("What's next?")).first()
  try {
    await page.goto(base + '/')
    await onHome().waitFor({ timeout: 20000 })
    await page.waitForLoadState('networkidle')
    await page.getByText(s.click, { exact: true }).click()
    await heading(s.screen).waitFor({ timeout: 10000 }).catch(() => {})
    check(s.name, new URL(page.url()).pathname === s.path, `click -> address ${new URL(page.url()).pathname}`)
    check(s.name, await heading(s.screen).isVisible(), `"${s.screen}" heading shows`)
    check(s.name, !(await onHome().isVisible()), 'home page is gone')
    if (s.navStays) check(s.name, await page.getByText('Shell nav').isVisible(), 'the layout is still there: the page went inside layout()')
    await page.getByText('← Back').click()
    await onHome().waitFor({ timeout: 10000 }).catch(() => {})
    check(s.name, new URL(page.url()).pathname === '/' && await onHome().isVisible(), '← Back -> home')
    // opened directly (server-rendered): Back must stay in the app
    await page.goto(base + s.path)
    await heading(s.screen).waitFor({ timeout: 10000 })
    await page.waitForLoadState('networkidle')
    await page.getByText('← Back').click()
    await onHome().waitFor({ timeout: 10000 }).catch(() => {})
    check(s.name, page.url().startsWith(base) && new URL(page.url()).pathname === '/', `opened directly, ← Back -> home (${page.url()})`)
    check(s.name, (await page.title()) !== '' , `title on home: "${await page.title()}"`)
    // the run's own probe
    await page.goto(base + '/')
    await onHome().waitFor({ timeout: 10000 })
    await page.waitForLoadState('networkidle')
    await page.addScriptTag({ type: 'module', content: probeJs })
    await page.waitForFunction(() => typeof window.__s2cRunProbe === 'function')
    const spec = { actionIndex: 0, kind: 'navigate', trigger: { srcLoc: 'T', label: `"${s.click}"` }, screen: { route: out.route, heading: s.screen }, claim: '' }
    const obs = await page.evaluate((sp) => window.__s2cRunProbe(sp), spec)
    const verdict = judgeProbe(spec, obs, { changed: [], restored: true })
    check(s.name, verdict.status === 'passed', `the run's probe: ${verdict.status}: ${verdict.reason}`)
    check(s.name, new URL(page.url()).pathname === '/' && await onHome().isVisible(), 'the probe left the page where it was')
    const wrong = { ...spec, screen: { route: '/nowhere', heading: 'Nowhere' } }
    const wv = judgeProbe(wrong, await page.evaluate((sp) => window.__s2cRunProbe(sp), wrong), { changed: [], restored: true })
    check(s.name, wv.status === 'failed', `a probe for a page it doesn't open fails: ${wv.reason}`)
    // the new page's own <title> from its meta()
    await page.goto(base + s.path)
    await heading(s.screen).waitFor({ timeout: 10000 })
    check(s.name, (await page.title()) === s.screen, `the page's title is "${await page.title()}"`)
    check(s.name, errors.length === 0, `no page or hydration errors${errors.length ? ': ' + errors.join('; ') : ''}`)
  } catch (e) {
    check(s.name, false, `browser: ${e.message}`)
    console.log(log.slice(-2000))
  } finally {
    await page.close()
    server.kill()
  }
}
await browser.close()
rmSync(work, { recursive: true, force: true })
console.log(failures.length ? `\nFAILED ${failures.length}:\n  ${failures.join('\n  ')}` : '\nall green')
process.exit(failures.length ? 1 : 0)

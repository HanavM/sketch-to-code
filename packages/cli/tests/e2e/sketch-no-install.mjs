/**
 * End-to-end proof for `sketch-to-code sketch`: the overlay runs on somebody
 * else's project and leaves no trace in it.
 *
 * That last clause is the whole product claim, and it is the only thing here a
 * unit test cannot check. So this scaffolds a real Vite + React app in a temp
 * dir, records its every file and its package.json byte-for-byte, runs the
 * command against it, drives the overlay with a real browser, and then proves
 * the project is EXACTLY as it was — no plugin in the config, no dependency
 * added, no node_modules entry — while the overlay was nonetheless fully alive
 * and able to edit source.
 *
 * Deliberately no model call: the thing being tested is the door, not what
 * happens once you are inside. A zero-token deterministic edit (/@s2c/manipulate)
 * proves the plugin's middleware is really wired to this project's files.
 *
 * Usage: node packages/cli/tests/e2e/sketch-no-install.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../../../..', import.meta.url).pathname)
const CLI = join(REPO, 'packages', 'cli', 'dist', 'bin.js')
const KEEP = process.argv.includes('--keep')
const log = (...a) => console.log('[e2e-sketch]', ...a)

const write = (dir, rel, text) => {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** Every file in the project except node_modules, with its bytes. */
const snapshotTree = (dir) => {
  const out = new Map()
  const walk = (sub) => {
    for (const name of readdirSync(join(dir, sub))) {
      if (name === 'node_modules' || name === '.git') continue
      const rel = sub ? join(sub, name) : name
      const abs = join(dir, rel)
      if (statSync(abs).isDirectory()) walk(rel)
      else out.set(rel, readFileSync(abs, 'utf8'))
    }
  }
  walk('')
  return out
}

const diffTrees = (before, after) => {
  const changed = []
  for (const [rel, text] of after) {
    if (!before.has(rel)) changed.push(`added ${rel}`)
    else if (before.get(rel) !== text) changed.push(`edited ${rel}`)
  }
  for (const rel of before.keys()) if (!after.has(rel)) changed.push(`deleted ${rel}`)
  return changed
}

const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-sketch-')))
log('project:', dir)

write(dir, 'package.json', `${JSON.stringify({
  name: 'sketch-e2e-app',
  private: true,
  version: '0.0.0',
  type: 'module',
  scripts: { dev: 'vite' },
  dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
  devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' },
}, null, 2)}\n`)
// Note what is NOT here: no sketch2code import, no plugin in the array. This is
// the config a developer who has never heard of this tool already has.
write(dir, 'vite.config.js', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`)
write(dir, 'index.html', `<!doctype html>
<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
`)
write(dir, 'src/main.jsx', `import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
`)
write(dir, 'src/App.jsx', `export default function App() {
  return (
    <main>
      <h1 id="title" className="text-xl">Sketch me</h1>
    </main>
  )
}
`)

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

let child = null
let browser = null
try {
  log('installing only react + vite — sketch-to-code is never a dependency here')
  const install = spawnSync('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: dir, encoding: 'utf8' })
  if (install.status !== 0) throw new Error(`npm install failed:\n${install.stdout}${install.stderr}`)
  spawnSync('git', ['init', '-q'], { cwd: dir })
  spawnSync('git', ['add', '-A'], { cwd: dir })
  spawnSync('git', ['-c', 'user.email=e2e@x', '-c', 'user.name=e2e', 'commit', '-qm', 'init'], { cwd: dir })

  const before = snapshotTree(dir)
  const pkgBefore = readFileSync(join(dir, 'package.json'), 'utf8')
  const cfgBefore = readFileSync(join(dir, 'vite.config.js'), 'utf8')
  log(`recorded ${before.size} files`)

  // ── run the command, keeping it alive so we can poke the server ────────────
  log('npx sketch-to-code sketch --keep-open --no-open')
  child = spawn('node', [CLI, 'sketch', dir, '--keep-open', '--no-open'], { encoding: 'utf8' })
  let out = ''
  child.stdout.on('data', (d) => { out += String(d) })
  child.stderr.on('data', (d) => { out += String(d) })

  // the url it chose — deliberately not a port we picked, so this has to read it
  let url = null
  for (let i = 0; i < 120 && url === null; i++) {
    const m = /(http:\/\/localhost:\d+)/.exec(out)
    if (m) url = m[1]
    else await new Promise((r) => setTimeout(r, 500))
  }
  if (!url) throw new Error(`no url within 60s. output:\n${out}`)
  log('server:', url)
  check('it chose a free port itself', /localhost:\d{4,5}/.test(url), url)
  check('it says the project is untouched', /untouched/i.test(out))

  // ── the overlay is really there, on their app ─────────────────────────────
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 } })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 })
  check('the overlay loaded into a project that never installed it', true)

  const stamped = await page.evaluate(() => {
    const el = document.getElementById('title')
    return { stamp: el?.dataset.s2c ?? null, text: el?.textContent ?? '' }
  })
  log('stamp on <h1>:', stamped.stamp)
  check('their JSX got stamped', /^src\/App\.jsx:\d+:\d+$/.test(stamped.stamp ?? ''), stamped.stamp ?? 'none')

  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  check('the middleware answers', ping?.hasPipeline === true, JSON.stringify(ping))

  // ── and it can really edit their source: one zero-token nudge ─────────────
  // Through /@s2c/manipulate, the same deterministic path tweak-mode dragging
  // uses. No model, so this stays free and repeatable, and it still proves the
  // thing that matters: the middleware is wired to THIS project's files.
  const nudge = await page.evaluate(async () => {
    const res = await fetch('/@s2c/manipulate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': window.__S2C_TOKEN__ ?? '' },
      body: JSON.stringify({
        // 'ml' is one of the spacing props applyManipulation accepts; the
        // first attempt here passed the CSS name ('margin-left') and got a
        // TypeError out of the engine rather than a refusal, which is worth
        // knowing about separately — see the note at the end of this file.
        srcLoc: document.getElementById('title').dataset.s2c,
        prop: 'ml', px: 16,
      }),
    })
    return { status: res.status, body: (await res.text()).slice(0, 200) }
  })
  log('manipulate:', nudge.status, nudge.body)
  const appAfter = readFileSync(join(dir, 'src/App.jsx'), 'utf8')
  const edited = appAfter !== before.get('src/App.jsx')
  check('it edited their source file', edited,
    edited ? (appAfter.match(/className="[^"]*"/)?.[0] ?? 'changed') : 'unchanged')

  // ── the point: nothing about the PROJECT changed ──────────────────────────
  check('package.json is byte-identical', readFileSync(join(dir, 'package.json'), 'utf8') === pkgBefore)
  check('vite.config.js is byte-identical', readFileSync(join(dir, 'vite.config.js'), 'utf8') === cfgBefore)
  check('no sketch-to-code in node_modules',
    !readdirSync(join(dir, 'node_modules')).includes('sketch-to-code'))
  check('no @s2c scope in node_modules',
    !readdirSync(join(dir, 'node_modules')).includes('@s2c'))

  const after = snapshotTree(dir)
  const changed = diffTrees(before, after).filter((c) => !c.endsWith('src/App.jsx'))
  log('files changed besides the edit itself:', changed.length ? changed.join(', ') : 'none')
  // .sketch2code/ is the run log and is expected; anything else is a trace we
  // promised not to leave
  const unexpected = changed.filter((c) => !/\.sketch2code\//.test(c))
  check('left nothing behind but its own run log', unexpected.length === 0, unexpected.join(', '))

  const real = errs.filter((e) => !/ResizeObserver/.test(e))
  check('no page errors', real.length === 0, real[0] ?? '')
} finally {
  await browser?.close().catch(() => undefined)
  if (child && !child.killed) child.kill('SIGTERM')
  await new Promise((r) => setTimeout(r, 800))
  if (!KEEP) rmSync(dir, { recursive: true, force: true })
  else log('kept:', dir)
}

if (failures) {
  console.error(`\n[e2e-sketch] ${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('\n[e2e-sketch] PASS — drew on a project that never installed anything, and left it as it was')

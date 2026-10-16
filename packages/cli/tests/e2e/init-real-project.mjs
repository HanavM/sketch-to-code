/**
 * End-to-end proof for `sketch2code init`: scaffold a REAL Vite + React app in a
 * temp dir (outside this repo, not a git repo), run the CLI against it, then
 * boot that project's own dev server and drive it with playwright to assert the
 * overlay actually loads and the plugin's middleware answers.
 *
 * Unit tests cover the file surgery; this covers the only question they can't:
 * does the thing we wrote actually run in a project we did not build ourselves.
 *
 * Usage: node packages/cli/tests/e2e/init-real-project.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium } from 'playwright'

// first free port in 5220-5229 — 5199/5206/5211 belong to other work, and
// unrelated system daemons do grab high ports now and then (strictPort would
// then fail the run for a reason that has nothing to do with the CLI)
const portFree = (p) => new Promise((res) => {
  const s = createServer()
  s.once('error', () => res(false))
  s.listen(p, '127.0.0.1', () => s.close(() => res(true)))
})
let PORT = null
for (let p = 5220; p <= 5229 && PORT === null; p++) if (await portFree(p)) PORT = p
if (PORT === null) throw new Error('no free port in 5220-5229')
const REPO = realpathSync(new URL('../../../..', import.meta.url).pathname)
const CLI = join(REPO, 'packages', 'cli', 'dist', 'bin.js')
const KEEP = process.argv.includes('--keep')
const log = (...a) => console.log('[e2e-cli]', ...a)

const write = (dir, rel, text) => {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts })
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`
  return { code: res.status, out }
}

// ── 1. a real, minimal Vite + React app in a temp dir ────────────────────────
const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-e2e-')))
log('project:', dir)

write(dir, 'package.json', `${JSON.stringify({
  name: 'e2e-app',
  private: true,
  version: '0.0.0',
  type: 'module',
  scripts: { dev: 'vite', build: 'vite build' },
  dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
  devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' },
}, null, 2)}\n`)

// the shape `npm create vite -- --template react` produces, plus a pinned port
write(dir, 'vite.config.js', `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: ${PORT}, strictPort: true },
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
      <h1 id="title">Sketch me</h1>
      <button className="bg-blue-500">Save</button>
    </main>
  )
}
`)

let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}

let server = null
try {
  log('installing the app deps (react/vite) — no sketch2code yet')
  const install = run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: dir })
  if (install.code !== 0) throw new Error(`npm install failed:\n${install.out}`)

  // ── 2. doctor BEFORE init: it should say what's missing ─────────────────────
  log('sketch2code doctor (before init)')
  const before = run('node', [CLI, 'doctor', dir])
  console.log(before.out.trim().split('\n').map((l) => `    ${l}`).join('\n'))
  check('doctor exits non-zero before setup', before.code === 1, `code ${before.code}`)
  check('doctor reports the missing dependency', /is not a dependency/.test(before.out))
  check('doctor reports "not inside a git repository"', /not inside a git repository/.test(before.out))

  // ── 3. init ────────────────────────────────────────────────────────────────
  log('sketch2code init --yes (non-git folder: it must offer git init + a commit)')
  const init = run('node', [CLI, 'init', dir, '--yes'])
  console.log(init.out.trim().split('\n').map((l) => `    ${l}`).join('\n'))
  check('init exits 0', init.code === 0, `code ${init.code}`)
  check('init made the repo + initial commit', /git init \+ initial commit/.test(init.out))
  check('init wired the config', /updated vite\.config\.js/.test(init.out))
  check('init verified the config loads', /vite loaded the config; plugins:/.test(init.out))
  check('sketch2code is in the resolved plugin list', /plugins:.*sketch2code/.test(init.out))
  check('init committed its own changes', /committed setup as/.test(init.out))

  const config = readFileSync(join(dir, 'vite.config.js'), 'utf8')
  check('config imports the plugin', config.includes("import sketch2code from '@s2c/vite-plugin'"))
  check('config calls it first in plugins', /plugins: \[sketch2code\(\), react\(\)\]/.test(config))
  check('.sketch2code/ is ignored', readFileSync(join(dir, '.gitignore'), 'utf8').includes('.sketch2code/'))
  check('git tree is clean after init', run('git', ['status', '--porcelain'], { cwd: dir }).out.trim() === '')

  // ── 4. init twice must be a no-op ──────────────────────────────────────────
  log('sketch2code init again (idempotence)')
  const again = run('node', [CLI, 'init', dir, '--yes'])
  check('second init exits 0', again.code === 0)
  check('second init changes the config not at all', readFileSync(join(dir, 'vite.config.js'), 'utf8') === config)
  check('second init says it is already wired', /already wires sketch2code/.test(again.out))
  check('second init does not duplicate the dependency', /already in devDependencies/.test(again.out))
  check('one plugin entry only', config.match(/sketch2code\(/g).length === 1)

  // ── 5. doctor AFTER init ───────────────────────────────────────────────────
  log('sketch2code doctor (after init)')
  const after = run('node', [CLI, 'doctor', dir])
  console.log(after.out.trim().split('\n').map((l) => `    ${l}`).join('\n'))
  check('doctor is healthy', after.code === 0, `code ${after.code}`)
  check('doctor reports the dev-server port', new RegExp(`localhost:${PORT}`).test(after.out))
  check('doctor sees the pipeline', /@s2c\/pipeline resolves/.test(after.out))
  check('doctor finds Claude Code', /Claude Code \d/.test(after.out))
  check('doctor points at /@s2c/runs', /@s2c\/runs/.test(after.out))

  // ── 6. the project's OWN dev server, driven by playwright ──────────────────
  log(`starting the app's dev server on :${PORT}`)
  // detached: npm spawns vite as a child, so killing npm alone orphans the
  // listener; a process group can be killed whole
  server = spawn('npm', ['run', 'dev'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  const serverLog = []
  server.stdout.on('data', (d) => serverLog.push(String(d)))
  server.stderr.on('data', (d) => serverLog.push(String(d)))

  const url = `http://localhost:${PORT}/`
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500))
    up = await fetch(url).then((r) => r.ok).catch(() => false)
  }
  if (!up) throw new Error(`dev server never came up:\n${serverLog.join('')}`)
  check('dev server is serving', up)
  check('the plugin attached the pipeline', /pipeline attached/.test(serverLog.join('')))

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(url, { waitUntil: 'networkidle' })

  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  check('/@s2c/ping answers ok', ping.ok === true, JSON.stringify(ping))
  check('ping root is the project', ping.root === dir, ping.root)
  check('ping reports the pipeline attached', ping.hasPipeline === true)

  const overlay = await page.evaluate(() => {
    const host = document.getElementById('s2c-overlay-host')
    return {
      exists: !!host,
      shadow: !!host?.shadowRoot,
      hud: !!host?.shadowRoot?.getElementById('status'),
      stamped: document.querySelectorAll('[data-s2c]').length,
      stampSample: document.querySelector('#title')?.getAttribute('data-s2c') ?? null,
    }
  })
  check('overlay host element exists', overlay.exists)
  check('overlay mounted a shadow root', overlay.shadow)
  check('the HUD is inside it', overlay.hud)
  check('JSX elements were stamped with file:line:col', overlay.stamped > 0, `${overlay.stamped} stamped`)
  check('the h1 stamp points at App.jsx', /src\/App\.jsx:\d+:\d+/.test(overlay.stampSample ?? ''), overlay.stampSample)

  // The page opens in design, ready to draw: what init and doctor now tell the
  // user. Alt+D pauses drawing and brings it back. (This check used to press
  // Alt+D first and expect drawing, which is the opposite since design became
  // the default surface: following the old printed instruction turned
  // drawing OFF.)
  const drawState = () => page.evaluate(() => {
    const host = document.getElementById('s2c-overlay-host')
    const canvas = host.shadowRoot.getElementById('canvas')
    return {
      mode: host.dataset.mode,
      pointer: canvas ? getComputedStyle(canvas).pointerEvents : null,
      status: host.shadowRoot.getElementById('status')?.textContent ?? '',
    }
  })
  const altD = async () => {
    await page.keyboard.down('Alt')
    await page.keyboard.press('KeyD')
    await page.keyboard.up('Alt')
    await page.waitForTimeout(400)
  }
  const onLoad = await drawState()
  check('the page opens with a live drawing surface', onLoad.mode === 'draw' && onLoad.pointer === 'auto', JSON.stringify(onLoad))
  check('the bar does not tell you to press Alt+D to draw', !/Alt\+D to draw/.test(onLoad.status), onLoad.status)
  await altD()
  const paused = await drawState()
  check('Alt+D pauses drawing', paused.mode === 'idle' && paused.pointer === 'none', JSON.stringify(paused))
  check('the bar says drawing is paused', /paused/.test(paused.status), paused.status)
  await altD()
  const back = await drawState()
  check('Alt+D again brings drawing back', back.mode === 'draw' && back.pointer === 'auto', JSON.stringify(back))

  const runsPage = await page.evaluate(() => fetch('/@s2c/runs').then((r) => r.status))
  check('/@s2c/runs is reachable', runsPage === 200, `status ${runsPage}`)
  check('no page errors', errors.length === 0, errors.join(' | '))

  await browser.close()
} catch (err) {
  failures++
  console.error('[e2e-cli] FAILED:', err.message)
} finally {
  if (server) {
    try { process.kill(-server.pid, 'SIGTERM') } catch { server.kill('SIGTERM') }
    await new Promise((r) => setTimeout(r, 500))
    if (server.exitCode === null) {
      try { process.kill(-server.pid, 'SIGKILL') } catch { server.kill('SIGKILL') }
    }
    // strictPort means a leftover listener would break the next run
    spawnSync('sh', ['-c', `lsof -ti :${PORT} | xargs kill -9 2>/dev/null; true`])
  }
  if (KEEP) log('keeping', dir)
  else rmSync(dir, { recursive: true, force: true })
}

console.log(failures === 0 ? '\n[e2e-cli] ALL CHECKS PASSED' : `\n[e2e-cli] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

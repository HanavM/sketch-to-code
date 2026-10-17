/**
 * s2c-005, SEED done #3: `init` → first ✓ on projects we did not write, zero
 * tokens.
 *
 * Five real, published Vite + React project shapes, each scaffolded fresh by
 * its own pinned generator from npm (nothing hand-written except the
 * workspace wrapper in #5):
 *
 *   1. vite-react-ts            create-vite 9.2.1, react-ts
 *   2. vite-react-compiler-ts   create-vite 9.2.1, react-compiler-ts (babel plugin beside react())
 *   3. tanstack-router          create-tsrouter-app 0.54.45 (Tailwind v4, file routes,
 *                               `const config = defineConfig(...)`, dev on --port 3000)
 *   4. vite-ssr-react-ts        create-vite-extra 5.0.3, ssr-react-ts (`npm run dev` is
 *                               `node server`: express + vite in middleware mode)
 *   5. npm-workspace            #1 moved to apps/web of an npm workspace whose git root
 *                               is the workspace, deps hoisted (most company repos)
 *
 * Per project, the way a person would: doctor (before), `init --yes`, doctor
 * (after), boot the dev server the way `npm run dev` does (in this process so
 * the model can be scripted), open the URL init PRINTED, ring the main
 * heading and type "red", and wait for "✓". Records minutes to first ✓.
 *
 * What is scripted is only the model: the reading (modify the h1) and the
 * edit (add a red style to the first <h1> under src/). Grounding, the overlay,
 * the safety checkpoint, verification and the Done sentence are all real.
 *
 * Not GitHub clones: this run is only allowed its own repo, so the projects
 * are what the generators publish to npm, not someone's app. See
 * docs/onboarding-real-projects.md.
 *
 * Usage: node packages/cli/tests/e2e/onboard-real-projects.mjs [--keep] [--only name,name] [--report out.md]
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { createServer as netServer } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../../../..', import.meta.url).pathname)
const CLI = join(REPO, 'packages', 'cli', 'dist', 'bin.js')
const KEEP = process.argv.includes('--keep')
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const ONLY = arg('--only')?.split(',') ?? null
const REPORT = arg('--report')
const log = (...a) => console.log('[onboard]', ...a)
const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', timeout: 300_000, ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}
let failures = 0
const results = []
let cur = null
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) { failures++; cur?.fails.push(`${label}${extra ? ` — ${extra}` : ''}`) }
  return ok
}
const portFree = (p) => new Promise((res) => {
  const s = netServer()
  s.once('error', () => res(false))
  s.listen(p, '127.0.0.1', () => s.close(() => res(true)))
})
const install = (dir) => run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: dir })
const git = (dir, ...a) => run('git', a, { cwd: dir })

const PROJECTS = [
  {
    name: 'vite-react-ts',
    create: (parent) => {
      const r = run('npm', ['create', '--yes', 'vite@9.2.1', 'app', '--', '--template', 'react-ts', '--no-interactive'], { cwd: parent, input: '' })
      return { ...r, dir: join(parent, 'app'), install: true }
    },
  },
  {
    name: 'vite-react-compiler-ts',
    create: (parent) => {
      const r = run('npm', ['create', '--yes', 'vite@9.2.1', 'app', '--', '--template', 'react-compiler-ts', '--no-interactive'], { cwd: parent, input: '' })
      return { ...r, dir: join(parent, 'app'), install: true }
    },
  },
  {
    name: 'tanstack-router',
    create: (parent) => {
      // installs its own deps; its optional "@tanstack/intent install" step
      // may fail offline and is not ours
      const r = run('npx', ['--yes', 'create-tsrouter-app@0.54.45', 'app', '--no-git', '--package-manager', 'npm', '--no-toolchain'], { cwd: parent, input: '' })
      const dir = join(parent, 'app')
      return { ...r, code: existsSync(join(dir, 'node_modules', 'vite')) ? 0 : r.code, dir, install: false }
    },
  },
  {
    name: 'vite-ssr-react-ts',
    server: 'node-server',
    create: (parent) => {
      const r = run('npm', ['create', '--yes', 'vite-extra@5.0.3', 'app', '--', '--template', 'ssr-react-ts', '--no-interactive'], { cwd: parent, input: '' })
      return { ...r, dir: join(parent, 'app'), install: true }
    },
  },
  {
    name: 'npm-workspace',
    create: (parent) => {
      const root = join(parent, 'acme')
      mkdirSync(join(root, 'apps'), { recursive: true })
      const r = run('npm', ['create', '--yes', 'vite@9.2.1', 'web', '--', '--template', 'react-ts', '--no-interactive'], { cwd: join(root, 'apps'), input: '' })
      const dir = join(root, 'apps', 'web')
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      pkg.name = '@acme/web'
      writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
      writeFileSync(join(root, 'package.json'), `${JSON.stringify({ name: 'acme', private: true, workspaces: ['apps/*'] }, null, 2)}\n`)
      writeFileSync(join(root, '.gitignore'), 'node_modules\n')
      const inst = install(root)
      if (inst.code !== 0) return { ...inst, dir }
      // an existing repo, committed, git root = the workspace
      git(root, 'init', '-q')
      git(root, 'add', '-A')
      git(root, '-c', 'user.email=dev@acme.test', '-c', 'user.name=dev', 'commit', '-qm', 'initial')
      return { ...r, dir, root, install: false }
    },
  },
]

/** The URL `init` told the person to open, from its "Next:" lines. */
const printedUrl = (out) => out.match(/open (http:\/\/localhost:\d+)/)?.[1] ?? null

/** First file under src/ with an <h1, the scripted codegen's target. */
const findH1 = (dir) => {
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) { const f = walk(p); if (f) return f } else if (/\.[jt]sx$/.test(e) && /<h1[\s>]/.test(readFileSync(p, 'utf8'))) return p
    }
    return null
  }
  return walk(join(dir, 'src'))
}

const parent0 = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-onboard-')))
const providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
const modelCalls = []
providers.setScriptedModel({
  onCall: (kind) => modelCalls.push({ kind, project: cur?.name }),
  interpret: (req) => {
    const ev = JSON.parse(req.brief)
    const h1 = ev.elementMenu.find((e) => e.tag === 'h1')
    return {
      reading: 'Make the main heading red.',
      actions: [{
        kind: 'modify', elements: [h1?.id], destElement: null, position: null,
        instruction: 'Make the heading text red.', strokes: ev.strokes.map((s) => s.id), layer: null, depicts: null, fidelity: null,
      }],
      unclear: null,
    }
  },
  codegen: ({ turn }) => {
    if (turn === 1 && cur?.dir) {
      const f = findH1(cur.dir)
      if (f) writeFileSync(f, readFileSync(f, 'utf8').replace(/<h1(?=[\s>])/, "<h1 style={{ color: 'red' }}"))
    }
    return 'Done.'
  },
})

const browser = await chromium.launch()
let nextPort = 5260
const servers = []
try {
  for (const P of PROJECTS) {
    if (ONLY && !ONLY.includes(P.name)) continue
    cur = { name: P.name, fails: [], times: {} }
    results.push(cur)
    console.log(`\n── ${P.name}`)
    const parent = join(parent0, P.name)
    mkdirSync(parent)
    let t = Date.now()
    try {
      const made = P.create(parent)
      if (made.code !== 0) throw new Error(`scaffold failed:\n${made.out.slice(-800)}`)
      cur.dir = made.dir
      if (made.install) {
        const i = install(made.dir)
        if (i.code !== 0) throw new Error(`npm install failed:\n${i.out.slice(-800)}`)
      }
      cur.times.scaffold = Date.now() - t
      const pkg = JSON.parse(readFileSync(join(made.dir, 'package.json'), 'utf8'))
      cur.dev = pkg.scripts?.dev ?? null
      log('dev script:', cur.dev)

      const tInit = Date.now()
      const before = run('node', [CLI, 'doctor', made.dir])
      check('doctor (before) says something is missing', before.code !== 0, `code ${before.code}`)
      const init = run('node', [CLI, 'init', made.dir, '--yes'])
      cur.initOut = init.out
      if (!check('init exits 0', init.code === 0, `code ${init.code}`)) console.log(init.out.slice(-1200))
      const after = run('node', [CLI, 'doctor', made.dir])
      if (!check('doctor (after) is healthy', after.code === 0, `code ${after.code}`)) console.log(after.out.slice(-1200))
      const gitRoot = git(made.dir, 'rev-parse', '--show-toplevel').out.trim()
      if (made.root) check('init used the existing repo, not a nested one', gitRoot === realpathSync(made.root), gitRoot)
      check('tree clean after init', git(made.dir, 'status', '--porcelain').out.trim() === '')
      cur.times.init = Date.now() - tInit

      // ── boot it the way `npm run dev` does ────────────────────────────────
      const url = printedUrl(init.out)
      const scriptPort = Number(cur.dev?.match(/--port[=\s]+(\d+)/)?.[1] ?? 0) || null
      let PORT = nextPort++
      while (!(await portFree(PORT))) PORT = nextPort++
      // The dev script's own port when it pins one (3000 for TanStack), else
      // vite's default would be 5173; we remap that to a free one and check
      // that init printed the RIGHT one, not that it guessed 5173.
      const expectPort = scriptPort ?? 5173
      check('init printed the address the dev server actually uses', url === `http://localhost:${expectPort}`, `printed ${url}, dev script → ${expectPort}`)
      const doctorUrl = after.out.match(/then open (http:\/\/localhost:\d+)/)?.[1] ?? null
      check('doctor printed it too', doctorUrl === `http://localhost:${expectPort}`, `printed ${doctorUrl}`)
      const req = createRequire(join(made.dir, 'package.json'))
      if (P.server === 'node-server') {
        // `node server` in the project dir: its own express + vite middleware.
        // It reads ./index.html per request, so the cwd stays there (every
        // path in this file is absolute).
        process.chdir(made.dir)
        process.env.PORT = String(PORT)
        await import(pathToFileURL(join(made.dir, 'server.js')).href)
        delete process.env.PORT
      } else {
        const vite = await import(pathToFileURL(req.resolve('vite')).href)
        const configFile = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'].map((f) => join(made.dir, f)).find(existsSync)
        const server = await vite.createServer({ root: made.dir, configFile, logLevel: 'error', server: { port: PORT, strictPort: true } })
        await server.listen()
        servers.push(server)
      }

      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
      const pageErrors = []
      page.on('pageerror', (e) => pageErrors.push(String(e)))
      await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle', timeout: 60_000 })
      // the overlay can mount after networkidle when the app hydrates late
      await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host'), null, { timeout: 15_000 }).catch(() => {})
      const hasOverlay = await page.evaluate(() => !!document.getElementById('s2c-overlay-host'))
      check('the overlay is on the page', hasOverlay)
      const stamped = await page.evaluate(() => document.querySelectorAll('[data-s2c]').length)
      check('elements are stamped to source', stamped > 0, `${stamped}`)
      if (!hasOverlay) throw new Error('no overlay: skipping the sketch')

      const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
      const strokes = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('ink')?.querySelectorAll('path').length ?? 0).catch(() => 0)
      const r = await page.evaluate(() => { const b = document.querySelector('h1')?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null })
      if (!check('there is a heading to mark', !!r)) throw new Error('no h1')
      const cx = r.x + r.w / 2; const cy = r.y + r.h / 2; const rx = r.w / 2 + 14; const ry = r.h / 2 + 14
      const ring = Array.from({ length: 25 }, (_, i) => [cx + rx * Math.cos((i / 24) * 2 * Math.PI * 1.04), cy + ry * Math.sin((i / 24) * 2 * Math.PI * 1.04)])
      const tSketch = Date.now()
      const s0 = await strokes()
      await page.mouse.move(ring[0][0], ring[0][1])
      await page.mouse.down()
      for (const [x, y] of ring.slice(1)) await page.mouse.move(x, y, { steps: 8 })
      await page.mouse.up()
      await page.waitForTimeout(150)
      check('the pen drew a stroke', (await strokes()) > s0)
      await page.keyboard.type('red', { delay: 25 })
      await page.keyboard.press('Enter')
      const seen = []
      let quiet = 0
      while (Date.now() - tSketch < 45_000) {
        await page.waitForTimeout(200)
        const s = await status()
        if (s === seen.at(-1)) quiet++
        else { quiet = 0; if (s) seen.push(s) }
        if (quiet >= 10 && /✓|✗|⚠|failed|stopped|could not|couldn’t|didn’t/i.test(s)) break
      }
      cur.times.sketch = Date.now() - tSketch
      cur.last = seen.at(-1) ?? ''
      for (const s of seen) console.log(`      │ ${s}`)
      check('the run ends on ✓', /^✓ /.test(cur.last), cur.last)
      const color = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).color).catch(() => '')
      check('the heading is red on the page', color === 'rgb(255, 0, 0)', color)
      check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
      cur.toFirstTick = Date.now() - tInit
      await page.close()
    } catch (err) {
      failures++
      cur.fails.push(`aborted: ${String(err.message ?? err).split('\n')[0]}`)
      console.error('  ✗ aborted:', err.message ?? err)
    }
    log(`${P.name}: ${cur.fails.length ? `${cur.fails.length} failure(s)` : 'ok'}, init→✓ ${cur.toFirstTick ? `${(cur.toFirstTick / 1000).toFixed(1)} s` : '—'}`)
  }
  check('no call reached a real model', modelCalls.every((c) => c.kind !== 'transcribe'))
} finally {
  providers.setScriptedModel(null)
  await browser.close().catch(() => {})
  for (const s of servers) await s.close().catch(() => {})
  if (REPORT) {
    const rows = results.map((r) => `| ${r.name} | \`${r.dev ?? '—'}\` | ${r.fails.some((f) => f.startsWith('init exits')) ? 'fail' : 'pass'} | ${r.times.scaffold ? (r.times.scaffold / 1000).toFixed(0) : '—'} s | ${r.toFirstTick ? (r.toFirstTick / 1000).toFixed(1) + ' s' : '—'} | ${r.fails.length ? r.fails.join('; ') : 'none'} |`)
    writeFileSync(REPORT, `| project | dev script | init | scaffold + install | init → first ✓ | failures |\n|---|---|---|---|---|---|\n${rows.join('\n')}\n`)
    log('report:', REPORT)
  }
  if (KEEP) log('keeping', parent0)
  else rmSync(parent0, { recursive: true, force: true })
}
console.log(failures === 0 ? '\n[onboard] ALL CHECKS PASSED' : `\n[onboard] ${failures} CHECK(S) FAILED`)
// the SSR template's express server has no close handle
process.exit(failures === 0 ? 0 : 1)

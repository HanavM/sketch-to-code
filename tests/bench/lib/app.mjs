/**
 * A throwaway Vite + React + Tailwind app, one per benchmark page.
 *
 * The sketches in this benchmark draw NEW UI onto an empty page, so there is
 * nothing to measure unless the page starts genuinely empty — and nothing is
 * comparable unless each page starts from the SAME empty page. A benchmark that
 * ran every sketch against examples/demo-app would measure "what the model did
 * to a page that already had a navbar, a form and three cards", which is a
 * different and much easier question, and the edits would pile up across pages.
 *
 * So: one scratch app, created fresh, committed, and resettable to that commit.
 *
 * The git repo is not optional. packages/pipeline/src/safety.ts refuses to let
 * a model edit anything unless (a) the app is inside a git repo, (b) that repo's
 * toplevel is not $HOME, and (c) the repo has at least one commit — its
 * checkpoint is `git stash create`, which returns nothing on a clean tree and
 * falls back to `rev-parse HEAD`. With no commit there is no checkpoint and the
 * run is refused outright. `changedFiles()` and `revertToCheckpoint()` then diff
 * against that checkpoint, so the initial commit has to contain EVERYTHING the
 * app needs; anything left uncommitted shows up as a model edit.
 *
 * Exports: makeApp({ dir, port }) -> { dir, port, start() }, resetApp(dir),
 * pluginEntry().
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
/** tests/bench/lib -> the checkout root. */
export const REPO = resolve(HERE, '..', '..', '..')
const PLUGIN_PKG = '@s2c/vite-plugin'
const PLUGIN_DIR = join(REPO, 'packages', 'vite-plugin')

/**
 * Bumping this invalidates every cached scratch app (see `isUsable`), which is
 * what has to happen whenever the files this module writes change shape. v2
 * dropped the @s2c/vite-plugin dependency in favour of an absolute-path import,
 * so a v1 app — whose vite.config.ts imports a bare specifier it never managed
 * to install — must be rebuilt rather than silently reused.
 */
const STAMP_VERSION = 3
const STAMP = '.bench-app.json'

const log = (...a) => console.log('[bench:app]', ...a)

// ── small process helpers ───────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}`.trim() }
}

function mustRun(cmd, args, opts = {}) {
  const res = run(cmd, args, opts)
  if (res.code !== 0) throw new Error(`\`${cmd} ${args.join(' ')}\` failed (${res.code}):\n${res.out}`)
  return res.out
}

function write(dir, rel, text) {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/**
 * How the scratch app reaches the plugin: an ABSOLUTE path to its built entry,
 * imported straight by the generated vite.config.ts. Not a dependency at all.
 *
 * packages/cli/src/deps.ts (`resolveDepSpec`) has the matching discussion for
 * the `init` command, and its two answers both fail for a scratch app:
 *
 * - '*' works only for a real workspace MEMBER. The app lives at
 *   tests/bench/out/app, and this repo's `workspaces` is ["packages/*",
 *   "examples/*"], so being inside the checkout buys nothing — npm goes to the
 *   registry for a package that was never published, and the install fails.
 * - 'file:<abs>' makes npm reify the link's own dependency tree, and the
 *   plugin's deps are @s2c/pipeline, @s2c/dom, @s2c/ink and @s2c/overlay-client
 *   at '*' — four more unpublished packages for npm to hunt for. (It can
 *   succeed, when a previous install left those paths resolvable, which is
 *   exactly the kind of works-on-my-machine the benchmark must not depend on.)
 *
 * Importing the built file by path needs no install and no resolution rules,
 * and it is what packages/cli/src/sketch.ts already does for the same reason.
 * The plugin's own @s2c/* imports then resolve from ITS location inside this
 * checkout, where the workspace links already exist.
 *
 * The cost is that a missing build is now a vite config error instead of an
 * npm error, which is why assertPluginBuilt() runs before anything is written.
 */
export function pluginEntry() {
  return join(PLUGIN_DIR, 'dist', 'index.js')
}

/** Kept as the old name for any caller that still imports it. */
export const pluginDepSpec = pluginEntry

/**
 * The plugin is consumed from `dist/` (its package.json main/exports point
 * there), and so is every @s2c package behind it. A stale or missing build is
 * the single most confusing way for a benchmark run to fail, so say it plainly
 * up front rather than letting vite report a resolution error per page.
 */
function assertPluginBuilt() {
  // the overlay client is deliberately NOT in this list: its package main is
  // ./src/main.ts and the plugin esbuild-bundles it at request time
  // (packages/vite-plugin/src/overlay-bundle.ts), so it has no dist to check.
  const needed = [
    join(PLUGIN_DIR, 'dist', 'index.js'),
    join(REPO, 'packages', 'pipeline', 'dist', 'index.js'),
  ]
  const missing = needed.filter((p) => !existsSync(p))
  if (missing.length) {
    throw new Error(
      `${PLUGIN_PKG} is not built — missing:\n  ${missing.join('\n  ')}\n` +
      `Run \`npm run build\` in ${REPO} first.`,
    )
  }
}

// ── the app's files ─────────────────────────────────────────────────────────

/**
 * Versions and Tailwind wiring copied from examples/demo-app: Tailwind v4 via
 * the `@tailwindcss/vite` plugin and a single `@import "tailwindcss"` in
 * src/index.css — there is no tailwind.config.js and no postcss config, because
 * v4 needs neither. Matching it matters: whatever the model emits has to be
 * styled by the same Tailwind the rest of this project tests against, and a v3
 * setup here would silently drop v4-only utilities.
 */
function appFiles(port, entry) {
  const pkg = {
    name: 'bench-app',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: { dev: 'vite', build: 'vite build' },
    dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
    // no @s2c/* entry: the plugin is imported by absolute path, see pluginEntry()
    devDependencies: {
      '@tailwindcss/vite': '^4.0.0',
      '@types/react': '^19.0.0',
      '@types/react-dom': '^19.0.0',
      '@vitejs/plugin-react': '^5.0.0',
      tailwindcss: '^4.0.0',
      vite: '^7.0.0',
    },
  }
  return {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    // node_modules and .sketch2code/ stay out of the initial commit; everything
    // else must be IN it, or the pipeline's checkpoint diff reads the leftovers
    // as edits the model made.
    '.gitignore': 'node_modules/\ndist/\n.sketch2code/\n.DS_Store\n',
    'vite.config.ts': `import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// ${PLUGIN_PKG}, by absolute path into this checkout's build — these packages are
// unpublished, so there is nothing to install; see pluginEntry() in lib/app.mjs
import sketch2code from '${entry}'

// allowDirty: the benchmark harness resets the tree between attempts itself,
// and a half-written sketch run must not be refused for a stray file.
export default defineConfig({
  plugins: [
    // instant: false — not a preference, a measurement requirement. The instant
    // render writes and mounts a component the moment Run is pressed, vite
    // full-reloads, and the in-flight reading dies with the page that asked for
    // it ("interpret failed: Failed to fetch"). With it on, this benchmark
    // cannot time a reading at all. See docs/findings.md: the race is real for
    // users too, and this flag is a workaround rather than its fix.
    sketch2code({ allowDirty: true, instant: false }),
    react(),
    tailwindcss(),
  ],
  server: { port: ${port}, strictPort: true },
})
`,
    'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>bench app — blank page</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    'src/index.css': '@import "tailwindcss";\n',
    'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
`,
    // Deliberately, verifiably empty: a full-height white canvas and not one
    // child. Every element the scorer finds on this page was put there by the
    // run being measured.
    'src/App.tsx': `export default function App() {
  return <main className="min-h-screen bg-white" />
}
`,
  }
}

function writeApp(dir, port, entry) {
  for (const [rel, text] of Object.entries(appFiles(port, entry))) write(dir, rel, text)
}

// ── git ─────────────────────────────────────────────────────────────────────

/**
 * -c user.*: a scratch dir inherits whatever global git identity exists, and on
 * a machine with none `git commit` fails. The identity is meaningless here, so
 * pin one rather than depend on the environment.
 */
const GIT_ID = ['-c', 'user.name=bench', '-c', 'user.email=bench@localhost', '-c', 'commit.gpgsign=false']

function gitCommitAll(dir, message) {
  mustRun('git', [...GIT_ID, 'add', '-A'], { cwd: dir })
  // --allow-empty: re-pointing the port when nothing else changed is fine
  mustRun('git', [...GIT_ID, 'commit', '--allow-empty', '-q', '-m', message], { cwd: dir })
}

function gitInit(dir) {
  mustRun('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  gitCommitAll(dir, 'bench: blank app')
}

// ── the cache check ─────────────────────────────────────────────────────────

/**
 * Making a scratch app costs an `npm install` (tens of seconds). A benchmark
 * run over a dozen sketches would pay that a dozen times for byte-identical
 * trees, so a dir that already holds a good app is reused as-is: no files
 * rewritten, no install. "Good" means every one of the things that can actually
 * be wrong here is right — the stamp is ours and at this file's version, it
 * records the SAME plugin entry path this checkout now has (a moved or renamed
 * checkout leaves a config importing a file that is gone), that entry still
 * exists, the git repo has a commit to check out, and the installed packages the
 * config imports are present.
 *
 * Reuse is safe because resetApp() returns the tree to the committed blank page;
 * the previous page's generated components are deleted, not inherited.
 */
function isUsable(dir, port) {
  const stampPath = join(dir, STAMP)
  if (!existsSync(stampPath)) return false
  let stamp
  try {
    stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
  } catch {
    return false
  }
  if (stamp.version !== STAMP_VERSION) return false
  // the entry path is baked into the committed vite.config.ts, so a stamp that
  // disagrees with pluginEntry() means the config points somewhere else
  if (stamp.pluginEntry !== pluginEntry()) return false
  if (!existsSync(stamp.pluginEntry)) return false
  if (!existsSync(join(dir, '.git'))) return false
  if (run('git', ['rev-parse', 'HEAD'], { cwd: dir }).code !== 0) return false
  for (const mod of ['vite', '@vitejs/plugin-react', '@tailwindcss/vite', 'react', 'react-dom']) {
    if (!existsSync(join(dir, 'node_modules', ...mod.split('/')))) return false
  }
  return true
}

const stampJson = (port, entry) =>
  `${JSON.stringify({ version: STAMP_VERSION, port, pluginEntry: entry }, null, 2)}\n`

/** Rewrite just the port (cheap) and re-commit, so resetApp keeps it. */
function repoint(dir, port, entry) {
  write(dir, 'vite.config.ts', appFiles(port, entry)['vite.config.ts'])
  writeFileSync(join(dir, STAMP), stampJson(port, entry))
  gitCommitAll(dir, `bench: port ${port}`)
}

// ── public API ──────────────────────────────────────────────────────────────

/**
 * Create (or reuse) a blank app at `dir` wired to the plugin on `port`.
 *
 * Returns { dir, port, start() }. `start()` boots vite and resolves once the
 * server actually answers, with a `stop()` that takes the whole process group
 * down — vite is a grandchild of the spawn when npm is in the middle, and
 * killing only the parent leaves a listener holding a --strictPort port.
 */
export async function makeApp({ dir, port }) {
  if (!dir || !isAbsolute(dir)) throw new Error('makeApp: dir must be an absolute path')
  if (!Number.isInteger(port)) throw new Error('makeApp: port must be an integer')
  assertPluginBuilt()

  const entry = pluginEntry()
  const warm = isUsable(dir, port)
  if (warm) {
    const stamp = JSON.parse(readFileSync(join(dir, STAMP), 'utf8'))
    // reset BEFORE repointing: repoint commits the whole tree, so whatever a
    // crashed run (or a hand measurement) left in src/ would otherwise become
    // part of the "blank" app every later page starts from (s2c-015: it did,
    // and the next page's base commit failed with nothing to commit)
    await resetApp(dir)
    if (stamp.port !== port) repoint(dir, port, entry)
    log(`reusing ${dir} (port ${port})`)
  } else {
    log(`creating ${dir} (port ${port}, ${PLUGIN_PKG} <- ${entry})`)
    // a half-made app from a crashed run is worse than no app; node_modules is
    // the expensive part and an unusable stamp means it cannot be trusted either
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    writeApp(dir, port, entry)
    // react/vite/tailwind only — all published, so this is an ordinary install
    const install = run('npm', ['install', '--silent', '--no-audit', '--no-fund'], { cwd: dir })
    if (install.code !== 0) throw new Error(`npm install failed in ${dir}:\n${install.out}`)
    writeFileSync(join(dir, STAMP), stampJson(port, entry))
    // after the install: package-lock.json is part of "everything", and an
    // uncommitted lockfile would read as a model edit in the checkpoint diff
    gitInit(dir)
  }

  const dirty = run('git', ['status', '--porcelain'], { cwd: dir }).out
  if (dirty) log(`warning: tree is not clean after setup:\n${dirty}`)

  return {
    dir,
    port,
    async start({ timeoutMs = 90_000 } = {}) {
      const url = `http://localhost:${port}/`
      const out = []
      // detached so the whole group can be signalled; XDG_DATA_HOME scoped into
      // the app because the pipeline's GLOBAL component library lives there
      // (packages/pipeline/src/library.ts globalLibraryDir) and a shared one
      // would let page 1's extracted components turn up as reusable material
      // for page 7 — contamination that would quietly inflate later scores.
      // Same path examples/demo-app uses, and it must stay OUTSIDE
      // .sketch2code/library or the global and project libraries coincide.
      const child = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
        cwd: dir,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, XDG_DATA_HOME: join(dir, '.sketch2code', 'xdg'), BROWSER: 'none' },
      })
      // the server's own output also goes to a file, so a run that dies says why (n33)
      const logFile = process.env.S2C_APP_LOG
      const keep = (d) => { out.push(String(d)); if (logFile) try { appendFileSync(logFile, String(d)) } catch { /* best effort */ } }
      child.stdout.on('data', keep)
      child.stderr.on('data', keep)
      let exited = false, exit = null
      child.on('exit', (code, sig) => { exited = true; exit = { code, signal: sig, at: new Date().toISOString() }; if (logFile) try { appendFileSync(logFile, `\n[vite exited code=${String(code)} signal=${String(sig)}]\n`) } catch { /* best effort */ } })

      const stop = async () => {
        try { process.kill(-child.pid, 'SIGTERM') } catch { child.kill('SIGTERM') }
        for (let i = 0; i < 20 && child.exitCode === null && !exited; i++) {
          await new Promise((r) => setTimeout(r, 100))
        }
        if (child.exitCode === null && !exited) {
          try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
        }
        // --strictPort means one leftover listener fails every later page
        spawnSync('sh', ['-c', `lsof -ti :${port} | xargs kill -9 2>/dev/null; true`])
      }

      const deadline = Date.now() + timeoutMs
      let up = false
      while (!up && Date.now() < deadline) {
        if (exited) break
        await new Promise((r) => setTimeout(r, 250))
        up = await fetch(url).then((r) => r.ok).catch(() => false)
      }
      if (!up) {
        await stop()
        throw new Error(`vite never answered on ${url}\n${out.join('')}`)
      }

      // Hand over a WARM server. Answering the HTML is not the same as being
      // ready: a cold vite only discovers react/react-dom when something asks
      // for the entry module, and optimizing them mid-load makes it tell the
      // page to reload. A browser that arrived first sees that reload tear its
      // navigation down — observed as `page.goto` timing out on 'networkidle'
      // for the FIRST benchmark page only, which is exactly the page whose
      // score would then be a lie about the model rather than about the harness.
      // Requesting the entry (and the CSS, so Tailwind's first compile is paid
      // here too) does that discovery before anyone is watching.
      for (const path of ['/', '/src/main.tsx', '/src/index.css', '/@s2c/ping']) {
        await fetch(new URL(path, url)).then((r) => r.arrayBuffer()).catch(() => undefined)
      }
      // let any reload the optimizer decided to trigger happen now, not later
      await new Promise((r) => setTimeout(r, 750))
      await fetch(new URL('/src/main.tsx', url)).catch(() => undefined)

      // n115: a caller waiting on a run can see the server has died (and how) instead of waiting forever
      return { url, port, dir, stop, log: () => out.join(''), alive: () => !exited, exit: () => exit }
    },
  }
}

/**
 * Back to the committed blank page: discard edits to tracked files, delete
 * untracked ones. `git clean -fd` without -x deliberately keeps IGNORED files,
 * so node_modules (and the installed plugin) survive — that is what makes one
 * dir reusable across attempts in seconds instead of a minute.
 *
 * What survives on purpose, and the catch: `.sketch2code/` is ignored too, so
 * the project's run history, its extracted-component library and its drawn
 * rules outlive a reset. That is right for retrying the SAME page (the run log
 * is the evidence) and wrong for a different page, because a component this
 * page's run put in the library is material the next page's run can reuse.
 * Give each benchmark page its own dir, or pass `{ state: true }` to wipe it.
 */
export async function resetApp(dir, { state = false } = {}) {
  mustRun('git', [...GIT_ID, 'checkout', '--', '.'], { cwd: dir })
  mustRun('git', ['clean', '-fdq'], { cwd: dir })
  if (state) rmSync(join(dir, '.sketch2code'), { recursive: true, force: true })
  const left = run('git', ['status', '--porcelain'], { cwd: dir }).out
  if (left) throw new Error(`resetApp: ${dir} is still dirty after reset:\n${left}`)
}

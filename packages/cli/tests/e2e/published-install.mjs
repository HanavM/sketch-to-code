/**
 * s2c-047, SEED done #3 ("npx sketch-to-code init → first edit"): rehearse the
 * published install without publishing anything.
 *
 * Every package is `npm pack`ed exactly as `npm publish` would send it, then
 * published to a throwaway local registry (verdaccio on 127.0.0.1, storage in
 * a temp dir, npmjs as uplink for everything else). A fresh create-vite app
 * then installs ONLY from that registry: `npx sketch-to-code init --yes`,
 * doctor, dev server, Chromium, ring the heading + "red" → ✓. No file: links,
 * no workspace, nothing resolves into this checkout.
 *
 * What it caught the first time: the plugin bundled the overlay from
 * @s2c/dom and @s2c/ink *source*, which only exists in a checkout. Installed
 * from a registry, init said ✓, doctor said "Healthy", and the page had no
 * overlay: nothing to draw on, one console.error as the only clue.
 *
 * What is scripted is only the model (reading + edit), as in
 * onboard-real-projects.mjs. Needs network to npmjs (through the proxy if
 * HTTPS_PROXY is set) and `npm run build` first. Zero tokens.
 *
 * Usage: node packages/cli/tests/e2e/published-install.mjs [--keep]
 */
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../../../..', import.meta.url).pathname)
const KEEP = process.argv.includes('--keep')
const PACKAGES = ['dom', 'ink', 'intent', 'providers', 'pipeline', 'overlay-client', 'vite-plugin', 'cli']
const REG_PORT = 4890
const REG = `http://127.0.0.1:${REG_PORT}/`
const VERDACCIO = 'verdaccio@6.10.5'
const log = (...a) => console.log('[published]', ...a)
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}

const tmp = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-published-')))
const npmrc = join(tmp, 'npmrc')
writeFileSync(npmrc, `registry=${REG}\n//127.0.0.1:${REG_PORT}/:_authToken=local-only\n`)
// own cache: the local 0.1.0 tarballs must never land in the user's npm cache
const env = { ...process.env, NPM_CONFIG_USERCONFIG: npmrc, NPM_CONFIG_CACHE: join(tmp, 'npm-cache'), NPM_CONFIG_UPDATE_NOTIFIER: 'false' }
const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', timeout: 600_000, env, ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}

let registry = null
let server = null
let browser = null
try {
  // ── 1. pack exactly what `npm publish` would send ─────────────────────────
  for (const p of PACKAGES) {
    if (!existsSync(join(REPO, 'packages', p, 'package.json'))) throw new Error(`no package ${p}`)
  }
  if (!existsSync(join(REPO, 'packages/cli/dist/bin.js'))) throw new Error('run `npm run build` first')
  const tgz = join(tmp, 'tgz')
  mkdirSync(tgz)
  for (const p of PACKAGES) {
    const r = run('npm', ['pack', '--ignore-scripts', '--pack-destination', tgz], { cwd: join(REPO, 'packages', p) })
    if (r.code !== 0) throw new Error(`npm pack ${p}:\n${r.out.slice(-600)}`)
  }
  check('every package packs', readdirSync(tgz).length === PACKAGES.length, readdirSync(tgz).join(' '))

  // ── 2. a throwaway registry on localhost ──────────────────────────────────
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || ''
  writeFileSync(join(tmp, 'verdaccio.yaml'), [
    `storage: ${join(tmp, 'storage')}`,
    'uplinks:',
    '  npmjs: { url: https://registry.npmjs.org/, timeout: 60s }',
    ...(proxy ? [`https_proxy: ${proxy}`, `http_proxy: ${proxy}`] : []),
    'packages:',
    "  '@s2c/*': { access: $all, publish: $all }",
    "  'sketch-to-code': { access: $all, publish: $all }",
    "  '**': { access: $all, publish: $all, proxy: npmjs }",
    'log: { type: stdout, format: pretty, level: warn }',
  ].join('\n'))
  registry = spawn('npx', ['--yes', VERDACCIO, '-c', join(tmp, 'verdaccio.yaml'), '-l', `127.0.0.1:${REG_PORT}`], {
    env: { ...process.env, NPM_CONFIG_UPDATE_NOTIFIER: 'false' }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let regLog = ''
  registry.stdout.on('data', (d) => { regLog += d })
  registry.stderr.on('data', (d) => { regLog += d })
  let up = false
  for (let i = 0; i < 120 && !up; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    up = await fetch(`${REG}-/ping`).then((r) => r.ok).catch(() => false)
  }
  if (!check('local registry is up', up)) throw new Error(`verdaccio did not start:\n${regLog.slice(-800)}`)
  for (const f of readdirSync(tgz)) {
    const r = run('npm', ['publish', join(tgz, f), '--registry', REG, '--ignore-scripts'])
    if (!check(`published ${f} to the local registry`, r.code === 0)) console.log(r.out.slice(-600))
  }

  // ── 3. a fresh app that only knows the registry ───────────────────────────
  const parent = join(tmp, 'work')
  mkdirSync(parent)
  const made = run('npm', ['create', '--yes', 'vite@9.2.1', 'app', '--', '--template', 'react-ts', '--no-interactive'], { cwd: parent, input: '' })
  if (made.code !== 0) throw new Error(`create-vite:\n${made.out.slice(-600)}`)
  const dir = join(parent, 'app')
  const inst = run('npm', ['install', '--no-audit', '--no-fund'], { cwd: dir })
  if (inst.code !== 0) throw new Error(`npm install:\n${inst.out.slice(-600)}`)
  run('git', ['init', '-q'], { cwd: dir })
  run('git', ['add', '-A'], { cwd: dir })
  run('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'app'], { cwd: dir })

  // ── 4. what the README will say once it is on npm ─────────────────────────
  const t0 = Date.now()
  const init = run('npx', ['--yes', 'sketch-to-code@0.1.0', 'init', '--yes'], { cwd: dir })
  if (!check('npx sketch-to-code init exits 0', init.code === 0, `code ${init.code}`)) console.log(init.out.slice(-1500))
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const spec = pkg.devDependencies?.['@s2c/vite-plugin'] ?? pkg.dependencies?.['@s2c/vite-plugin']
  check('init wrote the registry range, not a link', spec === '^0.1.0', String(spec))
  const lock = readFileSync(join(dir, 'package-lock.json'), 'utf8')
  check('nothing in the lockfile points into this checkout', !lock.includes(REPO) && !/"file:/.test(lock))
  for (const p of ['vite-plugin', 'pipeline', 'overlay-client', 'dom', 'ink']) {
    const at = join(dir, 'node_modules', '@s2c', p)
    check(`@s2c/${p} is a real install`, existsSync(at) && !lstatSync(at).isSymbolicLink())
  }
  const doctor = run('npx', ['--yes', 'sketch-to-code@0.1.0', 'doctor'], { cwd: dir })
  if (!check('doctor is healthy', doctor.code === 0, `code ${doctor.code}`)) console.log(doctor.out.slice(-1500))
  check('doctor built the drawing layer', /overlay\s+the drawing layer builds/.test(doctor.out))

  // ── 5. boot it, draw, and wait for ✓ ──────────────────────────────────────
  const req = createRequire(join(dir, 'package.json'))
  // the app's own providers copy; the scripted model lives on globalThis anyway
  const providersPath = createRequire(createRequire(req.resolve('@s2c/vite-plugin')).resolve('@s2c/pipeline')).resolve('@s2c/providers')
  check('the model provider comes from the install, not the checkout', !providersPath.startsWith(REPO), providersPath)
  const providers = await import(pathToFileURL(providersPath).href)
  const calls = []
  providers.setScriptedModel({
    onCall: (kind) => calls.push(kind),
    interpret: (r) => {
      const ev = JSON.parse(r.brief)
      const el = ev.elementMenu.find((e) => e.tag === 'h1')
      return {
        reading: 'Make the main heading red.',
        actions: [{ kind: 'modify', elements: [el?.id], destElement: null, position: null, instruction: 'Make the heading text red.', strokes: ev.strokes.map((s) => s.id), layer: null, depicts: null, fidelity: null }],
        unclear: null,
      }
    },
    codegen: ({ turn }) => {
      if (turn === 1) {
        const f = join(dir, 'src', 'App.tsx')
        writeFileSync(f, readFileSync(f, 'utf8').replace('<h1>', "<h1 style={{ color: 'red' }}>"))
      }
      return 'Done.'
    },
  })
  const vite = await import(pathToFileURL(req.resolve('vite')).href)
  server = await vite.createServer({ root: dir, configFile: join(dir, 'vite.config.ts'), logLevel: 'error', server: { port: 5291, strictPort: true } })
  await server.listen()
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto('http://localhost:5291/', { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host') || !!document.getElementById('s2c-overlay-failed'), null, { timeout: 20_000 }).catch(() => {})
  const failedBanner = await page.evaluate(() => document.getElementById('s2c-overlay-failed')?.textContent ?? null)
  check('no "could not start its drawing layer" banner', failedBanner === null, failedBanner ?? '')
  if (!check('the overlay is on the page', await page.evaluate(() => !!document.getElementById('s2c-overlay-host')))) throw new Error('no overlay')

  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const r = await page.evaluate(() => { const b = document.querySelector('h1')?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null })
  if (!check('there is an h1 to mark', !!r)) throw new Error('no h1')
  const cx = r.x + r.w / 2; const cy = r.y + r.h / 2; const rx = r.w / 2 + 14; const ry = r.h / 2 + 14
  const ring = Array.from({ length: 25 }, (_, i) => [cx + rx * Math.cos((i / 24) * 2 * Math.PI * 1.04), cy + ry * Math.sin((i / 24) * 2 * Math.PI * 1.04)])
  await page.mouse.move(ring[0][0], ring[0][1])
  await page.mouse.down()
  for (const [x, y] of ring.slice(1)) await page.mouse.move(x, y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(150)
  await page.keyboard.type('red', { delay: 25 })
  await page.keyboard.press('Enter')
  const tSketch = Date.now()
  const seen = []
  let quiet = 0
  while (Date.now() - tSketch < 45_000) {
    await page.waitForTimeout(200)
    const s = await status()
    if (s === seen.at(-1)) quiet++
    else { quiet = 0; if (s) seen.push(s) }
    if (quiet >= 10 && /✓|✗|⚠|failed|stopped|could not|couldn’t|didn’t/i.test(s)) break
  }
  for (const s of seen) console.log(`      │ ${s}`)
  check('the run ends on ✓', /^✓ /.test(seen.at(-1) ?? ''), seen.at(-1) ?? '')
  const color = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).color).catch(() => '')
  check('the h1 is red on the page', color === 'rgb(255, 0, 0)', color)
  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '))
  check('no call reached a real model', calls.every((c) => c !== 'transcribe'))
  log(`init → ✓ ${((Date.now() - t0) / 1000).toFixed(1)} s (registry on localhost, npm cache cold)`)
  providers.setScriptedModel(null)
} catch (err) {
  failures++
  console.error('  ✗ aborted:', err.message ?? err)
} finally {
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  registry?.kill()
  if (KEEP) log('keeping', tmp)
  else rmSync(tmp, { recursive: true, force: true })
}
console.log(failures === 0 ? '\n[published] ALL CHECKS PASSED' : `\n[published] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

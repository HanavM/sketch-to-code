/**
 * Live e2e (s2c-040): what's drawn inside the screen box becomes the new
 * screen's content.
 *
 * The person draws an arrow from the navbar's "Reports" link to a box, and
 * sketches a search field and a button inside the box. The arrow means "this
 * opens a Reports screen" (s2c-039); the sketch inside means "and it has
 * this on it". Before s2c-040 the sketch went to codegen as an ordinary add
 * placed on the page it was drawn on, so it landed on the HOME page.
 *
 * The demo app's own vite runs IN THIS PROCESS so the model can be scripted
 * (@s2c/providers setScriptedModel), as in the non-coder walkthrough. The
 * script stands in only for what a model decides: the reading (navigate +
 * an add citing the inner strokes) and the files codegen writes. The script
 * writes where the brief tells it to, so whether the add reaches the screen
 * file is decided by the pipeline, not by the test. Everything else is real:
 * the pen, grounding, the navigate engine, the retarget, the page reload, the
 * navigate probe opening the screen and counting what's on it, verification,
 * the receipt, undo.
 *
 * Checks:
 *   1. the codegen brief points the add at src/screens/Reports.tsx and says
 *      it is not for the page it was drawn on
 *   2. the form is in Reports.tsx, App.tsx is untouched
 *   3. the run's own probe passed AND the add's verdict is satisfied by what
 *      the probe saw on the opened screen
 *   4. the receipt names the screen and what went on it, ends on a tick
 *   5. by hand: click Reports → the search field is there; ← Back → home
 *   6. one undo removes everything
 *   7. not hollow: a codegen that ignores the brief and builds on the home
 *      page makes the run FAIL the add in plain words
 *   and: no page errors, zero real model calls
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-navigate-contents.mjs
 * (needs `npm run build` for packages/providers/dist; no dev server needed)
 */
import { execSync } from 'node:child_process'
import { createServer as netServer } from 'node:net'
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { ensureDraw, inkCount, penMode } from './lib/pen.mjs'

const REPO = realpathSync(new URL('../../', import.meta.url).pathname)
const APPDIR = join(REPO, 'examples/demo-app')
const RUNS = join(APPDIR, '.sketch2code/runs')
const log = (...a) => console.log('[e2e-nav-contents]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
}
const runsNow = () => (existsSync(RUNS) ? readdirSync(RUNS) : [])
const portFree = (p) => new Promise((res) => {
  const s = netServer()
  s.once('error', () => res(false))
  s.listen(p, '127.0.0.1', () => s.close(() => res(true)))
})
let PORT = null
for (let p = 5250; p <= 5259 && PORT === null; p++) if (await portFree(p)) PORT = p
if (PORT === null) throw new Error('no free port in 5250-5259')

const CREATED = ['src/screens/Reports.tsx', 'src/screens/index.ts', 'src/lib/screens.tsx']
const EDITED = ['src/main.tsx', 'src/components/Navbar.tsx', 'src/App.tsx']
restore()
const original = Object.fromEntries(EDITED.map((f) => [f, readFileSync(join(APPDIR, f), 'utf8')]))

const FORM = `      <form className="mt-6 flex gap-2" onSubmit={(e) => e.preventDefault()}>
        <input type="search" placeholder="Search reports" className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">Search</button>
      </form>
`
/** Where the script builds: wherever the brief says, the way a model would. */
let honest = true
const briefs = []
const modelCalls = []
let providers = null
let server = null
let browser = null

try {
  providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
  providers.setScriptedModel({
    onCall: (kind, detail) => modelCalls.push({ kind, detail: detail.slice(0, 60) }),
    interpret: (req) => {
      const ev = JSON.parse(req.brief)
      const ids = ev.strokes.map((s) => s.id)
      const link = ev.elementMenu.find((e) => e.tag === 'a' && /Reports/.test(e.text))
      if (!link) throw new Error('the Reports link is not in the element menu')
      // drawing order: the arrow, the box, then the field and the button inside it
      return {
        reading: 'The Reports link opens a Reports screen with a search box on it.',
        actions: [
          { kind: 'navigate', elements: [link.id], destElement: null, position: null, instruction: 'clicking Reports opens the Reports screen',
            strokes: ids.slice(0, 2), layer: null, depicts: null, fidelity: null, screen: 'Reports' },
          { kind: 'add', elements: null, destElement: null, position: null, instruction: 'a search field with a Search button',
            strokes: ids.slice(2), layer: 'in-flow', depicts: null, fidelity: null, screen: null },
        ],
        unclear: null,
      }
    },
    codegen: ({ root, text, turn }) => {
      briefs.push(text)
      if (turn !== 1) return 'Done.'
      const target = honest && /ON THE \\?"Reports\\?" SCREEN/.test(text) && text.includes('src/screens/Reports.tsx')
        ? 'src/screens/Reports.tsx' : 'src/App.tsx'
      const abs = join(root, target)
      const src = readFileSync(abs, 'utf8')
      const next = target === 'src/App.tsx'
        ? src.replace('            <ChevronTrail />\n', `            <ChevronTrail />\n${FORM.replace(/^/gm, '      ')}`)
        : src.replace(/(<\/h1>\n)/, `$1${FORM}`)
      if (next === src) throw new Error(`the script found no place to build in ${target}`)
      writeFileSync(abs, next)
      return 'Done.'
    },
  })

  const vite = await import(pathToFileURL(join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  server = await vite.createServer({ root: APPDIR, configFile: join(APPDIR, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true } })
  await server.listen()

  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  if (process.env.DEBUG_E2E) {
    page.on('console', (m) => console.log('   [console]', m.text().slice(0, 160)))
    page.on('load', () => console.log('   [load]', page.url()))
    page.on('request', (r) => { if (/@s2c/.test(r.url())) console.log('   [req]', r.method(), r.url().slice(-50)) })
  }
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const pen = async (points) => {
    await page.mouse.move(points[0][0], points[0][1])
    await page.mouse.down()
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(120)
  }
  const boxAt = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + 2, y0 + 3]]

  const boot = async () => {
    restore()
    await page.evaluate(() => sessionStorage.clear()).catch(() => {})
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__S2C_DEBUG__ != null, null, { timeout: 20000 })
    await page.waitForTimeout(600)
    await ensureDraw(page)
  }

  /** The gesture: arrow from Reports to a box, a field and a button inside it, two words. */
  const sketch = async (words) => {
    const link = await page.evaluate(() => {
      const r = document.querySelector('nav a:nth-of-type(2)').getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height + 4 }
    })
    const before = await inkCount(page)
    // the Reports link sits at the right of the navbar: the box goes below and to the left of it
    await pen([[link.x, link.y], [link.x - 60, link.y + 120], [link.x - 140, link.y + 240], [link.x - 120, link.y + 225], [link.x - 140, link.y + 240], [link.x - 145, link.y + 215]])
    const box = { x0: link.x - 560, y0: link.y + 260, x1: link.x - 160, y1: link.y + 560 }
    await pen(boxAt(box.x0, box.y0, box.x1, box.y1))
    await pen(boxAt(box.x0 + 30, box.y0 + 60, box.x1 - 120, box.y0 + 100))
    await pen(boxAt(box.x1 - 100, box.y0 + 60, box.x1 - 30, box.y0 + 100))
    const after = await inkCount(page)
    check(`${words}: four strokes landed`, after - before === 4, `${before} → ${after}`)
    await page.keyboard.type(words, { delay: 20 })
    await page.keyboard.press('Enter')
    // settle: a terminal line that stays put for 2 s
    const seen = []
    let quiet = 0
    const t0 = Date.now()
    while (Date.now() - t0 < 60_000) {
      await page.waitForTimeout(200)
      const s = await status()
      if (s === seen[seen.length - 1]) quiet++
      else { quiet = 0; if (s) seen.push(s) }
      if (quiet >= 10 && /✓|✗|⚠|couldn|didn|verified/i.test(s)) break
    }
    return seen
  }

  const lastRunDir = (before) => {
    const fresh = runsNow().filter((r) => !before.has(r)).sort()
    return fresh.length ? join(RUNS, fresh.at(-1)) : null
  }
  const verdicts = (dir) => {
    const files = readdirSync(dir).filter((f) => /^verify-.*\.json$/.test(f)).sort()
    if (!files.length) return []
    const v = JSON.parse(readFileSync(join(dir, files.at(-1)), 'utf8'))
    return Array.isArray(v) ? v : Array.isArray(v?.verified) ? v.verified : []
  }

  // ── the honest run ─────────────────────────────────────────────────────────
  await boot()
  let before = new Set(runsNow())
  const seen = await sketch('reports')
  for (const s of seen) console.log(`      │ ${s}`)
  const receipt = seen.at(-1) ?? ''

  // 1. the brief
  const brief = briefs[0] ?? ''
  check('1. codegen ran once, and its brief points the add at the screen file', briefs.length >= 1 && brief.includes('src/screens/Reports.tsx') && /ON THE \\?"Reports\\?" SCREEN, not the page it was drawn on/.test(brief), briefs.length ? '' : 'codegen never ran')
  check('1. the brief says the navigate is already applied', /ALREADY APPLIED[\s\S]*Reports/.test(brief))

  // 2. files
  const screen = existsSync(join(APPDIR, 'src/screens/Reports.tsx')) ? readFileSync(join(APPDIR, 'src/screens/Reports.tsx'), 'utf8') : ''
  check('2. the form is in the Reports screen', /placeholder="Search reports"/.test(screen) && /← Back/.test(screen) && /<h1[^>]*>Reports<\/h1>/.test(screen))
  check('2. the home page (App.tsx) is untouched', readFileSync(join(APPDIR, 'src/App.tsx'), 'utf8') === original['src/App.tsx'])

  // 3. verification
  const dir = lastRunDir(before)
  check('3. the run left a run folder', !!dir)
  const sc = dir && existsSync(join(dir, 'screen-contents.json')) ? JSON.parse(readFileSync(join(dir, 'screen-contents.json'), 'utf8')) : []
  check('3. run2 recorded the retarget', sc.length === 1 && sc[0].file === 'src/screens/Reports.tsx', JSON.stringify(sc))
  const vs = dir ? verdicts(dir) : []
  const beh = vs.find((d) => d?.kind === 'behaviour')
  const add = vs.find((d) => d?.kind === 'add')
  check('3. the navigate probe passed', beh?.status === 'passed', beh ? `${beh.status}: ${beh.reason}` : JSON.stringify(vs).slice(0, 200))
  check('3. the add is satisfied by what the probe saw on the screen', add?.onScreen === '#/reports' && add?.verdict?.satisfied === true, add ? add.verdict?.reason : 'no add verdict')

  // 4. receipt
  check('4. the receipt ends on a tick', /^✓/.test(receipt), receipt)
  check('4. the receipt names the screen and what went on it', /open a "Reports" screen/.test(receipt) && /put what you drew in its box on the "Reports" screen/.test(receipt), receipt)

  // 5. by hand
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15000 })
  for (let i = 0; i < 3 && (await penMode(page)) === 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  await page.click('nav a:nth-of-type(2)')
  await page.waitForFunction(() => location.hash === '#/reports', null, { timeout: 5000 }).catch(() => {})
  // the hash changes first, React renders the screen a moment later
  await page.locator('#root input[placeholder="Search reports"]').waitFor({ timeout: 5000 }).catch(() => {})
  const onScreen = await page.locator('#root input[placeholder="Search reports"]').count()
  check('5. by hand: Reports opens a screen with the search field on it', onScreen === 1 && await page.locator('nav').count() === 0,
    `pen ${await penMode(page)}, hash ${await page.evaluate(() => location.hash)}, field ${onScreen}`)
  await page.click('text=← Back').catch(() => {})
  await page.waitForFunction(() => location.hash === '' && document.querySelector('nav') != null, null, { timeout: 5000 }).catch(() => {})
  check('5. ← Back comes home, and home has no search field', await page.locator('nav').count() === 1 && await page.locator('input[placeholder="Search reports"]').count() === 0)

  // 6. undo
  await page.waitForTimeout(400)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  const t0 = Date.now()
  while (Date.now() - t0 < 15000 && !/undid|nothing to undo/i.test(await status())) await page.waitForTimeout(200)
  await page.waitForTimeout(1500)
  check('6. one undo removes the screen, registry and lib', CREATED.every((f) => !existsSync(join(APPDIR, f))), CREATED.filter((f) => existsSync(join(APPDIR, f))).join(', '))
  check('6. and puts main, Navbar and App back byte for byte', EDITED.every((f) => readFileSync(join(APPDIR, f), 'utf8') === original[f]))

  // ── 7. not hollow: a codegen that builds on the home page anyway ───────────
  honest = false
  briefs.length = 0
  await boot()
  before = new Set(runsNow())
  const seen7 = await sketch('reports')
  const dir7 = lastRunDir(before)
  const add7 = dir7 ? verdicts(dir7).find((d) => d?.kind === 'add') : null
  check('7. building on the home page instead FAILS the add', add7?.verdict?.satisfied === false && /nothing you drew in its box is on it/.test(add7.verdict.reason ?? ''), add7 ? add7.verdict?.reason : 'no add verdict')
  check('7. and the run does not end on a tick', !/^✓/.test(seen7.at(-1) ?? ''), seen7.at(-1))

  const real = pageErrors.filter((e) => !/ResizeObserver/.test(e))
  check('no page errors', real.length === 0, real.join(' | '))
  check('no real model was reachable (all calls scripted)', modelCalls.every((c) => c.kind !== 'transcribe'), JSON.stringify(modelCalls.map((c) => c.kind)))
} catch (err) {
  failures++
  console.error('[e2e-nav-contents] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  restore()
}
console.log(failures === 0 ? '\n[e2e-nav-contents] ALL CHECKS PASSED' : `\n[e2e-nav-contents] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

/**
 * The benchmark: how close does a SIMPLE sketch get to a landing page, how long
 * does it take, and what does it cost?
 *
 * This is the only part of this repo that deliberately spends real model quota.
 * Every other live test is zero-token by construction. The point here is to put
 * numbers on three things that have so far only been claimed:
 *
 *   accuracy — did the page that came out have the blocks the sketch asked for,
 *              in the right places, in the right order?
 *   time     — how long from pressing Run to the page being there?
 *   cost     — how many tokens, counting BOTH the reading and the code writing?
 *
 * Two measurement decisions worth stating, because they are what make the
 * numbers worth anything:
 *
 * 1. Accuracy is computed independently of the pipeline. The pipeline grades
 *    itself (`verifyActions` → a verified %) and that number is reported too,
 *    but it cannot be the accuracy metric: a system scoring its own homework
 *    tells you nothing about whether a person would recognise the result. The
 *    headline number comes from `score.mjs`, which measures rendered boxes
 *    against the sketch's own answer key and knows nothing about how the page
 *    was made.
 *
 * 2. Cost counts the interpretation AND the codegen. `result.json` records only
 *    the codegen session's usage, so reading that alone understates the bill by
 *    a whole multimodal call. The interpretation's usage is scraped off its own
 *    HTTP response.
 *
 * Drawing time is recorded separately from run time, because they are different
 * people's problems: run time is the machine's, drawing time is the user's, and
 * "how few strokes can we get away with" is a question about the second.
 *
 * Usage, FROM THE REPO ROOT:
 *   node tests/bench/run.mjs                      # all 15
 *   node tests/bench/run.mjs --only 01,04         # just those ids (prefix match)
 *   node tests/bench/run.mjs --limit 1            # calibrate cost on one page
 *   node tests/bench/run.mjs --dry                # draw and score, never Run (free)
 */
import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import specs from './sketches/index.mjs'
import { toStrokes } from './lib/draw.mjs'
import { makeApp } from './lib/app.mjs'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { scorePage, summarise } from './lib/score.mjs'
import { writeReport } from './lib/report.mjs'

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (process.argv[i + 1] ?? true)
}
const has = (name) => process.argv.includes(`--${name}`)

const REPO = new URL('../../', import.meta.url).pathname
const OUT = join(REPO, 'tests/bench/out')
/**
 * The throwaway app lives OUTSIDE this checkout, in the system temp dir.
 *
 * Not a tidiness preference. `pluginDepSpec` gives an app inside the workspace
 * the spec '*', which resolves only for an actual workspace member — and
 * `tests/bench/out/app` is not one, so npm goes to the registry for packages
 * that were never published and the install fails. Outside the checkout it gets
 * a `file:` link into packages/vite-plugin instead, whose own unpublished @s2c/*
 * deps then resolve through the symlink's realpath. Override with --app.
 */
const APP_DIR = String(arg('app', join(tmpdir(), 's2c-bench-app')))
const PORT = Number(arg('port', 5301))
const DRY = has('dry')
const log = (...a) => console.log('[bench]', ...a)

const only = arg('only')
const limit = arg('limit')
let chosen = specs
if (only) {
  const want = String(only).split(',').map((s) => s.trim())
  chosen = specs.filter((s) => want.some((w) => s.id.startsWith(w)))
}
if (limit) chosen = chosen.slice(0, Number(limit))
if (chosen.length === 0) throw new Error(`no specs matched --only ${String(only)}`)

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'shots'), { recursive: true })

log(`${chosen.length} page(s)${DRY ? ' · DRY: drawing and scoring only, no model call' : ''}`)
log('building the throwaway app…')
const app = await makeApp({ dir: APP_DIR, port: PORT })
log('app:', APP_DIR)

const browser = await chromium.launch()
const results = []

/**
 * Evaluate something in the page, surviving a navigation.
 *
 * Pressing Run fires the instant render first: it scaffolds a real component
 * before the slow path starts, which writes a file, which makes vite full-reload
 * the page. Any evaluate in flight across that reload dies with "Execution
 * context was destroyed" — which is not a failure, it is the feature working.
 * So every poll after Run goes through here.
 */
async function safeEval(page, fn, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      return await page.evaluate(fn)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!/Execution context was destroyed|Target closed|navigation/i.test(msg)) throw err
      await page.waitForTimeout(400)
    }
  }
  throw new Error('the page kept navigating; could not read its state')
}

/** Draw one polyline with a real pointer, the way a hand would. */
async function drawPolyline(page, points) {
  await page.mouse.move(points[0].x, points[0].y)
  await page.mouse.down()
  for (const p of points.slice(1)) await page.mouse.move(p.x, p.y)
  await page.mouse.up()
  // Longer than the overlay's bridge window (400ms), on purpose.
  //
  // The overlay joins a mark that begins within ~14px of where the last one
  // ended and within 400ms, because that is a trackpad hop rather than a new
  // line. For a benchmark whose entire subject is the NUMBER of marks, that
  // merging makes the measurement unstable: 02-split-hero captured 9 of 10
  // marks on some runs and 2 of 10 on others, same sketch, because its marks
  // happen to start near each other. Pausing past the window makes the count
  // deterministic — and is also what a hand actually does, since moving the pen
  // somewhere else takes longer than this.
  await page.waitForTimeout(450)
}

/**
 * Put the app back to a blank page between sketches, WITHOUT touching its config.
 *
 * `resetApp` from the harness does `git checkout -- .`, which rewrites
 * vite.config.ts. Vite watches its own config and restarts the server when it
 * changes — and a restart under --strictPort, on a port it has not finished
 * releasing, just exits. That is how page 2 onwards got ERR_CONNECTION_REFUSED
 * after page 1 passed: nothing was wrong with the benchmark, the server had
 * quietly killed itself on being reset.
 *
 * So this resets only what a sketch can touch: src/, any generated server/, and
 * the state under .sketch2code/ that is gitignored and therefore survives a
 * clean — the run history, the drawn rules, and the component library, which
 * would otherwise let page 7 build out of parts page 1 happened to leave behind.
 */
function resetSrc(dir) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('checkout', '--', 'src')
  git('clean', '-fdq', 'src')
  for (const gone of ['server', '.sketch2code/runs', '.sketch2code/library', '.sketch2code/rules.json']) {
    rmSync(join(dir, gone), { recursive: true, force: true })
  }
}

/** Read the most recent run's own record: its verified % and codegen tokens. */
function readRunRecord(dir) {
  const runs = join(dir, '.sketch2code', 'runs')
  if (!existsSync(runs)) return null
  const ids = readdirSync(runs).sort()
  for (const id of ids.reverse()) {
    const f = join(runs, id, 'result.json')
    if (existsSync(f)) {
      try {
        return JSON.parse(readFileSync(f, 'utf8'))
      } catch { /* a half-written record is not the one we want */ }
    }
  }
  return null
}

for (const spec of chosen) {
  log(`\n── ${spec.id} · ${spec.title}`)
  const row = {
    id: spec.id, title: spec.title, strokes: spec.strokes.length,
    drawMs: null, runMs: null, tokens: null, verified: null, score: null, error: null,
  }
  const page = await browser.newPage({ viewport: spec.viewport })
  const errs = []
  page.on('pageerror', (e) => errs.push(String(e)))

  /** The interpretation's own token usage, which result.json does not record. */
  let interpretTokens = null
  page.on('response', (res) => {
    if (!res.url().includes('/@s2c/interpret')) return
    res.json().then((b) => {
      if (b?.v2?.tokens) interpretTokens = b.v2.tokens
    }).catch(() => undefined)
  })

  let server = null
  try {
    // Reset with the server DOWN, then start it, then draw.
    //
    // The other order does not work, and how it fails is instructive: vite
    // watches its own config and restarts when the tree under it is rewritten,
    // and a restart under --strictPort on a port it has not finished releasing
    // just exits. Resetting a live server's tree cost three debugging rounds —
    // first a reload landing mid-sketch and losing the strokes, then the server
    // gone entirely. A fresh server per page costs under two seconds and
    // removes the whole class of failure.
    //
    // The reset also clears the gitignored state under .sketch2code/ — the run
    // history, the drawn rules and the component library — which a plain `git
    // clean` leaves behind. Without that, page 7 could build itself out of
    // parts page 1 happened to leave lying around, which is a benchmark
    // measuring itself.
    resetSrc(APP_DIR)
    server = await app.start()
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 })
    await page.waitForTimeout(600)
    // and if it still went away, say so as itself rather than as a TypeError
    const alive = () => page.evaluate(() => window.__S2C_DEBUG__ != null)
    if (!(await alive())) throw new Error('the overlay was not ready on a freshly started server')

    // manual, so nothing fires while the sketch is still being drawn
    for (let i = 0; i < 4; i++) {
      if ((await page.evaluate(() => window.__S2C_DEBUG__.auto().mode)) === 'manual') break
      await page.keyboard.press('Alt+a')
      await page.waitForTimeout(150)
    }
    const sr = () => `document.getElementById('s2c-overlay-host').shadowRoot`
    await page.evaluate(`${sr()}.getElementById('clear').click()`)
    await page.waitForTimeout(200)
    // draw mode on — Alt+D toggles, so check rather than press blind
    for (let i = 0; i < 3; i++) {
      if ((await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)) === 'draw') break
      await page.keyboard.press('Alt+d')
      await page.waitForTimeout(200)
    }

    // ── the drawing, timed on its own ────────────────────────────────────
    const drawStart = Date.now()
    for (const line of spec.strokes) await drawPolyline(page, line)
    for (const note of spec.notes ?? []) {
      await page.mouse.move(note.at.x, note.at.y)
      await page.waitForTimeout(120)
      await page.keyboard.press('Alt+n')
      await page.waitForTimeout(250)
      await page.keyboard.type(note.text)
      await page.keyboard.press('Enter')
      await page.waitForTimeout(200)
    }
    row.drawMs = Date.now() - drawStart
    // Two different counts, both reported, because they answer different
    // questions. `strokes` is what a person DREW — the number this benchmark is
    // trying to drive down. `captured` is what the system ended up with, which
    // is smaller whenever two consecutive marks start within a few px of where
    // the last one ended: the overlay bridges those into one stroke on purpose,
    // because that is a trackpad hop rather than a new line. A real hand
    // triggers it too, so this is not drift to be corrected — but if captured
    // collapses to almost nothing the canvas was not taking input at all, and
    // that WOULD invalidate the page.
    if (!(await alive())) {
      throw new Error('the page reloaded while the sketch was being drawn — the strokes are gone')
    }
    row.captured = await page.evaluate(() => window.__S2C_DEBUG__.strokes().length)
    log(`drew ${spec.strokes.length} marks → ${row.captured} strokes in ${(row.drawMs / 1000).toFixed(1)}s`)
    if (row.captured < Math.ceil(spec.strokes.length / 2)) {
      throw new Error(`only ${row.captured} of ${spec.strokes.length} marks registered — the canvas was not drawing`)
    }
    await page.screenshot({ path: join(OUT, 'shots', `${spec.id}-sketch.png`) })

    if (DRY) {
      // not an error: a dry page did exactly what was asked of it
      row.dry = true
      results.push(row)
      await page.close()
      continue
    }

    // ── Run, confirm, and wait ───────────────────────────────────────────
    const runStart = Date.now()
    await page.keyboard.press('Alt+r')
    let ready = false
    for (let i = 0; i < 400; i++) {
      ready = await safeEval(page, () => {
        const h = document.getElementById('s2c-overlay-host')
        const c = h?.shadowRoot?.getElementById('confirm')
        return c ? getComputedStyle(c).display !== 'none' && !c.disabled : false
      })
      if (ready) break
      await page.waitForTimeout(250)
    }
    const statusNow = () => safeEval(page, () => document.getElementById('s2c-overlay-host')
      ?.shadowRoot?.getElementById('status')?.textContent ?? '')
    if (!ready) throw new Error(`no reading within 100s · ${await statusNow()}`)
    await safeEval(page, `${sr()}.getElementById('confirm').click()`)

    for (let i = 0; i < 1600; i++) { // up to ~13 min, the plugin's own cap
      const busy = await safeEval(page, () => document.getElementById('s2c-overlay-host')?.dataset.mode === 'running')
      if (!busy && i > 4) break
      await page.waitForTimeout(500)
    }
    row.runMs = Date.now() - runStart
    const status = await statusNow()
    log(`run finished in ${(row.runMs / 1000).toFixed(0)}s · ${status.slice(0, 140)}`)

    // ── what it cost and what it thinks of itself ────────────────────────
    const record = readRunRecord(APP_DIR)
    const codegen = record?.tokens ?? { input: 0, cacheRead: 0, output: 0 }
    row.tokens = {
      input: (interpretTokens?.input ?? 0) + codegen.input,
      cacheRead: (interpretTokens?.cacheRead ?? 0) + codegen.cacheRead,
      output: (interpretTokens?.output ?? 0) + codegen.output,
      interpret: interpretTokens,
      codegen,
    }
    row.verified = record?.verification?.score ?? null
    row.changedFiles = record?.changedFiles?.length ?? null

    // ── accuracy, measured by something that did not make the page ───────
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    await page.evaluate(() => {
      // hide the overlay so its own chrome never counts as a rendered block
      const h = document.getElementById('s2c-overlay-host')
      if (h) h.style.display = 'none'
    })
    row.score = await scorePage(page, spec)
    await page.screenshot({ path: join(OUT, 'shots', `${spec.id}-result.png`), fullPage: true })
    // order prints as — when there were fewer than two comparable regions:
    // "0%" there means "could not be measured", and printing that as a zero
    // drags an average down with a number that was never an observation
    const ord = row.score.orderPairs > 0 && row.score.order !== null
      ? `${(row.score.order * 100).toFixed(0)}%`
      : '—'
    log(`regions ${row.score.matched.length}/${spec.regions.length} · ` +
      `score ${(row.score.regionScore * 100).toFixed(0)}% · must ${(row.score.mustScore * 100).toFixed(0)}% · ` +
      `order ${ord} · ${row.score.elements} elements`)
    if (row.score.missed.length) log('missed:', row.score.missed.map((m) => m.role).join(', '))

    const real = errs.filter((e) => !/ResizeObserver/.test(e))
    if (real.length) row.error = `page error: ${real[0]}`
  } catch (err) {
    row.error = err instanceof Error ? err.message : String(err)
    log('FAILED:', row.error)
  } finally {
    await page.close().catch(() => undefined)
    await server?.stop().catch(() => undefined)
  }
  results.push(row)
  // write after every page: a long benchmark that loses everything to one crash
  // on page 12 is worse than no benchmark
  writeReport(join(OUT, 'report.md'), { results, meta: { app: APP_DIR, port: PORT, dry: DRY } })
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
}

await browser.close()
try { resetSrc(APP_DIR) } catch { /* the app is a throwaway anyway */ }

const agg = summarise(results)
log('\n──────── totals ────────')
log(`pages: ${results.length}  ·  failed: ${results.filter((r) => r.error).length}` +
  `${results.some((r) => r.dry) ? `  ·  dry: ${results.filter((r) => r.dry).length}` : ''}`)
const ordered = results.filter((r) => (r.score?.orderPairs ?? 0) > 0)
const ordMean = ordered.length
  ? ordered.reduce((a, r) => a + r.score.order, 0) / ordered.length
  : null
log(`mean region score: ${(agg.regionScore * 100).toFixed(0)}%  ·  must: ${(agg.mustScore * 100).toFixed(0)}%  ·  ` +
  `order: ${ordMean === null ? '—' : `${(ordMean * 100).toFixed(0)}% (of ${String(ordered.length)} measurable)`}`)
const tok = results.reduce((a, r) => a + (r.tokens ? r.tokens.input + r.tokens.output : 0), 0)
const cacheRead = results.reduce((a, r) => a + (r.tokens?.cacheRead ?? 0), 0)
log(`tokens: ${tok.toLocaleString()} billed-ish (+${cacheRead.toLocaleString()} cache reads)`)
const secs = results.reduce((a, r) => a + (r.runMs ?? 0), 0) / 1000
log(`time: ${(secs / 60).toFixed(1)} min of run time, ${(results.reduce((a, r) => a + (r.drawMs ?? 0), 0) / 1000).toFixed(0)}s of drawing`)
log(`report: ${join(OUT, 'report.md')}`)

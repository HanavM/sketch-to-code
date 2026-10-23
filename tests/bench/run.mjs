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
 *   node tests/bench/run.mjs --budget 120000      # stop before a page that could pass 120k billed tokens
 *   node tests/bench/run.mjs --mode screenshot    # one arm: auto|gesture|design|screenshot
 *   node tests/bench/run.mjs --set rough          # the loose/partial/edit set (s2c-009)
 *   node tests/bench/run.mjs --words content      # typed words: all|content|none (s2c-016, lib/words.mjs)
 *   node tests/bench/run.mjs --read-only --repeat 5 --only r04,r11,r14   # readings only, no codegen (s2c-056)
 *
 * In --dry mode every page is also SCORED as it stands, untouched. No sketch
 * has been realized yet, so a page that scores realized there has a vacuous
 * answer key, and the runner fails it: that is the zero-token check that each
 * spec measures the change it asks for and not something the page already had.
 */
import { chromium } from 'playwright'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import tidy from './sketches/index.mjs'
import rough from './sketches/rough/index.mjs'
import round1 from '../rounds/round1/sketches.mjs'
import round1auto from '../rounds/round1/auto.mjs'
import round2auto from '../rounds/round2/auto.mjs'
import round3auto from '../rounds/round3/auto.mjs'
import round4auto from '../rounds/round4/auto.mjs'
import round5auto from '../rounds/round5/auto.mjs'
import round6auto from '../rounds/round6/auto.mjs'
import round7auto from '../rounds/round7/auto.mjs'
import round8auto from '../rounds/round8/auto.mjs'
import round9auto from '../rounds/round9/auto.mjs'
import round10auto from '../rounds/round10/auto.mjs'
import { pictureLikeness, blend, LIKENESS_VERSION } from '../rounds/lib/likeness.mjs'
import { effectsOf, effectRecall } from '../rounds/lib/effects.mjs'
import { measureAnchors, driftedAnchors } from './sketches/rough/base.mjs'
import { toStrokes } from './lib/draw.mjs'
import { makeApp } from './lib/app.mjs'
import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { scorePage, summarise } from './lib/score.mjs'
import { writeReport } from './lib/report.mjs'
import { parseMode, keyFor, launchArgs, modeHolds } from './lib/mode.mjs'
import { parseWords, notesFor, wordsTyped, answerKey, wordSummary } from './lib/words.mjs'
import { pensFor, penChanges, penMismatch } from './lib/pen.mjs'
import { judgePlain, tallyPlain } from './lib/plain.mjs'
import { browserSpoiled, freshBrowserPerPage, retryable, withTimeout } from './lib/crash.mjs'
import { readingSummary } from './lib/readings.mjs'

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
// --plain (with --dry): ask the server's no-model rules what they would read,
// in-process, and judge it against the answer key. Zero tokens (s2c-052).
const PLAIN = has('plain')
if (PLAIN && !DRY) throw new Error('--plain only runs with --dry: it must never press Run')
// --read-only: press Run, record what the reading came back as (ok, cause,
// time, tokens), then stop. No Go, so no codegen: a reading costs ~5k billed
// tokens against ~16k for a whole page. For counting failed readings (s2c-056).
// --repeat N runs each chosen page N times.
const READ_ONLY = has('read-only')
if (READ_ONLY && DRY) throw new Error('--read-only presses Run; --dry never does: pick one')
const MODE = parseMode(arg('mode'))
if (READ_ONLY && MODE === 'screenshot') throw new Error('--read-only needs a reading: screenshot mode has none')
const WORDS = parseWords(arg('words'))
const SETS = { tidy, rough, round1, round1auto, round2auto, round3auto, round4auto, round5auto, round6auto, round7auto, round8auto, round9auto, round10auto }
const SET = String(arg('set', 'tidy'))
if (!SETS[SET]) throw new Error(`--set must be one of ${Object.keys(SETS).join(', ')} (got "${SET}")`)
const specs = SETS[SET]
const log = (...a) => console.log('[bench]', ...a)

const only = arg('only')
const limit = arg('limit')
let chosen = specs
if (only) {
  const want = String(only).split(',').map((s) => s.trim())
  chosen = specs.filter((s) => want.some((w) => s.id.startsWith(w)))
}
if (limit) chosen = chosen.slice(0, Number(limit))
const REPEAT = Math.max(1, Number(arg('repeat', 1)) || 1)
if (REPEAT > 1) chosen = chosen.flatMap((s) => Array.from({ length: REPEAT }, () => s))
if (chosen.length === 0) throw new Error(`no specs matched --only ${String(only)}`)
// before the app is built: an unclassified note in content mode is a spec bug, not a run failure
for (const s of chosen) { notesFor(s, WORDS); pensFor(s) }

mkdirSync(OUT, { recursive: true })
mkdirSync(join(OUT, 'shots'), { recursive: true })

log(`${chosen.length} page(s) · set ${SET} · mode ${MODE} · words ${WORDS}${DRY ? ' · DRY: drawing and scoring only, no model call' : ''}${READ_ONLY ? ` · READ-ONLY: readings only, no codegen${REPEAT > 1 ? `, ${REPEAT}× each` : ''}` : ''}`)
log('building the throwaway app…')
const app = await makeApp({ dir: APP_DIR, port: PORT })
log('app:', APP_DIR)

// S2C_CHROMIUM: a browser other than playwright's pinned one (as intent-check.mjs)
const launchBrowser = () => chromium.launch({
  args: launchArgs(MODE),
  ...(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {}),
})
let browser = await launchBrowser()

/**
 * The whole browser dying or wedging, not one page failing (lib/crash.mjs).
 *
 * Screenshot mode's tab capture (getDisplayMedia) can take Chromium down, or
 * be granted and never show a frame, which hung the run with no timeout
 * (seed2tree s2c-013, s2c-029). Reusing one browser across pages is what
 * wedges it, so the screenshot arm gets a fresh browser per page. Only a
 * failure BEFORE Run is retried: nothing has been paid for yet. After Run the
 * reading may already be billed, so a retry could pay twice; that page fails
 * and the run moves on in a fresh browser.
 */
const CAPTURE_PROBE_MS = 45_000
const retried = new Set()
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
/** The dev server's "[s2c] reading failed: …" lines (s2c-056), newest last. */
function readingFailures(serverLog) {
  return serverLog.split('\n').filter((l) => l.includes('[s2c] reading failed')).map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').trim()).slice(-3)
}

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
async function drawPolyline(page, rawPoints) {
  // A hand can only draw on the screen: marks planned past the page edge
  // (a heading that bleeds off it) start at the edge instead. Off-screen
  // pointer points broke capture: round-2 c2 drew 8 marks as 4 strokes,
  // diagonal lines from the corner, and lost the body and date marks.
  const vp = page.viewportSize() ?? { width: 1280, height: 900 }
  const points = rawPoints.map((p) => ({
    x: Math.min(vp.width - 2, Math.max(1, p.x)),
    y: Math.min(vp.height - 2, Math.max(1, p.y)),
  }))
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
 * Pick a pen colour the way a user does: Alt+P opens the pen panel, the custom
 * colour input takes any #rrggbb, Alt+P closes it again. null = Alt+0, the
 * default ink. (lib/pen.mjs; s2c-015)
 */
async function setPen(page, color) {
  if (!color) {
    await page.keyboard.press('Alt+0')
    await page.waitForTimeout(100)
    return
  }
  await page.keyboard.press('Alt+p')
  await page.waitForTimeout(200)
  const ok = await page.evaluate((c) => {
    const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
    if (!input) return false
    input.value = c
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  }, color)
  await page.keyboard.press('Alt+p')
  await page.waitForTimeout(150)
  if (!ok) throw new Error('the pen panel has no custom colour input')
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
const GIT_ID = ['-c', 'user.name=bench', '-c', 'user.email=bench@localhost', '-c', 'commit.gpgsign=false']
/**
 * The blank app's commit. An edit page commits its base page on top of it
 * (prepareBase) so the model's checkpoint and changedFiles() see the base as
 * the starting point; every reset goes back here. Found by message rather than
 * as HEAD, so a run that died mid-page cannot make a base page the new blank.
 */
function blankCommit(dir) {
  const out = execFileSync('git', ['log', '--format=%H %s', '-50'], { cwd: dir, encoding: 'utf8' })
  const line = out.split('\n').find((l) => l && !/ bench: base for /.test(l))
  if (!line) throw new Error('no blank commit in the scratch app')
  return line.split(' ')[0]
}

function prepareBase(dir, spec) {
  if (!spec.base) return
  writeFileSync(join(dir, 'src', 'App.tsx'), spec.base)
  execFileSync('git', [...GIT_ID, 'add', 'src'], { cwd: dir, stdio: 'pipe' })
  execFileSync('git', [...GIT_ID, 'commit', '-q', '-m', `bench: base for ${spec.id}`], { cwd: dir, stdio: 'pipe' })
}

function resetSrc(dir) {
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' })
  git('reset', '-q', '--hard', blankCommit(dir))
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

/**
 * Round pages (tests/rounds) carry a reference picture: score how much the
 * page now on screen looks like it (colour, structure, plus the region score
 * as layout), as lift over a blank page. Viewport shot, overlay hidden.
 */
async function likenessOf(page, spec, row, tag) {
  if (!spec.ref) return
  const shot = await page.screenshot({ animations: 'disabled' }) // first frame, as the target ref is shot
  writeFileSync(join(OUT, 'shots', `${spec.id}-${tag}.png`), shot)
  const pic = await pictureLikeness(page, spec.ref, shot)
  const layout = row.score?.regionScore ?? null
  // v2 structure forgives a ~16px offset; overallV1 keeps the old strict number so rounds stay comparable
  row.likeness = { ...pic, layout, version: LIKENESS_VERSION, overall: blend({ colour: pic.colourAligned, structure: pic.structureAligned }, layout, spec.baseline), overallV2: blend(pic, layout, spec.baseline), overallV1: blend({ colour: pic.colour, structure: pic.structureStrict }, layout, spec.baseline) }
  const p = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
  log(`likeness ${p(row.likeness.overall)} · colour ${p(pic.colourAligned)} · structure ${p(pic.structureAligned)} (aligned x${pic.align.scale} ${pic.align.dx},${pic.align.dy}; unmoved ${p(pic.structure)}, strict ${p(pic.structureStrict)}) · layout ${p(layout)} · v2 ${p(row.likeness.overallV2)} · v1 ${p(row.likeness.overallV1)}`)
  // creative techniques kept (tilt, glass, hollow type, bleed...): reported beside likeness, not blended in
  if (spec.effects?.length) {
    row.effects = effectRecall(spec.effects, await effectsOf(page))
    log(`effects ${p(row.effects.recall)} · kept ${row.effects.kept.join(', ') || '—'} · missing ${row.effects.missing.join(', ') || '—'}`)
  }
}

// --budget N: stop starting live pages once billed tokens (input + output,
// interpret + codegen) reach N minus one worst-case page. Pages vary 25k-90k
// (round 1, 2026-10-21: one 6-page run spent 303k against a 300k/day budget).
const BUDGET = arg('budget', null) === null ? null : Number(arg('budget'))
const WORST_PAGE = 95_000
let spent = 0
const queue = [...chosen]
while (queue.length) {
  if (BUDGET !== null && !DRY && spent + WORST_PAGE > BUDGET) {
    log(`\nbudget: ${spent.toLocaleString()} spent of ${BUDGET.toLocaleString()}; one more page could pass it. Stopping before ${queue.map((s) => s.id).join(', ')}`)
    break
  }
  const spec = queue.shift()
  log(`\n── ${spec.id} · ${spec.title}`)
  const row = {
    id: spec.id, title: spec.title, mode: MODE, sentMode: null, strokes: spec.strokes.length,
    drawMs: null, runMs: null, tokens: null, verified: null, score: null, error: null,
    words: WORDS, wordsTyped: wordsTyped(spec, WORDS), judged: true, dropped: [],
  }
  // the answer key for this words arm: with no words, checks only words can pass are dropped
  const key = answerKey(spec, WORDS)
  row.judged = key.judged
  row.dropped = key.dropped
  if (!key.judged) {
    // not run at all: a paid run of a page nobody can grade is quota for nothing,
    // and scoring it on its `kept` checks alone would pass the untouched page
    log(`not judged with --words ${WORDS}: without ${key.dropped.join('; ')} nothing left tells the change apart`)
    results.push(row)
    if (DRY) row.dry = true
    continue
  }
  if (!browser.isConnected() || freshBrowserPerPage(MODE) && results.length + retried.size > 0) {
    if (!browser.isConnected()) log('the browser died on the last page; launching a fresh one')
    // bounded: closing a browser whose capture wedged must not become the new hang
    await withTimeout(browser.close(), 10_000, 'close').catch(() => undefined)
    browser = await launchBrowser()
  }
  const page = await browser.newPage({ viewport: spec.viewport })
  let pressedRun = false
  let retry = false
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
    prepareBase(APP_DIR, spec)
    server = await app.start()
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 })
    await page.waitForTimeout(600)
    // and if it still went away, say so as itself rather than as a TypeError
    const alive = () => page.evaluate(() => window.__S2C_DEBUG__ != null)
    if (!(await alive())) throw new Error('the overlay was not ready on a freshly started server')

    // an edit page's marks are hard-coded onto the base page's layout: if that
    // layout moved, the marks land on the wrong things and the page measures
    // nothing. Refuse rather than score it.
    if (spec.anchors?.length) {
      const drift = driftedAnchors(await measureAnchors(page, spec.anchors))
      if (drift.length) throw new Error(`base page layout drifted, marks would miss: ${drift.join('; ')}`)
    }

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

    // the arm under test. Set before drawing: the pills persist, and auto must
    // see a cleared override or it is not measuring what a user gets
    for (let i = 0; i < 3; i++) {
      const st = await page.evaluate(() => window.__S2C_DEBUG__.runMode())
      if (modeHolds(MODE, st)) break
      // an override we did not ask for is cleared by pressing its own key
      const key = keyFor(MODE) ?? keyFor(st.chosen)
      await page.keyboard.press(key)
      await page.waitForTimeout(150)
    }
    if (!modeHolds(MODE, await page.evaluate(() => window.__S2C_DEBUG__.runMode()))) {
      throw new Error(`could not put the overlay in ${MODE} mode`)
    }

    // ── the drawing, timed on its own ────────────────────────────────────
    // default ink first: the pen persists in localStorage across pages
    await page.keyboard.press('Alt+0')
    await page.waitForTimeout(100)
    const pens = new Map(penChanges(spec).map((c) => [c.at, c.color]))
    const drawStart = Date.now()
    for (const [i, line] of spec.strokes.entries()) {
      if (pens.has(i)) await setPen(page, pens.get(i))
      await drawPolyline(page, line)
    }
    for (const note of notesFor(spec, WORDS)) {
      await page.mouse.move(note.at.x, note.at.y)
      await page.waitForTimeout(120)
      // a whole-page note (Alt+Shift+N) is about the run, not the ink under the pointer
      await page.keyboard.press(note.whole ? 'Alt+Shift+N' : 'Alt+n')
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
    const capturedStrokes = await page.evaluate(() => window.__S2C_DEBUG__.strokes())
    row.captured = capturedStrokes.length
    const penBad = penMismatch(spec, capturedStrokes)
    if (penBad) throw new Error(`the pen did not take: ${penBad}`)
    log(`drew ${spec.strokes.length} marks → ${row.captured} strokes in ${(row.drawMs / 1000).toFixed(1)}s`)
    if (row.captured < Math.ceil(spec.strokes.length / 2)) {
      throw new Error(`only ${row.captured} of ${spec.strokes.length} marks registered — the canvas was not drawing`)
    }
    await page.screenshot({ path: join(OUT, 'shots', `${spec.id}-sketch.png`) })

    row.sentMode = (await page.evaluate(() => window.__S2C_DEBUG__.runMode())).effective
    log(`mode ${MODE} → sends ${row.sentMode}`)
    if (MODE === 'screenshot') {
      // a capture that fails costs nothing to find out here and a paid
      // reading to find out after Run
      const bytes = await withTimeout(
        page.evaluate(() => window.__S2C_DEBUG__.captureProbe()),
        CAPTURE_PROBE_MS,
        `tab capture hung: no answer in ${CAPTURE_PROBE_MS / 1000}s`,
      )
      if (!(bytes > 1000)) throw new Error(`tab capture came back empty (${String(bytes)} chars)`)
      row.captureChars = bytes
      log(`tab capture ok (${bytes} base64 chars)`)
    }

    if (DRY) {
      // not an error: a dry page did exactly what was asked of it
      row.dry = true
      if (PLAIN) {
        const wire = await page.evaluate(() => window.__S2C_DEBUG__.wire())
        mkdirSync(join(OUT, 'plain'), { recursive: true })
        writeFileSync(join(OUT, 'plain', `${spec.id}.words-${WORDS}.wire.json`), JSON.stringify(wire))
        const { plainReading } = await import('@s2c/pipeline')
        let plain
        try {
          plain = plainReading(wire.strokes, wire.snapshot, wire.mode === 'design' ? 'design' : 'gesture', wire.notes ?? [])
        } catch (err) {
          // the server catches this too and asks the model: a decline
          plain = { ok: false, reason: `threw: ${String(err)}` }
        }
        row.plain = judgePlain(key.spec, wire, plain)
        log(`plain reading: ${row.plain.outcome} (want ${row.plain.want ?? 'none'}, got ${row.plain.got ?? `declined: ${row.plain.reason}`})${row.plain.why ? ` · ${row.plain.why}` : ''}`)
      }
      // ...and score the page untouched: nothing was built, so nothing can be
      // realized. If it is, the spec's answer key is vacuous.
      await page.evaluate(() => {
        const h = document.getElementById('s2c-overlay-host')
        if (h) h.style.display = 'none'
      })
      row.score = await scorePage(page, key.spec)
      await likenessOf(page, spec, row, 'untouched')
      const s = row.score
      log(`untouched page: intent ${s.intent === null ? '—' : s.intent.toFixed(2)} · realized ${String(s.realized)}`)
      if (s.realized && key.judged) row.error = 'the untouched page already scores realized: this spec measures nothing'
      results.push(row)
      await page.close()
      continue
    }

    // ── Run, confirm, and wait ───────────────────────────────────────────
    const runStart = Date.now()
    pressedRun = true
    await page.keyboard.press('Alt+r')
    // screenshot mode has no reading to confirm: Run goes straight to the
    // model with the picture (main.ts autoRun -> proceed). Waiting for a
    // Confirm button there failed every page after paying for it (s2c-013).
    let ready = MODE === 'screenshot'
    let readFailed = false
    // ~150 s: past the reading's own 2-minute limit, so a slow reading that
    // lands isn't scored as a failure, and one that doesn't arrives with its cause
    for (let i = 0; i < 600 && !ready; i++) {
      const st = await safeEval(page, () => {
        const h = document.getElementById('s2c-overlay-host')
        const c = h?.shadowRoot?.getElementById('confirm')
        const s = h?.shadowRoot?.getElementById('status')
        return {
          ready: c ? getComputedStyle(c).display !== 'none' && !c.disabled : false,
          // the overlay's "couldn't read" line: stop waiting, it won't change
          failed: !!s && s.classList.contains('err') && /couldn.t read/.test(s.textContent ?? ''),
        }
      })
      ready = !!st?.ready
      readFailed = !!st?.failed
      if (ready || readFailed) break
      await page.waitForTimeout(250)
    }
    const statusNow = () => safeEval(page, () => document.getElementById('s2c-overlay-host')
      ?.shadowRoot?.getElementById('status')?.textContent ?? '')
    if (READ_ONLY) {
      // the outcome is the data, a failure included: never Go, never codegen
      row.readOnly = true
      row.readingMs = Date.now() - runStart
      row.reading = (await safeEval(page, () => window.__S2C_DEBUG__?.reading?.() ?? null)) ?? { ok: false, error: `no answer within ${(row.readingMs / 1000).toFixed(0)}s (still waiting)` }
      if (!row.reading.ok) {
        row.readingError = await safeEval(page, () => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.title ?? '') || null
        row.serverSaid = readingFailures(server?.log?.() ?? '')
      }
      const t = row.reading.tokens
      log(`reading ${row.reading.ok ? 'ok' : 'FAILED'} in ${(row.readingMs / 1000).toFixed(0)}s${row.reading.plain ? ` (no model: ${row.reading.plain})` : ''}${t ? ` · tokens in ${t.input} cache ${t.cacheRead} out ${t.output}` : ''}${row.reading.ok ? '' : ` · ${row.reading.error ?? row.readingError ?? '?'}`}`)
      results.push(row)
      writeFileSync(join(OUT, 'readings.json'), JSON.stringify(results, null, 2))
      continue
    }
    if (!ready) {
      // s2c-056: the bar's sentence is the same for every cause; the cause is
      // on its tooltip ("interpret failed: …", from the dev server's reply)
      const cause = await safeEval(page, () => document.getElementById('s2c-overlay-host')
        ?.shadowRoot?.getElementById('status')?.title ?? '')
      row.readingError = cause || null
      row.readingMs = Date.now() - runStart
      // and what the dev server logged about it (one server per page)
      row.serverSaid = readingFailures(server?.log?.() ?? '')
      throw new Error(`${readFailed ? 'reading failed' : 'no reading within 150s'} after ${(row.readingMs / 1000).toFixed(0)}s · ${await statusNow()}${cause ? ` · cause: ${cause}` : ''}`)
    }
    if (MODE !== 'screenshot') await safeEval(page, `${sr()}.getElementById('confirm').click()`)

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
    spent += row.tokens.input + row.tokens.output
    if (record?.sends?.length) {
      log('codegen turns: ' + record.sends.map((t) => `${t.attempt}/${t.kind} ${Math.round(t.billed / 1000)}k ${t.toolCalls} tools`).join(' · '))
      // which calls: Read/Edit/Write counts per turn (a 23-call build is many small Edits or re-Reads)
      for (const t of record.sends) if (t.tools?.length) {
        const n = {}
        for (const c of t.tools) n[c] = (n[c] ?? 0) + 1
        log(`  ${t.attempt}/${t.kind}: ` + Object.entries(n).map(([c, k]) => (k > 1 ? `${c} x${k}` : c)).join(', '))
      }
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
    row.score = await scorePage(page, key.spec)
    row.realized = key.judged ? !!row.score.realized : null
    await likenessOf(page, spec, row, 'built')
    await page.screenshot({ path: join(OUT, 'shots', `${spec.id}-result.png`), fullPage: true })
    // keep the run's own record (reading, prompt, codemod) per page: the app
    // wipes it on the next page, and a failed build needs its reading to debug
    try {
      const runs = join(APP_DIR, '.sketch2code', 'runs')
      for (const r of readdirSync(runs)) cpSync(join(runs, r), join(OUT, 'runs', spec.id, r), { recursive: true })
    } catch { /* no run record: nothing to keep */ }
    // and the built source itself: round-3 e5's chart came out with no bars
    // and the code that drew it was gone by the next page
    try {
      const srcDir = join(OUT, 'runs', spec.id, 'src')
      mkdirSync(srcDir, { recursive: true })
      cpSync(join(APP_DIR, 'src'), srcDir, { recursive: true })
    } catch { /* best effort */ }
    // and a small committed digest next to the round's side-by-sides: out/ is
    // not kept, and n12 could not tell why c2's headline shrank without it
    if (spec.target) {
      try { writeRunDigest(APP_DIR, join(spec.target, '..', 'built', 'runs'), spec.id, row) } catch { /* best effort */ }
    }
    // order prints as — when there were fewer than two comparable regions:
    // "0%" there means "could not be measured", and printing that as a zero
    // drags an average down with a number that was never an observation
    const ord = row.score.orderPairs > 0 && row.score.order !== null
      ? `${(row.score.order * 100).toFixed(0)}%`
      : '—'
    // an edit page has no regions, only its answer key (s2c-009): never run live before s2c-013
    log(`regions ${row.score.matched?.length ?? 0}/${spec.regions?.length ?? 0} · ` +
      `score ${(row.score.regionScore * 100).toFixed(0)}% · must ${(row.score.mustScore * 100).toFixed(0)}% · ` +
      `order ${ord} · ${row.score.elements} elements`)
    if (row.score.missed?.length) log('missed:', row.score.missed.map((m) => m.role).join(', '))

    const real = errs.filter((e) => !/ResizeObserver/.test(e))
    if (real.length) row.error = `page error: ${real[0]}`
  } catch (err) {
    row.error = err instanceof Error ? err.message : String(err)
    const spoiled = browserSpoiled(row.error)
    if (retryable(row.error, { pressedRun, alreadyRetried: retried.has(spec.id) })) {
      retried.add(spec.id)
      retry = true
      log(`the browser died or wedged before Run (${row.error.split('\n')[0]}); nothing was paid, retrying this page once in a fresh browser`)
    } else {
      if (spoiled) row.error = `browser died or wedged${pressedRun ? ' after Run (not retried: the reading may be billed)' : ' again on retry'}: ${row.error}`
      log('FAILED:', row.error)
    }
    // a wedged capture leaves the browser connected but useless: drop it, so
    // the next page (or the retry) gets a fresh one
    if (spoiled) await withTimeout(browser.close(), 10_000, 'close').catch(() => undefined)
  } finally {
    await withTimeout(page.close(), 10_000, 'close').catch(() => undefined)
    await server?.stop().catch(() => undefined)
  }
  if (retry) {
    queue.unshift(spec)
    continue
  }
  if (retried.has(spec.id)) row.retriedAfterCrash = true
  results.push(row)
  // write after every page: a long benchmark that loses everything to one crash
  // on page 12 is worse than no benchmark
  writeReport(join(OUT, 'report.md'), { results, meta: { app: APP_DIR, port: PORT, dry: DRY, extra: { mode: MODE, words: WORDS } } })
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
  // one file per arm too, so words-compare.mjs can set the arms side by side
  writeFileSync(join(OUT, `results.${MODE}.words-${WORDS}.json`), JSON.stringify(results, null, 2))
}

await browser.close().catch(() => undefined)
try { resetSrc(APP_DIR) } catch { /* the app is a throwaway anyway */ }

if (READ_ONLY) {
  const r = readingSummary(results)
  log('\n──────── readings ────────')
  log(`readings: ${r.total} · ok ${r.ok} · failed ${r.failed}${r.noModel ? ` · ${r.noModel} read with no model` : ''}`)
  for (const [cause, n] of r.causes) log(`  ${n}× ${cause}`)
  log(`time: median ${(r.medianMs / 1000).toFixed(0)}s, slowest ${(r.maxMs / 1000).toFixed(0)}s · tokens: ${r.billed.toLocaleString()} billed-ish (+${r.cacheRead.toLocaleString()} cache reads)`)
  log(`results: ${join(OUT, 'readings.json')}`)
  process.exit(0)
}

const agg = summarise(results)
log('\n──────── totals ────────')
log(`pages: ${results.length}  ·  failed: ${results.filter((r) => r.error).length}` +
  `${results.some((r) => r.dry) ? `  ·  dry: ${results.filter((r) => r.dry).length}` : ''}`)
const ordered = results.filter((r) => (r.score?.orderPairs ?? 0) > 0)
const ordMean = ordered.length
  ? ordered.reduce((a, r) => a + r.score.order, 0) / ordered.length
  : null
log(`REALIZED: ${agg.realized === null ? '—' : `${(agg.realized * 100).toFixed(0)}% (${agg.realizedPages} of ${agg.judgedPages} pages)`}  ·  ` +
  `intent ${agg.intent === null ? '—' : agg.intent.toFixed(2)} (structure ${agg.structure?.toFixed(2) ?? '—'}, content ${agg.content?.toFixed(2) ?? '—'}, order ${agg.intentOrder?.toFixed(2) ?? '—'})`)
log(`secondary, positional — mean region score: ${(agg.regionScore * 100).toFixed(0)}%  ·  must: ${(agg.mustScore * 100).toFixed(0)}%  ·  ` +
  `order: ${ordMean === null ? '—' : `${(ordMean * 100).toFixed(0)}% (of ${String(ordered.length)} measurable)`}`)
const tok = results.reduce((a, r) => a + (r.tokens ? r.tokens.input + r.tokens.output : 0), 0)
const cacheRead = results.reduce((a, r) => a + (r.tokens?.cacheRead ?? 0), 0)
log(`tokens: ${tok.toLocaleString()} billed-ish (+${cacheRead.toLocaleString()} cache reads)`)
const secs = results.reduce((a, r) => a + (r.runMs ?? 0), 0) / 1000
log(`time: ${(secs / 60).toFixed(1)} min of run time, ${(results.reduce((a, r) => a + (r.drawMs ?? 0), 0) / 1000).toFixed(0)}s of drawing`)
const ws = wordSummary(results.filter((r) => !r.dry && !r.error))
log(`words ${WORDS}: realized ${ws.realizedPct === null ? '—' : `${(ws.realizedPct * 100).toFixed(0)}%`} of ${ws.judged} judged` +
  `${ws.notJudged ? ` (${ws.notJudged} not judged without words)` : ''} · ${ws.wordsTyped} words typed · ` +
  `${ws.wordsPerRealized === null ? '—' : ws.wordsPerRealized.toFixed(1)} words per realized page`)
log(`report: ${join(OUT, 'report.md')}`)
if (PLAIN) {
  const pr = results.filter((r) => r.plain)
  const t = tallyPlain(pr.map((r) => r.plain))
  log(`plain readings (no model): ${t.right} right · ${t.wrong} wrong · ${t.missed} missed · ${t['false-fire']} false fires · ${t.declined} correctly declined, of ${t.total}` +
    ` · read free: ${t.freeRate === null ? '—' : `${(t.freeRate * 100).toFixed(0)}% of the ${t.able} pages a rule could take`}`)
  for (const r of pr) log(`  ${r.id.padEnd(30)} ${r.plain.outcome.padEnd(10)} want ${String(r.plain.want).padEnd(15)} ${r.plain.got ?? `declined: ${r.plain.reason}`}`)
  writeFileSync(join(OUT, `plain.words-${WORDS}.json`), JSON.stringify({ tally: t, rows: pr.map((r) => ({ id: r.id, ...r.plain })) }, null, 2))
}

/**
 * What the reading made of the drawing, small enough to commit per page:
 * each action's kind, cited strokes, text squiggles, drawn type size and the
 * start of its instruction, plus the page's likeness and tokens.
 */
function writeRunDigest(appDir, dir, id, row) {
  const runs = join(appDir, '.sketch2code', 'runs')
  const latest = readdirSync(runs).sort().pop()
  const interp = JSON.parse(readFileSync(join(runs, latest, 'interpretation.json'), 'utf8'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    id,
    at: new Date().toISOString(),
    likeness: row.likeness ? { version: row.likeness.version, overall: row.likeness.overall, overallV2: row.likeness.overallV2, overallV1: row.likeness.overallV1, colour: row.likeness.colour, structure: row.likeness.structure, structureStrict: row.likeness.structureStrict, colourAligned: row.likeness.colourAligned, structureAligned: row.likeness.structureAligned, align: row.likeness.align, layout: row.likeness.layout } : null,
    effects: row.effects ?? null,
    tokens: row.tokens ? { input: row.tokens.input, output: row.tokens.output, cacheRead: row.tokens.cacheRead } : null,
    // per codegen turn: build vs repair rounds, tool calls (null before n27)
    sends: readRunRecord(appDir)?.sends ?? null,
    reading: interp.reading,
    actions: (interp.actions ?? []).map((a) => ({
      kind: a.kind,
      textMarks: a.textMarks ?? [],
      textSize: (a.textSize ?? []).map((t) => ({ strokes: t.strokes, lines: t.lines, fontPx: t.fontPx })),
      region: a.region ? [a.region.x, a.region.y, a.region.w, a.region.h].map(Math.round) : null,
      paths: (a.svgPaths ?? []).map((p) => p.strokeId),
      instruction: String(a.instruction ?? '').slice(0, 160),
    })),
    rejected: interp.rejected ?? [],
  }, null, 2) + '\n')
}


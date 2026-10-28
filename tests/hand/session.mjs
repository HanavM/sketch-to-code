/**
 * Hand-sketch session (goal 2026-10-27, node n1): a person at the overlay.
 *
 * The sketcher (the agent, playing a person) looks ONLY at a target's
 * screenshot and decides every stroke and note. This process is just the
 * hand and the eyes: it keeps one browser on the real overlay of a blank app
 * and takes commands over local HTTP, one at a time, so the sketcher can draw
 * the big parts, look at what the tool shows, and fix — in sequence.
 *
 * It never reads the target's HTML or plan. The SCORER (v3, unchanged) needs
 * the target's regions and blank baseline from targets.json; those are loaded
 * here only to score at `done`, and the score is never returned before `done`.
 *
 *   node tests/hand/session.mjs [--port 5390] [--app-port 5302]
 *   curl -s localhost:5390 -d '{"op":"open","round":7,"id":"c1-..."}'
 *
 * Ops:
 *   open {round, id}            fresh blank app, overlay in draw/manual mode
 *   stroke {pts:[[x,y]..]}      one pen stroke through those waypoints (a hand:
 *                               walked at 6px with slight wobble)
 *   pen {color|null}            pen colour via the real pen panel
 *   note {x, y, text, whole?}   Alt+N (or Alt+Shift+N) and type
 *   deleteNote {text}           click a note's x (n35; counts as a fix)
 *   undo                        Ctrl+Z (counts as an erased stroke)
 *   moveNote {text, x, y}       drag a note chip onto another mark (n9; counts as a fix)
 *   look {name}                 screenshot of what is on screen now
 *   run                         Alt+R, wait for the reading, shot it, Go, wait
 *                               for the build, reload, shot the result
 *   done                        score (v3), side-by-side, metrics -> digest
 */
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { makeApp } from '../bench/lib/app.mjs'
import { walk, jitter } from '../bench/lib/draw.mjs'
import { scorePage } from '../bench/lib/score.mjs'
import { pictureLikeness, blend, LIKENESS_VERSION } from '../rounds/lib/likeness.mjs'
import { strokeStats } from './metrics.mjs'

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] }
const REPO = new URL('../../', import.meta.url).pathname
const PORT = Number(arg('port', 5390))
const APP_DIR = join(tmpdir(), 's2c-hand-app')
const OUT = join(REPO, 'tests/hand/out')
const CHROME = process.env.S2C_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium-1243/chrome-linux64/chrome') ? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' : undefined)
process.env.S2C_READING_TIMEOUT_MS ??= '230000'

const app = await makeApp({ dir: APP_DIR, port: Number(arg('app-port', 5302)) })
const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
let S = null // the current page session

const sr = `document.getElementById('s2c-overlay-host').shadowRoot`
const now = () => Date.now()
const GIT_ID = ['-c', 'user.name=hand', '-c', 'user.email=hand@localhost', '-c', 'commit.gpgsign=false']

function resetSrc(dir) {
  const git = (...a) => execFileSync('git', [...GIT_ID, ...a], { cwd: dir, stdio: 'pipe' })
  const first = execFileSync('git', ['rev-list', '--max-parents=0', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim().split('\n')[0]
  const log = execFileSync('git', ['log', '--format=%H %s', '-50'], { cwd: dir, encoding: 'utf8' })
  const blank = log.split('\n').find((l) => l && !/ bench: base for /.test(l))?.split(' ')[0] ?? first
  git('reset', '-q', '--hard', blank); git('clean', '-fdq', 'src')
  for (const gone of ['server', '.sketch2code/runs', '.sketch2code/library', '.sketch2code/rules.json']) rmSync(join(dir, gone), { recursive: true, force: true })
}
function runRecords(dir) {
  const runs = join(dir, '.sketch2code', 'runs')
  if (!existsSync(runs)) return []
  return readdirSync(runs).sort().map((id) => { try { return JSON.parse(readFileSync(join(runs, id, 'result.json'), 'utf8')) } catch { return null } }).filter(Boolean)
}
async function safeEval(page, fn, arg0) {
  for (let i = 0; i < 60; i++) {
    try { return await page.evaluate(fn, arg0) } catch (e) {
      if (!/context was destroyed|Target closed|navigation/i.test(String(e))) throw e
      await page.waitForTimeout(400)
    }
  }
  throw new Error('page kept navigating')
}
async function statusLine(page) {
  return page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '')
}
async function drawMode(page) {
  for (let i = 0; i < 4; i++) {
    if ((await safeEval(page, () => window.__S2C_DEBUG__.auto().mode)) === 'manual') break
    await page.keyboard.press('Alt+a'); await page.waitForTimeout(150)
  }
  for (let i = 0; i < 3; i++) {
    if ((await safeEval(page, () => document.getElementById('s2c-overlay-host').dataset.mode)) === 'draw') break
    await page.keyboard.press('Alt+d'); await page.waitForTimeout(200)
  }
}
function scoringSpec(round, id) {
  const dir = join(REPO, `tests/rounds/round${round}/`)
  const { targets, calibration } = JSON.parse(readFileSync(`${dir}targets.json`, 'utf8'))
  return { id, ref: `${dir}ref/${id}.png`, regions: targets[id].regions, baseline: calibration[id].blank, viewport: { width: 1280, height: 900 } }
}

const ops = {
  async open({ round, id }) {
    if (S?.page) await S.page.close().catch(() => {})
    if (S?.server) await S.server.stop().catch(() => {})
    const ref = join(REPO, `tests/rounds/round${round}/ref/${id}.png`)
    if (!existsSync(ref)) throw new Error(`no screenshot ${ref}`)
    resetSrc(APP_DIR)
    const server = await app.start()
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    let interpret = []
    page.on('response', (res) => {
      if (!res.url().includes('/@s2c/interpret')) return
      res.json().then((b) => { if (b?.v2?.tokens) interpret.push(b.v2.tokens) }).catch(() => {})
    })
    await page.goto(server.url, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 })
    await page.waitForTimeout(600)
    await drawMode(page)
    await page.evaluate(`${sr}.getElementById('clear').click()`)
    await page.keyboard.press('Alt+0')
    const dir = join(OUT, `round${round}`, id)
    mkdirSync(dir, { recursive: true })
    S = { round, id, ref, dir, page, server, interpret, events: [], strokes: [], notes: [], runs: [], undos: 0, shots: 0, t0: null, opened: now() }
    return { ok: true, ref, out: dir }
  },
  async stroke({ pts }) {
    const p = S.page
    if (S.t0 == null) S.t0 = now()
    const way = pts.map(([x, y]) => ({ x, y }))
    const raw = way.length === 1 ? way : jitter(walk(way, 6), 0.9, S.strokes.length + 1)
    const points = raw.map((q) => ({ x: Math.min(1278, Math.max(1, q.x)), y: Math.min(898, Math.max(1, q.y)) }))
    await p.mouse.move(points[0].x, points[0].y); await p.mouse.down()
    for (const q of points.slice(1)) await p.mouse.move(q.x, q.y)
    await p.mouse.up(); await p.waitForTimeout(450)
    S.strokes.push({ way: pts, n: points.length, at: now() - S.t0 })
    S.events.push({ op: 'stroke', at: now() - S.t0 })
    return { ok: true, strokes: S.strokes.length }
  },
  async pen({ color }) {
    const p = S.page
    if (!color) { await p.keyboard.press('Alt+0'); return { ok: true } }
    await p.keyboard.press('Alt+p'); await p.waitForTimeout(200)
    await p.evaluate((c) => { const i = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('penCustom'); i.value = c; i.dispatchEvent(new Event('input', { bubbles: true })) }, color)
    await p.keyboard.press('Alt+p'); await p.waitForTimeout(150)
    S.events.push({ op: 'pen', color, at: now() - (S.t0 ?? now()) })
    return { ok: true }
  },
  async note({ x, y, text, whole }) {
    const p = S.page
    if (S.t0 == null) S.t0 = now()
    await p.mouse.move(x, y); await p.waitForTimeout(120)
    await p.keyboard.press(whole ? 'Alt+Shift+N' : 'Alt+n'); await p.waitForTimeout(250)
    await p.keyboard.type(text); await p.keyboard.press('Enter'); await p.waitForTimeout(200)
    S.notes.push({ text, whole: !!whole, x, y, at: now() - S.t0 })
    S.events.push({ op: 'note', at: now() - S.t0 })
    // what a person reads in the bar: which mark the note landed on (n9)
    return { ok: true, notes: S.notes.length, status: await statusLine(p) }
  },
  /** n9: drag a note's chip (found by the start of its text) to page point x,y. */
  async moveNote({ text, x, y }) {
    const p = S.page
    const box = await p.evaluate((t) => {
      const root = document.getElementById('s2c-overlay-host').shadowRoot
      const chip = [...root.querySelectorAll('.noteChip')].find((c) => (c.querySelector('.noteText')?.textContent ?? '').startsWith(t))
      if (!chip) return null
      const r = chip.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }
    }, text)
    if (!box) return { ok: false, error: 'no such note' }
    await p.mouse.move(box.x, box.y); await p.mouse.down()
    const tx = x - (await p.evaluate(() => window.scrollX)), ty = y - (await p.evaluate(() => window.scrollY))
    for (let i = 1; i <= 12; i++) { await p.mouse.move(box.x + ((tx - box.x) * i) / 12, box.y + ((ty - box.y) * i) / 12); await p.waitForTimeout(16) }
    await p.mouse.up(); await p.waitForTimeout(250)
    S.noteMoves = (S.noteMoves ?? 0) + 1
    S.events.push({ op: 'moveNote', at: now() - (S.t0 ?? now()) })
    return { ok: true, status: await statusLine(p) }
  },
  /** n35: click a note chip's x (found by the start of its text); counts as a fix. */
  async deleteNote({ text }) {
    const p = S.page
    const ok = await p.evaluate((t) => {
      const root = document.getElementById('s2c-overlay-host').shadowRoot
      const chip = [...root.querySelectorAll('.noteChip')].find((c) => (c.querySelector('.noteText')?.textContent ?? '').startsWith(t))
      const x = chip?.querySelector('.noteDel'); if (!x) return false
      const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, text)
    if (!ok) return { ok: false, error: 'no such note' }
    await p.mouse.click(ok.x, ok.y); await p.waitForTimeout(200)
    S.noteMoves = (S.noteMoves ?? 0) + 1
    S.notes = S.notes.filter((n) => !n.text.startsWith(text))
    S.events.push({ op: 'deleteNote', at: now() - (S.t0 ?? now()) })
    return { ok: true, status: await statusLine(p) }
  },
  async undo() {
    await S.page.keyboard.press('Control+z'); await S.page.waitForTimeout(200)
    S.undos++; S.events.push({ op: 'undo', at: now() - (S.t0 ?? now()) })
    return { ok: true }
  },
  async look({ name }) {
    const f = join(S.dir, `look-${String(++S.shots).padStart(2, '0')}-${name ?? 'now'}.png`)
    await S.page.screenshot({ path: f })
    return { ok: true, file: f }
  },
  async run() {
    const p = S.page
    const before = runRecords(APP_DIR).length
    const n = S.runs.length + 1
    await p.screenshot({ path: join(S.dir, `run${n}-sketch.png`) })
    const t = now(); S.events.push({ op: 'run', at: t - S.t0 })
    await p.keyboard.press('Alt+r')
    let ready = false, failed = false
    for (let i = 0; i < 960 && !ready && !failed; i++) {
      const st = await safeEval(p, () => {
        const h = document.getElementById('s2c-overlay-host'); const c = h?.shadowRoot?.getElementById('confirm'); const s = h?.shadowRoot?.getElementById('status')
        return { ready: c ? getComputedStyle(c).display !== 'none' && !c.disabled : false, failed: !!s && s.classList.contains('err') && /couldn.t read/.test(s.textContent ?? '') }
      })
      ready = !!st.ready; failed = !!st.failed
      if (!ready && !failed) await p.waitForTimeout(250)
    }
    const readMs = now() - t
    const readShot = join(S.dir, `run${n}-reading.png`)
    await p.screenshot({ path: readShot })
    const reading = await safeEval(p, () => window.__S2C_DEBUG__?.reading?.() ?? null)
    const status = await safeEval(p, () => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '')
    if (!ready) { S.runs.push({ n, readMs, failed: true, status }); return { ok: false, readMs, status, readShot } }
    await safeEval(p, `${sr}.getElementById('confirm').click()`)
    for (let i = 0; i < 1600; i++) {
      const busy = await safeEval(p, () => document.getElementById('s2c-overlay-host')?.dataset.mode === 'running')
      if (!busy && i > 4) break
      await p.waitForTimeout(500)
    }
    // n21: a run that failed writes no record; the bar says so, so stop waiting
    for (let i = 0; i < 1200 && runRecords(APP_DIR).length <= before; i++) {
      if (i > 4 && /went wrong|couldn.t/i.test(await safeEval(p, () => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? ''))) break
      await p.waitForTimeout(500)
    }
    const totalMs = now() - t
    const rec = runRecords(APP_DIR).slice(-1)[0] ?? null
    await p.reload({ waitUntil: 'networkidle' }); await p.waitForTimeout(1200)
    await p.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 20000 }).catch(() => {})
    const resShot = join(S.dir, `run${n}-result.png`)
    await p.evaluate(() => { const h = document.getElementById('s2c-overlay-host'); if (h) h.style.display = 'none' })
    await p.screenshot({ path: resShot })
    await p.evaluate(() => { const h = document.getElementById('s2c-overlay-host'); if (h) h.style.display = '' })
    await drawMode(p)
    const codegen = rec?.tokens ?? null
    const interp = S.interpret[S.interpret.length - 1] ?? null
    S.runs.push({ n, readMs, buildMs: totalMs - readMs, totalMs, codegen, interpret: interp, status: (await safeEval(p, () => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '')).slice(0, 200), strokesSoFar: S.strokes.length, notesSoFar: S.notes.length })
    return { ok: true, readMs, totalMs, readShot, resShot, reading: reading ? { ok: reading.ok, summary: String(reading.summary ?? reading.plain ?? '').slice(0, 400) } : null }
  },
  async done({ stopped } = {}) {
    const p = S.page
    const endAt = now()
    await p.evaluate(() => { const h = document.getElementById('s2c-overlay-host'); if (h) h.style.display = 'none' })
    const spec = scoringSpec(S.round, S.id)
    const shot = await p.screenshot({ animations: 'disabled' })
    writeFileSync(join(S.dir, 'final.png'), shot)
    const pic = await pictureLikeness(p, spec.ref, shot)
    const score = await scorePage(p, spec)
    const layout = score?.regionScoreGrouped ?? score?.regionScore ?? null
    const overall = blend({ colour: pic.colourAligned, structure: pic.structureAligned }, layout, spec.baseline)
    const sum = (k) => S.runs.reduce((a, r) => a + ((r.codegen?.[k] ?? 0) + (r.interpret?.[k] ?? 0)), 0)
    const words = S.notes.reduce((a, n) => a + n.text.split(/\s+/).filter(Boolean).length, 0)
    const firstRun = S.runs[0]
    // time the person spent drawing and typing: first stroke to done, minus the time spent waiting on runs
    const drawMs = S.t0 ? Math.max(0, endAt - S.t0 - S.runs.reduce((a, r) => a + (r.totalMs ?? r.readMs ?? 0), 0)) : 0
    const digest = {
      round: S.round, id: S.id, version: LIKENESS_VERSION, stopped: stopped ?? null,
      likeness: Math.round(overall * 1000) / 10, colour: pic.colourAligned, structure: pic.structureAligned, layout,
      strokes: strokeStats(S.strokes.map((s) => s.way)), erased: S.undos, notesMoved: S.noteMoves ?? 0,
      words, notes: S.notes.length, longestNote: S.notes.reduce((a, n) => Math.max(a, n.text.split(/\s+/).filter(Boolean).length), 0),
      noteTexts: S.notes.map((n) => n.text),
      time: {
        firstStrokeToDoneS: S.t0 ? Math.round((endAt - S.t0) / 1000) : null,
        firstReadingS: firstRun ? Math.round(((S.events.find((e) => e.op === 'run')?.at ?? 0) + firstRun.readMs) / 1000) : null,
        readS: S.runs.map((r) => Math.round(r.readMs / 1000)), buildS: S.runs.map((r) => (r.buildMs == null ? null : Math.round(r.buildMs / 1000))),
        sketchingS: Math.round((drawMs) / 1000),
      },
      corrections: Math.max(0, S.runs.length - 1), runs: S.runs.length,
      tokens: { input: sum('input'), cacheRead: sum('cacheRead'), output: sum('output'), billed: sum('input') + sum('output') },
      events: S.events, strokesDrawn: S.strokes, notesTyped: S.notes,
    }
    writeFileSync(join(S.dir, 'digest.json'), JSON.stringify(digest, null, 2))
    await sideBySide(p, spec.ref, S.dir)
    return { ok: true, digest: { ...digest, events: undefined, strokesDrawn: undefined } }
  },
}

async function sideBySide(p, ref, dir) {
  const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`
  const sketch = [...readdirSync(dir)].filter((f) => /^run\d+-sketch\.png$/.test(f)).sort().shift()
  const pg = await browser.newPage({ viewport: { width: 1920, height: 520 } })
  await pg.setContent(`<body style="margin:0;display:flex;gap:8px;background:#222;font:14px sans-serif;color:#eee">${[['target', ref], ['sketch', sketch ? join(dir, sketch) : null], ['result', join(dir, 'final.png')]].map(([t, f]) => `<div><div style="padding:4px">${t}</div>${f ? `<img src="${b64(f)}" style="width:632px">` : ''}</div>`).join('')}</body>`)
  await pg.screenshot({ path: join(dir, 'side-by-side.png') }); await pg.close()
}

createServer((req, res) => {
  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', async () => {
    try {
      const cmd = JSON.parse(body || '{}')
      if (!ops[cmd.op]) throw new Error(`unknown op ${cmd.op}`)
      if (cmd.op !== 'open' && !S) throw new Error('open a page first')
      const out = await ops[cmd.op](cmd)
      res.end(JSON.stringify(out))
    } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ ok: false, error: String(e?.stack ?? e) })) }
  })
}).listen(PORT, '127.0.0.1', () => console.log(`[hand] listening on ${PORT}; app ${APP_DIR}`))

/**
 * e2e (goal loop n9): ten edits in a row, no waiting.
 *
 * Ten direct edits (reorder, resize, move) on the demo app, each started as
 * soon as the previous one is released (about a second apart, not waiting for
 * any code to land). Checks:
 *
 *   - all ten finish inside 20 s, first press to last release
 *   - every one is committed to the source by /@s2c/manipulate (0 tokens)
 *   - what you saw at the end is what the code has: after everything settles,
 *     and again after a full page reload (the page rebuilt from the code
 *     alone), every tracked box is within 2 px of the picture you were looking
 *     at right after the last release settled
 *   - nothing flashes back: once a box reached where it ends, it never moves
 *     more than 2 px away again (recorded every frame across the whole run)
 *
 * Then Ctrl+Z ten times, about 350 ms apart (no waiting either):
 *   - each undo changes the page within 50 ms of the key, and no box covers
 *     more than 60% of its travel in one frame (it glides, it doesn't jump)
 *   - every undo the server did is the one the page showed
 *   - the source is back to the start (git diff empty), and the page, both
 *     settled and rebuilt from the code in a fresh tab, matches the start
 *
 * Writes docs/motion/ten-in-a-row.json. Starts its own vite on :5267.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const PORT = 5267
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-ten]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })
const GAP = Number(process.env.S2C_GAP_MS ?? 250)
const UNDO_GAP = Number(process.env.S2C_UNDO_GAP_MS ?? 350)

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const CARD = 'section[data-s2c*="StatCards"] > div'
const GRID = 'div[class*="md:grid-cols-3"] > *'
const FORM = '[data-s2c*="ContactForm"]'
const NAV = 'nav a'

const KEYS = `
  globalThis.__keys = () => {
    const out = new Map()
    const add = (k, el) => { if (!out.has(k)) out.set(k, el) }
    for (const el of document.querySelectorAll('${CARD}, ${GRID}, ${NAV}')) {
      if (el.closest('#s2c-overlay-host')) continue
      add('item|' + (el.textContent ?? '').trim().slice(0, 24), el)
    }
    const inner = document.querySelector('section[data-s2c*="StatCards"]')?.parentElement
    const seen = {}
    for (const el of inner ? inner.children : []) {
      const f = (el.getAttribute('data-s2c') ?? el.tagName).replace(/:\\d+:\\d+$/, '')
      seen[f] = (seen[f] ?? 0) + 1
      add('block|' + f + '#' + seen[f], el)
    }
    return out
  }
  globalThis.__snap = () => {
    const boxes = {}
    for (const [k, el] of globalThis.__keys()) {
      const r = el.getBoundingClientRect()
      boxes[k] = [r.left + scrollX, r.top + scrollY, r.width, r.height, Number(getComputedStyle(el).opacity)]
    }
    return boxes
  }
`

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
let report
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const commits = []
  page.on('response', async (r) => {
    if (!r.url().includes('/@s2c/manipulate')) return
    try { const j = await r.json(); commits.push({ at: Date.now(), ok: !!j.ok, change: j.change ?? j.error }) } catch { commits.push({ ok: false, change: 'unreadable' }) }
  })
  let modelCalls = 0
  for (const p of ['**/@s2c/interpret', '**/@s2c/run']) {
    await page.route(p, (route) => { modelCalls++; return route.fulfill({ status: 500, body: '{"ok":false}' }) })
  }
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
  await page.waitForTimeout(300)
  await page.addScriptTag({ content: KEYS + `
    globalThis.__FR__ = []; globalThis.__REC__ = true
    const tick = () => { globalThis.__FR__.push({ at: performance.now(), boxes: globalThis.__snap() }); if (globalThis.__REC__) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  ` })

  const box = (sel, i = 0) => page.evaluate(([s, n]) => {
    const el = [...document.querySelectorAll(s)].filter((e) => !e.closest('#s2c-overlay-host'))[n]
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }, [sel, i])
  // aim where the element is, not where it was a frame ago: wait out a glide
  const still = async (sel, i) => {
    let a = await box(sel, i)
    for (let k = 0; k < 20; k++) {
      await page.waitForTimeout(40)
      const z = await box(sel, i)
      if (Math.abs(z.left - a.left) < 0.5 && Math.abs(z.top - a.top) < 0.5 && Math.abs(z.w - a.w) < 0.5 && Math.abs(z.h - a.h) < 0.5) return z
      a = z
    }
    return a
  }
  const pick = async (sel, i) => {
    const r = await still(sel, i)
    await page.waitForTimeout(60)
    await page.mouse.click(r.left + Math.min(12, r.w / 4), r.top + Math.min(12, r.h / 4))
    await page.waitForTimeout(150)
    return still(sel, i)
  }
  const reorder = (sel, from, to) => async () => {
    const a = await pick(sel, from)
    const z = await box(sel, to)
    await page.mouse.move(a.cx, a.cy)
    await page.mouse.down()
    if (a.h < 40) await page.mouse.move(z.cx + (to > from ? z.w * 0.3 : -z.w * 0.3), z.cy, { steps: 10 })
    else {
      await page.mouse.move(a.cx, a.top - 30, { steps: 4 })
      await page.mouse.move(z.cx, z.top - 30, { steps: 6 })
      await page.mouse.move(z.cx + (to > from ? 40 : -40), z.cy + 12, { steps: 3 })
    }
    await page.waitForTimeout(250)
  }
  const resize = (sel, i, d) => async () => {
    const r = await pick(sel, i)
    await page.mouse.move(r.cx, r.bottom)
    await page.mouse.down()
    await page.mouse.move(r.cx, r.bottom + d, { steps: 6 })
    await page.waitForTimeout(150)
  }
  const move = (sel, i, dx, dy) => async () => {
    const r = await pick(sel, i)
    await page.mouse.move(r.left + 40, r.top + 40)
    await page.mouse.down()
    await page.mouse.move(r.left + 40 + dx, r.top + 40 + dy, { steps: 5 })
    await page.waitForTimeout(150)
  }

  const EDITS = [
    ['reorder card 1→3', reorder(CARD, 0, 2)],
    ['resize card taller', resize(CARD, 0, 48)],
    ['reorder grid 1→3', reorder(GRID, 0, 2)],
    ['reorder nav link 1→3', reorder(NAV, 0, 2)],
    ['move form down', move(FORM, 0, 0, 36)],
    ['reorder card 3→1', reorder(CARD, 2, 0)],
    ['resize grid item taller', resize(GRID, 1, 40)],
    ['reorder nav link 3→1', reorder(NAV, 2, 0)],
    ['reorder grid 2→1', reorder(GRID, 1, 0)],
    ['resize card shorter', resize(CARD, 1, -24)],
  ]
  const initial = await page.evaluate(() => globalThis.__snap())
  const t0 = Date.now()
  const marks = []
  for (const [name, gesture] of EDITS) {
    const s0 = Date.now()
    await gesture()
    await page.mouse.up()
    marks.push({ name, startMs: s0 - t0, releaseMs: Date.now() - t0, status: await status() })
    await page.waitForTimeout(GAP)
  }
  const totalMs = Date.now() - t0
  // the picture right after the last release settled (glides done), before
  // the last code lands is the earliest it could; take it at +400 ms
  await page.waitForTimeout(400)
  const seen = await page.evaluate(() => globalThis.__snap())
  // let every commit land
  for (let i = 0; i < 40 && commits.length < EDITS.length; i++) await page.waitForTimeout(250)
  await page.waitForTimeout(2500)
  const settled = await page.evaluate(() => { globalThis.__REC__ = false; return { snap: globalThis.__snap(), fr: globalThis.__FR__ } })
  const st = await status()
  // the page rebuilt from the code alone
  // the page rebuilt from the code alone, in a second tab (this one keeps its undo history)
  const fresh = async () => {
    const p2 = await b.newPage({ viewport: { width: 1280, height: 1000 } })
    await p2.goto(APP, { waitUntil: 'networkidle' })
    await p2.waitForTimeout(800)
    await p2.addScriptTag({ content: KEYS })
    const snap = await p2.evaluate(() => globalThis.__snap())
    await p2.close()
    return snap
  }
  const reloaded = await fresh()

  // ---- undo all ten, one after another, not waiting ---------------------
  await page.addScriptTag({ content: `
    globalThis.__s2cUndo = []; globalThis.__FR__ = []; globalThis.__REC__ = true; globalThis.__KEYS_AT__ = []
    addEventListener('keydown', (e) => { if (e.key === 'z') globalThis.__KEYS_AT__.push(performance.now()) }, true)
    { const tick = () => { globalThis.__FR__.push({ at: performance.now(), boxes: globalThis.__snap() }); if (globalThis.__REC__) requestAnimationFrame(tick) }
      requestAnimationFrame(tick) }
  ` })
  await page.waitForTimeout(300)
  const u0 = Date.now()
  for (let i = 0; i < EDITS.length; i++) {
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(UNDO_GAP)
  }
  const undoKeysMs = Date.now() - u0
  for (let i = 0; i < 60; i++) {
    const n = await page.evaluate(() => globalThis.__s2cUndo.filter((x) => !x.preview).length)
    if (n >= EDITS.length) break
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(2500)
  const undone = await page.evaluate(() => { globalThis.__REC__ = false; return { snap: globalThis.__snap(), fr: globalThis.__FR__, keys: globalThis.__KEYS_AT__, log: globalThis.__s2cUndo } })
  const srcDiff = execSync('git diff --stat -- examples/demo-app/src/', { cwd: ROOT }).toString().trim()
  const undoneReloaded = await fresh()
  // per undo: first frame after the key where any tracked box differs from the frame before the key
  const undoRows = []
  const ufr = undone.fr
  const differs = (p, q) => Object.keys(p).some((k) => !q[k] || [0, 1, 2, 3, 4].some((j) => Math.abs(p[k][j] - q[k][j]) > 0.5))
  undone.keys.forEach((at, i) => {
    const prev = [...ufr].reverse().find((f) => f.at < at)
    const next = undone.keys[i + 1] ?? Infinity
    const win = ufr.filter((f) => f.at >= at && f.at < next)
    const first = prev ? win.find((f) => differs(prev.boxes, f.boxes)) : null
    // smoothness: no box covers more than 60% of its travel (> 8 px) in one frame
    let jump = null
    if (prev && win.length) {
      const end = win.at(-1).boxes
      for (const k of Object.keys(end)) {
        if (!prev.boxes[k]) continue
        for (let j = 0; j < 4; j++) {
          const travel = Math.abs(end[k][j] - prev.boxes[k][j])
          if (travel <= 8) continue
          let last = prev.boxes[k][j]
          for (const f of win) {
            const v = f.boxes[k]?.[j]; if (v == null) continue
            if (Math.abs(v - last) > 0.6 * travel) { jump = `${k.split('|')[1]} ${'xywh'[j]} ${Math.abs(v - last).toFixed(0)}/${travel.toFixed(0)} px in one frame at +${(f.at - at).toFixed(0)} ms`; break }
            last = v
          }
          if (jump) break
        }
        if (jump) break
      }
    }
    undoRows.push({ visibleMs: first ? +(first.at - at).toFixed(1) : null, jump })
  })
  const cmp = (a, bb) => {
    const off = []
    for (const k of new Set([...Object.keys(a), ...Object.keys(bb)])) {
      if (!a[k] || !bb[k]) { off.push(`${k} ${a[k] ? 'missing' : 'extra'}`); continue }
      const d = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(a[k][j] - bb[k][j])))
      if (d > 2) off.push(`${k.split('|')[1]} ${d.toFixed(0)}px`)
    }
    return off
  }
  const settledOff = cmp(seen, settled.snap)
  const reloadOff = cmp(seen, reloaded)
  // flash: a box at its final place that later moves > 2 px away and back
  const final = settled.snap
  const lastRel = marks.at(-1).releaseMs
  const flashes = []
  const fr = settled.fr
  // only after the last release: nothing should move once it has come to rest where it ends
  const tail = fr.filter((f) => f.at >= fr[0].at + lastRel - 50)
  for (const k of Object.keys(final)) {
    let close = false
    for (const f of tail) {
      const v = f.boxes[k]; if (!v || v[4] < 0.5) continue
      const d = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(v[j] - final[k][j])))
      if (d <= 1) close = true
      else if (close && d > 2) { flashes.push(`${k.split('|')[1]} ${d.toFixed(0)}px`); break }
    }
  }
  const okCommits = commits.filter((c) => c.ok).length
  const issues = []
  if (totalMs >= 20000) issues.push(`took ${totalMs} ms`)
  if (okCommits !== EDITS.length) issues.push(`${okCommits}/${EDITS.length} committed`)
  if (settledOff.length) issues.push(`settled page differs from what was seen: ${settledOff.join(', ')}`)
  if (reloadOff.length) issues.push(`code differs from what was seen: ${reloadOff.join(', ')}`)
  if (flashes.length) issues.push(`moved after coming to rest: ${flashes.join(', ')}`)
  if (modelCalls) issues.push(`${modelCalls} model calls`)
  const exactUndos = undone.log.filter((x) => !x.preview && x.exact).length
  const undoBack = cmp(initial, undone.snap)
  const undoReload = cmp(initial, undoneReloaded)
  undoRows.forEach((u, i) => {
    if (u.visibleMs == null || u.visibleMs >= 50) issues.push(`undo ${i + 1} visible after ${u.visibleMs} ms`)
    if (u.jump) issues.push(`undo ${i + 1} jumped: ${u.jump}`)
  })
  if (undone.keys.length !== EDITS.length) issues.push(`${undone.keys.length} undo keys seen`)
  if (exactUndos !== EDITS.length) issues.push(`${exactUndos}/${EDITS.length} undos matched the edit shown`)
  if (srcDiff) issues.push(`source not back to the start after undo: ${srcDiff.split('\n').at(-1)}`)
  if (undoBack.length) issues.push(`page after undo differs from the start: ${undoBack.join(', ')}`)
  if (undoReload.length) issues.push(`reloaded page after undo differs from the start: ${undoReload.join(', ')}`)
  if (errors.length) issues.push(`page errors: ${errors.join(' | ')}`)
  report = { undo: { keysMs: undoKeysMs, rows: undoRows, log: undone.log }, summary: { edits: EDITS.length, totalMs, committed: okCommits, modelCalls, pass: issues.length === 0, issues, finalStatus: st }, marks, commits }
  for (const m of marks) log(`${(m.releaseMs / 1000).toFixed(1)} s  ${m.name}  | ${m.status}`)
  for (const c of commits) log(`  commit: ${c.ok ? '✓' : '✗'} ${c.change}`)
  undoRows.forEach((u, i) => log(`  undo ${i + 1}: visible ${u.visibleMs} ms${u.jump ? ` JUMP ${u.jump}` : ''} | ${JSON.stringify(undone.log.filter((x) => !x.preview)[i] ?? null)}`))
  log(`SUMMARY: ${EDITS.length} edits in ${(totalMs / 1000).toFixed(1)} s, ${okCommits} committed${issues.length ? ` | ${issues.join(' | ')}` : ''}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}ten-in-a-row.json`, JSON.stringify(report, null, 1))
  if (issues.length) { log('FAILED'); process.exitCode = 1 } else log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

/**
 * e2e (goal loop n8): one shared plane. A set of 20+ direct edits (reorder,
 * resize, move) on the demo app, chained one after another, each landing in
 * the source through the 0-token codemods (/@s2c/manipulate) and coming back
 * as a hot reload. For every edit, every tracked box on the page is recorded
 * each animation frame from release until well after the reload:
 *
 *   - SEEN: the last frame before the hot reload's first DOM change is what
 *     you were looking at when the code landed
 *   - MATCH: the final page equals what was seen (every tracked box within
 *     2 px): the code followed the picture
 *   - NO FLASH / JUMP: no box ever moves away from where it ends up after it
 *     got close (> 2 px back out), and no box vanishes and comes back
 *   - MISMATCH: where the code's version differs, it eases there over >= 4
 *     frames and the status says why
 *
 * Passes when >= 95% of edits match with no flash/jump and every mismatch is
 * smooth and explained. Writes docs/motion/shared-plane.json.
 * Starts its own vite on :5265. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

const PORT = 5265
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-shared-plane]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const CARD = 'section[data-s2c*="StatCards"] > div'
const GRID = 'div[class*="md:grid-cols-3"] > *'
const PLAN = '[data-s2c*="PlanCard"]'
const FORM = '[data-s2c*="ContactForm"]'
const NAV = 'nav a'

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const results = []
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
  await page.waitForTimeout(300)

  // what is tracked: the stat cards, the 3-column grid's children, the plan
  // card, and the top-level blocks of the page body (keyed by source + text,
  // so a reordered mapped card keeps its key)
  await page.addScriptTag({ content: `
    globalThis.__keys = () => {
      // items (cards, grid children, nav links) by their text, which survives
      // a reorder; page blocks by their file and occurrence (line numbers and
      // text move when the code is rewritten)
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
    globalThis.__rec = () => {
      globalThis.__FR__ = []; globalThis.__REC__ = true; globalThis.__LAND__ = null
      const mo = new MutationObserver((recs) => {
        if (globalThis.__LAND__ != null) return
        for (const r of recs) {
          const t = r.target.nodeType === 1 ? r.target : r.target.parentElement
          if (!t || t.closest?.('#s2c-overlay-host') || t.id === 's2c-overlay-host') continue
          if (r.type === 'childList' || r.type === 'characterData' || r.attributeName === 'class') { globalThis.__LAND__ = performance.now(); mo.disconnect(); return }
        }
      })
      globalThis.__MO__ = mo
      const tick = (ts) => {
        const boxes = {}
        for (const [k, el] of globalThis.__keys()) {
          const r = el.getBoundingClientRect()
          boxes[k] = [r.left + scrollX, r.top + scrollY, r.width, r.height, Number(getComputedStyle(el).opacity)]
        }
        globalThis.__FR__.push({ ts, at: performance.now(), boxes })
        if (globalThis.__REC__) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
    globalThis.__arm = () => globalThis.__MO__.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
  ` })

  const box = (sel, i = 0) => page.evaluate(([s, n]) => {
    const el = [...document.querySelectorAll(s)].filter((e) => !e.closest('#s2c-overlay-host'))[n]
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, label: (el.textContent ?? '').trim().slice(0, 14) }
  }, [sel, i])
  const pick = async (sel, i) => {
    const r = await box(sel, i)
    await page.waitForTimeout(80)
    await page.mouse.click(r.left + Math.min(12, r.w / 4), r.top + Math.min(12, r.h / 4))
    await page.waitForTimeout(220)
    return box(sel, i)
  }

  // ---- the gestures --------------------------------------------------------
  const reorder = (sel, from, to) => async () => {
    const a = await pick(sel, from)
    const z = await box(sel, to)
    await page.mouse.move(a.cx, a.cy)
    await page.mouse.down()
    if (a.h < 40) {
      // a small item in a row (nav links): slide along the row into the slot
      await page.mouse.move(z.cx + (to > from ? z.w * 0.3 : -z.w * 0.3), z.cy, { steps: 12 })
    } else {
      await page.mouse.move(a.cx, a.top - 30, { steps: 5 })
      await page.mouse.move(z.cx, z.top - 30, { steps: 8 })
      await page.mouse.move(z.cx + (to > from ? 40 : -40), z.cy + 12, { steps: 3 })
    }
    await page.waitForTimeout(350)
  }
  const resize = (sel, i, edge, d) => async () => {
    const r = await pick(sel, i)
    const [x, y] = edge === 'bottom' ? [r.cx, r.bottom] : [r.right, r.cy]
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(edge === 'bottom' ? x : x + d, edge === 'bottom' ? y + d : y, { steps: 8 })
    await page.waitForTimeout(250)
  }
  const move = (sel, i, dx, dy) => async () => {
    const r = await pick(sel, i)
    await page.mouse.move(r.left + 40, r.top + 40)
    await page.mouse.down()
    await page.mouse.move(r.left + 40 + dx, r.top + 40 + dy, { steps: 6 })
    await page.waitForTimeout(200)
  }

  const EDITS = [
    ['reorder card 1→3', reorder(CARD, 0, 2)],
    ['reorder card 3→1', reorder(CARD, 2, 0)],
    ['reorder card 3→1 again', reorder(CARD, 2, 0)],
    ['reorder card 2→3', reorder(CARD, 1, 2)],
    ['resize card taller', resize(CARD, 0, 'bottom', 48)],
    ['resize card shorter', resize(CARD, 1, 'bottom', -24)],
    ['reorder grid 1→3', reorder(GRID, 0, 2)],
    ['reorder grid 3→1', reorder(GRID, 2, 0)],
    ['resize grid item taller', resize(GRID, 1, 'bottom', 40)],
    ['reorder nav link 1→3', reorder(NAV, 0, 2)],
    ['reorder nav link 3→1', reorder(NAV, 2, 0)],
    ['move form down', move(FORM, 0, 0, 36)],
    ['move grid item 2 down', move(GRID, 1, 0, 32)],
    ['reorder card 1→2', reorder(CARD, 0, 1)],
    ['resize card taller again', resize(CARD, 2, 'bottom', 32)],
    ['reorder grid 2→1', reorder(GRID, 1, 0)],
    ['resize grid item 3 taller', resize(GRID, 2, 'bottom', 32)],
    ['reorder nav link 2→1', reorder(NAV, 1, 0)],
    ['move grid item 3 down', move(GRID, 2, 0, 32)],
    ['reorder card 2→1', reorder(CARD, 1, 0)],
    ['reorder grid 1→2', reorder(GRID, 0, 1)],
    ['resize card shorter again', resize(CARD, 0, 'bottom', -40)],
  ]

  for (const [name, gesture] of EDITS) {
    await page.evaluate(() => { globalThis.__s2cLanded = null; globalThis.__rec() })
    await gesture()
    const relAt = await page.evaluate(() => { globalThis.__arm(); return performance.now() })
    await page.mouse.up()
    const got = await page.waitForFunction(() => globalThis.__s2cLanded != null, null, { timeout: 20000 }).then(() => true, () => false)
    await page.waitForTimeout(900)
    const st = await status()
    const { fr, land, landed } = await page.evaluate(() => { globalThis.__REC__ = false; return { fr: globalThis.__FR__, land: globalThis.__LAND__, landed: globalThis.__s2cLanded } })
    const r = { name, status: st, landed, committed: got && /^✓/.test(st) }
    results.push(r)
    if (!r.committed) { r.pass = false; r.why = `not committed: ${st}`; log(`✗ ${name}: ${r.why}`); continue }
    const after = fr.filter((f) => f.at >= relAt)
    const final = after.at(-1).boxes
    // what you saw when the code landed: every box at rest in the frames just
    // before the hot reload's first DOM change. A box at rest there that moves
    // afterwards is a mismatch (the code put it somewhere else); a box still
    // gliding into place there is judged by the jump check below.
    const pre = land == null ? [] : after.filter((f) => f.at < land).slice(-3)
    const off = []
    for (const k of Object.keys(final)) {
      if (pre.length && pre.some((f) => !f.boxes[k])) { off.push(`${k} appeared`); continue }
      if (pre.length < 2) continue
      const atRest = [0, 1, 2, 3].every((j) => pre.every((f) => Math.abs(f.boxes[k][j] - pre.at(-1).boxes[k][j]) < 0.5))
      if (!atRest) continue
      const d = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(pre.at(-1).boxes[k][j] - final[k][j])))
      if (d > 2) off.push(`${k.split('|')[1]} ${d.toFixed(0)}px`)
    }
    if (pre.length) for (const k of Object.keys(pre.at(-1).boxes)) if (!final[k]) off.push(`${k} vanished`)
    // flash/jump: after getting close to its final value, no box moves back out
    const jumps = []
    for (const k of Object.keys(final)) {
      for (let j = 0; j < 5; j++) {
        const tol = j === 4 ? 0.15 : 2
        let min = Infinity, gone = false
        for (const f of after) {
          const v = f.boxes[k]
          if (!v) { gone = true; continue }
          if (gone) { jumps.push(`${k.split('|')[1]} blinked out`); gone = false }
          // a faded drag placeholder (the item lifted out, its ghost under the
          // pointer) is not where you see the item: position counts once it is solid
          if (j < 4 && v[4] < 0.5) continue
          const dist = Math.abs(v[j] - final[k][j])
          if (dist > min + tol) { r.track ??= after.map((f) => [+(f.at - relAt).toFixed(0), ...(f.boxes[k] ?? []).map((v) => +v.toFixed(2)), land != null && f.at >= land ? 'L' : '']); jumps.push(`${k.split('|')[1]} ${'xywho'[j]} ${min.toFixed(1)}→${dist.toFixed(1)}`); break }
          min = Math.min(min, dist)
        }
      }
    }
    // a mismatch must ease (>= 4 in-between frames after the land) and say why
    const fromLand = after.filter((f) => land == null || f.at >= land)
    const easeFrames = off.length ? Math.max(0, ...Object.keys(final).map((k) => fromLand.filter((f) => f.boxes[k] && Math.max(...[0, 1, 2, 3].map((j) => Math.abs(f.boxes[k][j] - final[k][j]))) > 1).length)) : 0
    r.matched = off.length === 0
    r.off = off
    r.jumps = jumps
    r.easeFrames = easeFrames
    r.explained = off.length === 0 || /differently|snapped|scale/.test(st)
    r.pass = jumps.length === 0 && (r.matched || (easeFrames >= 4 && r.explained))
    log(`${r.pass ? (r.matched ? '✓' : '~') : '✗'} ${name}: ${r.matched ? 'matched' : `mismatch ${off.join(', ')} (eased ${easeFrames} frames${r.explained ? ', explained' : ', NOT explained'})`}${jumps.length ? ` JUMPS ${jumps.join('; ')}` : ''} | ${landed?.how} ${landed?.ms?.toFixed?.(0)} ms`)
    await page.waitForTimeout(300)
  }

  const n = results.length
  const clean = results.filter((r) => r.pass && r.matched).length
  const passed = results.filter((r) => r.pass).length
  const summary = { edits: n, matchedClean: clean, passed, matchRate: clean / n, passRate: passed / n, pageErrors: errors }
  log(`SUMMARY: ${clean}/${n} matched with no flash/jump (${(100 * clean / n).toFixed(0)}%), ${passed}/${n} passed incl. smooth explained mismatches`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}shared-plane.json`, JSON.stringify({ summary, results }, null, 1))
  if (errors.length) { log('page errors:', errors.join(' | ')); process.exitCode = 1 }
  if (n < 20 || clean / n < 0.95 || passed < n) { log('FAILED'); process.exitCode = 1 } else log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

/**
 * e2e (goal loop n13): ten MIXED edits in a row, then ten undos.
 *
 * Drags (reorder, resize, move) in tweak mode interleaved with pen erases
 * (scribble) and recolours (green ring) in auto mode, each started as soon as
 * the previous one is released — no waiting for any code to land. Checks:
 *
 *   - all ten finish inside 20 s, first press to last release
 *   - every edit lands in code with no model: 6 via /@s2c/manipulate, 4 via
 *     /@s2c/direct (0 tokens)
 *   - each edit is visible within 50 ms of the release / pen lift
 *   - what you saw is what the code has: the settled page and a fresh tab
 *     rebuilt from the code alone match the picture right after the last edit
 *     settled (boxes within 2 px, same colours, same elements)
 *
 * Then Ctrl+Z ten times, 350 ms apart (no waiting):
 *   - each undo changes the page within 50 ms of the key, no box jumps
 *     (> 60% of its travel in one frame)
 *   - every undo the server did is the one the page showed
 *   - the source is back to the start, and the page (settled and fresh) too
 *
 * Writes docs/motion/mixed-ten.json. Starts its own vite on :5269.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const PORT = 5269
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-mixed]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })
const GAP = Number(process.env.S2C_GAP_MS ?? 250)
const UNDO_GAP = Number(process.env.S2C_UNDO_GAP_MS ?? 350)
const GREEN = '#16a34a'

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
    for (const el of document.querySelectorAll('${CARD}, ${GRID}, ${NAV}, section h2')) {
      // an undone erase comes back as a ghost first (undo-preview captureErase): it counts
      if (el.closest('#s2c-overlay-host')) continue
      add(el.tagName + '|' + (el.textContent ?? '').trim().slice(0, 24), el)
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
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
      boxes[k] = [r.left + scrollX, r.top + scrollY, r.width, r.height, cs.display === 'none' ? 0 : Number(cs.opacity), cs.color]
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
  await page.addInitScript(() => { try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ } })
  const commits = []
  page.on('response', async (r) => {
    if (!r.url().includes('/@s2c/manipulate')) return
    try { const j = await r.json(); commits.push({ at: Date.now(), ok: !!j.ok, change: j.change ?? j.error }) } catch { commits.push({ ok: false, change: 'unreadable' }) }
  })
  let modelCalls = 0
  for (const p of ['**/@s2c/interpret', '**/@s2c/run']) {
    await page.route(p, (route) => { modelCalls++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"e2e: no model"}' }) })
  }
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.dataset.mode)
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
    await page.waitForTimeout(500)
  }
  await ensureDraw(page)
  await page.addScriptTag({ content: KEYS + `
    globalThis.__s2cDirect = []
    globalThis.__FR__ = []; globalThis.__REC__ = true
    const tick = () => { globalThis.__FR__.push({ at: performance.now(), boxes: globalThis.__snap() }); if (globalThis.__REC__) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
    globalThis.__REL__ = []
    addEventListener('pointerup', () => globalThis.__REL__.push(performance.now()), true)
    // a drag shows while it happens: time it from its first move
    globalThis.__MV__ = []; let down = false
    addEventListener('pointerdown', () => { down = true }, true)
    addEventListener('pointermove', () => { if (down) { down = false; globalThis.__MV__.push(performance.now()) } }, true)
  ` })

  // ---- modes ---------------------------------------------------------------
  const toTweak = async () => {
    if ((await mode()) === 'tweak') return
    await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
    await page.waitForTimeout(120)
    if ((await mode()) !== 'tweak') throw new Error(`ASSERT: tweak mode did not turn on (${await mode()})`)
  }
  const toDraw = async () => {
    if ((await mode()) === 'tweak') {
      await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
      await page.waitForTimeout(80)
    }
    await ensureDraw(page)
  }

  // ---- gestures --------------------------------------------------------------
  const box = (sel, i = 0, text = null) => page.evaluate(([s, n, t]) => {
    const els = [...document.querySelectorAll(s)].filter((e) => !e.closest('#s2c-overlay-host') && !e.hasAttribute('data-s2c-ghost'))
    const el = t ? els.find((e) => (e.textContent ?? '').trim().startsWith(t)) : els[n]
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, x: r.left, y: r.top }
  }, [sel, i, text])
  const still = async (sel, i, text) => {
    let a = await box(sel, i, text)
    for (let k = 0; k < 20 && a; k++) {
      await page.waitForTimeout(40)
      const z = await box(sel, i, text)
      if (z && Math.abs(z.left - a.left) < 0.5 && Math.abs(z.top - a.top) < 0.5 && Math.abs(z.w - a.w) < 0.5 && Math.abs(z.h - a.h) < 0.5) return z
      a = z
    }
    return a
  }
  const pick = async (sel, i) => {
    await toTweak()
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
    await page.mouse.up()
  }
  const resize = (sel, i, d) => async () => {
    const r = await pick(sel, i)
    await page.mouse.move(r.cx, r.bottom)
    await page.mouse.down()
    await page.mouse.move(r.cx, r.bottom + d, { steps: 6 })
    await page.waitForTimeout(150)
    await page.mouse.up()
  }
  const move = (sel, i, dx, dy) => async () => {
    const r = await pick(sel, i)
    await page.mouse.move(r.left + 40, r.top + 40)
    await page.mouse.down()
    await page.mouse.move(r.left + 40 + dx, r.top + 40 + dy, { steps: 5 })
    await page.waitForTimeout(150)
    await page.mouse.up()
  }
  const stroke = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 })
    await page.mouse.up()
  }
  let penSet = false
  const setPen = async () => {
    if (penSet) return
    penSet = true
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(300)
    await page.evaluate((h) => {
      const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
      input.value = h
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, GREEN)
    await page.waitForTimeout(200)
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(150)
  }
  const erase = (sel, text) => async () => {
    await toDraw()
    const t = await still(sel, 0, text)
    if (!t) throw new Error(`ASSERT: erase target "${text}" not on the page`)
    const x0 = t.x + t.w * 0.08, x1 = t.x + t.w * 0.92, y0 = t.y + t.h * 0.15, y1 = t.y + t.h * 0.85
    const n0 = await inkCount(page)
    await stroke(Array.from({ length: 9 }, (_, i) => [x0 + ((x1 - x0) * i) / 8, i % 2 ? y1 : y0]))
    await assertInk(page, n0 + 1, `scribble on ${text}`)
  }
  const recolour = (sel, text) => async () => {
    await toDraw()
    const t = await still(sel, 0, text)
    if (!t) throw new Error(`ASSERT: recolour target "${text}" not on the page`)
    await setPen()
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2
    const n0 = await inkCount(page)
    await stroke(Array.from({ length: 25 }, (_, i) => [cx + (t.w / 2 + 12) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (t.h / 2 + 12) * Math.sin((i / 24) * 2.08 * Math.PI)]))
    await assertInk(page, n0 + 1, `ring on ${text}`)
  }

  const EDITS = [
    ['reorder card 1→3', 'drag', reorder(CARD, 0, 2)],
    ['erase nav link "Reports"', 'direct', erase(NAV, 'Reports')],
    ['resize card taller', 'drag', resize(CARD, 0, 48)],
    ['recolour "Team members" green', 'direct', recolour('section h2', 'Team members')],
    ['reorder grid 1→3', 'drag', reorder(GRID, 0, 2)],
    ['erase stat card "Revenue"', 'direct', erase(CARD, 'Revenue')],
    ['move form down', 'drag', move(FORM, 0, 0, 36)],
    ['recolour nav link "Settings" green', 'direct', recolour(NAV, 'Settings')],
    ['reorder nav link 1→2', 'drag', reorder(NAV, 0, 1)],
    ['resize grid item taller', 'drag', resize(GRID, 1, 40)],
  ]
  const initial = await page.evaluate(() => globalThis.__snap())
  const t0 = Date.now()
  const marks = []
  for (const [name, kind, gesture] of EDITS) {
    const s0 = Date.now()
    await gesture()
    const rel = await page.evaluate((k) => k === 'drag' ? globalThis.__MV__.at(-1) : globalThis.__REL__.at(-1), kind)
    marks.push({ name, kind, startMs: s0 - t0, releaseMs: Date.now() - t0, rel, status: await status() })
    await page.waitForTimeout(GAP)
  }
  const totalMs = Date.now() - t0
  await page.waitForTimeout(400)
  const seen = await page.evaluate(() => globalThis.__snap())
  const want = (k) => EDITS.filter((e) => e[1] === k).length
  for (let i = 0; i < 60; i++) {
    const d = await page.evaluate(() => globalThis.__s2cDirect.length)
    if (commits.length >= want('drag') && d >= want('direct')) break
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(2500)
  const settled = await page.evaluate(() => { globalThis.__REC__ = false; return { snap: globalThis.__snap(), fr: globalThis.__FR__, direct: globalThis.__s2cDirect } })
  const st = await status()
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

  const differs = (p, q) => Object.keys({ ...p, ...q }).some((k) => !p[k] || !q[k] || [0, 1, 2, 3, 4].some((j) => Math.abs(p[k][j] - q[k][j]) > 0.5) || p[k][5] !== q[k][5])
  // edit → visible: first frame after the release that differs from the frame before it
  const efr = settled.fr
  const editRows = marks.map((m, i) => {
    const prev = [...efr].reverse().find((f) => f.at < m.rel)
    const first = prev ? efr.filter((f) => f.at >= m.rel && f.at < m.rel + 2000).find((f) => differs(prev.boxes, f.boxes)) : null
    return { name: m.name, visibleMs: first ? +(first.at - m.rel).toFixed(1) : null }
  })

  // ---- undo all ten ---------------------------------------------------------
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
  const ufr = undone.fr
  const undoRows = undone.keys.map((at, i) => {
    const prev = [...ufr].reverse().find((f) => f.at < at)
    const next = undone.keys[i + 1] ?? Infinity
    const win = ufr.filter((f) => f.at >= at && f.at < next)
    const first = prev ? win.find((f) => differs(prev.boxes, f.boxes)) : null
    let jump = null
    if (prev && win.length) {
      const end = win.at(-1).boxes
      outer: for (const k of Object.keys(end)) {
        if (!prev.boxes[k] || prev.boxes[k][4] < 0.5) continue
        for (let j = 0; j < 4; j++) {
          const travel = Math.abs(end[k][j] - prev.boxes[k][j])
          if (travel <= 8) continue
          let last = prev.boxes[k][j]
          for (const f of win) {
            const v = f.boxes[k]?.[j]; if (v == null) continue
            if (Math.abs(v - last) > 0.6 * travel) { jump = `${k.split('|')[1]} ${'xywh'[j]} ${Math.abs(v - last).toFixed(0)}/${travel.toFixed(0)} px in one frame at +${(f.at - at).toFixed(0)} ms`; break outer }
            last = v
          }
        }
      }
    }
    return { visibleMs: first ? +(first.at - at).toFixed(1) : null, jump }
  })
  const cmp = (a, bb) => {
    const off = []
    for (const k of new Set([...Object.keys(a), ...Object.keys(bb)])) {
      if (!a[k] || !bb[k]) { off.push(`${k} ${a[k] ? 'missing' : 'extra'}`); continue }
      const d = Math.max(...[0, 1, 2, 3].map((j) => Math.abs(a[k][j] - bb[k][j])))
      if (d > 2) off.push(`${k.split('|')[1]} ${d.toFixed(0)}px`)
      if (a[k][5] !== bb[k][5]) off.push(`${k.split('|')[1]} colour ${a[k][5]}→${bb[k][5]}`)
    }
    return off
  }
  const issues = []
  const okCommits = commits.filter((c) => c.ok).length
  const landed = settled.direct.filter((d) => d.how === 'landed').length
  if (totalMs >= 20000) issues.push(`took ${totalMs} ms`)
  if (okCommits !== want('drag')) issues.push(`${okCommits}/${want('drag')} drags committed`)
  if (landed !== want('direct')) issues.push(`${landed}/${want('direct')} pen edits written directly (${JSON.stringify(settled.direct.map((d) => d.how))})`)
  editRows.forEach((r) => { if (r.visibleMs == null || r.visibleMs >= 50) issues.push(`${r.name} visible after ${r.visibleMs} ms`) })
  const settledOff = cmp(seen, settled.snap)
  const reloadOff = cmp(seen, reloaded)
  if (settledOff.length) issues.push(`settled page differs from what was seen: ${settledOff.join(', ')}`)
  if (reloadOff.length) issues.push(`code differs from what was seen: ${reloadOff.join(', ')}`)
  if (modelCalls) issues.push(`${modelCalls} model calls`)
  const exactUndos = undone.log.filter((x) => !x.preview && x.exact).length
  undoRows.forEach((u, i) => {
    if (u.visibleMs == null || u.visibleMs >= 50) issues.push(`undo ${i + 1} visible after ${u.visibleMs} ms`)
    if (u.jump) issues.push(`undo ${i + 1} jumped: ${u.jump}`)
  })
  if (undone.keys.length !== EDITS.length) issues.push(`${undone.keys.length} undo keys seen`)
  if (exactUndos !== EDITS.length) issues.push(`${exactUndos}/${EDITS.length} undos matched the edit shown`)
  if (srcDiff) issues.push(`source not back to the start after undo: ${srcDiff.split('\n').at(-1)}`)
  const undoBack = cmp(initial, undone.snap)
  const undoReload = cmp(initial, undoneReloaded)
  if (undoBack.length) issues.push(`page after undo differs from the start: ${undoBack.join(', ')}`)
  if (undoReload.length) issues.push(`reloaded page after undo differs from the start: ${undoReload.join(', ')}`)
  if (errors.length) issues.push(`page errors: ${errors.join(' | ')}`)
  report = { summary: { edits: EDITS.length, totalMs, committed: okCommits, direct: landed, modelCalls, undoKeysMs, pass: issues.length === 0, issues, finalStatus: st }, edits: editRows, marks, commits, direct: settled.direct, undo: { rows: undoRows, log: undone.log } }
  for (const [i, m] of marks.entries()) log(`${(m.releaseMs / 1000).toFixed(1)} s  ${m.name}  visible ${editRows[i].visibleMs} ms | ${m.status}`)
  for (const c of commits) log(`  manipulate: ${c.ok ? '✓' : '✗'} ${c.change}`)
  for (const d of settled.direct) log(`  direct: ${d.how} ${d.change ?? ''}`)
  undoRows.forEach((u, i) => log(`  undo ${i + 1}: visible ${u.visibleMs} ms${u.jump ? ` JUMP ${u.jump}` : ''} | ${JSON.stringify(undone.log.filter((x) => !x.preview)[i] ?? null)}`))
  log(`SUMMARY: ${EDITS.length} mixed edits in ${(totalMs / 1000).toFixed(1)} s, ${okCommits} drags + ${landed} pen edits in code${issues.length ? ` | ${issues.join(' | ')}` : ''}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}mixed-ten.json`, JSON.stringify(report, null, 1))
  if (issues.length) { log('FAILED'); process.exitCode = 1 } else log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

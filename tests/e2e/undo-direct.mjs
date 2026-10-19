/**
 * e2e (goal loop n12): undo of erase and recolour is instant and smooth.
 *
 * Five direct edits (3 erases, 2 recolours) land in code with no model (as in
 * direct-erase-recolour.mjs), then Ctrl+Z five times, quickly. For each undo:
 *   - keydown → the change starts going back in < 50 ms (an erased element
 *     fades back in where it was, neighbours glide apart; a colour eases back)
 *   - smooth: the restored element's opacity only rises, it never shows twice,
 *     and no box jumps once the revert's code lands
 *   - all five reverts land: the demo source is exactly what it was
 *
 * (Original n10 header follows.)
 *
 * In auto mode a plain scribble (erase) or a plain coloured ring (recolour)
 * already shows on the page at pen lift. This checks the next half: that same
 * change is written into the demo source by the deterministic engines
 * (POST /@s2c/direct) — no /@s2c/interpret, no /@s2c/run, 0 tokens — and when
 * the hot reload brings the code's version, nothing flashes or jumps:
 *
 *   - lift → the change is visible in < 50 ms
 *   - the source file changed, within ~1.5 s of lift
 *   - erase: the erased element never shows again; no other tracked box moves
 *     once the code lands (the gap the glide closed is the gap the code has)
 *   - recolour: once the colour reaches the drawn one it never goes back
 *
 * (n12 writes docs/motion/undo-direct.json, vite on :5268.) n10: writes direct-edits.json, vite :5266 and puts
 * the demo source back afterwards. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const PORT = 5268
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-undo-direct]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })
const diff = () => execSync('git diff --stat -- examples/demo-app/src/', { cwd: ROOT }).toString().trim()

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const GREEN = '#16a34a'
const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const results = []
let modelCalls = 0
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 1000 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(performance.now()), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default is auto */ }
  })
  for (const p of ['**/@s2c/interpret', '**/@s2c/run']) {
    await page.route(p, (route) => {
      modelCalls++
      return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'e2e: the model must not be asked' }) })
    })
  }
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
    await page.waitForTimeout(500)
  }
  await ensureDraw(page)
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)

  await page.addScriptTag({ content: `
    globalThis.__keys = () => {
      const out = new Map()
      const add = (k, el) => { if (!out.has(k)) out.set(k, el) }
      const sel = 'section[data-s2c*="StatCards"] > div, div[class*="md:grid-cols-3"] > *, nav a, h1, h2, button, [data-e2e-t]'
      for (const el of document.querySelectorAll(sel)) {
        if (el.closest('#s2c-overlay-host')) continue
        add(el.tagName + '|' + (el.textContent ?? '').trim().slice(0, 24), el)
      }
      return out
    }
    globalThis.__rec = (targetKey) => {
      globalThis.__FR__ = []; globalThis.__REC__ = true; globalThis.__LAND__ = null
      const mo = new MutationObserver((recs) => {
        if (globalThis.__LAND__ != null) return
        for (const r of recs) {
          const t = r.target.nodeType === 1 ? r.target : r.target.parentElement
          if (!t || t.closest?.('#s2c-overlay-host') || t.id === 's2c-overlay-host') continue
          if (r.type === 'childList' || r.type === 'characterData' || r.attributeName === 'class') { globalThis.__LAND__ = performance.now(); mo.disconnect(); return }
        }
      })
      mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class'] })
      const tick = (ts) => {
        const boxes = {}
        for (const [k, el] of globalThis.__keys()) {
          const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
          boxes[k] = [r.left + scrollX, r.top + scrollY, r.width, r.height, cs.display === 'none' ? 0 : Number(cs.opacity), cs.color, cs.backgroundColor]
        }
        globalThis.__FR__.push({ at: performance.now(), boxes })
        if (globalThis.__REC__) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
  ` })

  const find = (how) => page.evaluate((h) => {
    const els = [...document.querySelectorAll(h.sel)].filter((e) => !e.closest('#s2c-overlay-host'))
    const el = h.text ? els.find((e) => (e.textContent ?? '').trim().startsWith(h.text)) : els[h.i ?? 0]
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    const r = el.getBoundingClientRect()
    return { key: el.tagName + '|' + (el.textContent ?? '').trim().slice(0, 24), src: el.getAttribute('data-s2c'), x: r.left, y: r.top, w: r.width, h: r.height }
  }, how)
  const draw = async (pts, steps = 4) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps })
    await page.mouse.up()
  }
  let penSet = false
  const setPen = async (hex) => {
    if (penSet) return
    penSet = true
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(400)
    await page.evaluate((h) => {
      const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
      input.value = h
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, hex)
    await page.waitForTimeout(300)
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(200)
  }
  const scribble = (t) => {
    const x0 = t.x + t.w * 0.08, x1 = t.x + t.w * 0.92, y0 = t.y + t.h * 0.15, y1 = t.y + t.h * 0.85
    return Array.from({ length: 9 }, (_, i) => [x0 + ((x1 - x0) * i) / 8, i % 2 ? y1 : y0])
  }
  const ring = (t) => {
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2
    return Array.from({ length: 25 }, (_, i) => [cx + (t.w / 2 + 12) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (t.h / 2 + 12) * Math.sin((i / 24) * 2.08 * Math.PI)])
  }

  const EDITS = [
    { name: 'erase stat card "Active users"', kind: 'erase', at: { sel: 'section[data-s2c*="StatCards"] > div', text: 'Active users' } },
    { name: 'erase nav link "Reports"', kind: 'erase', at: { sel: 'nav a', text: 'Reports' } },
    { name: 'erase stat card "Revenue"', kind: 'erase', at: { sel: 'section[data-s2c*="StatCards"] > div', text: 'Revenue' } },
    { name: 'recolour "Team members" heading green', kind: 'recolour', at: { sel: 'section h2', text: 'Team members' } },
    { name: 'recolour nav link "Settings" green', kind: 'recolour', at: { sel: 'nav a', text: 'Settings' } },
  ]
  const start = diff()
  const t0 = Date.now()
  for (const e of EDITS) {
    const t = await find(e.at)
    const r = { name: e.name, kind: e.kind }
    results.push(r)
    if (!t) { r.pass = false; r.why = 'target not on the page'; log(`✗ ${e.name}: ${r.why}`); continue }
    r.key = t.key; r.at = e.at
    await page.waitForTimeout(200)
    if (e.kind === 'recolour') await setPen(GREEN)
    await page.evaluate(() => { globalThis.__s2cDirect = [] })
    const n0 = await inkCount(page)
    await draw(e.kind === 'erase' ? scribble(t) : ring(t))
    await assertInk(page, n0 + 1, e.name)
    const got = await page.waitForFunction(() => (globalThis.__s2cDirect ?? []).length > 0, null, { timeout: 8000 }).then(() => true, () => false)
    r.direct = got ? (await page.evaluate(() => globalThis.__s2cDirect[0])) : null
    r.landed = !!r.direct && r.direct.how === 'landed'
    log(`${r.landed ? '✓' : '✗'} ${e.name}: ${r.direct?.change ?? `not written directly (status: ${await status()})`}`)
    await page.waitForTimeout(300)
  }
  const editMs = Date.now() - t0
  const landedAll = results.every((r) => r.landed)

  // ---- undo, newest first, quickly ------------------------------------------
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    globalThis.__s2cUndo = []; globalThis.__KEYAT__ = []
    addEventListener('keydown', (e) => { if (e.key === 'z' && (e.ctrlKey || e.metaKey)) globalThis.__KEYAT__.push(performance.now()) }, true)
  })
  const undos = []
  for (const r of [...results].reverse()) {
    if (!r.landed) continue
    const u = { name: `undo: ${r.name}`, kind: r.kind, key: r.key }
    undos.push(u)
    await page.evaluate((k) => globalThis.__rec(k), r.key)
    await page.keyboard.press('Control+z')
    const ok = await page.waitForFunction((n) => globalThis.__s2cUndo.filter((x) => !x.preview).length >= n, undos.length, { timeout: 8000 }).then(() => true, () => false)
    await page.waitForTimeout(700)
    const { fr, land, key, log: ulog, count } = await page.evaluate((k) => {
      globalThis.__REC__ = false
      const count = [...globalThis.__keys().keys()].length
      return { fr: globalThis.__FR__, land: globalThis.__LAND__, key: globalThis.__KEYAT__.at(-1), log: globalThis.__s2cUndo.filter((x) => !x.preview).at(-1), count }
    }, r.key)
    u.server = ulog ?? null
    const after = fr.filter((f) => f.at >= key)
    const issues = []
    if (!ok || !ulog) issues.push('the server never answered')
    else if (!ulog.exact) issues.push(`server undid something else (${ulog.undid})`)
    else if (!ulog.previewed) issues.push('no instant preview played')
    const v0 = fr.filter((f) => f.at < key).at(-1)?.boxes[r.key] ?? null
    const vis = (v) => (v && v[2] * v[3] > 0 ? v[4] : 0)
    const firstVisible = after.find((f) => {
      const v = f.boxes[r.key]
      return r.kind === 'erase' ? vis(v) > 0.03 : (v && v0 && (v[5] !== v0[5] || v[6] !== v0[6]))
    })
    u.keyToVisibleMs = firstVisible ? +(firstVisible.at - key).toFixed(1) : null
    u.keyToFirstDomChangeMs = land != null ? +(land - key).toFixed(0) : null
    if (u.keyToVisibleMs == null || u.keyToVisibleMs >= 50) issues.push(`visible after ${u.keyToVisibleMs} ms`)
    if (r.kind === 'erase') {
      // fades in: opacity never drops by more than a hair once rising
      let peak = 0, frames = 0
      for (const f of after) {
        const o = vis(f.boxes[r.key])
        if (o > 0.03 && o < 0.97) frames++
        if (o < peak - 0.15) { issues.push(`restored element dipped to ${o.toFixed(2)} at +${(f.at - key).toFixed(0)} ms (flash)`); break }
        peak = Math.max(peak, o)
      }
      u.fadeInFrames = frames
      if (peak < 0.97) issues.push(`never fully back (opacity ${peak.toFixed(2)})`)
      if (frames < 4) issues.push(`popped in (${frames} frames of fade)`)
      const dup = await page.evaluate((k) => [...document.querySelectorAll('section[data-s2c*="StatCards"] > div, nav a')].filter((el) => el.tagName + '|' + (el.textContent ?? '').trim().slice(0, 24) === k).length, r.key)
      if (dup !== 1) issues.push(`${dup} copies on the page after the code landed`)
    } else {
      const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const final = after.at(-1)?.boxes[r.key]
      // eased: more than one in-between colour
      const seen = new Set(after.map((f) => (f.boxes[r.key] ?? [])[5] + '/' + (f.boxes[r.key] ?? [])[6]))
      u.colourSteps = seen.size
      if (seen.size < 4) issues.push(`colour jumped (${seen.size} distinct frames)`)
      if (final && rgb(final[5]).every((x, i) => Math.abs(x - [22, 163, 74][i]) <= 20)) issues.push('still green')
    }
    // nothing jumps, while the preview plays or when the revert's code lands
    if (after.length) {
      const fromLand = after
      const last = after.at(-1).boxes
      for (const k of Object.keys(last)) {
        const xs = fromLand.map((f) => f.boxes[k]).filter(Boolean)
        const moved = Math.max(0, ...xs.map((v) => Math.max(...[0, 1, 2, 3].map((j) => Math.abs(v[j] - last[k][j])))))
        // glides still finishing move smoothly; a jump is a big step between two frames
        // a glide eases (each frame's step close to its neighbours'); a jump is
        // one big step between small ones (a snap, or a reload resetting a glide)
        const steps = xs.slice(1).map((v, i) => Math.max(...[0, 1, 2, 3].map((j) => Math.abs(v[j] - xs[i][j]))))
        for (let i = 0; i < steps.length; i++) {
          const around = Math.max(steps[i - 1] ?? 0, steps[i + 1] ?? 0)
          if (steps[i] > 24 && steps[i] > 2.5 * around) { issues.push(`${k} jumped ${steps[i].toFixed(0)} px in one frame (moved ${moved.toFixed(0)} in all)`); break }
        }
      }
    }
    u.issues = issues
    u.pass = issues.length === 0
    log(`${u.pass ? '✓' : '✗'} ${u.name}: visible ${u.keyToVisibleMs} ms, first DOM change ${u.keyToFirstDomChangeMs} ms${issues.length ? ` | ${issues.join('; ')}` : ''}`)
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(800)
  const back = diff() === start
  const passed = undos.filter((u) => u.pass).length
  const summary = { edits: results.length, landed: results.filter((r) => r.landed).length, editMs, undos: undos.length, undoPassed: passed, sourceBack: back, modelCalls, pageErrors: errors }
  log(`SUMMARY: ${summary.landed}/${summary.edits} edits landed directly in ${editMs} ms; ${passed}/${undos.length} undos instant and smooth; source back to start: ${back}; model calls: ${modelCalls}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}undo-direct.json`, JSON.stringify({ summary, edits: results, undos }, null, 1))
  if (errors.length) log('page errors:', errors.join(' | '))
  if (!landedAll || passed < undos.length || !back || modelCalls > 0 || errors.length) { log('FAILED'); process.exitCode = 1 } else log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

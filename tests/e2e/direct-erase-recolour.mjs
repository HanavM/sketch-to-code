/**
 * e2e (goal loop n10): erase and recolour land in the code with no model.
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
 * Writes docs/motion/direct-edits.json. Starts its own vite on :5266 and puts
 * the demo source back afterwards. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const PORT = 5266
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-direct]', ...a)
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
    // erases first, in the default ink; then the green pen for the rings
    { name: 'erase stat card "Active users"', kind: 'erase', at: { sel: 'section[data-s2c*="StatCards"] > div', text: 'Active users' } },
    { name: 'erase stat card "Conversion"', kind: 'erase', at: { sel: 'section[data-s2c*="StatCards"] > div', text: 'Conversion' } },
    { name: 'erase nav link "Reports"', kind: 'erase', at: { sel: 'nav a', text: 'Reports' } },
    { name: 'erase the form\'s "Role" field', kind: 'erase', at: { sel: '[data-s2c*="ContactForm"] form > div', i: 2 } },
    { name: 'erase stat card "Revenue"', kind: 'erase', at: { sel: 'section[data-s2c*="StatCards"] > div', text: 'Revenue' } },
    { name: 'recolour "Team members" heading green', kind: 'recolour', at: { sel: 'section h2', text: 'Team members' } },
    { name: 'recolour the contact form heading green', kind: 'recolour', at: { sel: '[data-s2c*="ContactForm"] h2', i: 0 } },
    { name: 'recolour nav link "Settings" green', kind: 'recolour', at: { sel: 'nav a', text: 'Settings' } },
  ]

  for (const e of EDITS) {
    const t = await find(e.at)
    const r = { name: e.name, kind: e.kind }
    results.push(r)
    if (!t) { r.pass = false; r.why = 'target not on the page'; log(`✗ ${e.name}: ${r.why}`); continue }
    r.src = t.src
    await page.waitForTimeout(250)
    if (e.kind === 'recolour') await setPen(GREEN)
    await page.evaluate(() => { globalThis.__s2cDirect = []; globalThis.__s2cOptimistic = null })
    await page.evaluate((k) => globalThis.__rec(k), t.key)
    const before = diff()
    const n0 = await inkCount(page)
    await draw(e.kind === 'erase' ? scribble(t) : ring(t))
    await assertInk(page, n0 + 1, e.name)
    const got = await page.waitForFunction(() => (globalThis.__s2cDirect ?? []).length > 0, null, { timeout: 8000 }).then(() => true, () => false)
    await page.waitForTimeout(900)
    const st = await status()
    const { fr, land, direct, lift, opt } = await page.evaluate(() => { globalThis.__REC__ = false; return { fr: globalThis.__FR__, land: globalThis.__LAND__, direct: globalThis.__s2cDirect, lift: globalThis.__LIFT__.at(-1), opt: globalThis.__s2cOptimistic } })
    r.direct = direct?.[0] ?? null
    r.status = st
    r.optimistic = opt
    r.codeChanged = diff() !== before
    if (!got || !r.direct) { r.pass = false; r.why = `never written directly (status: ${st}; optimistic: ${JSON.stringify(opt)})`; log(`✗ ${e.name}: ${r.why}`); continue }
    const after = fr.filter((f) => f.at >= lift)
    // lift → visible
    const v0 = after[0]?.boxes[t.key]
    const firstVisible = after.find((f) => {
      const v = f.boxes[t.key]
      if (!v) return true
      return e.kind === 'erase' ? v[4] < 0.97 : (v[5] !== v0[5] || v[6] !== v0[6])
    })
    r.liftToVisibleMs = firstVisible ? +(firstVisible.at - lift).toFixed(1) : null
    r.liftToLandMs = land != null ? +(land - lift).toFixed(0) : null
    const issues = []
    if (r.liftToVisibleMs == null || r.liftToVisibleMs >= 50) issues.push(`visible after ${r.liftToVisibleMs} ms`)
    if (!r.codeChanged) issues.push('the source did not change')
    if (r.direct.how !== 'landed') issues.push(`hot reload ${r.direct.how}`)
    if (r.liftToLandMs == null || r.liftToLandMs > 2500) issues.push(`code landed ${r.liftToLandMs} ms after lift`)
    const fromLand = land == null ? [] : after.filter((f) => f.at >= land - 40)
    if (e.kind === 'erase') {
      // once faded, it never shows again
      let faded = false
      for (const f of after) {
        const v = f.boxes[t.key]
        const op = v ? (v[2] * v[3] > 0 ? v[4] : 0) : 0
        if (op < 0.05) faded = true
        else if (faded && op > 0.1) { issues.push(`erased element flashed back (${op.toFixed(2)} at +${(f.at - lift).toFixed(0)} ms)`); break }
      }
      if (!faded) issues.push('never faded out')
      // no other box moves once the code lands
      const last = after.at(-1).boxes
      for (const k of Object.keys(last)) {
        if (k === t.key) continue
        const xs = fromLand.map((f) => f.boxes[k]).filter(Boolean)
        const moved = Math.max(0, ...xs.map((v) => Math.max(...[0, 1, 2, 3].map((j) => Math.abs(v[j] - last[k][j])))))
        if (moved > 2) issues.push(`${k} jumped ${moved.toFixed(0)} px when the code landed`)
      }
    } else {
      const rgb = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
      const close = (a, b2) => Math.max(...a.map((x, i) => Math.abs(x - b2[i]))) <= 14
      const final = after.at(-1).boxes[t.key]
      const idx = final && rgb(final[5]).every((x, i) => Math.abs(x - [22, 163, 74][i]) <= 30) ? 5 : 6
      if (!final) issues.push('recoloured element vanished')
      else {
        let reached = false
        for (const f of after) {
          const v = f.boxes[t.key]
          if (!v) { issues.push('recoloured element blinked out'); break }
          if (close(rgb(v[idx]), rgb(final[idx]))) reached = true
          else if (reached) { issues.push(`colour flashed back to ${v[idx]} at +${(f.at - lift).toFixed(0)} ms`); break }
        }
        r.finalColour = final[idx]
        if (!close(rgb(final[idx]), [22, 163, 74]) && !close(rgb(final[idx]), rgb(after[1]?.boxes[t.key]?.[idx] ?? final[idx]))) issues.push(`ended ${final[idx]}, not the colour shown`)
      }
    }
    r.issues = issues
    r.pass = issues.length === 0
    log(`${r.pass ? '✓' : '✗'} ${e.name}: ${r.direct.change} | visible ${r.liftToVisibleMs} ms, code on page ${r.liftToLandMs} ms${issues.length ? ` | ${issues.join('; ')}` : ''}`)
    await page.waitForTimeout(400)
  }

  const n = results.length
  const passed = results.filter((r) => r.pass).length
  const summary = { edits: n, passed, modelCalls, pageErrors: errors }
  log(`SUMMARY: ${passed}/${n} erase/recolour edits landed in code with no model and no flash; model calls: ${modelCalls}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}direct-edits.json`, JSON.stringify({ summary, results }, null, 1))
  if (errors.length) log('page errors:', errors.join(' | '))
  if (passed < n || modelCalls > 0 || errors.length) { log('FAILED'); process.exitCode = 1 } else log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

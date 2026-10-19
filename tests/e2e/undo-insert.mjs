/**
 * e2e (goal loop n15): undo of a drawn addition is instant and smooth.
 *
 * Three direct additions land as in direct-insert.mjs (caret + word, no
 * model). Then Ctrl+Z three times, newest first. For each undo:
 *   - keydown → the added link is visibly going in < 50 ms
 *   - smooth: it fades/shrinks out (never pops), every other link glides
 *     (no single-frame step > 24 px), nothing flashes when the revert lands
 *   - the page order and the Navbar source are exactly what they were
 *   - the model is never asked
 *
 * Writes docs/motion/undo-insert.json. Starts vite on :5271 and puts the demo
 * source back afterwards. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const PORT = 5271
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const NAV = `${ROOT}examples/demo-app/src/components/Navbar.tsx`
const log = (...a) => console.log('[e2e-undo-insert]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const results = []
let modelCalls = 0
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
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
  const navItems = () => page.evaluate(() => [...document.querySelectorAll('nav a, nav button')]
    .filter((e) => !e.closest('#s2c-overlay-host'))
    .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? '').trim(), tag: e.tagName, x: r.left, y: r.top, w: r.width, h: r.height } }))

  const SRC0 = readFileSync(NAV, 'utf8')
  const ORDER0 = (await navItems()).map((i) => i.t)
  const EDITS = [
    { word: 'Blog', between: ['Overview', 'Reports'] },
    { word: 'Docs', between: ['Reports', 'Settings'] },
    { word: 'Help', between: ['Settings', 'Sign out'] },
  ]
  for (const e of EDITS) {
    const r = { word: e.word, between: e.between }
    results.push(r)
    await page.waitForTimeout(400)
    const items = await navItems()
    const a = items.find((i) => i.t === e.between[0])
    const c = items.find((i) => i.t === e.between[1])
    if (!a || !c) { r.pass = false; r.why = 'neighbours not on the page'; log(`✗ ${e.word}: ${r.why}`); continue }
    const src0 = readFileSync(NAV, 'utf8')
    await page.evaluate(() => {
      globalThis.__s2cDirect = []; globalThis.__s2cGrown = null; globalThis.__s2cPreview = null
      globalThis.__FR__ = []; globalThis.__REC__ = true
      const tick = (ts) => {
        const layer = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending')
        const g = layer?.querySelector('.pg.ghost')
        const links = [...document.querySelectorAll('nav a, nav button')].filter((el) => !el.closest('#s2c-overlay-host'))
          .map((el) => [(el.textContent ?? '').trim(), Number(getComputedStyle(el).opacity), el.getBoundingClientRect().left])
        globalThis.__FR__.push({ at: performance.now(), ghost: g ? Number(getComputedStyle(g).opacity) : null, links })
        if (globalThis.__REC__) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    const x = (a.x + a.w + c.x) / 2
    const y = a.y + a.h - 2
    const n0 = await inkCount(page)
    await page.mouse.move(x - 9, y + 16)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 6 })
    await page.mouse.move(x + 9, y + 16, { steps: 6 })
    await page.mouse.up()
    await assertInk(page, n0 + 1, `caret for ${e.word}`)
    await page.waitForTimeout(200)
    await page.keyboard.type(e.word, { delay: 20 })
    await page.keyboard.press('Enter')
    const t0 = Date.now()
    const got = await page.waitForFunction(() => (globalThis.__s2cDirect ?? []).length > 0, null, { timeout: 10000 }).then(() => true, () => false)
    r.directMs = Date.now() - t0
    await page.waitForTimeout(700)
    const { fr, lift, direct, grown, preview } = await page.evaluate(() => {
      globalThis.__REC__ = false
      return { fr: globalThis.__FR__, lift: globalThis.__LIFT__.at(-1), direct: globalThis.__s2cDirect, grown: globalThis.__s2cGrown, preview: globalThis.__s2cPreview }
    })
    r.status = await status()
    r.direct = direct?.[0] ?? null
    r.grown = grown
    r.preview = preview
    const src1 = readFileSync(NAV, 'utf8')
    const issues = []
    if (!got || !r.direct) issues.push(`never written directly (status: ${r.status})`)
    // ghost at lift
    const afterLift = fr.filter((f) => f.at >= lift)
    const g0 = afterLift.find((f) => f.ghost != null && f.ghost > 0.3)
    r.liftToGhostMs = g0 ? +(g0.at - lift).toFixed(1) : null
    if (r.liftToGhostMs == null || r.liftToGhostMs >= 50) issues.push(`ghost after ${r.liftToGhostMs} ms`)
    // source: one more line, with the word, between the neighbours
    const added = src1.split('\n').filter((l) => !src0.split('\n').includes(l))
    r.addedLines = added
    const iA = src1.indexOf(`>${e.between[0]}<`) >= 0 ? src1.indexOf(`>${e.between[0]}<`) : src1.indexOf(e.between[0])
    const iW = src1.indexOf(`>${e.word}<`)
    const iC = src1.indexOf(e.between[1], iW + 1)
    if (added.length !== 1 || !added[0].includes(`>${e.word}</a>`)) issues.push(`source change: ${JSON.stringify(added)}`)
    if (!(iA >= 0 && iA < iW && iW < iC)) issues.push('the word is not between its neighbours in the source')
    // page: the new link sits between the neighbours, and grew in
    const last = fr.at(-1)?.links ?? []
    const order = last.map((l) => l[0])
    const k = order.indexOf(e.word)
    if (!(k > 0 && order[k - 1] === e.between[0] && order[k + 1] === e.between[1])) issues.push(`page order ${order.join(' | ')}`)
    const ops = fr.map((f) => f.links.find((l) => l[0] === e.word)).filter(Boolean).map((l) => l[1])
    r.newOpacityFrames = ops.slice(0, 14).map((o) => +o.toFixed(2))
    const rising = new Set(ops.filter((o) => o < 0.999).map((o) => o.toFixed(3)))
    if (!(ops.length > 0 && ops[0] < 0.5 && rising.size >= 4 && ops.at(-1) > 0.999)) issues.push(`did not grow in (${r.newOpacityFrames.join(',')})`)
    // every link already there moves smoothly: no single-frame step > 24 px (a shift would jump a whole slot, 75+ px)
    for (const name of order.filter((t) => t !== e.word)) {
      const xs = fr.map((f) => f.links.find((l) => l[0] === name)?.[2]).filter((v) => v != null)
      const jump = Math.max(0, ...xs.slice(1).map((v, i) => Math.abs(v - xs[i])))
      if (jump > 24) issues.push(`"${name}" jumped ${jump.toFixed(0)} px in one frame`)
      r.maxStep = Math.max(r.maxStep ?? 0, +jump.toFixed(1))
    }
    if (!grown || grown.added !== 1) issues.push(`growLanded: ${JSON.stringify(grown)}`)
    r.frames = fr.map((f) => ({ at: +(f.at - lift).toFixed(1), g: f.ghost, l: f.links.map((l) => `${l[0]}:${l[2].toFixed(0)}:${l[1].toFixed(2)}`).join(' ') }))
    r.pass = issues.length === 0
    r.issues = issues
    log(`${r.pass ? '✓' : '✗'} "${e.word}" between ${e.between.join(' / ')} · ghost ${r.liftToGhostMs} ms · in code ${r.direct?.wroteMs ?? '?'} ms after Enter · landed ${r.direct?.landMs ?? '?'} ms · max step ${r.maxStep} px${issues.length ? ` — ${issues.join('; ')}` : ''}`)
  }

  // ---- undo, newest first ------------------------------------------------------
  const undos = []
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    globalThis.__s2cUndo = []; globalThis.__KEYAT__ = []
    addEventListener('keydown', (e) => { if (e.key === 'z' && (e.ctrlKey || e.metaKey)) globalThis.__KEYAT__.push(performance.now()) }, true)
  })
  for (const r of [...results].reverse()) {
    if (!r.direct) continue
    const u = { word: r.word }
    undos.push(u)
    const before = (await navItems()).map((i) => i.t)
    await page.evaluate(() => {
      globalThis.__FR__ = []; globalThis.__REC__ = true
      const tick = () => {
        const links = [...document.querySelectorAll('nav a, nav button')].filter((el) => !el.closest('#s2c-overlay-host'))
          .map((el) => { const cs = getComputedStyle(el); const b = el.getBoundingClientRect(); return [(el.textContent ?? '').trim(), cs.display === 'none' ? 0 : Number(cs.opacity), b.left, b.width, el.hasAttribute('data-s2c-ghost') ? 1 : 0] })
        globalThis.__FR__.push({ at: performance.now(), links })
        if (globalThis.__REC__) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.keyboard.press('Control+z')
    const ok = await page.waitForFunction((n) => globalThis.__s2cUndo.filter((x) => !x.preview).length >= n, undos.length, { timeout: 8000 }).then(() => true, () => false)
    await page.waitForTimeout(800)
    const { fr, key, ulog, prev } = await page.evaluate(() => {
      globalThis.__REC__ = false
      return { fr: globalThis.__FR__, key: globalThis.__KEYAT__.at(-1), ulog: globalThis.__s2cUndo.filter((x) => !x.preview).at(-1), prev: globalThis.__s2cUndo.filter((x) => x.preview).length }
    })
    const issues = []
    u.server = ulog ?? null
    if (!ok || !ulog?.exact) issues.push(`server undo not exact: ${JSON.stringify(ulog)}`)
    if (!ulog?.previewed) issues.push('no instant preview')
    // visible: the first frame after the key where the word (real or copy) is fading or gone
    const after = fr.filter((f) => f.at >= key)
    const vis = (f) => { const ls = f.links.filter((l) => l[0] === r.word); return ls.length === 0 ? 0 : Math.max(...ls.map((l) => l[1])) }
    const f0 = after.find((f) => vis(f) < 0.97)
    u.keyToVisibleMs = f0 ? +(f0.at - key).toFixed(1) : null
    if (u.keyToVisibleMs == null || u.keyToVisibleMs >= 50) issues.push(`visible after ${u.keyToVisibleMs} ms`)
    // smooth out: its opacity only falls, through several frames
    const ops = after.map(vis)
    u.opacityFrames = ops.slice(0, 12).map((o) => +o.toFixed(2))
    const rises = ops.slice(1).some((o, i) => o > ops[i] + 0.02)
    const steps = new Set(ops.filter((o) => o > 0.01 && o < 0.97).map((o) => o.toFixed(2)))
    if (rises) issues.push(`came back while going (${u.opacityFrames.join(',')})`)
    if (steps.size < 3) issues.push(`popped out (${u.opacityFrames.join(',')})`)
    if (ops.at(-1) !== 0) issues.push('still on the page')
    // no other link jumps
    const others = before.filter((t) => t !== r.word)
    u.maxStep = 0
    for (const name of others) {
      const xs = after.map((f) => f.links.find((l) => l[0] === name && !l[4] && l[1] > 0)?.[2]).filter((v) => v != null)
      const jump = Math.max(0, ...xs.slice(1).map((v, i) => Math.abs(v - xs[i])))
      u.maxStep = Math.max(u.maxStep, +jump.toFixed(1))
      if (jump > 24) issues.push(`"${name}" jumped ${jump.toFixed(0)} px in one frame`)
    }
    const order = (await navItems()).map((i) => i.t)
    if (order.join('|') !== others.join('|')) issues.push(`page order ${order.join(' | ')}`)
    u.frames = after.map((f) => ({ at: +(f.at - key).toFixed(1), l: f.links.map((l) => `${l[0]}${l[4] ? '*' : ''}:${l[2].toFixed(0)}:${l[1].toFixed(2)}`).join(' ') }))
    u.pass = issues.length === 0
    u.issues = issues
    log(`${u.pass ? '✓' : '✗'} undo "${r.word}" · visible ${u.keyToVisibleMs} ms after Ctrl+Z · max step ${u.maxStep} px${issues.length ? ` — ${issues.join('; ')}` : ''}`)
  }
  const srcBack = readFileSync(NAV, 'utf8') === SRC0
  const orderBack = (await navItems()).map((i) => i.t).join('|') === ORDER0.join('|')
  if (!srcBack || !orderBack) { log(`✗ not back to start: source ${srcBack}, page ${orderBack}`); undos.push({ pass: false, issues: ['not back to start'] }) }
  const undoPass = undos.filter((u) => u.pass).length
  log(`${undoPass}/${undos.length} undos instant and smooth · source back: ${srcBack} · page back: ${orderBack}`)
  if (errors.length) log('page errors:', errors.slice(0, 3))
  const pass = results.filter((x) => x.pass).length
  log(`${pass}/${results.length} additions landed in code with no model · model calls: ${modelCalls}`)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}undo-insert.json`, JSON.stringify({ when: new Date().toISOString(), modelCalls, results, undos }, null, 2))
  if (pass !== results.length || undoPass !== undos.length || modelCalls > 0 || errors.length) process.exitCode = 1
} finally {
  await b.close()
  vite.kill()
  restore()
}

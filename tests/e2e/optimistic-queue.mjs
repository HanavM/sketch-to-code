/**
 * Live e2e (goal loop n10): draw the next change while earlier ones are still
 * being coded. Three changes drawn back to back all land.
 *
 * Runs examples/demo-app in this process, with the real overlay, pen, plain
 * reader, recolour and delete engines, verification and undo. The model is a
 * script that THROWS if called: none of these three needs it.
 *
 *   1. green ring round the "Team members" heading      (UserTable.tsx)
 *   2. green ring round the "Sign out" button, drawn while 1 is being coded
 *   3. scribble over an element in a third file, drawn while 1 or 2 is coded
 *
 * Checked: each change shows on the page within 100 ms of its pen lift, even
 * with earlier ones in flight; the pen stays free (no 'running' lock); the
 * runs go to the server one at a time, in drawing order, each with only its
 * own ink; nothing flashes back while the code catches up; all three land in
 * the source and on the page with nothing left pending; Ctrl+Z three times
 * puts every file back byte for byte.
 *
 * These three need no model, so their code lands in a couple of seconds:
 * faster than a person draws the next one. Each run request is held 5 s on
 * its way to the server (the run itself is real), so the drawings really do
 * pile up behind each other, as they do when the model is writing the code.
 *
 * Usage: node tests/e2e/optimistic-queue.mjs
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../..', import.meta.url).pathname)
const APP = join(REPO, 'examples', 'demo-app')
const PORT = 5199 // the plugin's config pins it
const GREEN = '#16a34a'
const BUDGET_MS = 100
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
const COMPONENTS = join(APP, 'src', 'components')
const log = (...a) => console.log('[e2e-queue]', ...a)
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}
const { readdirSync } = await import('node:fs')
const original = Object.fromEntries(readdirSync(COMPONENTS).map((f) => [f, readFileSync(join(COMPONENTS, f), 'utf8')]))
const restore = () => {
  for (const [f, s] of Object.entries(original)) {
    if (readFileSync(join(COMPONENTS, f), 'utf8') !== s) { writeFileSync(join(COMPONENTS, f), s); log(`restored ${f} by hand`) }
  }
}

let server = null
let browser = null
let providers = null
const calls = []
const timings = {}
try {
  process.env.XDG_DATA_HOME = join(APP, '.sketch2code', 'xdg') // as `npm run dev` does
  providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
  providers.setScriptedModel({
    onCall: (kind) => calls.push(kind),
    interpret: () => { throw new Error('this test needs no model reading') },
    codegen: () => { throw new Error('this test needs no codegen') },
  })
  const vite = await import(pathToFileURL(join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  server = await vite.createServer({ root: APP, configFile: join(APP, 'vite.config.ts'), logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  const runs = []
  page.on('request', (r) => {
    if (!r.url().endsWith('/@s2c/run') || r.method() !== 'POST') return
    const body = JSON.parse(r.postData() ?? '{}')
    runs.push({ at: Date.now(), strokes: (body.strokes ?? []).map((s) => s.id), colors: (body.strokes ?? []).map((s) => s.color ?? null) })
  })
  // the code takes as long as a model-written change would
  await page.route('**/@s2c/run', async (route) => {
    await new Promise((r) => setTimeout(r, 5000))
    await route.continue()
  })
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default is auto anyway */ }
  })
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()).catch(() => ({})))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.waitForFunction(() => document.getElementById('s2c-overlay-host')?.dataset.mode === 'draw', null, { timeout: 15000 })

  const host = () => page.evaluate(() => {
    const h = document.getElementById('s2c-overlay-host')
    return { mode: h?.dataset.mode, flight: h?.dataset.flight ?? null, queued: Number(h?.dataset.queued ?? 0) }
  })
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const pen = async (points, steps = 6) => {
    await page.mouse.move(points[0][0], points[0][1])
    await page.mouse.down()
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps })
    await page.mouse.up()
  }
  const ring = (r, pad = 12) => {
    const cx = r.x + r.w / 2; const cy = r.y + r.h / 2
    return Array.from({ length: 25 }, (_, i) => [cx + (r.w / 2 + pad) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (r.h / 2 + pad) * Math.sin((i / 24) * 2.08 * Math.PI)])
  }
  const scribble = (t) => {
    const x0 = t.x + t.w * 0.06, x1 = t.x + t.w * 0.94
    const y0 = t.y + t.h * 0.1, y1 = t.y + t.h * 0.9
    return [[x0, y0], ...Array.from({ length: 8 }, (_, i) => [x0 + ((x1 - x0) * (i + 1)) / 8, i % 2 ? y0 : y1])]
  }
  const setPen = async (hex) => {
    if (!hex) { await page.keyboard.press('Alt+0'); await page.waitForTimeout(150); return }
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(400)
    await page.evaluate((h) => {
      const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
      input.value = h
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, hex)
    await page.waitForTimeout(200)
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(150)
  }
  const rgb = (css) => page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1)
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, css)
  const greenish = ([r, g, b]) => g > 100 && g > r * 1.5 && g > b * 1.5

  /**
   * Tag an element and stamp the first frame it shows the change: a colour
   * different from now, or not rendered at all.
   */
  const watch = (tag, sel, text, prop) => page.evaluate(({ tag, sel, text, prop }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => (e.textContent ?? '').trim() === text)
    if (!el) return null
    el.setAttribute('data-q', tag)
    const before = prop ? getComputedStyle(el)[prop] : null
    globalThis.__SEEN__ ??= {}
    globalThis.__SEEN__[tag] = null
    const obs = new MutationObserver(() => {
      if (globalThis.__SEEN__[tag] != null) return
      const changed = prop ? getComputedStyle(el)[prop] !== before : (!el.isConnected || getComputedStyle(el).display === 'none' || Number(getComputedStyle(el).opacity) < 0.97)
      if (changed) {
        const lift = globalThis.__LIFT__.at(-1)
        requestAnimationFrame(() => { globalThis.__SEEN__[tag] = performance.now() - lift })
      }
    })
    obs.observe(el, { attributes: true })
    const b = el.getBoundingClientRect()
    return { before, src: el.getAttribute('data-s2c'), rect: { x: b.x, y: b.y, w: b.width, h: b.height } }
  }, { tag, sel, text, prop })
  const seen = (tag) => page.evaluate((t) => globalThis.__SEEN__?.[t] ?? null, tag)
  const waitSeen = async (tag) => {
    await page.waitForFunction((t) => globalThis.__SEEN__?.[t] != null, tag, { timeout: 2000 }).catch(() => {})
    return seen(tag)
  }

  // the third target: a mid-sized, worded element in a file the other two don't touch
  const third = await page.evaluate(() => {
    const els = [...document.querySelectorAll('[data-s2c]')].filter((el) => {
      if (el.closest('#s2c-overlay-host')) return false
      const src = el.getAttribute('data-s2c') ?? ''
      if (/UserTable|Navbar/.test(src)) return false
      const r = el.getBoundingClientRect()
      return r.top > 80 && r.bottom < innerHeight - 20 && r.width >= 120 && r.width <= 420 && r.height >= 40 && r.height <= 160 &&
        (el.textContent ?? '').trim().length > 0
    })
    els.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)
    const el = els[0]
    return el ? { text: (el.textContent ?? '').trim(), tag: el.tagName.toLowerCase(), src: el.getAttribute('data-s2c') } : null
  })
  if (!check('found a third target outside UserTable/Navbar', !!third)) throw new Error('no third target')
  log('third target:', third.tag, third.src, JSON.stringify(third.text.slice(0, 40)))

  const heading = { tag: 'heading', sel: 'section h2', text: 'Team members', prop: 'color' }
  const button = { tag: 'button', sel: 'nav button', text: 'Sign out', prop: 'backgroundColor' }
  const gone = { tag: 'gone', sel: `${third.tag}[data-s2c="${third.src}"]`, text: third.text, prop: null }

  // ---- 1: green ring round the heading ---------------------------------------
  const m1 = await watch(heading.tag, heading.sel, heading.text, heading.prop)
  const m2 = await watch(button.tag, button.sel, button.text, button.prop)
  const m3 = await watch(gone.tag, gone.sel, gone.text, gone.prop)
  check('all three targets on the page', !!(m1 && m2 && m3))
  await setPen(GREEN)
  await pen(ring(m1.rect))
  timings.heading = await waitSeen('heading')
  check(`1 (ring, heading): recoloured within ${BUDGET_MS} ms of lift`, timings.heading != null && timings.heading < BUDGET_MS, `${timings.heading?.toFixed(1)} ms`)
  // handed off to the code: the pen is free for the next one
  await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.flight, null, { timeout: 5000 }).catch(() => {})
  const h1 = await host()
  check('1 handed off: being coded, pen still in draw mode', h1.flight != null && h1.mode === 'draw', JSON.stringify(h1))

  // ---- 2: green ring round the button, while 1 is being coded ----------------
  await pen(ring(m2.rect))
  timings.button = await waitSeen('button')
  const h2 = await host()
  check(`2 (ring, button): recoloured within ${BUDGET_MS} ms of lift, with 1 still in flight`, timings.button != null && timings.button < BUDGET_MS && h2.flight != null,
    `${timings.button?.toFixed(1)} ms, ${JSON.stringify(h2)}`)
  // it settles and waits its turn (or starts, if 1 already landed)
  await page.waitForFunction(() => {
    const h = document.getElementById('s2c-overlay-host')
    const ink = h?.shadowRoot?.getElementById('ink')
    return [...(ink?.querySelectorAll('path') ?? [])].every((p) => p.classList.contains('held'))
  }, null, { timeout: 5000 }).catch(() => {})

  // ---- 3: scribble, while earlier ones are still being coded -----------------
  await setPen(null)
  const r3 = await page.evaluate((sel) => { const b = document.querySelector(`[data-q="gone"]`)?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null }, gone.sel)
  const busyAt3 = await host()
  await pen(scribble(r3 ?? m3.rect))
  timings.gone = await waitSeen('gone')
  check(`3 (scribble): hidden within ${BUDGET_MS} ms of lift`, timings.gone != null && timings.gone < BUDGET_MS, `${timings.gone?.toFixed(1)} ms`)
  check('3 was drawn while an earlier change was still being coded', busyAt3.flight != null, JSON.stringify(busyAt3))
  await page.waitForFunction(() => Number(document.getElementById('s2c-overlay-host')?.dataset.queued ?? 0) >= 2, null, { timeout: 4000 }).catch(() => {})
  const piled = await host()
  check('2 and 3 waited their turn behind 1 (two in the queue)', piled.flight === h1.flight && piled.queued === 2, JSON.stringify(piled))

  // ---- all three land, one at a time, nothing flashes back -------------------
  const state = () => page.evaluate(() => {
    const q = (t) => document.querySelector(`[data-q="${t}"]`)
    const hd = [...document.querySelectorAll('section h2')].find((e) => e.textContent.trim() === 'Team members')
    const bt = [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Sign out')
    const g = q('gone')
    return {
      heading: hd ? getComputedStyle(hd).color : null,
      button: bt ? getComputedStyle(bt).backgroundColor : null,
      goneShown: !!(g && g.isConnected && getComputedStyle(g).display !== 'none'),
      landed: globalThis.__s2cLanded ?? [],
      pending: document.querySelectorAll('[data-s2c-pending]').length,
    }
  })
  let flashed = null
  const t0 = Date.now()
  let last = null
  let lastStatus = ''
  while (Date.now() - t0 < 120_000) {
    const s = await state()
    last = s
    const st = await status()
    if (st !== lastStatus) { lastStatus = st; log('status:', st) }
    if (s.heading && !greenish(await rgb(s.heading))) { flashed = `heading ${s.heading}`; break }
    if (s.button && !greenish(await rgb(s.button))) { flashed = `button ${s.button}`; break }
    // the scribbled element: matched by its words, a fresh render of it after a reload counts too
    const back = await page.evaluate(({ sel, text }) => [...document.querySelectorAll(sel)].some((e) =>
      (e.textContent ?? '').trim() === text && getComputedStyle(e).display !== 'none'), { sel: `${third.tag}[data-s2c="${third.src}"]`, text: third.text })
    if (back) { flashed = 'scribbled element shown again'; break }
    const h = await host()
    if (s.landed.length >= 3 && h.flight == null && h.queued === 0) break
    await page.waitForTimeout(100)
  }
  check('nothing flashed back while the code caught up', !flashed, flashed ?? '')
  check('three runs finished', last.landed.length === 3, JSON.stringify(last.landed))
  check('all three landed (no failed run)', last.landed.every((l) => l.ok), JSON.stringify(last.landed))
  check('the runs went in drawing order', last.landed.map((l) => l.job).join(',') === [...last.landed.map((l) => l.job)].sort((a, b) => a - b).join(','))
  check('three /@s2c/run requests, one at a time', runs.length === 3, String(runs.length))
  check('each run carried only its own ink', runs.length === 3 && runs.every((r) => r.strokes.length === 1) && new Set(runs.map((r) => r.strokes[0])).size === 3,
    JSON.stringify(runs.map((r) => r.strokes)))
  check('runs carried the right pens (green, green, plain)', runs.map((r) => r.colors[0] ?? 'plain').join(',') === `${GREEN},${GREEN},plain`,
    runs.map((r) => r.colors[0] ?? 'plain').join(','))
  check('nothing left marked pending on the page', last.pending === 0, String(last.pending))
  check('no model call', calls.length === 0, calls.join(' '))

  await page.waitForTimeout(800)
  const tableSrc = readFileSync(join(COMPONENTS, 'UserTable.tsx'), 'utf8').split('\n').find((l) => l.includes('Team members')) ?? ''
  const navSrc = readFileSync(join(COMPONENTS, 'Navbar.tsx'), 'utf8')
  const navBtn = navSrc.split('\n').find((l) => l.includes('<button')) ?? ''
  check('1 in the source: heading holds a green utility', /\btext-(green-\d{3}|\[#16a34a\])/.test(tableSrc), tableSrc.trim())
  check('2 in the source: button holds a green fill', /(^|\s|")bg-(green-\d{3}|\[#16a34a\])/.test(navBtn), navBtn.trim())
  const thirdFile = (third.src ?? '').split(':')[0].split('/').pop()
  const changedThird = readFileSync(join(COMPONENTS, thirdFile), 'utf8') !== original[thirdFile]
  check(`3 in the source: ${thirdFile} changed`, changedThird)
  const fin = await state()
  check('page shows the code\'s green heading and button', !!fin.heading && greenish(await rgb(fin.heading)) && !!fin.button && greenish(await rgb(fin.button)), `${fin.heading} / ${fin.button}`)
  const stillThere = await page.evaluate(({ sel, text }) => [...document.querySelectorAll(sel)].some((e) => (e.textContent ?? '').trim() === text && getComputedStyle(e).display !== 'none'),
    { sel: `${third.tag}[data-s2c^="${(third.src ?? '').split(':')[0]}"]`, text: third.text })
  check('page no longer shows the scribbled element', !stillThere)

  // ---- undo all three, newest first ---------------------------------------------
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press(UNDO)
    const s0 = Date.now()
    let s = ''
    while (Date.now() - s0 < 10_000 && !/undid|nothing to undo/i.test(s)) { await page.waitForTimeout(200); s = await status() }
    check(`undo ${i + 1} answers`, /undid/i.test(s), s)
    await page.waitForTimeout(1000)
  }
  for (const [f, s] of Object.entries(original)) {
    if (readFileSync(join(COMPONENTS, f), 'utf8') !== s) check(`Ctrl+Z restored ${f} byte for byte`, false)
  }
  check('Ctrl+Z x3 restored every component file byte for byte',
    Object.entries(original).every(([f, s]) => readFileSync(join(COMPONENTS, f), 'utf8') === s))
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
} catch (err) {
  failures++
  console.error('[e2e-queue] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  restore()
}
log('lift → visible:', Object.entries(timings).map(([k, v]) => `${k} ${v?.toFixed(1) ?? '—'} ms`).join(', '))
console.log(failures === 0 ? '\n[e2e-queue] ALL CHECKS PASSED' : `\n[e2e-queue] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

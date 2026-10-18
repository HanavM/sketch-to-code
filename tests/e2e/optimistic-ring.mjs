/**
 * Live e2e (goal loop n6): circling an element with a coloured pen recolours
 * it on the page at pen lift, with no Go press, and the code catches up.
 *
 * Runs examples/demo-app (Tailwind v4) in this process, with the real overlay,
 * pen, plain reader, recolour engine, verification and undo. The model is a
 * script that THROWS if called: a coloured ring needs none.
 *
 *   A. ROLLBACK: /@s2c/run is stubbed to fail. The "Team members" heading goes
 *      green within 100 ms of lift, the run's snapshot still sees the old
 *      colour (the patch never leaks into what the code is checked against),
 *      and when the run fails the heading is back exactly as it was.
 *   B. LANDS (heading, words recoloured) and C. LANDS (Sign out button, fill
 *      recoloured): green within 100 ms of lift, never back to the old colour
 *      while the code catches up, ends on ✓ with the source holding a green
 *      utility and nothing left marked pending.
 *   D. Ctrl+Z twice: both files back byte for byte, and the page shows the
 *      original colours again.
 *
 * Timing is measured in the page: pointerup event timestamp → the first
 * animation frame after the element's computed colour changed.
 *
 * Usage: node tests/e2e/optimistic-ring.mjs
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
const FILES = {
  heading: join(APP, 'src/components/UserTable.tsx'),
  button: join(APP, 'src/components/Navbar.tsx'),
}
const original = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(f, 'utf8')]))
const log = (...a) => console.log('[e2e-opt-ring]', ...a)
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}
const timings = []

let server = null
let browser = null
let providers = null
const calls = []
try {
  process.env.XDG_DATA_HOME = join(APP, '.sketch2code', 'xdg') // as `npm run dev` does
  providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
  providers.setScriptedModel({
    onCall: (kind) => calls.push(kind),
    interpret: () => { throw new Error('a coloured ring reached the model') },
    codegen: () => { throw new Error('a coloured ring reached codegen') },
  })
  const vite = await import(pathToFileURL(join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  server = await vite.createServer({ root: APP, configFile: join(APP, 'vite.config.ts'), logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default is auto anyway */ }
  })
  const open = async () => {
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()).catch(() => ({})))
      if (ping.hasPipeline) break
      await page.waitForTimeout(500)
    }
    await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host')?.dataset.mode, null, { timeout: 15000 })
  }

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
  const greenPen = async () => {
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(500)
    await page.evaluate((hex) => {
      const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
      input.value = hex
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }, GREEN)
    await page.waitForTimeout(300)
    await page.keyboard.press('Alt+p')
  }
  const rgb = (css) => page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1)
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, css)
  const greenish = ([r, g, b]) => g > 100 && g > r * 1.5 && g > b * 1.5

  /** Tag the element and start watching its computed colour; stamp the frame it changed. */
  const mark = (c) => page.evaluate(({ sel, text, prop }) => {
    document.querySelectorAll('[data-opt-ring]').forEach((e) => e.removeAttribute('data-opt-ring'))
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
    if (!el) return null
    el.setAttribute('data-opt-ring', '1')
    const before = getComputedStyle(el)[prop]
    globalThis.__RECOL__ = null
    globalThis.__RECOLOBS__?.disconnect()
    globalThis.__RECOLOBS__ = new MutationObserver(() => {
      if (globalThis.__RECOL__ != null) return
      if (getComputedStyle(el)[prop] !== before) requestAnimationFrame(() => { globalThis.__RECOL__ = performance.now() })
    })
    globalThis.__RECOLOBS__.observe(el, { attributes: true })
    const b = el.getBoundingClientRect()
    return { before, style: el.getAttribute('style'), src: el.getAttribute('data-s2c'), rect: { x: b.x, y: b.y, w: b.width, h: b.height } }
  }, c)
  const liftToVisible = () => page.evaluate(() => {
    const lift = globalThis.__LIFT__.at(-1)
    return globalThis.__RECOL__ != null && lift != null ? globalThis.__RECOL__ - lift : null
  })
  const now = (c) => page.evaluate(({ sel, text, prop }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
    return el ? { v: getComputedStyle(el)[prop], cls: el.className, style: el.getAttribute('style'), pending: el.getAttribute('data-s2c-pending') } : null
  }, c)

  const heading = { name: 'heading', sel: 'section h2', text: 'Team members', prop: 'color', re: /\btext-(green-\d{3}|\[#16a34a\])/ }
  const button = { name: 'button', sel: 'nav button', text: 'Sign out', prop: 'backgroundColor', re: /(^|\s)bg-(green-\d{3}|\[#16a34a\])/ }

  // ---- A: the run fails → the colour comes back -------------------------------
  await open()
  let snapColour = null
  let runCalled = false
  await page.route('**/@s2c/run', async (route) => {
    runCalled = true
    const body = JSON.parse(route.request().postData() ?? '{}')
    const n = (body.snapshot?.nodes ?? []).find((x) => (x.text ?? '').trim() === 'Team members')
    snapColour = n ? JSON.stringify(n.styles ?? n.style ?? n.computed ?? null) : null
    await new Promise((r) => setTimeout(r, 300))
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed failure' }) })
  })
  const mA = await mark(heading)
  if (!check('A: "Team members" heading found', !!mA)) throw new Error('no heading')
  await greenPen()
  await pen(ring(mA.rect))
  await page.waitForFunction(() => globalThis.__RECOL__ != null, null, { timeout: 2000 }).catch(() => {})
  const msA = await liftToVisible()
  const vA = await now(heading)
  timings.push({ case: 'A heading (rollback)', ms: msA })
  check(`A: recoloured within ${BUDGET_MS} ms of lift`, msA != null && msA < BUDGET_MS, `${msA?.toFixed(1)} ms`)
  check('A: it shows green and is marked pending', !!vA && greenish(await rgb(vA.v)) && vA.pending === 'recolour', `${vA?.v} pending=${vA?.pending}`)
  await page.waitForFunction(({ sel, text, prop, before }) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
    return el && getComputedStyle(el)[prop] === before
  }, { ...heading, before: mA.before }, { timeout: 20000 }).catch(() => {})
  const vA2 = await now(heading)
  check('A: the run started with no Go press', runCalled)
  check('A: the run\'s snapshot did not carry the green patch', snapColour == null || !/16a34a|rgb\(22, 163, 74\)/i.test(snapColour), snapColour ?? '(no colour field)')
  check('A: failure put the colour back exactly', !!vA2 && vA2.v === mA.before && vA2.style === mA.style && vA2.pending === null, `${vA2?.v} style=${vA2?.style} pending=${vA2?.pending}`)
  check('A: source untouched', readFileSync(FILES.heading, 'utf8') === original.heading)
  await page.unroute('**/@s2c/run')
  await page.keyboard.press('Alt+0')

  // ---- B, C: live, the code lands ----------------------------------------------
  for (const c of [heading, button]) {
    await open()
    const m = await mark(c)
    if (!check(`${c.name}: found on the page`, !!m)) continue
    const n0 = calls.length
    await greenPen()
    await pen(ring(m.rect))
    await page.waitForFunction(() => globalThis.__RECOL__ != null, null, { timeout: 2000 }).catch(() => {})
    const ms = await liftToVisible()
    timings.push({ case: `${c.name} (lands)`, ms })
    check(`${c.name}: recoloured within ${BUDGET_MS} ms of lift`, ms != null && ms < BUDGET_MS, `${ms?.toFixed(1)} ms`)
    // until the run is done the old colour must never come back
    let flashed = null
    let last = ''
    const t0 = Date.now()
    let quiet = 0
    while (Date.now() - t0 < 45_000) {
      const v = await now(c)
      if (v && v.v === m.before) { flashed = v; break }
      const s = await status()
      if (s !== last) { last = s; quiet = 0 } else quiet++
      if (quiet >= 10 && /✓|✗|⚠/.test(s)) break
      await page.waitForTimeout(50)
    }
    await page.keyboard.press('Alt+0')
    await page.waitForTimeout(800)
    const after = await now(c)
    const line = readFileSync(FILES[c.name], 'utf8').split('\n').find((l) => l.includes(c.name === 'heading' ? 'Team members' : '<button')) ?? ''
    check(`${c.name}: never flashed back to the old colour while the code caught up`, !flashed, flashed ? JSON.stringify(flashed) : '')
    check(`${c.name}: ends on a tick`, /^✓/.test(last), last)
    check(`${c.name}: no model call`, calls.length === n0, calls.slice(n0).join(' '))
    check(`${c.name}: source holds a green utility`, c.re.test(line), line.trim())
    check(`${c.name}: page shows the code's green, nothing pending, no inline patch`,
      !!after && greenish(await rgb(after.v)) && c.re.test(after.cls) && after.pending === null && !/!important/.test(after.style ?? ''),
      `${after?.v} pending=${after?.pending} style=${after?.style}`)
  }

  // ---- D: undo both, newest first ----------------------------------------------
  for (const c of [button, heading]) {
    await page.keyboard.press(UNDO)
    const s0 = Date.now()
    let s = ''
    while (Date.now() - s0 < 10_000 && !/undid|nothing to undo/i.test(s)) { await page.waitForTimeout(200); s = await status() }
    check(`undo answers (${c.name})`, /undid/i.test(s), s)
    await page.waitForTimeout(1000)
  }
  for (const [k, f] of Object.entries(FILES)) check(`Ctrl+Z restored ${k} file byte for byte`, readFileSync(f, 'utf8') === original[k])
  for (const c of [heading, button]) {
    const v = await now(c)
    check(`${c.name}: page back to its original colour after undo`, !!v && !greenish(await rgb(v.v)) && v.pending === null, v?.v)
  }
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
  check('no model call at all', calls.length === 0, calls.join(' '))
} catch (err) {
  failures++
  console.error('[e2e-opt-ring] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  for (const [k, f] of Object.entries(FILES)) if (readFileSync(f, 'utf8') !== original[k]) { writeFileSync(f, original[k]); log(`restored ${k} by hand`) }
}
log('lift → recoloured:', timings.map((t) => `${t.case} ${t.ms?.toFixed(1) ?? '—'} ms`).join(', '))
console.log(failures === 0 ? '\n[e2e-opt-ring] ALL CHECKS PASSED' : `\n[e2e-opt-ring] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

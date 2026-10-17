/**
 * s2c-051: a coloured ring, no words, on a TAILWIND app, in a real browser.
 *
 * s2c-050 built the recolour engine's Tailwind path (swap the element's text-/
 * bg- colour utility for the palette token the drawn colour snapped to) and
 * tested it with unit tests only; the 60-second demo is a plain-CSS starter.
 * This runs examples/demo-app (Tailwind v4) in this process with the real
 * overlay, pen, plain reader, engine, verification and undo. The model is a
 * script that THROWS if called: every check here is about zero model calls.
 *
 *   1. green pen, ring the "Team members" heading (text-gray-900)  → its words go green
 *   2. green pen, ring the navbar "Sign out" button (bg-blue-600)   → its fill goes green,
 *      and stays green under the pointer (its hover:bg-blue-700 follows)
 *   3. Ctrl+Z twice                                                → both files back byte for byte
 *
 * For each ring: no interpret or codegen call, the className holds a green
 * utility and no longer the old one, the page shows green, the bar ends on ✓.
 *
 * It edits examples/demo-app/src in place (that is the app) and restores both
 * files in `finally` whatever happens; the last check is that undo alone
 * already had.
 *
 * Usage: node tests/e2e/ring-tailwind.mjs
 */
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../..', import.meta.url).pathname)
const APP = join(REPO, 'examples', 'demo-app')
const PORT = 5199 // the plugin's config pins it
const GREEN = '#16a34a'
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
const FILES = {
  heading: join(APP, 'src/components/UserTable.tsx'),
  button: join(APP, 'src/components/Navbar.tsx'),
}
const original = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(f, 'utf8')]))
const log = (...a) => console.log('[ring-tw]', ...a)
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}

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
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()).catch(() => ({})))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }

  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const rectOf = (sel) => page.evaluate((s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null }, sel)
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
  const settle = async (ms = 30_000) => {
    const seen = []
    const s0 = Date.now()
    let quiet = 0
    while (Date.now() - s0 < ms) {
      await page.waitForTimeout(200)
      const s = await status()
      if (s && s !== seen.at(-1)) { seen.push(s); quiet = 0 } else quiet++
      if (quiet >= 8 && /✓|✗|⚠|could not|couldn’t|didn’t|undid|nothing to undo/i.test(s)) break
    }
    return seen
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
  /** The browser's own rendering of a CSS colour (oklch included) as [r,g,b]. */
  const rgb = (css) => page.evaluate((c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1
    const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 1, 1)
    return [...g.getImageData(0, 0, 1, 1).data.slice(0, 3)]
  }, css)
  const greenish = ([r, g, b]) => g > 100 && g > r * 1.5 && g > b * 1.5
  const classOf = (sel) => page.evaluate((s) => document.querySelector(s)?.className ?? '', sel)

  const cases = [
    { name: 'heading', sel: 'section h2', text: 'Team members', prop: 'color', old: 'text-gray-900', re: /\btext-(green-\d{3}|\[#16a34a\])/ },
    { name: 'button', sel: 'nav button', text: 'Sign out', prop: 'backgroundColor', old: 'bg-blue-600', re: /(^|\s)bg-(green-\d{3}|\[#16a34a\])/ },
  ]
  const lastLines = []
  for (const c of cases) {
    const sel = (await page.evaluate(({ sel, text }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
      if (!el) return null
      el.setAttribute('data-ring-tw', '1')
      return '[data-ring-tw="1"]'
    }, c))
    if (!check(`${c.name}: "${c.text}" found on the page`, !!sel)) continue
    const r = await rectOf(sel)
    const before = (await page.evaluate(({ s, p }) => getComputedStyle(document.querySelector(s))[p], { s: sel, p: c.prop }))
    const n0 = calls.length
    await greenPen()
    await pen(ring(r))
    const seen = await settle()
    await page.keyboard.press('Alt+0')
    lastLines.push(seen.at(-1) ?? '')
    log(`${c.name}: ${seen.join(' → ')}`)
    await page.waitForTimeout(1200) // HMR
    const after = await page.evaluate(({ sel, text, p }) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
      return el ? { cls: el.className, v: getComputedStyle(el)[p] } : null
    }, { sel: c.sel, text: c.text, p: c.prop })
    check(`${c.name}: ends on a tick`, /^✓/.test(seen.at(-1) ?? ''), seen.at(-1))
    check(`${c.name}: no model call`, calls.length === n0, calls.slice(n0).join(' '))
    const src = readFileSync(FILES[c.name], 'utf8')
    const line = src.split('\n').find((l) => l.includes(c.name === 'heading' ? 'Team members' : '<button')) ?? ''
    check(`${c.name}: source holds a green utility`, c.re.test(line), line.trim())
    check(`${c.name}: the old ${c.old} is gone from that className`, !new RegExp(`(^|[\\s"])${c.old.replace(/[[\]]/g, '\\$&')}(\\s|")`).test(line), line.trim())
    check(`${c.name}: only that one file changed`, Object.entries(FILES).every(([k, f]) => (k === c.name || k === 'heading') || readFileSync(f, 'utf8') === original[k]))
    check(`${c.name}: rendered class matches source`, !!after && c.re.test(after.cls), after?.cls)
    const px = after ? await rgb(after.v) : null
    check(`${c.name}: the page shows green (${c.prop})`, !!px && greenish(px) && after.v !== before, `${before} → ${after?.v} ${px ? `rgb(${px})` : ''}`)
    if (c.name === 'button') {
      // found by this test: hover:bg-blue-700 stayed, so the green button went
      // blue under the pointer. The engine now moves state colours with it.
      check('button: hover state follows (hover:bg-green-700, no hover:bg-blue-*)', /hover:bg-green-700/.test(line) && !/hover:bg-blue-/.test(line), line.trim())
      // The overlay's canvas sits over the page while drawing, so a real
      // pointer never reaches :hover; force the state on the button instead.
      // Tailwind v4 also wraps hover: in @media (hover: hover), which headless
      // Chromium reports as none. Without both, this passes on any colour.
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'hover' }] })
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable')
      const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
      const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'nav button' })
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: ['hover'] })
      await page.waitForTimeout(300)
      const hv = await page.evaluate(() => getComputedStyle(document.querySelector('nav button')).backgroundColor)
      const hpx = await rgb(hv)
      check('button: hovered, it is a darker green, not blue', greenish(hpx) && hv !== after.v, `${hv} rgb(${hpx})`)
      await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      await cdp.send('Emulation.setEmulatedMedia', { features: [] })
      await cdp.detach()
    }
  }

  // undo both, newest first
  for (const c of [...cases].reverse()) {
    await page.keyboard.press(UNDO)
    const seen = await settle(10_000)
    log(`undo: ${seen.at(-1)}`)
    check(`undo answers in plain words (${c.name})`, /undid/i.test(seen.at(-1) ?? '') && !/fill:|→|\+ /.test(seen.at(-1) ?? ''), seen.at(-1))
    await page.waitForTimeout(800)
  }
  for (const [k, f] of Object.entries(FILES)) check(`Ctrl+Z restored ${k} file byte for byte`, readFileSync(f, 'utf8') === original[k])
  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
  check('no model call at all', calls.length === 0, calls.join(' '))
} catch (err) {
  failures++
  console.error('[ring-tw] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  for (const [k, f] of Object.entries(FILES)) if (readFileSync(f, 'utf8') !== original[k]) { writeFileSync(f, original[k]); log(`restored ${k} by hand`) }
}
console.log(failures === 0 ? '\n[ring-tw] ALL CHECKS PASSED' : `\n[ring-tw] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

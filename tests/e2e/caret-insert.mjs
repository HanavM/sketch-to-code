/**
 * Live e2e (s2c-055): a caret between two nav links puts the new link THERE,
 * and the tick checks where it went, not just that something appeared.
 *
 * In the s2c-013 bench (r14) the structured path put "Blog" at the END of the
 * nav both times it ran, and the bar said "Done" both times: verification only
 * asked whether something new showed up near the mark, and the end of a short
 * nav is near it.
 *
 * The demo app's vite runs in this process so the model can be scripted. The
 * script stands in for what a model decides: the reading (an add into the nav,
 * citing the caret, with no sibling anchor, which is what the reading is
 * allowed to say) and the edit. The edit follows the brief: the honest script
 * inserts after the source line the brief's insertSlot names; with no slot in
 * the brief it does what the model did in s2c-013 and appends. Everything
 * else is real: pen, grounding, the slot, verification against the live DOM,
 * the bar, undo.
 *
 *   1. honest: Blog renders between Overview and Reports; the bar ends on ✓
 *   2. the brief carried the slot (both neighbours' source locations)
 *   3. not hollow: a codegen that appends at the end makes the bar say, in
 *      words, that it didn't go between "Overview" and "Reports"
 *   and: Ctrl+Z restores the file, no page errors, zero real model calls
 *
 * Run FROM THE REPO ROOT after `npm run build`: node tests/e2e/caret-insert.mjs
 */
import { execSync } from 'node:child_process'
import { createServer as netServer } from 'node:net'
import { readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { ensureDraw, inkCount } from './lib/pen.mjs'

const REPO = realpathSync(new URL('../../', import.meta.url).pathname)
const APPDIR = join(REPO, 'examples/demo-app')
const NAV = join(APPDIR, 'src/components/Navbar.tsx')
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
const log = (...a) => console.log('[e2e-caret]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src', { cwd: REPO })
}
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}
const portFree = (p) => new Promise((res) => {
  const s = netServer()
  s.once('error', () => res(false))
  s.listen(p, '127.0.0.1', () => s.close(() => res(true)))
})
let PORT = null
for (let p = 5260; p <= 5269 && PORT === null; p++) if (await portFree(p)) PORT = p
if (PORT === null) throw new Error('no free port in 5260-5269')

const BLOG = '          <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Blog</a>\n'
restore()
const original = readFileSync(NAV, 'utf8')

let honest = true
const briefs = []
const modelCalls = []
let providers = null
let server = null
let browser = null

try {
  providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
  providers.setScriptedModel({
    onCall: (kind) => modelCalls.push(kind),
    interpret: (req) => {
      const ev = JSON.parse(req.brief)
      return {
        reading: 'Add a "Blog" link to the menu.',
        actions: [{
          kind: 'add', elements: null, destElement: null, position: 'into',
          instruction: 'add a nav link "Blog"', strokes: ev.strokes.map((s) => s.id),
          layer: 'in-flow', depicts: null, fidelity: null, screen: null,
        }],
        unclear: null,
      }
    },
    codegen: ({ root, text, turn }) => {
      briefs.push(text)
      if (turn !== 1) return 'Nothing more to change.'
      const abs = join(root, 'src/components/Navbar.tsx')
      const src = readFileSync(abs, 'utf8')
      const lines = src.split('\n')
      const m = /"insertSlot":\s*\{[\s\S]*?"after":\s*\{[\s\S]*?"srcLoc":\s*"src\/components\/Navbar\.tsx:(\d+):\d+"/.exec(text)
      let next
      if (honest && m) {
        const at = Number(m[1]) // 1-based line of the "after" neighbour
        lines.splice(at, 0, BLOG.trimEnd())
        next = lines.join('\n')
      } else {
        // s2c-013's outcome: at the end of the links, before the button
        next = src.replace(/(\n\s*<button )/, `\n${BLOG.trimEnd()}$1`)
      }
      if (next === src) throw new Error('the script found no place to write')
      writeFileSync(abs, next)
      return 'action 0: added the Blog link'
    },
  })

  const vite = await import(pathToFileURL(join(REPO, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  process.env.XDG_DATA_HOME = join(APPDIR, '.sketch2code', 'xdg')
  server = await vite.createServer({ root: APPDIR, configFile: join(APPDIR, 'vite.config.ts'), logLevel: 'error', server: { port: PORT, strictPort: true } })
  await server.listen()
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const links = () => page.evaluate(() => [...document.querySelectorAll('nav a')]
    .map((a) => { const r = a.getBoundingClientRect(); return { t: a.textContent.trim(), x: r.x, w: r.width, y: r.y, h: r.height } }))

  const boot = async () => {
    restore()
    await page.evaluate(() => sessionStorage.clear()).catch(() => {})
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => window.__S2C_DEBUG__ != null, null, { timeout: 20000 })
    await page.waitForTimeout(600)
    await ensureDraw(page)
  }

  /** A quick caret under the gap between Overview and Reports, then "Blog" + Enter. */
  const sketch = async () => {
    const ls = await links()
    const ov = ls.find((l) => l.t === 'Overview')
    const rp = ls.find((l) => l.t === 'Reports')
    const x = (ov.x + ov.w + rp.x) / 2
    const y = ov.y + ov.h - 2
    const n0 = await inkCount(page)
    await page.mouse.move(x - 9, y + 16)
    await page.mouse.down()
    await page.mouse.move(x, y, { steps: 6 })
    await page.mouse.move(x + 9, y + 16, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(450)
    check('the caret landed', (await inkCount(page)) === n0 + 1)
    await page.keyboard.type('Blog', { delay: 20 })
    await page.keyboard.press('Enter')
    const seen = []
    let quiet = 0
    const t0 = Date.now()
    while (Date.now() - t0 < 60_000) {
      await page.waitForTimeout(200)
      const s = await status()
      if (s === seen.at(-1)) quiet++
      else { quiet = 0; if (s) seen.push(s) }
      if (quiet >= 10 && /✓|✗|⚠|couldn|didn/i.test(s)) break
    }
    for (const s of seen) console.log(`      │ ${s}`)
    await page.waitForTimeout(1000) // HMR
    return seen.at(-1) ?? ''
  }

  const order = async () => (await links()).sort((a, b) => a.x - b.x).map((l) => l.t)

  // ── 1–2: honest ──────────────────────────────────────────────────────────
  await boot()
  let bar = await sketch()
  const brief = briefs[0] ?? ''
  check('2. the codegen brief carries the slot, with both neighbours', /"insertSlot"/.test(brief) && /"text": "Overview"/.test(brief) && /"text": "Reports"/.test(brief), brief ? '' : 'codegen never ran')
  const o1 = await order()
  check('1. Blog renders between Overview and Reports', o1.join(',') === 'Overview,Blog,Reports,Settings', o1.join(', '))
  check('1. the bar ends on a tick', /^✓/.test(bar), bar)
  await page.keyboard.press(UNDO)
  await page.waitForTimeout(2500)
  check('Ctrl+Z restores the navbar byte for byte', readFileSync(NAV, 'utf8') === original)

  // ── 3: not hollow ────────────────────────────────────────────────────────
  honest = false
  briefs.length = 0
  await boot()
  bar = await sketch()
  const o2 = await order()
  check('3. (the appending codegen did append)', o2.join(',') === 'Overview,Reports,Settings,Blog', o2.join(', '))
  check('3. the bar does not say Done', !/^✓/.test(bar) && !/Done/.test(bar), bar)
  check('3. the bar says where it should have gone, in words', /between "Overview" and "Reports", where you marked it/.test(bar) && !/Navbar\.tsx|action \d/.test(bar), bar)

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
  check('every model call was scripted (interpret + codegen only)', modelCalls.every((k) => k === 'interpret' || k === 'codegen'), modelCalls.join(' '))
} catch (err) {
  failures++
  console.error('[e2e-caret] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  restore()
}
log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

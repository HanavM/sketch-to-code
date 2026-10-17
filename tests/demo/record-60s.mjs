/**
 * s2c-045, SEED done #5: the 60-second demo, played and recorded, zero tokens.
 *
 * SCRIPTED. The reading of each drawing and the code written for it are
 * stood in for by a script (@s2c/providers setScriptedModel), exactly as in
 * packages/cli/tests/e2e/walkthrough-noncoder.mjs. Everything else is real:
 * `create vite` starter, `sketch-to-code init`, the overlay, the pen, auto-run,
 * grounding, verification, the plain-words bar and undo. So this video shows
 * what the PRODUCT looks like and that the path works; it does NOT show that a
 * model reads rough ink (that is s2c-013's paid pilot). The video carries a
 * banner saying so, and the shot list is docs/demo-60s.md.
 *
 * Shots (no typed words except shot 4, which is "sketch first, words as support"):
 *   1. the stock starter, running
 *   2. scribble over the "Edit src/App.jsx …" line          → it's gone
 *   3. Alt+P green pen, ring the heading, no words           → the heading is green
 *   4. a box in the space under the button + "testimonials"  → a new section
 *   5. Ctrl+Z                                                → the section is gone, files restored
 *
 * Every shot is also asserted (on the page and on disk), so a green run of this
 * script is the proof that the demo shows only things that work.
 *
 * Usage: node tests/demo/record-60s.mjs [--out dir] [--keep]
 *   --out   where demo-60s.webm and the shot log go (default: a temp dir, printed)
 */
import { spawnSync } from 'node:child_process'
import { createServer as netServer } from 'node:net'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const REPO = realpathSync(new URL('../..', import.meta.url).pathname)
const CLI = join(REPO, 'packages', 'cli', 'dist', 'bin.js')
const KEEP = process.argv.includes('--keep')
const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null })()
const CREATE_VITE = 'vite@9.2.1' // same pin as the walkthrough
/** How long each result stays on screen before the next mark, so a viewer sees it land. */
const DWELL = 5000
const UNDO = process.platform === 'darwin' ? 'Meta+z' : 'Control+z'
const log = (...a) => console.log('[demo]', ...a)
const run = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts })
  return { code: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` }
}
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}

const parent = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 's2c-demo-')))
const dir = join(parent, 'my-app')
const outDir = OUT ? (mkdirSync(OUT, { recursive: true }), realpathSync(OUT)) : parent
const videoTmp = join(parent, 'video')
log('project:', dir)

const portFree = (p) => new Promise((res) => {
  const s = netServer()
  s.once('error', () => res(false))
  s.listen(p, '127.0.0.1', () => s.close(() => res(true)))
})
let PORT = null
for (let p = 5250; p <= 5259 && PORT === null; p++) if (await portFree(p)) PORT = p
if (PORT === null) throw new Error('no free port in 5250-5259')

let server = null
let browser = null
let context = null
let providers = null
const calls = []
const shots = []
const t0 = Date.now()
try {
  // ── the starter, init'd ────────────────────────────────────────────────────
  const created = run('npm', ['create', '--yes', CREATE_VITE, 'my-app', '--', '--template', 'react', '--no-interactive'], { cwd: parent, input: '' })
  if (created.code !== 0) throw new Error(`npm create vite failed:\n${created.out}`)
  const install = run('npm', ['install', '--silent', '--no-audit', '--no-fund', '--ignore-scripts'], { cwd: dir })
  if (install.code !== 0) throw new Error(`npm install failed:\n${install.out}`)
  const init = run('node', [CLI, 'init', dir, '--yes'])
  check('init exits 0 on the starter', init.code === 0, `code ${init.code}`)
  const app = () => join(dir, 'src/App.jsx')
  const committed = readFileSync(app(), 'utf8')
  const edit = (fn) => writeFileSync(app(), fn(readFileSync(app(), 'utf8')))

  // ── the script that stands in for the model ────────────────────────────────
  providers = await import(join(REPO, 'packages', 'providers', 'dist', 'index.js'))
  const find = (menu, tag, text) => menu.find((e) => e.tag === tag && (text === null || e.text.includes(text)))
  const EDIT_LINE = /\n\s*<p>\n\s*Edit <code>src\/App\.jsx<\/code> and save to test <code>HMR<\/code>\n\s*<\/p>/
  const SCRIPT = {
    scribble: {
      // s2c-049: a scratch-out confined to one element is read by the reader's
      // own rule, with no model. Being asked here means that broke.
      interpret: () => { throw new Error('the scribble reached the model') },
      codegen: () => edit((s) => s.replace(EDIT_LINE, '')),
    },
    ring: {
      // s2c-050: a green ring round the heading, no words, is read by the
      // pen-colour rule and written by the recolour engine. Neither call
      // should happen; being asked here means that broke.
      interpret: () => { throw new Error('the green ring reached the model') },
      codegen: () => { throw new Error('the green ring reached codegen') },
    },
    box: {
      interpret: (ev) => ({
        reading: 'Add a testimonials section in the space under the counter.',
        actions: [{
          kind: 'add', elements: null, destElement: find(ev.elementMenu, 'button', 'Count is')?.id ?? null,
          position: 'after', instruction: 'Add a testimonials section: three short quotes from happy users.',
          strokes: ev.strokes.map((s) => s.id), layer: 'in-flow', depicts: null, fidelity: null,
        }],
        unclear: null,
      }),
      codegen: () => edit((s) => s.replace(/(\n\s*<\/button>\n)/, `$1        <section className="testimonials">
          <h2>What people say</h2>
          <blockquote>"I changed my site without writing code."</blockquote>
          <blockquote>"I drew a box and it was there."</blockquote>
        </section>
`)),
    },
  }
  let current = null
  providers.setScriptedModel({
    onCall: (kind) => calls.push(`${kind}:${current}`),
    interpret: (req) => SCRIPT[current].interpret(JSON.parse(req.brief)),
    codegen: ({ turn }) => { if (turn === 1) SCRIPT[current].codegen(); return 'Done.' },
  })

  // ── the app's own vite, in this process; a recorded browser ────────────────
  const vite = await import(pathToFileURL(join(dir, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
  server = await vite.createServer({ root: dir, configFile: join(dir, 'vite.config.js'), logLevel: 'error', server: { port: PORT, strictPort: true } })
  await server.listen()
  browser = await chromium.launch().catch(() => chromium.launch({ executablePath: process.env.S2C_CHROMIUM ?? '/opt/pw-browsers/chromium' }))
  const size = { width: 1280, height: 800 }
  context = await browser.newContext({ viewport: size, recordVideo: { dir: videoTmp, size } })
  // The honesty label, burned into every frame. Fixed, click-through, and
  // outside the app's root, so the overlay never offers it as a target.
  await context.addInitScript(() => {
    const put = () => {
      if (document.getElementById('demo-label')) return
      const d = document.createElement('div')
      d.id = 'demo-label'
      d.textContent = 'Demo recording · the box reading is scripted, not a live model; the scribble and the green ring need none'
      d.setAttribute('style', 'position:fixed;left:12px;top:10px;z-index:2147483646;pointer-events:none;font:12px system-ui;background:#111c;color:#fff;padding:4px 8px;border-radius:6px')
      document.documentElement.appendChild(d)
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put)
    else put()
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' })

  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const rectOf = (sel) => page.evaluate((s) => { const b = document.querySelector(s)?.getBoundingClientRect(); return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null }, sel)
  const pen = async (points, steps = 10) => {
    await page.mouse.move(points[0][0], points[0][1])
    await page.mouse.down()
    for (const [x, y] of points.slice(1)) await page.mouse.move(x, y, { steps })
    await page.mouse.up()
  }
  const ring = (r, pad = 14) => {
    const cx = r.x + r.w / 2; const cy = r.y + r.h / 2
    return Array.from({ length: 25 }, (_, i) => [cx + (r.w / 2 + pad) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (r.h / 2 + pad) * Math.sin((i / 24) * 2.08 * Math.PI)])
  }
  // a loose, slightly wobbly box: not a careful rectangle
  const box = (x0, y0, x1, y1) => [[x0, y0 + 3], [x1 - 4, y0], [x1, y1 - 2], [x0 + 5, y1], [x0 + 1, y0 + 6]]
  const scribble = (r) => {
    const pts = []
    for (let i = 0; i <= 8; i++) pts.push([r.x + 8 + ((r.w - 16) * i) / 8, i % 2 ? r.y + r.h - 4 : r.y + 4])
    return pts
  }
  /** Wait until the bar settles on a terminal line; returns every line seen. */
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
  const shot = async (name, fn) => {
    const at = (Date.now() - videoStart) / 1000
    const seen = await fn()
    shots.push({ name, at, end: (Date.now() - videoStart) / 1000, last: seen?.at(-1) ?? '' })
    log(`${name} @ ${at.toFixed(1)}s → ${seen?.at(-1) ?? ''}`)
    return seen ?? []
  }
  const videoStart = Date.now()

  // 1. the starter, running
  await shot('1 the app, running', async () => { await page.waitForTimeout(DWELL + 2000); return [await status()] })

  // 2. scribble out a line: no words
  const p = await rectOf('#center p')
  const s2 = await shot('2 scribble = delete', async () => { current = 'scribble'; await pen(scribble(p), 6); return settle() })
  // light DOM only: a `text=` locator also reads the bar, which quotes the line
  check('shot 2: the line is gone from the page', await page.evaluate(() => !document.body.innerText.includes('save to test')))
  check('shot 2: ends on a tick', /^✓/.test(s2.at(-1) ?? ''), s2.at(-1))
  // s2c-046: it used to say "removed the text "Edit and save to test"", words
  // that are not next to each other on the screen
  check('shot 2: quotes the line with its gap marked', /removed the text "Edit … and save to test"/.test(s2.at(-1) ?? ''), s2.at(-1))
  await page.waitForTimeout(DWELL)

  // 3. green pen, ring the heading: no words
  const s3 = await shot('3 green ring = make it green', async () => {
    current = 'ring'
    await page.keyboard.press('Alt+p')
    await page.waitForTimeout(600)
    await page.evaluate(() => {
      const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
      input.value = '#16a34a'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await page.waitForTimeout(400)
    await page.keyboard.press('Alt+p')
    await pen(ring(await rectOf('h1')), 6)
    const seen = await settle()
    await page.keyboard.press('Alt+0') // back to the default ink for the next mark
    return seen
  })
  const color = await page.evaluate(() => getComputedStyle(document.querySelector('h1')).color)
  check('shot 3: the heading is green', color === 'rgb(22, 163, 74)', color)
  check('shot 3: ends on a tick', /^✓/.test(s3.at(-1) ?? ''), s3.at(-1))
  await page.waitForTimeout(DWELL)

  // 4. a box + one word
  const btn = await rectOf('button.counter')
  const s4 = await shot('4 box + "testimonials" = new section', async () => {
    current = 'box'
    await pen(box(btn.x - 120, btn.y + btn.h + 30, btn.x + btn.w + 120, btn.y + btn.h + 110), 12)
    await page.waitForTimeout(300)
    await page.keyboard.type('testimonials', { delay: 70 })
    await page.keyboard.press('Enter')
    return settle()
  })
  check('shot 4: the section is on the page', await page.evaluate(() => document.body.innerText.includes('What people say')))
  check('shot 4: ends on a tick', /^✓/.test(s4.at(-1) ?? ''), s4.at(-1))
  await page.waitForTimeout(DWELL)

  // 5. one undo
  const beforeUndo = readFileSync(app(), 'utf8')
  const s5 = await shot('5 Ctrl+Z = undo', async () => { await page.keyboard.press(UNDO); return settle(10_000) })
  check('shot 5: undo answered', /undid/i.test(s5.at(-1) ?? ''), s5.at(-1))
  // s2c-045: it used to say "↩ undid: sketch run"
  check('shot 5: undo says what it took back, in plain words', /testimonials/.test(s5.at(-1) ?? '') && !/sketch run/.test(s5.at(-1) ?? ''), s5.at(-1))
  await page.waitForTimeout(1500)
  check('shot 5: the section is gone', await page.evaluate(() => !document.body.innerText.includes('What people say')))
  const afterUndo = readFileSync(app(), 'utf8')
  check('shot 5: only the last change was undone (line still gone, heading still green)',
    afterUndo !== beforeUndo && !EDIT_LINE.test(afterUndo) && afterUndo.includes("color: '#16a34a'") && !afterUndo.includes('testimonials'))
  await page.waitForTimeout(2000)

  check('no page errors', pageErrors.length === 0, pageErrors.join(' | '))
  check('shot 2: the scribble was read with no model call (s2c-049)', !calls.some((c) => c.endsWith(':scribble')), calls.join(' '))
  check('shot 3: the green ring was read and applied with no model call (s2c-050)', !calls.some((c) => c.endsWith(':ring')), calls.join(' '))
  check('every model call was scripted', calls.length > 0 && calls.every((c) => /^(interpret|codegen):/.test(c)), calls.join(' '))
  check('App.jsx differs from the starter', readFileSync(app(), 'utf8') !== committed)
} catch (err) {
  failures++
  console.error('[demo] FAILED:', err.stack ?? err.message)
} finally {
  providers?.setScriptedModel(null)
  const v = context ? await context.pages()[0]?.video() : null
  await context?.close().catch(() => {})
  await browser?.close().catch(() => {})
  await server?.close().catch(() => {})
  try {
    const file = v ? await v.path() : readdirSync(videoTmp).map((f) => join(videoTmp, f))[0]
    if (file) {
      const dest = join(outDir, 'demo-60s.webm')
      renameSync(file, dest)
      log('video:', dest)
    }
  } catch (e) { log('no video:', e.message) }
  const total = shots.at(-1)?.end ?? 0
  const lines = shots.map((s) => `| ${s.at.toFixed(1)}–${s.end.toFixed(1)} s | ${s.name} | ${s.last.replace(/\|/g, '/')} |`)
  writeFileSync(join(outDir, 'demo-60s-shots.md'), `| time | shot | the bar's last line |\n|---|---|---|\n${lines.join('\n')}\n\nTotal recorded: ${total.toFixed(1)} s (box reading scripted; the scribble and the green ring need no model)\n`)
  log(`shots: ${join(outDir, 'demo-60s-shots.md')} · recorded ${total.toFixed(1)} s · wall ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (KEEP || !OUT) log('keeping', parent)
  else rmSync(parent, { recursive: true, force: true })
}
console.log(failures === 0 ? '\n[demo] ALL CHECKS PASSED' : `\n[demo] ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

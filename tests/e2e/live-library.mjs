/**
 * Live e2e: THE ELEMENT LIBRARY — things you made, put back on the page.
 *
 * What only a browser can prove: that a lasso-extract files itself with a real
 * picture drawn from the page, that picking a card and clicking a container
 * produces a real import that actually RENDERS a second copy, that filing the
 * same component twice leaves one card rather than two, and that forgetting a
 * card leaves the component file alone.
 *
 * Phases, all zero-token:
 *   1. Alt+Shift+L opens; empty library says so rather than looking broken
 *   2. lasso two nav links into a component → it files itself, with a picture
 *   3. the picture served over HTTP is a PNG with real content
 *   4. pick the card, click a container → the component renders there too, from
 *      a real import, and the receipt says what it did
 *   5. Ctrl+Z removes the placement
 *   6. filing the same component again updates the one card (no duplicate)
 *   7. Esc puts down what you are holding; ✕ forgets a card and leaves the file
 *
 * This one starts its OWN dev server, because it is the only suite that touches
 * the global library — the one that follows the user between projects. Pointing
 * XDG_DATA_HOME at a temp directory means a test run can never delete or dirty
 * a real person's library, and it makes the mirroring genuinely testable rather
 * than something to assert around.
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-library.mjs
 */
import { chromium } from 'playwright'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync, spawn } from 'node:child_process'

const PORT = Number(process.env.S2C_PORT ?? 5218)
/**
 * Given S2C_APP, this connects to a server someone else started — in which case
 * THEY are responsible for pointing XDG_DATA_HOME at a scratch directory, since
 * this suite writes to the global library. Without it, it starts its own.
 */
const GIVEN = process.env.S2C_APP
const APP = GIVEN ?? `http://localhost:${PORT}/`
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const SRC = `${REPO_ROOT}examples/demo-app/src`
const LIB = `${REPO_ROOT}examples/demo-app/.sketch2code/library`
const log = (...a) => console.log('[e2e-lib]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })
  execSync('git clean -fdq examples/demo-app/src/', { cwd: REPO_ROOT })
}

restore()
// a library left over from an earlier run would make every count meaningless
if (existsSync(LIB)) rmSync(LIB, { recursive: true })

// an isolated global library, so this never reads or writes the developer's own
const XDG = GIVEN ? (process.env.XDG_DATA_HOME ?? '(the real one — set XDG_DATA_HOME!)')
  : mkdtempSync(join(tmpdir(), 's2c-xdg-'))
log('global library for this run:', GIVEN ? XDG : join(XDG, 'sketch2code/library'))
let server = null
if (!GIVEN) {
  server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: `${REPO_ROOT}examples/demo-app`,
    env: { ...process.env, XDG_DATA_HOME: XDG },
    stdio: 'ignore',
  })
  process.on('exit', () => {
    server?.kill('SIGTERM')
    rmSync(XDG, { recursive: true, force: true })
  })
}
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(APP)
    if (r.ok) break
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 200))
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
/**
 * A successful extract reloads the page, so anything read in that window sees
 * no overlay at all. These two tolerate it and let the callers' loops retry,
 * rather than every phase having to know which gestures reload.
 */
const soft = async (fn, arg) => {
  try {
    return await page.evaluate(fn, arg)
  } catch {
    return null
  }
}
const status = async () =>
  (await soft(() => document.getElementById('s2c-overlay-host')?.shadowRoot
    ?.getElementById('status')?.textContent ?? null)) ?? ''
const lib = async () =>
  (await soft(() => window.__S2C_DEBUG__?.library() ?? null))

async function waitLib(pred, what, ms = 20000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await lib()
    if (last && pred(last)) return last
    await page.waitForTimeout(300)
  }
  throw new Error(`ASSERT: timed out waiting for ${what} — last: ${JSON.stringify(last?.entries)}`)
}

async function waitStatus(re, ms = 20000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(200)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

const cards = () =>
  sh(() => [...document.getElementById('s2c-overlay-host').shadowRoot
    .querySelectorAll('#libGrid .lCard')].map((c) => ({
    id: c.dataset.entryId,
    name: c.querySelector('.lName')?.textContent ?? '',
    meta: c.querySelector('.lMeta')?.textContent ?? '',
    hasImg: !!c.querySelector('img'),
  })))

const clickCard = (id) =>
  sh((i) => document.getElementById('s2c-overlay-host').shadowRoot
    .querySelector(`#libGrid .lCard[data-entry-id="${i}"]`).click(), id)

const forgetCard = (id) =>
  sh((i) => document.getElementById('s2c-overlay-host').shadowRoot
    .querySelector(`#libGrid .lCard[data-entry-id="${i}"] .lDrop`).click(), id)

/** Draw a loop around two nav links, the way live-lasso does. */
async function lassoNavLinks() {
  const box = await sh(() => {
    const as = [...document.querySelectorAll('nav a')].slice(0, 2)
    const r0 = as[0].getBoundingClientRect()
    const r1 = as[1].getBoundingClientRect()
    return { x0: r0.left - 10, y0: r0.top - 12, x1: r1.right + 10, y1: r1.bottom + 12 }
  })
  await page.keyboard.press('Alt+l')
  await page.mouse.move(box.x0, box.y0)
  await page.mouse.down()
  for (const [x, y] of [[box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1], [box.x0, box.y0]]) {
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(box.x0 + ((x - box.x0) * i) / 4, box.y0 + ((y - box.y0) * i) / 4)
      await page.waitForTimeout(16)
    }
    box.x0 = x
    box.y0 = y
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. the empty library ──────────────────────────────────────────────────
const bind = await sh(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'library'))
if (!bind) throw new Error('ASSERT: Alt+Shift+L is not in the keymap')
log('keymap:', bind.keys, '·', bind.label)

await page.keyboard.press('Alt+Shift+L')
const empty = await waitLib((l) => l.open, 'the panel to open')
log('empty library says:', await status())
if (empty.entries.length !== 0) throw new Error('ASSERT: started with entries')
if (!/empty|sketch something/.test(await status())) {
  throw new Error('ASSERT: an empty library did not explain itself')
}
await page.keyboard.press('Alt+Shift+L')

// ── 2. a lasso-extract files itself ──────────────────────────────────────
await page.keyboard.press('Alt+t')
await lassoNavLinks()
const named = await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('lassoName')
  el.value = 'NavPair'
  return el.value
})
log('extracting as:', named)
await page.keyboard.press('Enter')
await waitStatus(/^✓ NavPair|^✗/)
log('extract:', await status())
await page.waitForTimeout(1500)

await page.keyboard.press('Alt+Shift+L')
const filed = await waitLib((l) => l.entries.length >= 1, 'the extract to file itself')
log('entries:', filed.entries.map((e) => `${e.name} (${e.kind}, ${e.home}, thumb=${e.hasThumb})`).join(' | '))
const entry = filed.entries.find((e) => e.name === 'NavPair')
if (!entry) throw new Error('ASSERT: the extracted component did not file itself')
if (entry.kind !== 'extracted') throw new Error(`ASSERT: filed as ${entry.kind}`)
if (!/NavPair\.tsx/.test(entry.file)) throw new Error(`ASSERT: wrong file: ${entry.file}`)
if (!entry.hasThumb) throw new Error('ASSERT: filed with no picture — the page never drew one')

// ── 3. the picture is real ───────────────────────────────────────────────
const shot = await page.request.get(
  `${APP.replace(/\/$/, '')}/@s2c/library/thumb?id=${entry.id}&home=project`)
const bytes = Buffer.from(await shot.body())
log('served picture:', shot.status(), shot.headers()['content-type'], bytes.length, 'bytes')
if (shot.status() !== 200) throw new Error(`ASSERT: the picture did not serve: ${shot.status()}`)
if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('ASSERT: not PNG bytes')
const colours = await sh(async (id) => {
  const img = new Image()
  img.src = `/@s2c/library/thumb?id=${id}&home=project`
  await img.decode()
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  cv.getContext('2d').drawImage(img, 0, 0)
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
  const seen = new Set()
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
  return { w: img.width, h: img.height, colours: seen.size }
}, entry.id)
log('decoded:', `${colours.w}×${colours.h}`, '·', colours.colours, 'colours')
if (colours.colours < 2) throw new Error('ASSERT: the picture is a flat fill — it drew nothing')

// ── 4. place it: a real import that really renders ──────────────────────
const before = await sh(() => document.querySelectorAll('nav a').length)
log('nav links before placing:', before)
await clickCard(entry.id)
const armed = await waitLib((l) => l.armed === entry.id, 'the card to be picked up')
log('holding:', armed.armedName, '·', await status())

// drop into the stat-cards grid: a plain container the app renders
const target = await sh(() => {
  const s = [...document.querySelectorAll('section')].find((x) => x.className.includes('grid'))
  const r = s.getBoundingClientRect()
  return { x: r.left + 6, y: r.top + 6 }
})
await page.mouse.click(target.x, target.y)
const receipt = await waitStatus(/^[✓✗]/)
log('placed:', receipt)
if (receipt.startsWith('✗')) throw new Error(`ASSERT: placing failed: ${receipt}`)
if (!/0 tokens/.test(receipt)) throw new Error('ASSERT: receipt missing the zero-token proof')
if (!/<NavPair/.test(receipt)) throw new Error(`ASSERT: the receipt does not show the JSX: ${receipt}`)

// the proof: the component renders a SECOND time, from an import
await page.waitForFunction((n) => document.querySelectorAll('nav a').length > n ||
  document.querySelectorAll('a').length > n + 1, before, { timeout: 12000 })
const statCards = readFileSync(`${SRC}/components/StatCards.tsx`, 'utf8')
log('StatCards.tsx now imports:', statCards.split('\n').find((l) => l.includes('NavPair'))?.trim())
if (!/import NavPair from/.test(statCards)) {
  throw new Error('ASSERT: placement did not add a real import')
}
if (!/<NavPair\s*\/>/.test(statCards)) throw new Error('ASSERT: no call site was written')
const usedNow = (await waitLib((l) => l.entries.some((e) => e.usedCount >= 1), 'the use count to rise'))
  .entries.find((e) => e.id === entry.id)
log('use count:', usedNow.usedCount)

// ── 5. undo ─────────────────────────────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
await page.waitForTimeout(800)
if (/NavPair/.test(readFileSync(`${SRC}/components/StatCards.tsx`, 'utf8'))) {
  throw new Error('ASSERT: undo left the placement behind')
}
log('undo removed the placement')

// ── 6. filing the same thing again is still one card ────────────────────
const countBefore = (await lib()).entries.length
await sh(async (f) => {
  await fetch('/@s2c/library/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-s2c-token': globalThis.__S2C_TOKEN__ },
    body: JSON.stringify({ file: f, kind: 'extracted', name: 'NavPair' }),
  })
}, entry.file)
await page.waitForTimeout(600)
const after = await lib()
log('after filing it again:', after.entries.length, 'entries (was', countBefore + ')')
if (after.entries.length !== countBefore) {
  throw new Error('ASSERT: filing the same component twice made a second card')
}
const same = after.entries.find((e) => e.name === 'NavPair')
if (same.id !== entry.id) throw new Error('ASSERT: the card was replaced rather than updated')
if (!same.hasThumb) throw new Error('ASSERT: re-filing without a picture blanked the one it had')

// ── 7. put it down, then forget it ─────────────────────────────────────
await clickCard(entry.id)
await waitLib((l) => l.armed === entry.id, 'picked up again')
await page.keyboard.press('Escape')
const down = await waitLib((l) => l.armed === null, 'put down')
log('Esc:', await status())
if (!down.open) throw new Error('ASSERT: Esc closed the panel as well as putting the entry down')

await forgetCard(entry.id)
const gone = await waitLib((l) => !l.entries.some((e) => e.id === entry.id), 'the card to go')
log('forgot it:', await status(), '·', gone.entries.length, 'left')
if (!existsSync(`${SRC}/components/NavPair.tsx`)) {
  throw new Error('ASSERT: forgetting a card deleted the component file')
}
log('the component file survived, as it must')

restore()
if (existsSync(LIB)) rmSync(LIB, { recursive: true })
// the global library for this run lived in a temp dir and goes with it
log('global library was used:', existsSync(join(XDG, 'sketch2code/library/index.json')))
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — made a component, it filed itself, placed it as a real import, and forgetting it kept the code')

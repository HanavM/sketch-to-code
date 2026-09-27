/**
 * Live e2e: VISUAL HISTORY — the page's own past, with pictures.
 *
 * What only a browser can prove: that the thumbnail the page draws of itself is
 * a real PNG with real content (a blank one would look exactly like a working
 * one in every other test), that a file saved in the EDITOR lands on the
 * timeline by itself with no gesture involved, and that putting a moment back
 * rewrites the files and re-renders the page.
 *
 * Phases, all zero-token:
 *   1. Alt+B opens; a baseline moment is already there, with a picture
 *   2. the thumbnail served over HTTP is a PNG, and is not one flat colour
 *   3. an EDITOR edit appears on the timeline, labelled as one, by itself
 *   4. an OVERLAY edit appears too, labelled with what it did
 *   5. nothing changed → nothing recorded (the watcher is chatty; the timeline
 *      must not be)
 *   6. pick the moment before the editor edit and put it back: the file and the
 *      page both return, and the scrub is itself on the timeline
 *   7. Ctrl+Z reaches the scrub, because it is an edit like any other
 *
 * Boot first: cd examples/demo-app && npx vite --port 5216
 * Run FROM THE REPO ROOT: node tests/e2e/live-history.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5216/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const NAVBAR = `${REPO_ROOT}examples/demo-app/src/components/Navbar.tsx`
const HISTORY = `${REPO_ROOT}examples/demo-app/.sketch2code/history`
const log = (...a) => console.log('[e2e-history]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

restore()
// a timeline left over from an earlier run would make every count meaningless
if (existsSync(HISTORY)) rmSync(HISTORY, { recursive: true })
const NAVBAR_BEFORE = readFileSync(NAVBAR, 'utf8')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const status = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const hist = () => sh(() => window.__S2C_DEBUG__.history())

async function waitHist(pred, what, ms = 20000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await hist()
    if (pred(last)) return last
    await page.waitForTimeout(300)
  }
  throw new Error(`ASSERT: timed out waiting for ${what} — last: ${JSON.stringify(last?.versions)}`)
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
    .querySelectorAll('#timeStrip .tCard')].map((c) => ({
    id: c.dataset.versionId,
    what: c.querySelector('.tWhat')?.textContent ?? '',
    hasImg: !!c.querySelector('img'),
  })))

const clickCard = (id) =>
  sh((i) => {
    const el = document.getElementById('s2c-overlay-host').shadowRoot
      .querySelector(`#timeStrip .tCard[data-version-id="${i}"]`)
    el.click()
  }, id)

const putBack = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('timeGo').click())

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })

// ── 1. the baseline ───────────────────────────────────────────────────────
const bind = await sh(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'history'))
if (!bind) throw new Error('ASSERT: Alt+B is not in the keymap')
log('keymap:', bind.keys, '·', bind.label)

await page.keyboard.press('Alt+b')
const first = await waitHist((h) => h.open && h.versions.length >= 1, 'the baseline moment')
log('versions:', first.versions.map((v) => v.label).join(' | '))
log('thumbnail the page drew:', first.thumbBytes, 'bytes of data URL')
if (first.thumbBytes < 2000) {
  throw new Error(`ASSERT: the page's picture of itself is suspiciously small (${first.thumbBytes} bytes)`)
}
if (!first.versions[0].hasThumb) throw new Error('ASSERT: the baseline moment has no picture')

// ── 2. the picture is a real PNG with real content ───────────────────────
const shot = await page.request.get(`${APP.replace(/\/$/, '')}/@s2c/history/thumb?id=${first.versions[0].id}`)
const bytes = Buffer.from(await shot.body())
log('served thumbnail:', shot.status(), shot.headers()['content-type'], bytes.length, 'bytes')
if (shot.status() !== 200) throw new Error(`ASSERT: the thumbnail did not serve: ${shot.status()}`)
if (shot.headers()['content-type'] !== 'image/png') throw new Error('ASSERT: not served as a PNG')
if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('ASSERT: not PNG bytes')
// decoded in the browser, because a PNG of one flat colour is a "working"
// thumbnail that shows nothing — this is the assertion that would catch it
const pixels = await sh(async (id) => {
  const img = new Image()
  img.src = `/@s2c/history/thumb?id=${id}`
  await img.decode()
  const cv = document.createElement('canvas')
  cv.width = img.width
  cv.height = img.height
  const g = cv.getContext('2d')
  g.drawImage(img, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height).data
  const seen = new Set()
  for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
  return { w: img.width, h: img.height, colours: seen.size }
}, first.versions[0].id)
log('decoded:', `${pixels.w}×${pixels.h}`, '·', pixels.colours, 'distinct colours')
if (pixels.w < 100 || pixels.h < 40) throw new Error('ASSERT: the picture is too small to be a page')
if (pixels.colours < 3) {
  throw new Error(`ASSERT: the picture is a flat fill — it draws nothing (${pixels.colours} colours)`)
}

// ── 3. an editor edit records itself ────────────────────────────────────
const edited = NAVBAR_BEFORE.replace('Acme Dashboard', 'Zenith Dashboard')
if (edited === NAVBAR_BEFORE) throw new Error('fixture drift: Navbar has no Acme Dashboard title')
writeFileSync(NAVBAR, edited)
log('saved Navbar.tsx in the "editor" — nothing pressed in the page')
const afterEdit = await waitHist(
  (h) => h.versions.some((v) => /edited by hand/.test(v.label)),
  'the editor edit to record itself',
)
const byHand = afterEdit.versions.find((v) => /edited by hand/.test(v.label))
log('recorded:', byHand.label, '· files:', byHand.files.join(', '))
if (!/Navbar\.tsx/.test(byHand.label)) throw new Error('ASSERT: the label does not name the file')
if (!byHand.files.some((f) => /Navbar\.tsx/.test(f))) {
  throw new Error(`ASSERT: the moment does not know what changed: ${byHand.files.join(',')}`)
}
const baselineId = first.versions[0].id

// ── 4. an overlay edit records itself too ───────────────────────────────
await page.keyboard.press('Alt+t')
const link = await sh(() => {
  const a = document.querySelector('nav a')
  const r = a.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
await page.mouse.click(link.x, link.y)
await page.waitForTimeout(250)
await page.keyboard.press('Alt+o') // props panel on a propless component: harmless
await page.keyboard.press('Escape')
// a real source edit through the overlay: nudge the selection
await page.mouse.move(link.x, link.y)
await page.mouse.down()
for (let i = 1; i <= 8; i++) { await page.mouse.move(link.x + i * 2, link.y); await page.waitForTimeout(20) }
await page.mouse.up()
const receipt = await waitStatus(/^[✓✗]/)
log('overlay edit:', receipt)
const afterOverlay = await waitHist(
  (h) => h.versions.length > afterEdit.versions.length,
  'the overlay edit to record itself',
)
const newest = afterOverlay.versions[0]
log('recorded:', newest.label)
if (/edited by hand/.test(newest.label)) {
  throw new Error(`ASSERT: our own edit was labelled as a hand edit: ${newest.label}`)
}

// ── 5. nothing changed → nothing recorded ──────────────────────────────
const countBefore = (await hist()).versions.length
writeFileSync(NAVBAR, readFileSync(NAVBAR, 'utf8')) // touch, same bytes
await page.waitForTimeout(3000)
const countAfter = (await hist()).versions.length
log('touching a file without changing it added', countAfter - countBefore, 'moments')
if (countAfter !== countBefore) {
  throw new Error('ASSERT: a no-op save added a moment — the timeline will fill with duplicates')
}

// ── 6. put the baseline back ───────────────────────────────────────────
await clickCard(baselineId)
const picked = await waitHist((h) => h.picked === baselineId, 'the baseline to be picked')
log('picked:', picked.picked)
const shownCards = await cards()
log('cards:', shownCards.map((c) => c.what).join(' | '))
if (!shownCards.every((c) => c.hasImg)) throw new Error('ASSERT: a card has no picture')
await putBack()
const back = await waitStatus(/^✓ back to|^✗/)
log('restore:', back)
if (back.startsWith('✗')) throw new Error(`ASSERT: the restore failed: ${back}`)
await page.waitForFunction(() => document.body.textContent.includes('Acme Dashboard'), { timeout: 10000 })
if (readFileSync(NAVBAR, 'utf8') !== NAVBAR_BEFORE) {
  throw new Error('ASSERT: the file was not put back the way it was')
}
log('page and file are back at the baseline')
const afterRestore = await waitHist(
  (h) => h.versions.some((v) => /before|scrub|putting back|back to/i.test(v.label)),
  'the scrub itself to be recorded',
)
log('the scrub is on the timeline as:',
  afterRestore.versions.find((v) => /before|scrub|putting back|back to/i.test(v.label)).label)

// ── 7. Ctrl+Z reaches it ───────────────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
log('undo after a scrub:', await status())
await page.waitForFunction(() => document.body.textContent.includes('Zenith Dashboard'), { timeout: 10000 })
log('undoing the scrub brought the later version back')

restore()
if (existsSync(HISTORY)) rmSync(HISTORY, { recursive: true })
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — the page pictures itself, editor edits record themselves, and a moment can be put back')

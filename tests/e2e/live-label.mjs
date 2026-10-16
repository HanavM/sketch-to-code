/**
 * Live e2e: TYPE-TO-LABEL — draw a shape, then just start typing.
 *
 * The one-word note used to cost four steps (pointer back on the shape, Alt+N,
 * type, Enter). Now it is: type, Enter. Zero model calls: /@s2c/interpret is
 * captured and fulfilled locally. Asserts:
 *   1. right after a drawing, the first printable key opens the note ON THAT
 *      DRAWING (its whole cluster), with the key kept as the first letter —
 *      even with the pointer parked over a button elsewhere
 *   2. it is one-shot: after Enter, the next key belongs to the host page again
 *   3. undo disarms it (the armed stroke is gone)
 *   4. a key the overlay already binds keeps its meaning: ? still opens help
 *   5. the test surface never steals keys
 *   6. auto mode: a key typed during the settle countdown opens the label and
 *      HOLDS the run; Enter releases it, and the interpret request carries the
 *      label on the drawing's strokes
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp/s2c-label-shots'
const log = (...a) => console.log('[e2e-label]', ...a)
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}
mkdirSync(SHOTS, { recursive: true })

const interprets = []
await page.route('**/@s2c/interpret', async (route) => {
  interprets.push(JSON.parse(route.request().postData() ?? '{}'))
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed' }) })
})
await page.route('**/@s2c/run', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }))

// manual first, so nothing fires while the basic rules are checked
await page.evaluate(() => {
  for (const k of ['s2c:hud', 's2c:fidelity', 's2c:pen']) localStorage.removeItem(k)
  localStorage.setItem('s2c:auto', '"manual"')
})
await page.reload({ waitUntil: 'networkidle' })
// the host page's view of the keyboard: anything that leaks reaches here
await page.evaluate(() => {
  window.__hostKeys = []
  window.addEventListener('keydown', (e) => { if (!e.defaultPrevented) window.__hostKeys.push(e.key) })
})

const ui = () =>
  page.evaluate(() => {
    const s = document.getElementById('s2c-overlay-host').shadowRoot
    const box = s.getElementById('noteBox')
    const inp = s.getElementById('noteInput')
    const help = s.getElementById('help')
    return {
      open: getComputedStyle(box).display !== 'none',
      what: s.getElementById('noteWhat').textContent,
      value: inp.value,
      focused: s.activeElement === inp,
      caret: [inp.selectionStart, inp.selectionEnd],
      helpOn: help ? getComputedStyle(help).display !== 'none' : false,
      status: s.getElementById('status').textContent,
    }
  })
const notes = () => page.evaluate(() => window.__S2C_DEBUG__.notes())
const strokes = () => page.evaluate(() => window.__S2C_DEBUG__.strokes().map((s) => s.id))
const hostKeys = () => page.evaluate(() => window.__hostKeys.splice(0))
const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
const setDraw = async () => {
  for (let i = 0; i < 3 && (await mode()) !== 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(200)
  }
  if ((await mode()) !== 'draw') throw new Error('could not reach draw mode')
}
const line = async (x0, y0, x1, y1) => {
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 10, y0 + ((y1 - y0) * i) / 10)
  await page.mouse.up()
}
/**
 * A loose four-sided box in the left gutter, one stroke per side. Each side
 * starts 20px off the last one's end: a pen-down right where the previous
 * stroke ended is the trackpad-hop bridge, and would merge them into one.
 */
const box = async (x, y, w, h) => {
  await line(x, y, x + w, y + 3)
  await line(x + w + 2, y + 23, x + w - 2, y + h)
  await line(x + w - 22, y + h, x + 2, y + h - 2)
  await line(x + 2, y + h - 22, x, y + 4)
}
const rectOf = (sel) =>
  page.evaluate((q) => {
    const r = document.querySelector(q).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)

// ---- 1. draw, then just type ------------------------------------------
await setDraw()
await box(30, 600, 90, 70)
const drawn = await strokes()
if (drawn.length !== 4) throw new Error(`box drew ${drawn.length} strokes, want 4`)
let u = await ui()
if (!/start typing to label/.test(u.status)) throw new Error(`no hint that typing labels it: "${u.status}"`)
// park the pointer on a real button far away: Alt+N would anchor THERE (rule
// 1); type-to-label must not, because the drawing is what the word is about
const btn = await rectOf('button[data-s2c*="Navbar.tsx:10"]')
await page.mouse.move(btn.x + btn.w / 2, btn.y + btn.h / 2)
await page.keyboard.press('P')
u = await ui()
if (!u.open) throw new Error('a key right after drawing did not open the label')
if (!u.focused) throw new Error('label field not focused — the next key would go nowhere')
if (u.value !== 'P') throw new Error(`the first key was lost or doubled: ${JSON.stringify(u.value)}`)
if (!eq(u.caret, [1, 1])) throw new Error(`caret ${u.caret} — the next key would replace the first letter`)
if (u.what !== 'on these 4 strokes') throw new Error(`label landed on "${u.what}", want the 4-stroke box`)
await page.keyboard.type('ricing')
writeFileSync(`${SHOTS}/label-open.png`, await page.screenshot({ clip: { x: 0, y: 560, width: 520, height: 220 } }))
await page.keyboard.press('Enter')
let n = await notes()
if (n.length !== 1) throw new Error(`label not committed: ${JSON.stringify(n)}`)
if (n[0].text !== 'Pricing') throw new Error(`text ${JSON.stringify(n[0].text)}, want "Pricing"`)
if (!eq(n[0].anchor, { kind: 'strokes', strokeIds: drawn })) {
  throw new Error(`anchor ${JSON.stringify(n[0].anchor)}, want the box ${drawn}`)
}
if (n[0].at.y < 660 || n[0].at.x > 40) throw new Error(`label hangs at ${JSON.stringify(n[0].at)}, not under the box`)
let leaked = await hostKeys()
if (leaked.length) throw new Error(`label keys leaked to the host page: ${leaked}`)
log('✓ draw → type "Pricing" → Enter: 2 steps, on the 4-stroke box, pointer elsewhere ignored')

// ---- 2. one-shot ------------------------------------------------------
await page.mouse.move(600, 450)
await page.keyboard.press('x')
u = await ui()
if (u.open) throw new Error('a second note opened: type-to-label must be one-shot')
leaked = await hostKeys()
if (!eq(leaked, ['x'])) throw new Error(`after the label the host page should get its key back, got ${leaked}`)
log('✓ one-shot: the next key is the host page\'s again')

// ---- 3. undo disarms ---------------------------------------------------
await line(30, 760, 140, 770)
await page.keyboard.press('Control+KeyZ')
if ((await strokes()).length !== 4) throw new Error('Ctrl+Z did not undo the stroke')
await hostKeys()
await page.keyboard.press('q')
u = await ui()
if (u.open) throw new Error('undo left type-to-label armed on a stroke that no longer exists')
log('✓ undo disarms it')

// ---- 4. bound keys keep their meaning ---------------------------------
await line(30, 760, 140, 770)
await page.keyboard.press('?')
u = await ui()
if (u.open) throw new Error('? opened a label instead of the help')
if (!u.helpOn) throw new Error('? did not open the help after a stroke')
await page.keyboard.press('Escape')
// the help took the key, but the stroke is still the newest and unlabelled:
// typing now still labels it
await page.keyboard.press('h')
u = await ui()
if (!u.open || u.value !== 'h') throw new Error(`after closing help, typing did not label: ${JSON.stringify(u)}`)
await page.keyboard.type('eader')
await page.keyboard.press('Enter')
n = await notes()
if (n.length !== 2 || n[1].text !== 'header') throw new Error(`second label: ${JSON.stringify(n[1])}`)
const help = await page.evaluate(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'label'))
if (!help || help.keys !== 'just type') throw new Error(`help does not list type-to-label: ${JSON.stringify(help)}`)
log('✓ ? still opens help · Esc · then typing still labels · listed in help as', JSON.stringify(help.keys))

// ---- 5. the test surface never steals keys ----------------------------
await line(200, 760, 300, 770)
await page.keyboard.press('Alt+Space')
if ((await page.evaluate(() => window.__S2C_DEBUG__.surface())) !== 'test') throw new Error('Alt+Space did not reach test')
await hostKeys()
await page.keyboard.press('z')
u = await ui()
if (u.open) throw new Error('type-to-label fired on the test surface')
if (!eq(await hostKeys(), ['z'])) throw new Error('the test surface did not give the page its key')
await page.keyboard.press('Alt+Space')
log('✓ test surface: keys belong to the page')

// ---- 6. auto mode: typing holds the run, Enter releases it -------------
await page.keyboard.press('Alt+KeyX') // clear
await page.evaluate(() => localStorage.setItem('s2c:auto', '"auto"'))
await page.reload({ waitUntil: 'networkidle' })
await setDraw()
interprets.length = 0
await box(30, 600, 90, 70)
await page.waitForTimeout(250) // inside the 900ms settle
await page.keyboard.type('Sig')
await page.waitForTimeout(2000) // well past the settle: a held run must not fire
u = await ui()
if (!u.open || u.value !== 'Sig') throw new Error(`auto: label not open mid-countdown: ${JSON.stringify(u)}`)
if (interprets.length) throw new Error(`auto fired ${interprets.length}× while the label was being typed`)
await page.keyboard.type('n up')
await page.keyboard.press('Enter')
for (let i = 0; i < 40 && interprets.length === 0; i++) await page.waitForTimeout(100)
if (interprets.length !== 1) throw new Error(`auto: ${interprets.length} interpret calls after Enter, want 1`)
const sent = interprets[0].notes ?? []
const ids = (await page.evaluate(() => window.__S2C_DEBUG__.strokes().map((s) => s.id)))
if (sent.length !== 1 || sent[0].text !== 'Sign up' || !eq(sent[0].anchor, { kind: 'strokes', strokeIds: ids })) {
  throw new Error(`auto: wire notes ${JSON.stringify(sent)}`)
}
log('✓ auto: typing in the countdown held the run for 2s · Enter released it · wire carries "Sign up" on', ids.join(','))

if (errors.length) throw new Error(`page errors: ${errors}`)
log('ALL LABEL CHECKS PASSED · screenshots in', SHOTS)
await b.close()

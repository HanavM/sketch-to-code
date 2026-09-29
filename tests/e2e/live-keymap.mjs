/**
 * Live e2e: the keymap — every HUD action reachable from the keyboard, and one
 * help overlay rendered from the same table the handler walks. Zero model
 * calls: /@s2c/interpret and /@s2c/run are stubbed locally, so the full
 * run → confirm → cancel lifecycle is exercised without spending anything or
 * touching the demo app's source. Asserts:
 *   1. the help overlay lists EVERY binding in the table, grouped, with no
 *      duplicate key combos, and it PAINTS (opaque, hit-testable, unclipped)
 *   2. ? opens it, ? closes it, Esc closes it
 *   3. the Escape ladder: note field → help → fidelity panel → the rest
 *   4. bindings end to end: draw, the three run modes, tweak, fidelity panel,
 *      the slider nudges, a fidelity keep, hide/show HUD, run/confirm/cancel,
 *      clear
 *   5. the host-app guard still holds — typing in the app's own <input> fires
 *      no overlay shortcut — and an open note field swallows its keystrokes
 *      so they reach neither the overlay nor the page
 * Set S2C_APP to point at a dev server on another port.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SHOTS = process.env.S2C_SHOTS ?? '/tmp/s2c-keymap-shots'
const log = (...a) => console.log('[e2e-keymap]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}
mkdirSync(SHOTS, { recursive: true })
await page.evaluate(() => { localStorage.removeItem('s2c:hud'); localStorage.removeItem('s2c:fidelity') })
await page.reload({ waitUntil: 'networkidle' })

/** One read of everything a binding could plausibly have changed. */
const state = () =>
  page.evaluate(() => {
    const host = document.getElementById('s2c-overlay-host')
    const s = host.shadowRoot
    const on = (id) => s.getElementById(id).classList.contains('on')
    const shown = (id) => getComputedStyle(s.getElementById(id)).display !== 'none'
    return {
      mode: host.dataset.mode,
      runMode: ['gesture', 'design', 'screenshot'].find((m) => on(`mode-${m}`)),
      help: shown('help'),
      fidelity: shown('fidelityPanel'),
      note: shown('noteBox'),
      hudHidden: !shown('hud'),
      resemblance: Number(s.getElementById('fidelityRange').value) / 100,
      keepAsymmetry: s.getElementById('keep-asymmetry').checked,
      confirmShown: s.getElementById('confirm').style.display !== 'none',
      cancelShown: s.getElementById('cancel').style.display !== 'none',
      runDisabled: s.getElementById('run').disabled,
      status: s.getElementById('status').textContent,
    }
  })
const press = async (k) => { await page.keyboard.press(k); await page.waitForTimeout(60) }
const keymap = () => page.evaluate(() => window.__S2C_DEBUG__.keymap())

// ---- 1. the help overlay is the keymap ---------------------------------
const binds = await keymap()
if (binds.length < 18) throw new Error(`only ${binds.length} bindings — the table looks truncated`)
const combos = binds.map((x) => x.keys)
const dupes = combos.filter((c, i) => combos.indexOf(c) !== i)
if (dupes.length) throw new Error(`duplicate key combos in the table: ${dupes.join(', ')}`)
for (const x of binds) {
  if (!x.id || !x.keys || !x.label || !x.group) throw new Error(`incomplete binding: ${JSON.stringify(x)}`)
}

await press('?')
let s = await state()
if (!s.help) throw new Error('? did not open the help overlay')
const help = await page.evaluate(() => {
  const s2 = document.getElementById('s2c-overlay-host').shadowRoot
  const h = s2.getElementById('help')
  const r = h.getBoundingClientRect()
  const rows = [...h.querySelectorAll('.hRow')].map((row) => ({
    id: row.dataset.bind,
    keys: row.querySelector('.hKeys').textContent,
    label: row.querySelector('.hLabel').textContent,
    keysW: row.querySelector('.hKeys').getBoundingClientRect().width,
    labelW: row.querySelector('.hLabel').getBoundingClientRect().width,
    h: row.getBoundingClientRect().height,
  }))
  return {
    rows,
    groups: [...h.querySelectorAll('.hGroup')].map((g) => g.textContent),
    box: { x: r.left, y: r.top, w: r.width, h: r.height },
    bg: getComputedStyle(h).backgroundColor,
    fg: getComputedStyle(h.querySelector('.hLabel') ?? h).color,
    opacity: getComputedStyle(h).opacity,
    // a rect is not proof of paint: hit-test the middle of the panel
    hitIsOverlay: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.id === 's2c-overlay-host',
    onScreen: r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight,
    // scrollHeight > clientHeight is fine (it scrolls); horizontal spill is not
    spill: [...h.querySelectorAll('.hRow, .hGroup')].filter((el) => {
      const er = el.getBoundingClientRect()
      return er.right > r.right + 1 || er.left < r.left - 1
    }).length,
    // A long list may overflow — what must never happen is a binding the user
    // cannot reach. Check the panel actually scrolls, and that scrolling to the
    // end brings the last row fully into view.
    overflows: h.scrollHeight > h.clientHeight,
    scrolls: ['auto', 'scroll'].includes(getComputedStyle(h).overflowY),
  }
})
if (help.rows.length !== binds.length) {
  const listed = new Set(help.rows.map((r) => r.id))
  throw new Error(`help lists ${help.rows.length} of ${binds.length}; missing: ${binds.filter((x) => !listed.has(x.id)).map((x) => x.id).join(', ')}`)
}
for (const x of binds) {
  const row = help.rows.find((r) => r.id === x.id)
  if (row.keys !== x.keys || row.label !== x.label) throw new Error(`help row drifted from the table: ${x.id}`)
  if (row.h < 12 || row.keysW < 12 || row.labelW < 40) throw new Error(`help row not rendered: ${JSON.stringify(row)}`)
}
if (new Set(help.groups).size !== help.groups.length) throw new Error(`groups are not contiguous: ${help.groups.join(', ')}`)
if (help.opacity !== '1') throw new Error('help overlay is transparent')
// Contrast, not a hex. The chrome has two skins and will have more; what has
// to hold in every one of them is that the words are readable on the surface
// they sit on, which is a number rather than a colour.
const lum = (c) => {
  const [r, g, b] = c.map((v) => {
    const x = v / 255
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const parse = (s) => (s.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)
const ratio = (a, b) => {
  const [x, y] = [lum(parse(a)), lum(parse(b))].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const surface = parse(help.bg)
if (surface.length !== 3) throw new Error(`help has no surface of its own: ${help.bg}`)
const alpha = Number((help.bg.match(/[\d.]+/g) ?? [])[3] ?? 1)
if (alpha < 0.5) throw new Error(`help surface is too transparent to read on: ${help.bg}`)
const contrast = ratio(help.bg, help.fg)
if (contrast < 4.5) {
  throw new Error(`help text fails contrast on its own panel: ${contrast.toFixed(2)}:1 (${help.fg} on ${help.bg})`)
}
log(`help contrast ${contrast.toFixed(1)}:1 · surface ${help.bg}`)
if (!help.hitIsOverlay) throw new Error('help centre is not hit-testable — something covers it')
if (!help.onScreen) throw new Error(`help overlay is off-screen: ${JSON.stringify(help.box)}`)
if (help.spill) throw new Error(`${help.spill} help rows overflow the panel horizontally`)
if (help.overflows) {
  if (!help.scrolls) throw new Error('help content is taller than the panel and it does not scroll — bindings are unreachable')
  const lastVisible = await page.evaluate(() => {
    const h = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('help')
    h.scrollTop = h.scrollHeight
    const rows = [...h.querySelectorAll('.hRow')]
    const last = rows[rows.length - 1].getBoundingClientRect()
    const box = h.getBoundingClientRect()
    return last.bottom <= box.bottom + 1 && last.top >= box.top - 1
  })
  if (!lastVisible) throw new Error('scrolling the help to the end still does not reveal the last binding')
}
writeFileSync(`${SHOTS}/help-overlay.png`, await page.screenshot())
log('✓ help lists all', binds.length, 'bindings in', help.groups.length, 'groups ·',
  Math.round(help.box.w) + 'x' + Math.round(help.box.h), '· groups:', help.groups.join('/'))

// ---- 2. ? and Esc both close it ---------------------------------------
await press('?')
if ((await state()).help) throw new Error('? did not close the help overlay')
await press('?')
await press('Escape')
if ((await state()).help) throw new Error('Escape did not close the help overlay')
log('✓ ? toggles · Escape closes')

// ---- 3. the Escape ladder ---------------------------------------------
await press('Alt+KeyF')
await press('?')
s = await state()
if (!s.help || !s.fidelity) throw new Error('setup for the ladder failed')
await press('Escape')
s = await state()
if (s.help) throw new Error('Escape did not take the help overlay first')
if (!s.fidelity) throw new Error('Escape fell THROUGH the help overlay into the fidelity panel')
// a note field outranks both
await page.mouse.move(1210, 420)
await press('Alt+KeyN')
s = await state()
if (!s.note) throw new Error('Alt+N did not open the note field with the fidelity panel open')
await press('Escape')
s = await state()
if (s.note) throw new Error('Escape did not cancel the note')
if (!s.fidelity) throw new Error('Escape fell through the note field into the fidelity panel')
await press('Escape')
if ((await state()).fidelity) throw new Error('Escape did not close the fidelity panel')
log('✓ Escape ladder: note → help → fidelity → the rest')

// ---- 4. every binding, end to end -------------------------------------
await press('Alt+KeyE')
if ((await state()).runMode !== 'design') throw new Error('Alt+E did not select design mode')
await press('Alt+KeyS')
if ((await state()).runMode !== 'screenshot') throw new Error('Alt+S did not select screenshot mode')
await press('Alt+KeyG')
if ((await state()).runMode !== 'gesture') throw new Error('Alt+G did not select gesture mode')

await press('Alt+KeyT')
if ((await state()).mode !== 'tweak') throw new Error('Alt+T did not enter tweak mode')
await press('Alt+KeyT')
if ((await state()).mode === 'tweak') throw new Error('Alt+T did not leave tweak mode')

await press('Alt+KeyD')
if ((await state()).mode !== 'draw') throw new Error('Alt+D did not enter draw mode')
await press('Alt+KeyD')
if ((await state()).mode !== 'idle') throw new Error('Alt+D did not leave draw mode')

const before = (await state()).resemblance
await press('Alt+ArrowUp')
await press('Alt+ArrowUp')
let after = (await state()).resemblance
if (Math.abs(after - (before + 0.1)) > 1e-9) throw new Error(`Alt+↑ ×2: ${before} → ${after}`)
await press('Alt+ArrowDown')
after = (await state()).resemblance
if (Math.abs(after - (before + 0.05)) > 1e-9) throw new Error(`Alt+↓: ${after}`)
await press('Alt+Digit1')
if ((await state()).keepAsymmetry) throw new Error('Alt+1 did not toggle the asymmetry keep')
await press('Alt+Digit1')
if (!(await state()).keepAsymmetry) throw new Error('Alt+1 did not toggle back')
log('✓ modes · tweak · draw · fidelity dial', before, '→', after, '· keeps')

await press('Alt+KeyH')
if (!(await state()).hudHidden) throw new Error('Alt+H did not hide the toolbar')
await press('Alt+KeyH')
if ((await state()).hudHidden) throw new Error('Alt+H did not bring the toolbar back')

// run / confirm / cancel, with both endpoints stubbed: no model call, no edit
await page.route('**/@s2c/interpret', (route) =>
  route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      v2: {
        interpretation: {
          reading: 'stubbed reading', rejected: [],
          actions: [{ kind: 'modify', targets: [{ rect: { x: 200, y: 200, w: 120, h: 40 }, tag: 'p', text: 'x' }], instruction: 'stub', needsConfirm: false }],
        },
        raw: {}, tokens: { input: 0, cacheRead: 0, output: 0 },
      },
    }),
  }))
let ranPost = false
await page.route('**/@s2c/run', (route) => {
  ranPost = true
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
})

await press('Alt+KeyR')
if (!(await state()).runDisabled) throw new Error('▶ Run was enabled with nothing drawn')
// design mode is live on load, so Alt+D pressed blind can toggle drawing OFF
for (let i = 0; i < 3 && (await state()).mode !== 'draw'; i++) {
  await press('Alt+KeyD')
  await page.waitForTimeout(140)
}
await page.mouse.move(420, 520)
await page.mouse.down()
for (let i = 1; i <= 8; i++) await page.mouse.move(420 + i * 14, 520 + (i % 2 ? 10 : 0), { steps: 2 })
await page.mouse.up()
await press('Alt+KeyR')
await page.waitForTimeout(600)
s = await state()
if (s.mode !== 'preview') throw new Error(`Alt+R did not reach preview: ${s.mode} / ${s.status}`)
if (!s.confirmShown || !s.cancelShown) throw new Error('preview did not show ✓ Go / ✗ Cancel')
await press('Alt+KeyC')
s = await state()
if (s.mode === 'preview') throw new Error('Alt+C did not cancel the preview')
log('✓ Alt+R → preview · Alt+C cancels')

await press('Alt+KeyR')
await page.waitForTimeout(600)
if ((await state()).mode !== 'preview') throw new Error('second Alt+R did not preview')
await press('Alt+Enter')
await page.waitForTimeout(600)
s = await state()
if (!ranPost) throw new Error('Alt+Enter did not POST /@s2c/run')
if (s.mode !== 'running') throw new Error(`Alt+Enter did not start the run: ${s.mode}`)
await press('Escape') // the local escape hatch — the stub sends no SSE 'done'
if ((await state()).mode !== 'idle') throw new Error('Escape did not reset a running overlay')
await page.unroute('**/@s2c/interpret')
await page.unroute('**/@s2c/run')

await press('Alt+KeyX')
s = await state()
if (!s.runDisabled) throw new Error('Alt+X did not clear the drawing')
log('✓ Alt+Enter → run · Esc resets · Alt+X clears')

// ---- 5. the guards -----------------------------------------------------
// the host app's own inputs keep their keystrokes
await page.evaluate(() => {
  window.__hostKeys = 0
  document.addEventListener('keydown', () => { window.__hostKeys++ })
})
await page.click('input[data-s2c*="ContactForm"]', { timeout: 5000 }).catch(async () => {
  await page.click('form input')
})
await page.keyboard.press('Alt+KeyD')
await page.keyboard.type('dhrx')
s = await state()
if (s.mode === 'draw') throw new Error('Alt+D fired while typing in the host app')
const hostSaw = await page.evaluate(() => window.__hostKeys)
if (hostSaw < 5) throw new Error(`host app stopped seeing its own keystrokes (${hostSaw})`)

// …and an open note field keeps its own, from BOTH sides
// (click away first: the host input still holds focus, and the guard above
// is exactly what would otherwise swallow Alt+N)
await page.mouse.click(1210, 420)
await press('Alt+KeyN')
if (!(await state()).note) throw new Error('note field did not open')
// zero the counter only once the field is up: Alt+N itself is a page-level
// keystroke and the page is entitled to see it
await page.evaluate(() => { window.__hostKeys = 0 })
await page.keyboard.type('drxt')
await page.keyboard.press('Alt+KeyD')
await page.keyboard.press('Alt+KeyH')
s = await state()
if (s.mode === 'draw') throw new Error('a shortcut fired from inside the note field')
if (s.hudHidden) throw new Error('Alt+H fired from inside the note field')
if (!s.note) throw new Error('the note field closed on its own')
const leaked = await page.evaluate(() => window.__hostKeys)
if (leaked !== 0) throw new Error(`${leaked} note keystrokes leaked to the host app`)
await press('Escape')
log('✓ host inputs keep their keys · the note field leaks none (host saw', leaked + ')')

await b.close()
log('ALL KEYMAP CHECKS PASSED · screenshots in', SHOTS)

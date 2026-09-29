/**
 * Live e2e: THE COMMAND PALETTE — one key, then type what you want.
 *
 * The claim being tested is not "a panel opens". It is that someone who knows
 * what they want but not where it lives can get there by describing it: the
 * search has to be order-free, it has to teach the shortcut on the way past,
 * and running something has to actually DO it rather than merely close.
 *
 * Phases, all zero-token:
 *   1. Ctrl/⌘+K opens it, focused, listing everything the keymap knows
 *   2. typing filters; words in any order find the same row
 *   3. ↑/↓ move the selection and it stays on screen
 *   4. Enter runs the selected command, and the palette is gone before it runs
 *   5. every row shows its shortcut, so using this teaches the faster way
 *   6. Esc closes without running anything
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-commands.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-cmd]', ...a)
const KEY = process.platform === 'darwin' ? 'Meta+k' : 'Control+k'

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const cmd = () => sh(() => window.__S2C_DEBUG__.commands())
const mode = () => sh(() => document.getElementById('s2c-overlay-host').dataset.mode)
const rows = () =>
  sh(() => [...document.getElementById('s2c-overlay-host').shadowRoot
    .querySelectorAll('#cmdList .kRow')].map((r) => ({
    id: r.dataset.cmd,
    label: r.querySelector('.kLabel')?.textContent ?? '',
    keys: r.querySelector('.kKeys')?.textContent ?? '',
    selected: r.getAttribute('aria-selected') === 'true',
    ...(() => { const x = r.getBoundingClientRect(); return { y: Math.round(x.y), h: Math.round(x.height) } })(),
  })))

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. it opens, focused, listing everything ────────────────────────────
const binds = await sh(() => window.__S2C_DEBUG__.keymap())
await page.keyboard.press(KEY)
await page.waitForTimeout(250)
const open = await cmd()
log('open:', JSON.stringify({ open: open.open, matches: open.matches.length, of: binds.length }))
if (!open.open) throw new Error('Ctrl/⌘+K did not open the palette')
if (open.matches.length !== binds.length) {
  throw new Error(`palette lists ${open.matches.length} of ${binds.length} bindings`)
}
const focused = await sh(() => document.getElementById('s2c-overlay-host')
  .shadowRoot.activeElement?.id)
if (focused !== 'cmdInput') throw new Error(`the field is not focused (${focused}) — you'd have to click it`)

// ── 2. filtering, and word order must not matter ───────────────────────
await page.keyboard.type('pen colour')
await page.waitForTimeout(220)
const a = await cmd()
log('"pen colour" →', a.matches.join(', '))
if (!a.matches.includes('pen')) throw new Error(`"pen colour" did not find the pen: ${a.matches}`)
if (a.matches.length >= binds.length) throw new Error('typing did not narrow anything')

await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
  el.value = 'colour pen'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(220)
const bWords = await cmd()
log('"colour pen" →', bWords.matches.join(', '))
if (JSON.stringify(bWords.matches) !== JSON.stringify(a.matches)) {
  throw new Error('word order changed the result — the search is not order-free')
}

// nonsense says so rather than showing everything
await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
  el.value = 'zzzz'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(200)
if ((await cmd()).matches.length !== 0) throw new Error('a nonsense query still matched something')
const empty = await sh(() => document.getElementById('s2c-overlay-host').shadowRoot
  .getElementById('cmdEmpty')?.textContent ?? null)
if (!empty) throw new Error('an empty result shows nothing at all — it looks broken')
log('no match says:', JSON.stringify(empty))

// ── 3. arrows move the selection ───────────────────────────────────────
await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
  el.value = 'mode'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(200)
const before = await cmd()
if (before.matches.length < 3) throw new Error(`"mode" should match several: ${before.matches}`)
await page.keyboard.press('ArrowDown')
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(150)
const moved = await cmd()
log('after two ArrowDowns: index', moved.index, 'of', moved.matches.length)
if (moved.index !== 2) throw new Error(`ArrowDown moved to ${moved.index}, want 2`)
const sel = (await rows()).find((r) => r.selected)
if (!sel) throw new Error('nothing is marked selected, so Enter is a guess')
if (sel.y < 0 || sel.y > 900) throw new Error(`the selected row is off screen at y=${sel.y}`)
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(120)
if ((await cmd()).index !== 1) throw new Error('ArrowUp did not go back')

// ── 4. Enter runs it — and the palette is gone first ──────────────────
await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
  el.value = 'tweak'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(200)
const target = (await cmd()).matches[0]
log('running:', target)
await page.keyboard.press('Enter')
await page.waitForTimeout(400)
const after = await cmd()
if (after.open) throw new Error('the palette is still open over the thing it just started')
if ((await mode()) !== 'tweak') {
  throw new Error(`Enter closed the palette but did not run the command (mode is ${await mode()})`)
}
log('✓ Enter ran it and closed first · mode:', await mode())
await page.keyboard.press('Escape')

// ── 5. every row teaches its shortcut ─────────────────────────────────
await page.keyboard.press(KEY)
await page.waitForTimeout(250)
const listed = await rows()
const noKeys = listed.filter((r) => r.keys.trim().length === 0)
if (noKeys.length) throw new Error(`${noKeys.length} rows show no shortcut: ${noKeys.map((r) => r.id)}`)
if (listed.some((r) => r.h < 12)) throw new Error('a row is not rendered')
log('✓ every one of', listed.length, 'rows carries its shortcut, e.g.',
  JSON.stringify(`${listed[0].label} — ${listed[0].keys}`))

// ── 6. Esc closes, running nothing ───────────────────────────────────
const modeBefore = await mode()
await sh(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('cmdInput')
  el.value = 'clear the drawing'
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await page.waitForTimeout(200)
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
if ((await cmd()).open) throw new Error('Esc did not close the palette')
if ((await mode()) !== modeBefore) throw new Error('Esc ran the highlighted command on the way out')
log('✓ Esc closed it and ran nothing')

const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — one key, type what you want, Enter does it')

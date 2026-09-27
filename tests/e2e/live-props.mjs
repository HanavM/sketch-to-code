/**
 * Live e2e: PROPS PANEL — controls derived from the component's own types.
 *
 * What only a browser can prove: that clicking a bit of a component resolves to
 * the RIGHT component (the panel showing the wrong one's knobs would look
 * exactly like it working), that each type produces the control it should, that
 * turning a control edits the named call site and the page actually changes,
 * and that a prop no control can represent is visible-but-greyed rather than
 * silently dropped.
 *
 * Runs against PlanCard, the one component in the demo app with real props:
 * title (string), seats (number), featured (boolean), tone (enum), onPick (a
 * callback, which must be greyed with a reason).
 *
 * Phases, all zero-token:
 *   1. Alt+O with nothing selected says so instead of opening empty
 *   2. select inside PlanCard, Alt+O: the component, its call site, and one
 *      control per prop of the right sort
 *   3. the enum: pick "warn" → the card's classes change in the live page
 *   4. the number: 12 → 30 → the rendered text changes
 *   5. the boolean: false → true → the "Most popular" badge appears
 *   6. the string: an apostrophe in the value survives the round trip
 *   7. Ctrl+Z walks the edits back
 *   8. the panel follows the selection, and Esc closes it without deselecting
 *
 * Boot first: cd examples/demo-app && npx vite --port 5214
 * Run FROM THE REPO ROOT: node tests/e2e/live-props.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5214/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const APPTSX = `${REPO_ROOT}examples/demo-app/src/App.tsx`
const log = (...a) => console.log('[e2e-props]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

restore()
const APP_BEFORE = readFileSync(APPTSX, 'utf8')
if (!APP_BEFORE.includes('<PlanCard title="Team" seats={12} tone="accent" />')) {
  throw new Error('fixture drift: App.tsx no longer mounts PlanCard the way this test expects')
}

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const status = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const props = () => sh(() => window.__S2C_DEBUG__.props())

async function waitStatus(re, ms = 15000) {
  const deadline = Date.now() + ms
  let last = ''
  while (Date.now() < deadline) {
    last = await status()
    if (re.test(last)) return last
    await page.waitForTimeout(150)
  }
  throw new Error(`ASSERT: status never matched ${String(re)} — last: ${last}`)
}

async function waitProps(pred, what, ms = 15000) {
  const deadline = Date.now() + ms
  let last = null
  while (Date.now() < deadline) {
    last = await props()
    if (pred(last)) return last
    await page.waitForTimeout(200)
  }
  throw new Error(`ASSERT: timed out waiting for ${what} — last: ${JSON.stringify(last)}`)
}

/** The live PlanCard: its classes, its rendered numbers, its badge. */
const card = () =>
  sh(() => {
    // by its own text, not by its heading: UserTable's heading is "Team
    // members", which matched a looser selector and made every reading here
    // describe the wrong section while the assertions still passed
    const section = [...document.querySelectorAll('section')]
      .find((s) => s.textContent.includes('seats included'))
    if (!section) return null
    const h = section.querySelector('h2')
    return {
      title: h?.textContent.trim() ?? '',
      cls: section.className,
      seats: section.querySelector('p')?.textContent.trim() ?? '',
      badge: !![...section.querySelectorAll('span')].find((s) => s.textContent.includes('Most popular')),
    }
  })

/** A control inside the panel, by prop name. */
const ctl = (name) =>
  sh((n) => {
    const body = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('propsBody')
    const row = [...body.querySelectorAll('.pRow')].find((r) => r.querySelector('.pName').textContent.replace('?', '') === n)
    if (!row) return null
    const el = row.querySelector('input, select')
    return { tag: el.tagName.toLowerCase(), type: el.type ?? null, value: el.value, checked: el.checked ?? null,
      disabled: el.disabled, options: [...(el.options ?? [])].map((o) => o.value) }
  }, name)

/** Set a control the way a person would, and let the change event fire. */
const setCtl = (name, value) =>
  sh(({ n, v }) => {
    const body = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('propsBody')
    const row = [...body.querySelectorAll('.pRow')].find((r) => r.querySelector('.pName').textContent.replace('?', '') === n)
    const el = row.querySelector('input, select')
    if (el.type === 'checkbox') el.checked = v
    else el.value = String(v)
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, { n: name, v: value })

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. nothing selected ───────────────────────────────────────────────────
const bind = await sh(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'props'))
if (!bind) throw new Error('ASSERT: Alt+O is not in the keymap')
log('keymap:', bind.keys, '·', bind.label)
await page.keyboard.press('Alt+t') // tweak mode, nothing selected yet
await page.keyboard.press('Alt+o')
log('with nothing selected:', await status())
if ((await props()).open) throw new Error('ASSERT: the panel opened with nothing to read')
if (!/select something first/.test(await status())) {
  throw new Error('ASSERT: it did not say why it stayed shut')
}

// ── 2. select inside PlanCard and open ───────────────────────────────────
const before = await card()
log('card before:', JSON.stringify(before))
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'Team')
  h.scrollIntoView({ block: 'center' })
})
await page.waitForTimeout(300)
const seatsBox = await sh(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'Team')
  const p = h.closest('section').querySelector('p')
  const r = p.getBoundingClientRect()
  return { x: r.left + 8, y: r.top + r.height / 2, stamp: p.dataset.s2c }
})
await page.mouse.click(seatsBox.x, seatsBox.y)
await page.waitForTimeout(200)
log('selected:', (await status()).slice(0, 70))
await page.keyboard.press('Alt+o')
const read = await waitProps((p) => p.open && p.component, 'the panel to read the component')
log('component:', read.component, '· call site:', read.site)
log('values:', JSON.stringify(read.values))
if (read.component !== 'PlanCard') {
  throw new Error(`ASSERT: clicking inside PlanCard resolved to ${read.component}`)
}
if (!/App\.tsx/.test(read.site ?? '')) throw new Error(`ASSERT: wrong call site: ${read.site}`)
for (const p of read.specs) log(`  ${p.name}: ${p.kind}${p.editable ? '' : ` (greyed — ${p.why})`}`)
const kinds = Object.fromEntries(read.specs.map((p) => [p.name, p.kind]))
if (kinds.title !== 'string' || kinds.seats !== 'number' || kinds.featured !== 'boolean' || kinds.tone !== 'enum') {
  throw new Error(`ASSERT: the kinds are wrong: ${JSON.stringify(kinds)}`)
}
const onPick = read.specs.find((p) => p.name === 'onPick')
if (!onPick || onPick.editable) throw new Error('ASSERT: a callback prop was offered as editable')
if (!/callback/.test(onPick.why ?? '')) throw new Error(`ASSERT: no reason given for onPick: ${onPick.why}`)

// the controls themselves, not just the specs
const toneCtl = await ctl('tone')
log('tone control:', JSON.stringify(toneCtl))
if (toneCtl.tag !== 'select') throw new Error('ASSERT: a union of string literals is not a dropdown')
if (!toneCtl.options.includes('warn')) throw new Error('ASSERT: the dropdown is missing the type’s options')
if (toneCtl.value !== 'accent') throw new Error(`ASSERT: the dropdown does not show the current value: ${toneCtl.value}`)
if ((await ctl('seats')).type !== 'number') throw new Error('ASSERT: a number prop is not a number field')
if ((await ctl('featured')).type !== 'checkbox') throw new Error('ASSERT: a boolean prop is not a checkbox')
if ((await ctl('title')).type !== 'text') throw new Error('ASSERT: a string prop is not a text field')

// ── 3. the enum ──────────────────────────────────────────────────────────
await setCtl('tone', 'warn')
log('tone →', await waitStatus(/^[✓✗]/))
await page.waitForFunction(() => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'Team')
  return h?.closest('section')?.className.includes('amber')
}, { timeout: 10000 })
log('card classes now:', (await card()).cls)
if (!readFileSync(APPTSX, 'utf8').includes('tone="warn"')) throw new Error('ASSERT: App.tsx does not say warn')

// ── 4. the number ────────────────────────────────────────────────────────
await setCtl('seats', 30)
await waitStatus(/^[✓✗]/)
await page.waitForFunction(() => document.body.textContent.includes('30 seats included'), { timeout: 10000 })
log('seats now:', (await card()).seats)
if (!readFileSync(APPTSX, 'utf8').includes('seats={30}')) {
  throw new Error('ASSERT: a number was not written as an expression')
}

// ── 5. the boolean ───────────────────────────────────────────────────────
await setCtl('featured', true)
await waitStatus(/^[✓✗]/)
await page.waitForFunction(() => document.body.textContent.includes('Most popular'), { timeout: 10000 })
log('badge showing:', (await card()).badge)
const appNow = readFileSync(APPTSX, 'utf8')
if (!/featured(\s|\/|>)/.test(appNow)) throw new Error('ASSERT: a true boolean was not written as the bare prop')

// ── 6. the string, with a character that has to survive quoting ─────────
await setCtl('title', "Ada's Squad")
await waitStatus(/^[✓✗]/)
await page.waitForFunction(() => document.body.textContent.includes("Ada's Squad"), { timeout: 10000 })
log('title now:', (await card()).title)

// ── 7. undo ──────────────────────────────────────────────────────────────
for (let i = 0; i < 4; i++) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await page.waitForTimeout(700)
}
await page.waitForFunction(() => document.body.textContent.includes('12 seats included'), { timeout: 10000 })
const restored = readFileSync(APPTSX, 'utf8')
log('after four undos, App.tsx matches the original:', restored === APP_BEFORE)
if (restored !== APP_BEFORE) {
  throw new Error(`ASSERT: undo did not walk every prop edit back:\n${restored.split('\n').find((l) => l.includes('PlanCard title'))}`)
}

// ── 8. it follows the selection, and Esc closes it ──────────────────────
await page.waitForTimeout(500)
// scroll BEFORE measuring: coordinates taken in one scroll position and
// clicked in another land on whatever happens to be there instead
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(300)
const navLink = await sh(() => {
  const a = document.querySelector('nav a')
  const r = a.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
})
await page.mouse.click(navLink.x, navLink.y)
const moved = await waitProps((p) => p.component && p.component !== 'PlanCard', 'the panel to follow the selection')
log('selection moved → panel now reads:', moved.component)
if (moved.component !== 'Navbar') throw new Error(`ASSERT: the panel followed to ${moved.component}`)

await page.keyboard.press('Escape')
const closed = await waitProps((p) => !p.open, 'the panel to close')
log('Esc closed the panel, selection kept:', !closed.open)
if (!/^a · |^a\b/.test(await status()) && /deselected/.test(await status())) {
  throw new Error('ASSERT: Esc closed the panel AND dropped the selection')
}

restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — types became controls, each control wrote a real edit, and the callback stayed greyed')

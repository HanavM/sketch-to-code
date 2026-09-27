/**
 * Live e2e: RESPONSIVE BY DEMONSTRATION — rearrange at a width, get that
 * breakpoint.
 *
 * The assertion that matters is the mobile-first one, and it can only be made
 * against a real browser and a real Tailwind build: after demonstrating at
 * PHONE width, the element must look demonstrated at 420px AND unchanged at
 * 1280px. Every other check here is scaffolding for that one.
 *
 * Phases, all zero-token:
 *   1. Alt+M is listed; the chip appears and names the band and where the
 *      breakpoints came from
 *   2. the chip follows the window as it is resized
 *   3. demonstrate at 420px: drag a card's gap/size, and the class lands
 *      unprefixed with the OLD value pushed up to sm:
 *   4. the proof: at 1280px the element measures what it always did; at 420px
 *      it measures the demonstrated value
 *   5. demonstrate at 1280px: the class lands prefixed, base untouched
 *   6. Alt+M off: an ordinary drag writes an ordinary class again
 *
 * Boot first: cd examples/demo-app && npx vite --port 5215
 * Run FROM THE REPO ROOT: node tests/e2e/live-responsive.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5215/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const FORM = `${REPO_ROOT}examples/demo-app/src/components/ContactForm.tsx`
const log = (...a) => console.log('[e2e-resp]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

restore()
const FORM_BEFORE = readFileSync(FORM, 'utf8')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const status = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const resp = () => sh(() => window.__S2C_DEBUG__.responsive())
const chip = () =>
  sh(() => {
    const c = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('bandChip')
    return { shown: c.style.display !== 'none', text: c.textContent, title: c.title }
  })

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

/**
 * How the form actually measures at this width.
 *
 * Deliberately a bundle rather than one property: tweak mode decides which
 * utility a drag means (this drag lands on the top margin, not the row gap),
 * and a test pinned to one property would assert nothing while looking like it
 * asserted everything.
 */
const formBox = () =>
  sh(() => {
    const f = document.querySelector('form')
    const cs = getComputedStyle(f)
    return { marginTop: cs.marginTop, rowGap: cs.rowGap, paddingTop: cs.paddingTop, cls: f.className }
  })
const same = (a, b) =>
  a.marginTop === b.marginTop && a.rowGap === b.rowGap && a.paddingTop === b.paddingTop

/** The unprefixed utility that the demonstration replaced, if any. */
const replaced = (before, after) => {
  const now = new Set(after.split(/\s+/).filter(Boolean))
  return before.split(/\s+/).filter((c) => c && !c.includes(':') && !now.has(c))
}

/**
 * Make sure the <form> is the selection.
 *
 * Checked against the overlay's own state, not the status line: after an undo
 * the form is still selected (the overlay re-resolves it through the remount),
 * so a click then lands on its spacing zone and correctly announces nothing —
 * a status-text check would read that as a failure to select.
 */
const selected = () => sh(() => window.__S2C_DEBUG__.paint())

async function selectForm() {
  for (let attempt = 0; attempt < 4; attempt++) {
    if ((await selected()).tag === 'form') return
    const at = await sh(() => {
      const f = document.querySelector('form')
      if (!f) return null
      const r = f.getBoundingClientRect()
      const first = f.children[0].getBoundingClientRect()
      return { x: r.left + 4, y: first.bottom + 6 }
    })
    // re-measured every attempt: an undo triggers HMR, and a rect taken while
    // React is swapping the form out aims the click where the form used to be
    if (at) {
      await page.mouse.click(at.x, at.y)
      await page.waitForTimeout(350)
    }
    if ((await selected()).tag === 'form') return
    await page.waitForTimeout(500)
  }
  throw new Error(`ASSERT: could not select the form — selection: ${JSON.stringify(await selected())}`)
}

/** Drag the form's gap band, which is how tweak mode edits spacing. */
async function dragGap(dy) {
  const band = await sh(() => {
    const f = document.querySelector('form')
    const first = f.children[0].getBoundingClientRect()
    const r = f.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: first.bottom + 8 }
  })
  await page.mouse.move(band.x, band.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(band.x, band.y + (dy * i) / 8)
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. the toggle, the chip, and where the numbers came from ──────────────
const bind = await sh(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'responsive'))
if (!bind) throw new Error('ASSERT: Alt+M is not in the keymap')
log('keymap:', bind.keys, '·', bind.label)
if ((await chip()).shown) throw new Error('ASSERT: the band chip is showing before the mode is on')

await page.keyboard.press('Alt+m')
const on = await (async () => {
  // the breakpoints are fetched from the dev server, so the band is only
  // meaningful once they have landed
  const deadline = Date.now() + 10000
  while (Date.now() < deadline) {
    const r = await resp()
    if (r.screens) return r
    await page.waitForTimeout(150)
  }
  throw new Error('ASSERT: the overlay never learned the project’s breakpoints')
})()
log('on at 1280px:', JSON.stringify({ band: on.band, screens: on.screens, source: on.source }))
if (!on.on) throw new Error('ASSERT: Alt+M did not turn the mode on')
if (on.band !== 'xl') throw new Error(`ASSERT: 1280px is the xl band, got ${on.band}`)
const c1 = await chip()
log('chip:', c1.text, '·', c1.title)
if (!c1.shown) throw new Error('ASSERT: the chip is not visible while the mode is on')
if (!/Tailwind defaults|@theme|tailwind\.config/.test(c1.title)) {
  throw new Error(`ASSERT: the chip does not say where the breakpoints came from: ${c1.title}`)
}
log('announced:', await status())

// ── 2. the chip follows the window ───────────────────────────────────────
await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(400)
const narrow = await resp()
const c2 = await chip()
log('at 420px: band', narrow.band, '· chip', c2.text)
if (narrow.band !== 'base') throw new Error(`ASSERT: 420px is below the smallest screen, got ${narrow.band}`)
if (!/640/.test(c2.text)) throw new Error(`ASSERT: the chip does not say what "base" means: ${c2.text}`)

// ── 3. demonstrate at phone width ───────────────────────────────────────
await page.keyboard.press('Alt+t')
const wideBefore = await formBox()
await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(300)
const narrowBefore = await formBox()
log('form before — classes:', narrowBefore.cls)
if (!/mt-4|space-y-4/.test(narrowBefore.cls)) {
  throw new Error(`fixture drift: the form no longer carries the classes this test demonstrates over: ${narrowBefore.cls}`)
}
await selectForm()
await dragGap(24)
const receipt = await waitStatus(/^[✓✗]|below|from \d+px/)
log('receipt:', receipt)
if (/^✗/.test(receipt)) throw new Error(`ASSERT: the demonstration was refused: ${receipt}`)
if (!/below 640px/.test(receipt)) {
  throw new Error(`ASSERT: the receipt does not say which widths this applies to: ${receipt}`)
}
const src = readFileSync(FORM, 'utf8')
const formLine = src.split('\n').find((l) => l.includes('<form'))
log('source now:', formLine.trim())
if (!/sm:/.test(formLine)) {
  throw new Error('ASSERT: demonstrating at phone width did not push the old value up to sm:')
}
// whatever the drag replaced must reappear at sm:, so wider screens keep it —
// checked generically, because which utility a drag means is tweak mode's call
const gone = replaced(narrowBefore.cls, formLine.match(/className="([^"]+)"/)[1])
log('the demonstration replaced:', gone.join(', ') || '(nothing)')
if (gone.length === 0) throw new Error('ASSERT: nothing was replaced, so nothing was demonstrated')
for (const u of gone) {
  if (!formLine.includes(`sm:${u}`)) {
    throw new Error(`ASSERT: ${u} was dropped instead of pushed up to sm: — ${formLine}`)
  }
}

// ── 4. the proof: narrow changed, wide did not ──────────────────────────
const narrowAfter = await formBox()
log('at 420px:', JSON.stringify(narrowAfter).slice(0, 120))
if (same(narrowAfter, narrowBefore)) {
  throw new Error('ASSERT: the demonstrated width did not actually change')
}
await page.setViewportSize({ width: 1280, height: 900 })
await page.waitForTimeout(500)
const wideAfter = await formBox()
log('at 1280px:', JSON.stringify(wideAfter).slice(0, 120))
if (!same(wideAfter, wideBefore)) {
  throw new Error(
    'ASSERT: THE mobile-first bug — demonstrating on a phone changed the desktop too: ' +
    `${JSON.stringify(wideBefore)} → ${JSON.stringify(wideAfter)}`,
  )
}
log('✓ phone demonstration left the desktop untouched')

// ── 5. demonstrate at desktop width ─────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
await page.waitForTimeout(600)
if (readFileSync(FORM, 'utf8') !== FORM_BEFORE) throw new Error('ASSERT: undo did not restore the form')

await selectForm()
await dragGap(24)
const receipt2 = await waitStatus(/^[✓✗]|from \d+px/)
log('desktop receipt:', receipt2)
const line2 = readFileSync(FORM, 'utf8').split('\n').find((l) => l.includes('<form'))
log('source now:', line2.trim())
if (!/xl:/.test(line2)) throw new Error(`ASSERT: a 1280px demonstration was not written as xl: ${line2}`)
// a wide demonstration must ADD a prefixed class and take nothing away
if (replaced(narrowBefore.cls, line2.match(/className="([^"]+)"/)[1]).length > 0) {
  throw new Error(`ASSERT: a desktop demonstration removed what narrow widths had: ${line2}`)
}
await page.setViewportSize({ width: 420, height: 900 })
await page.waitForTimeout(500)
const narrowStill = await formBox()
log('at 420px after a desktop demonstration:', JSON.stringify(narrowStill).slice(0, 120))
if (!same(narrowStill, narrowBefore)) {
  throw new Error(`ASSERT: a desktop demonstration changed the phone: ${JSON.stringify(narrowStill)}`)
}

// ── 6. off again ────────────────────────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
await page.waitForTimeout(600)
await page.setViewportSize({ width: 1280, height: 900 })
await page.waitForTimeout(400)
await page.keyboard.press('Alt+m')
log('off:', await status())
if ((await resp()).on) throw new Error('ASSERT: Alt+M did not turn it off')
if ((await chip()).shown) throw new Error('ASSERT: the chip stayed after the mode was turned off')
await selectForm()
await dragGap(24)
const receipt3 = await waitStatus(/^[✓✗]/)
log('plain receipt:', receipt3)
const line3 = readFileSync(FORM, 'utf8').split('\n').find((l) => l.includes('<form'))
log('source now:', line3.trim())
if (/xl:|sm:/.test(line3)) throw new Error(`ASSERT: an ordinary drag wrote a breakpoint: ${line3}`)

restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — demonstrating at a width writes that breakpoint, and the other widths keep what they had')

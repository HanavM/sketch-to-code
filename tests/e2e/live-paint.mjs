/**
 * Live e2e: PAINT — recolouring one shape inside generated artwork.
 *
 * Canva mode could move and resize boxes but never reach inside a drawing:
 * changing one line of a sketched face meant another model run. Every JSX host
 * element is stamped, so every <path> already carries its own file:line:col —
 * which makes a shape as addressable as a card, and recolouring it an
 * attribute edit. Zero model calls, so the whole flow runs in seconds.
 *
 * Phases, against the demo app's background flourish (a fill:none line-art
 * <path> inside a pointer-events:none <svg> — i.e. the hard case, since
 * document.elementFromPoint NEVER returns it):
 *   1. a click on the drawn line selects THE PATH, not the div behind it, and
 *      the popover opens beside the shape rather than in the HUD
 *   2. a swatch writes the colour into source and the page hot-reloads with it
 *      — asserted on the COMPUTED stroke, not the attribute
 *   3. three recolours in a row are three edits, and the selection survives
 *      each HMR remount
 *   4. Ctrl+Z reverts the last one
 *   5. Esc closes the popover BEFORE the rest of the ladder — the shape stays
 *      selected; the second Esc deselects
 *   6. a shape painted by an expression is refused, with the reason on the
 *      status line
 *   7. the new binding (Alt+K) is listed in ? like every other binding
 *
 * The demo app is edited for real, so it is restored in a finally.
 *
 * Boot first (port 5206 — 5199 belongs to the interactive session):
 *   cd examples/demo-app && npx vite --port 5206
 * Run FROM THE REPO ROOT: node tests/e2e/live-paint.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5206/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const FLOURISH = `${REPO_ROOT}examples/demo-app/src/components/BackgroundFlourish.tsx`
const log = (...a) => console.log('[e2e-paint]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })
const read = () => readFileSync(FLOURISH, 'utf8')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

const status = () =>
  page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent,
  )
const paintState = () => page.evaluate(() => window.__S2C_DEBUG__.paint())

/** Wait for a ✓/✗ receipt on the status line. */
async function waitReceipt(label, { expectFail = false } = {}) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const st = await status()
    if (st.startsWith('✓') || st.startsWith('✗')) {
      log(`${label}:`, st)
      if (expectFail && st.startsWith('✓')) throw new Error(`${label}: expected a refusal, got ${st}`)
      if (!expectFail && !st.startsWith('✓')) throw new Error(`${label} failed: ${st}`)
      if (!expectFail && !/0 tokens/.test(st)) throw new Error(`${label}: receipt missing zero-token proof`)
      return st
    }
    await page.waitForTimeout(150)
  }
  throw new Error(`${label}: no receipt (status: ${await status()})`)
}

/** The flourish path's live computed stroke, after HMR has settled. */
const computedStroke = () =>
  page.evaluate(
    () => getComputedStyle(document.querySelector('svg path[data-s2c*="BackgroundFlourish"]')).stroke,
  )

async function waitStroke(want, label) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    if ((await computedStroke()) === want) return
    await page.waitForTimeout(150)
  }
  throw new Error(`${label}: page paints ${await computedStroke()}, expected ${want}`)
}

const rgbOf = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`

/** Click a swatch by its hex (in-page: the panel lives in a shadow root). */
const clickSwatch = (hex) =>
  page.evaluate((c) => {
    const root = document.getElementById('s2c-overlay-host').shadowRoot
    const sw = root.getElementById('paintRow').querySelector(`.swatch[data-color="${c}"]`)
    if (!sw) throw new Error(`no swatch ${c} in the palette`)
    sw.click()
  }, hex)

const press = (key, code) =>
  page.evaluate(
    ({ key, code }) => window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true })),
    { key, code },
  )

try {
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => {
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click()
  })

  // ---- 1. the click lands on the SHAPE, not on the box behind it ----------
  // A point exactly on the drawn line, computed from the path's own geometry.
  const aim = await page.evaluate(() => {
    const p = document.querySelector('svg path[data-s2c*="BackgroundFlourish"]')
    const u = p.getPointAtLength(p.getTotalLength() * 0.5)
    const q = new DOMPoint(u.x, u.y).matrixTransform(p.getScreenCTM())
    const x = Math.round(q.x)
    const y = Math.round(q.y)
    const under = document.elementFromPoint(x, y)
    return { x, y, s2c: p.dataset.s2c, underTag: under?.tagName, underS2c: under?.dataset?.s2c ?? null }
  })
  log('aiming at', `${aim.x},${aim.y}`, '— the browser says that point is',
    `<${aim.underTag.toLowerCase()}> ${aim.underS2c}`)
  if (aim.underTag.toLowerCase() === 'path') {
    throw new Error('fixture drift: the flourish svg is hit-testable, so this proves nothing')
  }
  await page.mouse.click(aim.x, aim.y)
  await page.waitForTimeout(300)

  const sel = await paintState()
  log('selected:', JSON.stringify(sel))
  if (sel.tag !== 'path') throw new Error(`ASSERT: selected <${sel.tag}>, expected the <path>`)
  if (!sel.shape) throw new Error('ASSERT: the selection is not flagged as a paintable shape')
  if (sel.srcLoc !== aim.s2c) throw new Error(`ASSERT: selected ${sel.srcLoc}, aimed at ${aim.s2c}`)
  if (sel.srcLoc === aim.underS2c) throw new Error('ASSERT: selected the container, not the shape')
  if (!sel.open) throw new Error('ASSERT: the paint popover did not open with the shape')
  // line art: fill is none, so the palette must open on the prop that paints it
  if (sel.prop !== 'stroke') throw new Error(`ASSERT: opened on ${sel.prop}, expected stroke on line art`)

  const line = await status()
  log('status:', line)
  if (!/^picked up a shape\b.*click a colour to paint it/.test(line)) {
    throw new Error(`ASSERT: the status line does not say what is selected: ${line}`)
  }

  // the popover belongs NEXT TO the shape — not in the bar, which is a pill
  // with a documented width budget
  const anchor = await page.evaluate(() => {
    const root = document.getElementById('s2c-overlay-host').shadowRoot
    const panel = root.getElementById('paintPanel')
    const p = panel.getBoundingClientRect()
    const s = document.querySelector('svg path[data-s2c*="BackgroundFlourish"]').getBoundingClientRect()
    return {
      inHud: root.getElementById('hud').contains(panel),
      hudW: root.getElementById('hud').getBoundingClientRect().width,
      gapX: Math.round(p.left - s.right),
      dy: Math.round(p.top - s.top),
      w: Math.round(p.width),
      swatches: [...panel.querySelectorAll('.swatch')].map((x) => x.dataset.color),
      hasCustom: !!root.getElementById('paintCustom'),
      props: [...panel.querySelectorAll('.qSegBtn')].map((x) => `${x.textContent}${x.classList.contains('on') ? '*' : ''}`),
    }
  })
  log('popover:', JSON.stringify(anchor))
  if (anchor.inHud) throw new Error('ASSERT: the paint popover is inside the HUD')
  if (Math.abs(anchor.gapX) > 40 || Math.abs(anchor.dy) > 40) {
    throw new Error(`ASSERT: the popover is not anchored to the shape (gapX ${anchor.gapX}, dy ${anchor.dy})`)
  }
  if (anchor.swatches.length < 4) throw new Error('ASSERT: too few sampled swatches to paint with')
  if (!anchor.swatches.every((c) => /^#[0-9a-f]{6}$/.test(c))) {
    throw new Error(`ASSERT: swatches must be plain hex the server can parse: ${anchor.swatches.join(',')}`)
  }
  if (!anchor.hasCustom) throw new Error('ASSERT: no colour input for anything off the palette')
  if (anchor.props.join(',') !== 'fill,stroke*') {
    throw new Error(`ASSERT: fill/stroke row is wrong: ${anchor.props.join(',')}`)
  }

  // ---- 2. a swatch paints it, in source and on screen --------------------
  const before = read()
  if (!before.includes('stroke="currentColor"')) throw new Error('fixture drift: no literal stroke to paint')
  const wasPainting = await computedStroke()
  const c1 = anchor.swatches.find((c) => c !== '#ffffff' && c !== '#000000') ?? anchor.swatches[0]
  await clickSwatch(c1)
  await waitReceipt('paint 1')
  await waitStroke(rgbOf(c1), 'paint 1')
  log('the page repainted', wasPainting, '→', await computedStroke())
  const after1 = read()
  if (!after1.includes(`stroke="${c1}"`)) throw new Error(`ASSERT: source has no stroke="${c1}"`)
  if (after1.replace(`stroke="${c1}"`, 'stroke="currentColor"') !== before) {
    throw new Error('ASSERT: the edit touched more than the one attribute')
  }

  // ---- 3. stacking: ten in a row would be ten edits, not one -------------
  const c2 = anchor.swatches.find((c) => c !== c1)
  const c3 = anchor.swatches.find((c) => c !== c1 && c !== c2)
  for (const [n, c] of [[2, c2], [3, c3]]) {
    const live = await paintState()
    if (!live.open || live.srcLoc !== aim.s2c) {
      throw new Error(`ASSERT: the selection did not survive the remount before paint ${n}: ${JSON.stringify(live)}`)
    }
    await clickSwatch(c)
    await waitReceipt(`paint ${n}`)
    await waitStroke(rgbOf(c), `paint ${n}`)
  }
  if (!read().includes(`stroke="${c3}"`)) throw new Error(`ASSERT: the third paint did not land (${c3})`)
  log('three recolours landed:', c1, '→', c2, '→', c3)

  // ---- 3b. the colour input reaches past the sampled palette -------------
  const custom = '#7c3aed'
  await page.evaluate((c) => {
    const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('paintCustom')
    el.value = c
    // 'change', not 'input': the native picker fires input on every drag of
    // its gradient, and each of those would be an edit and an undo step
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, custom)
  await waitReceipt('custom colour')
  await waitStroke(rgbOf(custom), 'custom colour')
  if (!read().includes(`stroke="${custom}"`)) throw new Error('ASSERT: the colour input did not reach source')

  // the popover open beside the shape it paints — looked at, not just asserted
  await page.screenshot({ path: process.env.S2C_SHOT ?? '/tmp/s2c-paint-popover.png' })

  // ---- 4. Ctrl+Z reverts the last one ------------------------------------
  await page.evaluate(() =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', metaKey: true, bubbles: true })))
  const undoDeadline = Date.now() + 15000
  while (Date.now() < undoDeadline && !read().includes(`stroke="${c3}"`)) await page.waitForTimeout(200)
  log('after undo:', await status())
  if (!read().includes(`stroke="${c3}"`)) {
    throw new Error(`ASSERT: Ctrl+Z did not walk the paint back to ${c3}`)
  }

  // ---- 5. Esc closes the popover BEFORE anything else --------------------
  await press('Escape', 'Escape')
  await page.waitForTimeout(150)
  const afterEsc = await paintState()
  const stillSelected = await page.evaluate(() => window.__S2C_DEBUG__.selRect())
  log('after Esc #1:', JSON.stringify(afterEsc), '· selection rect:', JSON.stringify(stillSelected))
  if (afterEsc.open) throw new Error('ASSERT: Esc did not close the paint popover')
  if (!stillSelected) throw new Error('ASSERT: Esc dropped the shape selection along with the popover')
  await press('Escape', 'Escape')
  await page.waitForTimeout(150)
  if (await page.evaluate(() => window.__S2C_DEBUG__.selRect())) {
    throw new Error('ASSERT: the second Esc did not deselect')
  }

  // ---- 5b. an ordinary element is still an ordinary selection ------------
  const card = await page.evaluate(() => {
    const el = document.querySelector('section[data-s2c*="StatCards"] > div')
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + 8), y: Math.round(r.top + 8) }
  })
  await page.mouse.click(card.x, card.y)
  await page.waitForTimeout(250)
  const boxSel = await paintState()
  log('an ordinary element:', JSON.stringify(boxSel), '·', await status())
  if (boxSel.shape || boxSel.open) throw new Error('ASSERT: a box selection opened the paint popover')
  if (!/drag it to move, pull a corner to resize/.test(await status())) {
    throw new Error('ASSERT: the ordinary selection lost its own status line')
  }

  // ---- 6. an expression is refused, out loud -----------------------------
  // No demo shape is painted dynamically, so plant one: this is the case the
  // server cannot serve, and silence is the wrong way to say so.
  restore()
  writeFileSync(
    FLOURISH,
    read()
      .replace('const curve =', "const accent = '#dc2626'\nconst curve =")
      .replace(
        '<path d={curve} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />\n      </svg>',
        '<path d={curve} stroke="currentColor" strokeWidth="2" strokeLinecap="round" />\n' +
        '        <path d="M6 30 L72 130" stroke={accent} strokeWidth="9" strokeLinecap="round" />\n      </svg>',
      ),
  )
  const dynDeadline = Date.now() + 15000
  let dyn = null
  while (Date.now() < dynDeadline && !dyn) {
    dyn = await page.evaluate(() => {
      const p = [...document.querySelectorAll('svg path[data-s2c*="BackgroundFlourish"]')]
        .find((e) => getComputedStyle(e).stroke === 'rgb(220, 38, 38)')
      if (!p) return null
      const u = p.getPointAtLength(p.getTotalLength() * 0.5)
      const q = new DOMPoint(u.x, u.y).matrixTransform(p.getScreenCTM())
      return { x: Math.round(q.x), y: Math.round(q.y), s2c: p.dataset.s2c }
    })
    if (!dyn) await page.waitForTimeout(300)
  }
  if (!dyn) throw new Error('setup: the dynamic-stroke shape never mounted')
  log('dynamic shape at', `${dyn.x},${dyn.y}`, dyn.s2c)
  await page.mouse.click(dyn.x, dyn.y)
  await page.waitForTimeout(300)
  const dynSel = await paintState()
  if (dynSel.srcLoc !== dyn.s2c) throw new Error(`ASSERT: selected ${dynSel.srcLoc}, wanted ${dyn.s2c}`)
  // anything but the colour it already is — a no-op repaint would pass for the
  // wrong reason
  const dynSwatch = await page.evaluate(
    () => [...document.getElementById('s2c-overlay-host').shadowRoot
      .getElementById('paintRow').querySelectorAll('.swatch')]
      .map((s) => s.dataset.color).find((c) => c !== '#dc2626'),
  )
  await clickSwatch(dynSwatch)
  const refusal = await waitReceipt('refusal', { expectFail: true })
  if (!/expression/.test(refusal)) {
    throw new Error(`ASSERT: the refusal does not say WHY: ${refusal}`)
  }
  if (!read().includes('stroke={accent}')) {
    throw new Error('ASSERT: a refused paint still rewrote the expression')
  }

  // ---- 7. the new binding is documented ----------------------------------
  const bind = await page.evaluate(
    () => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'paint') ?? null,
  )
  const listed = await page.evaluate(() => {
    const root = document.getElementById('s2c-overlay-host').shadowRoot
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }))
    const row = root.getElementById('help').querySelector('.hRow[data-bind="paint"]')
    return row ? row.textContent : null
  })
  log('binding:', JSON.stringify(bind), '· help row:', listed)
  if (!bind || bind.keys !== 'Alt+K') throw new Error('ASSERT: no Alt+K binding in the keymap')
  if (!listed || !listed.includes('Alt+K')) throw new Error('ASSERT: ? does not list the paint binding')

  log('ALL PAINT CHECKS PASSED')
} finally {
  await b.close()
  restore()
}

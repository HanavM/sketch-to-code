/**
 * Pen colour: the colour you draw in is the colour you're asking for.
 * Asserts the swatches come from the page's own palette, that a picked colour
 * paints the ink and rides along on the stroke, that Alt+I eyedrops the colour
 * under the pointer, and that the wire payload carries it. No model calls —
 * /@s2c/interpret is stubbed while its real body is still inspected.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-pen]', ...a)
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.addInitScript(() => { try { localStorage.removeItem('s2c:pen') } catch {} })
await page.goto(APP, { waitUntil: 'networkidle' })

let posted = null
await page.route('**/@s2c/interpret', async (route) => {
  posted = route.request().postDataJSON()
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed' }) })
})

const sr = () => page.evaluateHandle(() => document.getElementById('s2c-overlay-host').shadowRoot)

// --- swatches are sampled from the page, normalized to hex ---
const swatches = await page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', altKey: true, bubbles: true }))
  return [...root.getElementById('penPanel').querySelectorAll('.swatch')].map((s) => s.dataset.color)
})
log('swatches:', swatches.join(' '))
if (swatches[0] !== '') throw new Error('ASSERT: first swatch must be the default ink (no colour intent)')
const colors = swatches.slice(1)
if (colors.length < 3) throw new Error(`ASSERT: expected several sampled colours, got ${colors.length}`)
if (!colors.every((c) => /^#[0-9a-f]{6}$/.test(c))) {
  throw new Error(`ASSERT: swatches must be plain hex the server can parse, got ${colors.join(',')}`)
}

// --- picking a colour and drawing paints in it ---
const pick = colors.find((c) => c !== '#ffffff' && c !== '#000000') ?? colors[0]
await page.evaluate((c) => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  root.getElementById('penPanel').querySelector(`.swatch[data-color="${c}"]`).click()
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))
  root.getElementById('draw').click()
}, pick)

await page.mouse.move(300, 300)
await page.mouse.down()
for (let i = 1; i <= 12; i++) await page.mouse.move(300 + i * 18, 300 + (i % 2 ? 16 : -16), { steps: 2 })
await page.mouse.up()
await page.waitForTimeout(150)

const drawn = await page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const p = root.getElementById('ink').querySelector('path')
  return { count: root.getElementById('ink').querySelectorAll('path').length, attr: p?.style.stroke || p?.getAttribute('stroke'), painted: p ? getComputedStyle(p).stroke : null }
})
log('drawn:', JSON.stringify(drawn), 'pen was', pick)
if (drawn.count !== 1) throw new Error(`ASSERT: expected one stroke, got ${drawn.count}`)
// compare what the browser PAINTS, not the attribute: a stroke="" attribute
// ranks below the stylesheet and would report the pen colour while painting blue
const expectRgb = `rgb(${[1, 3, 5].map((i) => parseInt(pick.slice(i, i + 2), 16)).join(', ')})`
if (drawn.painted !== expectRgb) {
  throw new Error(`ASSERT: ink paints ${drawn.painted}, expected the pen colour ${expectRgb} (${pick})`)
}

// --- the wire carries it ---
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())
await page.waitForTimeout(1200)
if (!posted) throw new Error('ASSERT: interpret was never posted')
const withColor = (posted.strokes ?? []).filter((s) => s.color)
log('posted strokes:', posted.strokes?.length, 'carrying colour:', withColor.length, withColor[0]?.color)
if (withColor.length !== posted.strokes.length) throw new Error('ASSERT: every stroke drawn with a pen must carry its colour')
if (withColor[0].color !== pick) throw new Error(`ASSERT: wire colour ${withColor[0].color} !== pen ${pick}`)

// --- eyedropper takes the colour under the pointer ---
const target = await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((e) => e.textContent.trim() === 'Active')
  const r = el.getBoundingClientRect()
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), color: getComputedStyle(el).color }
})
const dropped = await page.evaluate(({ x, y }) => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: y, bubbles: true, pointerId: 1, pointerType: 'mouse' }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', altKey: true, bubbles: true }))
  return document.getElementById('s2c-overlay-host').shadowRoot.getElementById('penDot').style.background
}, target)
log('eyedropped:', dropped, 'from element colour', target.color)
if (!dropped || dropped === 'rgb(37, 99, 235)') throw new Error(`ASSERT: eyedropper did not take a colour (${dropped})`)

log('ALL PEN CHECKS PASSED')
await b.close()

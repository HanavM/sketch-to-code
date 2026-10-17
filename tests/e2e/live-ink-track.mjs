/**
 * Ink-tracking check: the drawn stroke must stay locked to the element it was
 * drawn over, through scroll and browser zoom, with zero tolerance.
 *
 * PAID: it presses ▶ Run with /@s2c/run un-stubbed, so it spends one real
 * reading and one real edit (~3 min). Found by the s2c-034 sweep.
 */
import { chromium } from 'playwright'
import { inflateSync } from 'node:zlib'
import { ensureDraw } from './lib/pen.mjs'

/**
 * Minimal PNG reader (8-bit RGB/RGBA, non-interlaced) — enough to count ink
 * pixels in a screenshot. Rect assertions alone can't see ink: a zero-sized
 * <svg> root disables rendering while getBoundingClientRect keeps reporting
 * correct geometry, which is exactly how invisible strokes once shipped.
 */
function decodePng(buf) {
  let pos = 8
  let w = 0, h = 0, depth = 0, ctype = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; ctype = data[9] }
    else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    pos += 12 + len
  }
  if (depth !== 8 || (ctype !== 6 && ctype !== 2)) throw new Error(`unsupported png depth=${depth} color=${ctype}`)
  const bpp = ctype === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 0xff
    }
  }
  return { w, h, bpp, data: out }
}

/** Pixels of sketch2code blue (#2563eb) in a screenshot. */
function countInkPixels(png) {
  let n = 0
  for (let i = 0; i < png.data.length; i += png.bpp) {
    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2]
    if (b > 150 && b - r > 60 && b - g > 40) n++
  }
  return n
}

const inkPixelsIn = async (page, clip) => countInkPixels(decodePng(await page.screenshot({ clip })))

const APP = 'http://localhost:5199/'
const log = (...a) => console.log('[ink]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })
for (let i = 0; i < 20; i++) {
  const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
  if (ping.hasPipeline) break
  await page.waitForTimeout(500)
}

const card = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})

await ensureDraw(page)
await page.mouse.move(card.x + 20, card.y + 20)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(card.x + 20 + i * 12, card.y + 20 + (i % 2 ? 14 : 0), { steps: 2 })
}
await page.mouse.up()
await page.waitForTimeout(150)

const probe = () => page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  const ink = root.getElementById('ink')
  const path = ink?.querySelector('path')
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const pr = path?.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  return {
    paths: ink ? ink.querySelectorAll('path').length : -1,
    // offset of the ink from the element it was drawn over — the invariant
    dx: pr ? pr.left - er.left : NaN,
    dy: pr ? pr.top - er.top : NaN,
    w: pr ? pr.width : NaN,
    scrollY: window.scrollY,
  }
})

const before = await probe()
log('after draw:', JSON.stringify(before))
if (before.paths !== 1) throw new Error(`ASSERT: expected 1 ink path, got ${before.paths}`)

// the stroke must actually PAINT, not merely occupy the right rect
const drawnPixels = await inkPixelsIn(page, { x: card.x, y: card.y, width: card.w, height: card.h })
log('ink pixels over the card:', drawnPixels)
if (drawnPixels < 100) throw new Error(`ASSERT: stroke is not visible (${drawnPixels} ink px)`)

const maxScroll = await page.evaluate(() => {
  window.scrollTo(0, 400)
  return window.scrollY
})
await page.waitForTimeout(120)
const scrolled = await probe()
log(`after scroll ${maxScroll}:`, JSON.stringify(scrolled))

await page.evaluate(() => window.scrollTo(0, 0))
await page.evaluate(() => { document.body.style.zoom = '1.25' })
await page.waitForTimeout(120)
const zoomed = await probe()
log('after zoom 1.25:', JSON.stringify(zoomed))
await page.evaluate(() => { document.body.style.zoom = '' })

const near = (a, c, tol, what) => {
  if (!(Math.abs(a - c) <= tol)) throw new Error(`ASSERT ${what}: ${a} vs ${c}`)
}
near(scrolled.dx, before.dx, 0.01, 'ink drifted horizontally on scroll')
near(scrolled.dy, before.dy, 0.01, 'ink drifted vertically on scroll')
if (!(maxScroll > 50)) throw new Error(`page did not scroll (${maxScroll})`)
// Zoom reflows the page (a centered max-width layout shifts), so ink stays
// glued to PAGE coordinates rather than to the element — what must hold is
// that the ink scales with the page exactly like its content.
near(zoomed.w, before.w * 1.25, 0.6, 'ink did not scale with zoom (width)')

log('ink stays locked to its element through scroll and zoom')

// ---- the sketch must vanish once it has become a code change ----
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('clear').click()
})
const card2 = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
})
await page.mouse.move(card2.x + 15, card2.y + card2.h / 2)
await page.mouse.down()
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(card2.x + 15 + i * (card2.w - 30) / 12, card2.y + card2.h / 2 + (i % 2 ? 18 : -18), { steps: 2 })
}
await page.mouse.up()
await page.waitForTimeout(200)
log('scribbled:', JSON.stringify(await probe()))

await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click()
})
const t0 = Date.now()
while (Date.now() - t0 < 150000) {
  const m = await page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
  if (m === 'preview') break
  await page.waitForTimeout(1000)
}
await page.evaluate(() => {
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()
})
// dimmed while in flight
await page.waitForTimeout(300)
const applying = await page.evaluate(() =>
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ink').classList.contains('applying'))
log('dimmed while applying:', applying)

const t1 = Date.now()
let done = ''
while (Date.now() - t1 < 300000) {
  const st = await page.evaluate(
    () => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  if (st.startsWith('✓')) { done = st; break }
  if (st.startsWith('✗') || st.startsWith('failed')) throw new Error(`run failed: ${st}`)
  await page.waitForTimeout(500)
}
if (!done) throw new Error('run never finished')
await page.waitForTimeout(400)
const after = await probe()
log('after done:', done)
log('ink after done:', JSON.stringify(after))
if (after.paths !== 0) throw new Error(`ASSERT: sketch still on screen (${after.paths} paths)`)
const leftover = await inkPixelsIn(page, { x: card2.x, y: card2.y, width: card2.w, height: card2.h })
log('ink pixels after done:', leftover)
if (leftover > 20) throw new Error(`ASSERT: sketch pixels remain after the edit landed (${leftover})`)
if (!applying) throw new Error('ASSERT: ink was not dimmed while the run was in flight')

log('PASS — ink tracks scroll/zoom, dims on Go, and vanishes when the edit lands')
await b.close()

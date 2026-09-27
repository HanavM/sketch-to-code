/**
 * The browser half of the editor bridge.
 *
 * A fake editor (the extension's own transport would do; a raw SSE reader is
 * enough) attaches to the dev server, and we assert the overlay notices:
 * the indicator appears, selecting an element sends a reveal carrying that
 * element's exact stamp, and a cursor report paints on the page.
 *
 * Boot first (port 5237 — 5199 belongs to the interactive session):
 *   cd examples/demo-app && npx vite --port 5237
 */
import { chromium } from 'playwright'
import http from 'node:http'

const APP = process.env.S2C_APP ?? 'http://localhost:5237/'
const base = new URL(APP)
const log = (...a) => console.log('[e2e-ide-overlay]', ...a)

/** Attach as an editor: SSE, with the markers the gate requires. */
function attachEditor(onEvent) {
  return new Promise((resolve) => {
    const req = http.request(
      { hostname: base.hostname, port: base.port, path: '/@s2c/ide/events', method: 'GET',
        headers: { accept: 'text/event-stream', 'x-s2c-ide': 'e2e-fake-editor' } },
      (res) => {
        let buf = ''
        let event = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          buf += chunk
          for (const line of buf.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) {
              try { onEvent(event, JSON.parse(line.slice(5).trim())) } catch { /* partial */ }
            }
          }
          buf = buf.slice(buf.lastIndexOf('\n') + 1)
        })
        resolve(req)
      },
    )
    req.end()
  })
}

const post = (path, body) => new Promise((resolve) => {
  const data = JSON.stringify(body)
  const req = http.request(
    { hostname: base.hostname, port: base.port, path, method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-ide': 'e2e-fake-editor', 'content-length': Buffer.byteLength(data) } },
    (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)) },
  )
  req.end(data)
})

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(APP, { waitUntil: 'networkidle' })

const dot = () => page.evaluate(() =>
  getComputedStyle(document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ideDot')).display)

if (await dot() !== 'none') throw new Error('ASSERT: the indicator shows with no editor attached')
log('✓ no editor: indicator hidden')

const reveals = []
const editor = await attachEditor((event, data) => { if (event === 'reveal') reveals.push(data) })
await page.waitForFunction(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ideDot')
  return getComputedStyle(el).display !== 'none'
}, { timeout: 5000 })
log('✓ editor attached: indicator appeared, pushed over the existing stream')

// selecting an element in tweak mode reveals that element's own line
await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
const target = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[data-s2c*="StatCards"]')]
    .filter((e) => e.textContent.includes('Active users') && e.getBoundingClientRect().height >= 60)[0]
  const r = el.getBoundingClientRect()
  return { srcLoc: el.dataset.s2c, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + 12) }
})
await page.mouse.click(target.x, target.y)
await page.waitForTimeout(800)
// compare against what the overlay actually SELECTED, not against the element
// the test measured: a click lands on the topmost thing under it, which may
// be a child of the one that was measured
const selected = await page.evaluate(() => globalThis.__S2C_DEBUG__?.paint?.()?.srcLoc ?? null)
if (!selected) throw new Error('ASSERT: nothing was selected by the click')
const got = reveals.at(-1)
log('selected:', selected, '· revealed:', got && `${got.file}:${got.line}:${got.col}`)
if (!got) throw new Error('ASSERT: no reveal arrived')
const [file, line, col] = selected.split(':')
if (got.file !== file || got.line !== Number(line) || got.col !== Number(col)) {
  throw new Error(`ASSERT: reveal said ${got.file}:${got.line}:${got.col}, selection is ${selected}`)
}
log('✓ selecting an element revealed its exact stamp:', selected)

// a cursor report paints on the page
const before = await page.evaluate(() => !!globalThis.__S2C_DEBUG__)
void before
await post('/@s2c/ide/cursor', { file, line: Number(line) + 1 })
await page.waitForTimeout(700)
const painted = await page.evaluate(() => {
  const c = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('canvas')
  const ctx = c.getContext('2d')
  const { data } = ctx.getImageData(0, 0, c.width, c.height)
  let green = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 1] > 150 && data[i + 1] - data[i] > 60 && data[i + 3] > 100) green++
  }
  return green
})
log('cursor highlight pixels:', painted)
if (painted < 50) throw new Error('ASSERT: the editor cursor painted nothing on the page')
log('✓ an editor cursor highlights the matching element')

editor.destroy()
await page.waitForFunction(() => {
  const el = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('ideDot')
  return getComputedStyle(el).display === 'none'
}, { timeout: 8000 })
log('✓ editor gone: indicator hidden again')

log('ALL IDE OVERLAY CHECKS PASSED')
await b.close()

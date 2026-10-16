/**
 * Live e2e: a PICTURE dropped or pasted onto a placeholder box (s2c-023).
 *
 * "Put my logo here" needed an editor until now. Zero model calls: the drop
 * resolves to the box's own stamp and the server copies the file into the app
 * and rewires the box. Real browser events throughout (a DragEvent and a
 * ClipboardEvent carrying real File objects), against the demo app with three
 * boxes added for the test. Asserts:
 *   1. dropping a PNG on the "Logo" label fills THE BOX (not the label): the
 *      file lands in public/, the box is an <img> that actually loads, and its
 *      size classes survive
 *   2. pasting a JPEG while pointing at an empty box fills that box
 *   3. a PDF is refused in words, and nothing is written
 *   4. a box holding a heading and a button is refused in words, untouched
 *   5. Ctrl+Z twice: App.tsx is byte-identical to before the first drop and
 *      both copied files are gone
 *
 * Boot first: cd examples/demo-app && npx vite --port 5216
 * Run FROM THE REPO ROOT: node tests/e2e/live-image.mjs
 */
import { chromium } from 'playwright'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5216/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const APPTSX = `${REPO_ROOT}examples/demo-app/src/App.tsx`
const PUBLIC = `${REPO_ROOT}examples/demo-app/public`
const log = (...a) => console.log('[e2e-image]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })
  rmSync(PUBLIC, { recursive: true, force: true })
}
const pictures = () => (existsSync(PUBLIC) ? readdirSync(PUBLIC) : [])

// a real 4×2 PNG and a real 3×3 JPEG, so the browser has to decode them
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGP4z8AARwzIHABvqgf5gNwAKAAAAABJRU5ErkJggg=='
const JPEG_B64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAADAAMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHooor9MPz0//Z'

const SLOTS = `<ChevronTrail />
            <div className="flex gap-4" data-testid="slots">
              <div className="h-24 w-40 rounded bg-gray-200 flex items-center justify-center" data-testid="logo-slot">
                <span className="text-gray-500">Logo</span>
              </div>
              <div className="h-24 w-40 rounded bg-gray-200" data-testid="photo-slot" />
              <div className="h-24 w-40 rounded bg-white p-2" data-testid="filled">
                <h3>Team</h3>
                <button>Join</button>
              </div>
            </div>`

restore()
const ORIGINAL = readFileSync(APPTSX, 'utf8')
if (!ORIGINAL.includes('<ChevronTrail />')) fail('fixture drift: App.tsx has no <ChevronTrail />')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const sh = (fn, arg) => page.evaluate(fn, arg)
const status = () =>
  sh(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)

async function waitStatus(label, ok) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const st = await status()
    if (st.startsWith('✓') || st.startsWith('✗')) {
      log(`${label}:`, st)
      if (ok && !st.startsWith('✓')) fail(`${label}: ${st}`)
      if (!ok && !st.startsWith('✗')) fail(`${label}: expected a refusal, got ${st}`)
      if (ok && !/0 tokens/.test(st)) fail(`${label}: receipt missing zero-token proof`)
      return st
    }
    await page.waitForTimeout(100)
  }
  fail(`${label}: no receipt (status: ${await status()})`)
}
const clearStatus = () =>
  sh(() => { document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent = '' })

/** Centre of an element, found by a selector, in viewport coordinates. */
const centre = (sel) => sh((s) => {
  const r = document.querySelector(s).getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
}, sel)

/** A real drop: DragEvents carrying a File, dispatched where the pointer is. */
const drop = (at, b64, name, type) => sh(({ at, b64, name, type }) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const dt = new DataTransfer()
  dt.items.add(new File([bytes], name, { type }))
  const target = document.elementFromPoint(at.x, at.y)
  for (const kind of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(kind, { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, dataTransfer: dt }))
  }
}, { at, b64, name, type })

/** A real paste: move the pointer there, then a ClipboardEvent carrying a File. */
async function paste(at, b64, name, type) {
  await page.mouse.move(at.x, at.y)
  await sh(({ b64, name, type }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], name, { type }))
    document.body.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
  }, { b64, name, type })
}

/** Wait for HMR to show an <img> in place of a slot, and for it to decode. */
async function waitImg(testid) {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const got = await sh((id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el || el.tagName !== 'IMG' || !el.complete) return null
      const r = el.getBoundingClientRect()
      return { src: el.getAttribute('src'), natural: el.naturalWidth, w: Math.round(r.width), h: Math.round(r.height), cls: el.className }
    }, testid)
    if (got) return got
    await page.waitForTimeout(150)
  }
  fail(`${testid} never became a loaded <img>`)
}

const press = (opts) => sh((o) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...o })), opts)

try {
  // the three boxes, added for the test and committed to nothing
  writeFileSync(APPTSX, ORIGINAL.replace('<ChevronTrail />', SLOTS))
  const WITH_SLOTS = readFileSync(APPTSX, 'utf8')
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  await page.waitForSelector('[data-testid="logo-slot"]')
  for (let i = 0; i < 20; i++) {
    const ping = await sh(() => fetch('/@s2c/ping').then((r) => r.json()))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }

  // ── 1. drop on the label: the BOX becomes the picture ───────────────────
  const onLabel = await centre('[data-testid="logo-slot"] span')
  // the topmost PAGE element there (the overlay's host may sit above it, as it does while drawing)
  const under = await sh((at) => {
    const host = document.getElementById('s2c-overlay-host')
    return document.elementsFromPoint(at.x, at.y).find((e) => e !== host && !host.contains(e))?.tagName
  }, onLabel)
  if (under !== 'SPAN') fail(`fixture drift: the drop point is over <${under}>, not the label`)
  await clearStatus()
  await drop(onLabel, PNG_B64, 'Our Logo.png', 'image/png')
  await waitStatus('drop PNG on the Logo label', true)
  const logo = await waitImg('logo-slot')
  log('logo-slot is now', JSON.stringify(logo))
  if (!/^\/our-logo-[0-9a-f]{10}\.png$/.test(logo.src)) fail(`unexpected src ${logo.src}`)
  if (logo.natural !== 4) fail(`the picture did not decode (naturalWidth ${logo.natural})`)
  if (logo.w !== 160 || logo.h !== 96) fail(`the box lost its size: ${logo.w}×${logo.h}, expected 160×96`)
  if (!/object-cover/.test(logo.cls)) fail('no object-cover on a tailwind app')
  if (!readFileSync(`${PUBLIC}${logo.src}`).equals(Buffer.from(PNG_B64, 'base64'))) fail('copied bytes differ')
  if (readFileSync(APPTSX, 'utf8').includes('>Logo<')) fail('the placeholder label is still in source')

  // ── 2. paste while pointing at the empty box ────────────────────────────
  await clearStatus()
  await paste(await centre('[data-testid="photo-slot"]'), JPEG_B64, 'image.jpg', 'image/jpeg')
  await waitStatus('paste JPEG on the empty box', true)
  const photo = await waitImg('photo-slot')
  log('photo-slot is now', JSON.stringify(photo))
  if (!/^\/image-[0-9a-f]{10}\.jpg$/.test(photo.src)) fail(`unexpected src ${photo.src}`)
  if (photo.natural !== 3) fail(`the JPEG did not decode (naturalWidth ${photo.natural})`)
  if (pictures().length !== 2) fail(`expected 2 files in public/, got ${pictures().join(', ')}`)

  // ── 3. a PDF is not a picture ───────────────────────────────────────────
  const beforeRefusals = readFileSync(APPTSX, 'utf8')
  await clearStatus()
  await drop(await centre('[data-testid="filled"]'), btoa('%PDF-1.7\n%nope'), 'menu.pdf', 'application/pdf')
  const pdf = await waitStatus('drop a PDF', false)
  if (!/not a picture/.test(pdf)) fail(`PDF refusal does not say why: ${pdf}`)

  // ── 4. a box with real content is not a slot ────────────────────────────
  await clearStatus()
  // the pdf never reached the server (the overlay filters by type); this one does
  await drop(await centre('[data-testid="filled"]'), PNG_B64, 'x.png', 'image/png')
  const full = await waitStatus('drop on a filled card', false)
  if (!/not empty/.test(full)) fail(`filled-box refusal does not say why: ${full}`)
  if (readFileSync(APPTSX, 'utf8') !== beforeRefusals) fail('a refusal wrote to App.tsx')
  if (pictures().length !== 2) fail(`a refusal wrote a file: ${pictures().join(', ')}`)

  // ── 5. Ctrl+Z twice puts it all back ────────────────────────────────────
  for (let i = 0; i < 2; i++) {
    await press({ key: 'z', code: 'KeyZ', ctrlKey: true })
    await page.waitForTimeout(1500)
  }
  const after = readFileSync(APPTSX, 'utf8')
  if (after !== WITH_SLOTS) fail('App.tsx is not byte-identical after two undos')
  if (pictures().length !== 0) fail(`undo left files behind: ${pictures().join(', ')}`)
  log('two undos: App.tsx byte-identical, public/ empty')

  if (errs.length) fail(`page errors: ${errs.join(' | ')}`)
  log('PASS — 5 checks, 0 interpret calls')
} finally {
  restore()
  await b.close()
}

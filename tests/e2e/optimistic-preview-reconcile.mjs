/**
 * e2e (goal loop n9): what happens to a pending preview when the code lands,
 * with no model calls. /@s2c/run is stubbed to "start" and never finish; the
 * test writes the code itself, the way a run would, and ends the run through
 * the overlay's debug hook (__S2C_DEBUG__.runDone).
 *
 * For each of move / insert / new section on the demo app:
 *   A. LANDS: the test writes the edit the drawing asked for. The preview
 *      comes down as soon as hot reload shows it, while the run is still
 *      going (no overlap with the real thing), and the page shows it.
 *   B. SOMETHING ELSE: the test writes a different edit (the form heading's
 *      words). The preview stays while the run goes on, and is removed when
 *      the run ends; the page shows the other edit, and nothing is left of
 *      the preview.
 * The demo app's source is restored (git checkout) whatever happens.
 *
 * Needs the demo dev server (npm run dev, :5199). S2C_APP for another port,
 * S2C_CHROMIUM for a browser binary, S2C_ONLY=move,insert,section for a subset.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { ensureDraw } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const DEMO_SRC = new URL('../../examples/demo-app/src', import.meta.url).pathname
const NAV = `${DEMO_SRC}/components/Navbar.tsx`
const FORM = `${DEMO_SRC}/components/ContactForm.tsx`
const ONLY = process.env.S2C_ONLY?.split(',')
const log = (...a) => console.log('[e2e-reconcile]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const restoreSource = () => {
  try { execFileSync('git', ['checkout', '--', DEMO_SRC], { stdio: 'ignore' }) } catch { /* nothing to restore */ }
}
const edit = (file, from, to) => {
  const s = readFileSync(file, 'utf8')
  if (!s.includes(from)) fail(`demo source changed under the test: ${file}`)
  writeFileSync(file, s.replace(from, to))
}

const BUTTON = `        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Send invite
        </button>
`
const H2 = '<h2 className="text-base font-semibold text-gray-900">Invite a teammate</h2>'
const OVERVIEW = '<a href="#" className="text-sm text-gray-600 hover:text-gray-900">Overview</a>'

const lands = {
  move: () => {
    // the button out of the form's foot, to just under the heading
    edit(FORM, BUTTON, '')
    edit(FORM, `${H2}\n`, `${H2}\n${BUTTON.replace(/^ {2}/gm, '')}`)
  },
  insert: () => edit(NAV, OVERVIEW, `${OVERVIEW}\n          <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Blog</a>`),
  section: () => edit(FORM, '      </form>\n', `      </form>
      <div className="mt-6 border-t border-gray-200 pt-4">
        <h3 className="text-sm font-semibold text-gray-900">FAQ</h3>
        <p className="mt-1 text-sm text-gray-600">Invites expire after seven days.</p>
      </div>
`),
}
const somethingElse = () => edit(FORM, 'Invite a teammate</h2>', 'Invite a colleague</h2>')

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const results = {}
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => {
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ }
  })
  let runCalls = 0
  await page.route('**/@s2c/run', async (route) => {
    runCalls++
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  const open = async () => {
    restoreSource()
    await page.waitForTimeout(400)
    await page.goto(APP, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
      if (ping.hasPipeline) break
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(400)
    await ensureDraw(page)
  }
  const rectOf = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
  const byText = (text) => page.evaluate((t) => {
    const el = [...document.querySelectorAll('[data-s2c]')].find((e) => (e.textContent ?? '').trim() === t)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, text)
  const pendingN = () => page.evaluate(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending').children.length)
  // n10: in auto mode a run goes on in the background and the pen stays in draw mode
  const mode = () => page.evaluate(() => { const h = document.getElementById('s2c-overlay-host'); return h.dataset.flight ? 'running' : h.dataset.mode })
  const draw = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 4 })
    await page.mouse.up()
  }
  const navOrder = () => page.evaluate(() =>
    [...document.querySelectorAll('nav a')].map((a) => ({ t: (a.textContent ?? '').trim(), x: a.getBoundingClientRect().left }))
      .sort((p, q) => p.x - q.x).map((a) => a.t).join(','))
  const runDone = () => page.evaluate(() => globalThis.__S2C_DEBUG__.runDone({ summary: 'stubbed run done' }))

  const gestures = {
    move: {
      make: async () => {
        const btn = await rectOf('button[data-s2c^="src/components/ContactForm.tsx"]')
        const h2 = await rectOf('h2[data-s2c^="src/components/ContactForm.tsx"]')
        const x0 = btn.x + btn.w / 2, y0 = btn.y + btn.h / 2
        const x1 = h2.x + h2.w / 2, y1 = h2.y + h2.h / 2
        const shaft = []
        for (let i = 0; i <= 12; i++) shaft.push([x0 + ((x1 - x0) * i) / 12 + (i % 2 ? 1 : -1), y0 + ((y1 - y0) * i) / 12])
        return [...shaft, [x1 - 14, y1 + 18], [x1, y1], [x1 + 14, y1 + 18]]
      },
      before: async () => ({ btn: await byText('Send invite') }),
      real: async (b0) => { const btn = await byText('Send invite'); return !!btn && btn.y < b0.btn.y - 60 },
    },
    insert: {
      make: async () => {
        const a = await rectOf('a[data-s2c="src/components/Navbar.tsx:7:11"]')
        const c = await rectOf('a[data-s2c="src/components/Navbar.tsx:8:11"]')
        const gx = (a.x + a.w + c.x) / 2
        const y = a.y + a.h
        return [[gx - 9, y + 16], [gx - 4, y + 8], [gx, y], [gx + 4, y + 8], [gx + 9, y + 16]]
      },
      before: async () => ({}),
      real: async () => (await navOrder()) === 'Overview,Blog,Reports,Settings',
    },
    section: {
      make: async () => {
        const form = await rectOf('form[data-s2c^="src/components/ContactForm.tsx"]')
        const x = form.x + 10, y = form.y + form.h + 40, w = form.w - 20, h = 90
        const pts = []
        const side = (ax, ay, bx, by) => { for (let i = 0; i < 8; i++) pts.push([ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8]) }
        side(x, y, x + w, y + 1); side(x + w, y + 1, x + w - 1, y + h); side(x + w - 1, y + h, x + 1, y + h - 1); side(x + 1, y + h - 1, x + 2, y + 3)
        pts.push([x + 6, y + 1])
        return pts
      },
      before: async () => ({}),
      real: async () => !!(await byText('FAQ')),
    },
  }

  const start = async (kind, g) => {
    await open()
    const b0 = await g.before()
    const calls0 = runCalls
    await draw(await g.make())
    await page.waitForFunction(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending').children.length > 0, null, { timeout: 3000 })
      .catch(() => fail(`${kind}: no preview appeared`))
    // the run starts by itself (no Go) and is now "in flight"
    for (let i = 0; i < 600 && runCalls === calls0; i++) await page.waitForTimeout(100)
    if (runCalls !== calls0 + 1) fail(`${kind}: the run did not start by itself`)
    if ((await mode()) !== 'running') fail(`${kind}: not running after the run started (${await mode()})`)
    await page.evaluate(() => { globalThis.__s2cPreviewLanded = null })
    return b0
  }

  for (const [kind, g] of Object.entries(gestures)) {
    if (ONLY && !ONLY.includes(kind)) continue
    // A. the code lands what was drawn
    const b0 = await start(kind, g)
    const t0 = Date.now()
    lands[kind]()
    let goneMs = null, realMs = null
    while (Date.now() - t0 < 10_000 && (goneMs == null || realMs == null)) {
      const t = Date.now() - t0
      if (realMs == null && (await g.real(b0))) realMs = t
      if (goneMs == null && (await pendingN()) === 0) goneMs = t
      await page.waitForTimeout(25)
    }
    if (realMs == null) fail(`${kind}/lands: hot reload never showed the edit`)
    if (goneMs == null) fail(`${kind}/lands: the preview stayed up over the real change, mid-run`)
    if ((await mode()) !== 'running') fail(`${kind}/lands: the run ended early (${await mode()})`)
    const landed = await page.evaluate(() => globalThis.__s2cPreviewLanded)
    if (landed?.kind !== kind) fail(`${kind}/lands: preview came down for the wrong reason (${JSON.stringify(landed)})`)
    log(`${kind}/lands: real change visible at ${realMs} ms, preview down at ${goneMs} ms (after the file write), run still going`)
    if (goneMs > realMs + 600) fail(`${kind}/lands: preview overlapped the real change for ${goneMs - realMs} ms`)
    await runDone()
    await page.waitForTimeout(300)
    if (await pendingN()) fail(`${kind}/lands: preview back after the run`)
    if (!(await g.real(b0))) fail(`${kind}/lands: the real change is gone after the run`)

    // B. the code does something else
    const b1 = await start(kind, g)
    somethingElse()
    await page.waitForFunction(() => [...document.querySelectorAll('h2')].some((h) => h.textContent.includes('colleague')), null, { timeout: 10000 })
      .catch(() => fail(`${kind}/else: hot reload never showed the other edit`))
    await page.waitForTimeout(800)
    if ((await pendingN()) === 0) fail(`${kind}/else: the preview came down though the code did something else`)
    if (await g.real(b1)) fail(`${kind}/else: the drawn change somehow showed`)
    await runDone()
    await page.waitForTimeout(300)
    if (await pendingN()) fail(`${kind}/else: the preview is still up after the run`)
    const leftovers = await page.evaluate(() => document.querySelectorAll('[data-s2c-pending], .pg').length)
    if (leftovers) fail(`${kind}/else: ${leftovers} preview marks left in the page`)
    if (await g.real(b1)) fail(`${kind}/else: the page shows a change the code did not make`)
    log(`✓ ${kind}: preview down as soon as the real change showed; when the code did something else, held until the run ended, then removed`)
    results[kind] = { previewDownMs: goneMs, realVisibleMs: realMs }
  }
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
  log('results (ms after the file write):', JSON.stringify(results))
  log('PASS')
} finally {
  await b.close()
  restoreSource()
}

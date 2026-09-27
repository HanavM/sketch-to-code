/**
 * Live e2e: DRAG THE DATA — take a value you can read off the page and drop it
 * where it should also show.
 *
 * What only a browser can check here: that the two elements the server is told
 * about are the two the user actually pointed at (a copy from or into the wrong
 * element is the failure mode, and it would look like a working feature), that
 * the copied value really appears in the live DOM afterwards, and that the
 * refusals — the valuable half — reach the status line word for word.
 *
 * Phases, all zero-token:
 *   1. Alt+V is listed and arms
 *   2. drag the "Maya Chen" cell onto the role cell: both ends outlined pink,
 *      the wire carries those two stamps, and every row's role becomes the name
 *   3. Ctrl+Z puts the table back
 *   4. the scope refusal, verbatim: the same cell dropped on the <h2> outside
 *      the list — `u` does not exist there
 *   5. the destination refusal: a cell that contains a <span>
 *   6. the cross-file refusal (the page background belongs to App.tsx)
 *   7. releasing where you started, and Esc mid-drag, write nothing
 *
 * Boot first: cd examples/demo-app && npx vite --port 5213
 * Run FROM THE REPO ROOT: node tests/e2e/live-data.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5213/'
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const TABLE = `${REPO_ROOT}examples/demo-app/src/components/UserTable.tsx`
const log = (...a) => console.log('[e2e-data]', ...a)
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: REPO_ROOT })

restore()
const TABLE_BEFORE = readFileSync(TABLE, 'utf8')

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const status = () =>
  page.evaluate(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
const dataState = () => page.evaluate(() => window.__S2C_DEBUG__.data())

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

/** Centre of the nth cell in the users table, by column. */
const cellAt = (row, col) =>
  page.evaluate(({ r, c }) => {
    const tr = document.querySelectorAll('table tbody tr')[r]
    const td = tr?.querySelectorAll('td')[c]
    if (!td) return null
    const b = td.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, text: td.textContent.trim(), stamp: td.dataset.s2c }
  }, { r: row, c: col })

const headingAt = () =>
  page.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.trim() === 'Team members')
    const b = h.getBoundingClientRect()
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, stamp: h.dataset.s2c }
  })

/** Any pink pixel painted inside this box on the overlay canvas? */
const pinkIn = (box) =>
  page.evaluate((bx) => {
    const cv = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('canvas')
    const d = cv.getContext('2d').getImageData(
      Math.round(bx.x), Math.round(bx.y), Math.round(bx.w), Math.round(bx.h),
    ).data
    let hits = 0
    for (let i = 0; i < d.length; i += 4) {
      // DATA_COLOR is #ec4899: strong red, weak green, mid blue
      if (d[i + 3] > 40 && d[i] > 180 && d[i + 1] < 140) hits++
    }
    return hits
  }, box)

/** Press, move in steps (one jump is a click), optionally stop before release. */
async function dragValue(from, to, { release = true } = {}) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6)
    await page.waitForTimeout(20)
  }
  if (release) await page.mouse.up()
}

const roles = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('table tbody tr')].map((tr) => tr.querySelectorAll('td')[1].textContent.trim()))

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. the binding ────────────────────────────────────────────────────────
const bind = await page.evaluate(() => window.__S2C_DEBUG__.keymap().find((k) => k.id === 'dragdata'))
if (!bind) throw new Error('ASSERT: Alt+V is not in the keymap')
log('keymap:', bind.keys, '·', bind.label)

await page.keyboard.press('Alt+v')
if (!(await dataState()).armed) throw new Error('ASSERT: Alt+V did not arm the value drag')
log('armed:', await status())

// ── 2. the drag that works ───────────────────────────────────────────────
const name = await cellAt(0, 0)
const role = await cellAt(0, 1)
log('from', name.stamp, `“${name.text}”`, '→ to', role.stamp, `“${role.text}”`)
if (await roles().then((r) => r.join(',')) !== 'Admin,Editor,Viewer,Editor') {
  throw new Error('fixture drift: the roles column is not what this test expects')
}
await dragValue(name, role, { release: false })
const held = await dataState()
log('mid-drag:', JSON.stringify(held))
if (held.from !== name.stamp) throw new Error(`ASSERT: dragging from ${held.from}, not the cell pressed`)
if (held.to !== role.stamp) throw new Error(`ASSERT: dropping on ${held.to}, not the cell under the pointer`)
if (held.value !== 'Maya Chen') throw new Error(`ASSERT: holding “${held.value}”, not the value shown`)
const painted = await pinkIn({ x: name.x - 60, y: name.y - 12, w: 120, h: 24 })
log('pink painted over the source:', painted, 'px')
if (painted < 4) throw new Error('ASSERT: the drag computes but paints nothing')

await page.mouse.up()
const receipt = await waitStatus(/^[✓✗]/)
log('receipt:', receipt)
if (!receipt.startsWith('✓')) throw new Error(`ASSERT: the copy failed: ${receipt}`)
if (!/0 tokens/.test(receipt)) throw new Error('ASSERT: receipt missing the zero-token proof')
if (!/replaced/.test(receipt)) throw new Error('ASSERT: the receipt does not say what it overwrote')

// the real proof: the page itself. It is a .map(), so the template changed and
// every row now shows its own name in the role column.
await page.waitForFunction(
  () => [...document.querySelectorAll('table tbody tr')]
    .every((tr) => tr.querySelectorAll('td')[0].textContent.trim() === tr.querySelectorAll('td')[1].textContent.trim()),
  { timeout: 10000 },
)
log('roles column now:', (await roles()).join(', '))
if (!readFileSync(TABLE, 'utf8').includes('{u.name}')) throw new Error('ASSERT: source untouched?')

// ── 3. undo ──────────────────────────────────────────────────────────────
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
await waitStatus(/undid|nothing to undo/)
log('undo:', await status())
await page.waitForFunction(
  () => [...document.querySelectorAll('table tbody tr')].map((tr) =>
    tr.querySelectorAll('td')[1].textContent.trim()).join(',') === 'Admin,Editor,Viewer,Editor',
  { timeout: 10000 },
)
if (readFileSync(TABLE, 'utf8') !== TABLE_BEFORE) throw new Error('ASSERT: undo did not restore UserTable.tsx')
log('table restored')

// ── 4. the scope refusal, which is the point of the whole engine ─────────
await page.keyboard.press('Alt+v')
const head = await headingAt()
const name2 = await cellAt(0, 0)
await dragValue(name2, head)
const refused = await waitStatus(/✗/)
log('scope refusal:', refused)
if (!/only exists inside/.test(refused)) {
  throw new Error(`ASSERT: dropping a row value outside its list was not refused on scope: ${refused}`)
}
if (!/\bu\b/.test(refused)) throw new Error('ASSERT: the refusal does not name the variable')
if (!/prop|drop it/.test(refused)) throw new Error('ASSERT: the refusal does not name a fix')
if (readFileSync(TABLE, 'utf8') !== TABLE_BEFORE) throw new Error('ASSERT: a refused drag wrote to disk')

// ── 5. the destination refusal ───────────────────────────────────────────
// Aim at the CELL, not its centre: the status cell holds a pill <span>, and
// the middle of the cell is the pill — which holds only text and is a perfectly
// legal target. The bare strip to the right of the pill is the <td> itself.
await page.keyboard.press('Alt+v')
const statusCell = await page.evaluate(() => {
  const td = document.querySelectorAll('table tbody tr')[0].querySelectorAll('td')[2]
  const span = td.querySelector('span')
  const t = td.getBoundingClientRect()
  const p = span.getBoundingClientRect()
  return { x: (p.right + t.right) / 2, y: t.top + t.height / 2, tdStamp: td.dataset.s2c }
})
await dragValue(await cellAt(0, 0), statusCell)
const refused2 = await waitStatus(/✗/)
log('destination refusal:', refused2)
if (!/contains/.test(refused2)) {
  throw new Error(`ASSERT: dropping onto a cell holding an element was not refused: ${refused2}`)
}
if (readFileSync(TABLE, 'utf8') !== TABLE_BEFORE) throw new Error('ASSERT: a refused drag wrote to disk')

// ── 6. the cross-file refusal ────────────────────────────────────────────
// The page background is not "nothing": App.tsx's root div covers the whole
// viewport, so this is a drop into a different FILE, which is its own refusal.
await page.keyboard.press('Alt+v')
await dragValue(await cellAt(0, 0), { x: 40, y: 500 })
const refused3 = await waitStatus(/✗/)
log('cross-file refusal:', refused3)
if (!/different file|and you dropped it in|App\.tsx/.test(refused3)) {
  throw new Error(`ASSERT: a cross-file drop was not refused as one: ${refused3}`)
}

// ── 7. the two ways to write nothing ─────────────────────────────────────
const home = await cellAt(0, 0)
await page.keyboard.press('Alt+v')
await dragValue(home, { x: home.x + 30, y: home.y }, { release: false })
await page.mouse.move(home.x, home.y)
await page.mouse.up()
log('released where it started:', await status())
if (!/nothing copied/.test(await status())) {
  throw new Error(`ASSERT: releasing on the source did not say nothing happened: ${await status()}`)
}

await page.keyboard.press('Alt+v')
await dragValue(await cellAt(0, 0), await cellAt(1, 1), { release: false })
await page.keyboard.press('Escape')
await page.mouse.up()
log('Esc mid-drag:', await status())
if ((await dataState()).from !== null) throw new Error('ASSERT: Esc left a value in mid-air')
if (readFileSync(TABLE, 'utf8') !== TABLE_BEFORE) throw new Error('ASSERT: a cancelled drag wrote to disk')

restore()
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — a value drags from where it shows to where it should, undoes, and refuses with reasons')

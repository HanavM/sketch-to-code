/**
 * e2e (goal loop n5): drag to reorder, Canva-style. Zero tokens (the reorder
 * codemod, /@s2c/manipulate). Against the demo stat cards (a .map() of 3):
 *
 *   1. LIVE REFLOW — select card 0, drag it over card 2's slot and HOLD: the
 *      row reorders while the pointer is still down; the other cards GLIDE
 *      aside (>= 6 in-between frames), within 50 ms of entering the slot.
 *   2. RELEASE — the card glides from under the pointer into its slot; the
 *      row stays as shown until the hot reload lands, then the hold comes off
 *      with nothing left to move (__s2cLanded: landed, glided 0).
 *   3. NO JUMP — from release to well after the reload, each card's on-screen
 *      x (tracked by its words, every frame) only moves toward its final
 *      spot: no snap back to the old order, no flash.
 *   4. CODE — the stats array in StatCards.tsx is reordered (Revenue after
 *      Conversion). Source restored afterwards.
 *   5. CANCEL — drag over a slot then back out: the row glides back.
 *   Frame intervals over all of it: p95 <= 20 ms (60 fps).
 *
 * Starts its own vite on :5262. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PORT = 5262
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const CARDS = `${ROOT}examples/demo-app/src/components/StatCards.tsx`
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-motion-reorder]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
    await page.waitForTimeout(500)
  }
  await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
  await page.waitForTimeout(300)

  const SEL = 'section[data-s2c*="StatCards"] > div'
  const cards = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => {
    const r = el.getBoundingClientRect()
    return { label: el.querySelector('p')?.textContent ?? '', left: r.left, top: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }
  }), SEL)
  const c0 = await cards()
  if (c0.length !== 3) fail(`expected 3 stat cards, got ${c0.length}`)
  log('cards:', c0.map((c) => c.label).join(' | '))

  // frame recorder: every card's x by its label, plus frame times
  const record = () => page.evaluate((sel) => {
    globalThis.__FR__ = []
    globalThis.__REC__ = true
    const tick = (ts) => {
      const xs = {}
      for (const el of document.querySelectorAll(sel)) xs[el.querySelector('p')?.textContent ?? ''] = el.getBoundingClientRect().left
      globalThis.__FR__.push({ ts, xs })
      if (globalThis.__REC__) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, SEL)
  const stop = () => page.evaluate(() => { globalThis.__REC__ = false; return globalThis.__FR__ })

  // ---- 1: live reflow while the pointer is down ------------------------------
  const [a, , z] = c0
  await page.mouse.click(a.left + 12, a.top + 12)
  await page.waitForTimeout(200)
  if (!/^picked up the /.test(await status())) fail(`card not selected: ${await status()}`)
  await record()
  await page.mouse.move(a.cx, a.cy)
  await page.mouse.down()
  // travel toward card 2 but stay outside every other slot until the last step
  await page.mouse.move(a.cx, a.top - 30, { steps: 5 })
  await page.mouse.move(z.cx, z.top - 30, { steps: 10 })
  const enterAt = await page.evaluate(() => performance.now())
  // off-centre inside the slot, so the drop has somewhere to glide from
  await page.mouse.move(z.cx + 50, z.cy + 18, { steps: 2 })
  await page.waitForTimeout(450)
  const during = await page.evaluate(() => globalThis.__FR__)
  const midLabel = c0[1].label, lastLabel = c0[2].label, dragLabel = c0[0].label
  const live = during.filter((f) => f.ts >= enterAt)
  const firstMove = live.find((f) => Math.abs(f.xs[midLabel] - c0[1].left) > 1)
  const msToReflow = firstMove ? firstMove.ts - enterAt : null
  const midGlide = live.filter((f) => f.xs[midLabel] < c0[1].left - 1 && f.xs[midLabel] > c0[0].left + 1).length
  log(`1: row reflowed ${msToReflow?.toFixed(1)} ms after entering the slot; middle card glided over ${midGlide} frames (status: ${await status()})`)
  if (msToReflow == null || msToReflow > 50) fail(`live reflow took ${msToReflow} ms (budget 50)`)
  if (midGlide < 6) fail(`siblings jumped instead of gliding (${midGlide} in-between frames)`)
  const held = live.at(-1).xs
  if (Math.abs(held[midLabel] - c0[0].left) > 2 || Math.abs(held[lastLabel] - c0[1].left) > 2) fail(`row not showing the drop: ${JSON.stringify(held)}`)
  log('✓ 1: the row opens the slot live, gliding')

  // ---- 2+3: release, hold until the code lands, no jump ----------------------
  const relAt = await page.evaluate(() => { globalThis.__s2cLanded = null; return performance.now() })
  await page.mouse.up()
  await page.waitForFunction(() => globalThis.__s2cLanded != null, null, { timeout: 20000 })
    .catch(async () => fail(`hold never released (status: ${await status()})`))
  await page.waitForTimeout(800)
  const landed = await page.evaluate(() => globalThis.__s2cLanded)
  const fr = (await stop())
  log('2: landed:', JSON.stringify(landed), '| status:', await status())
  if (landed.how !== 'landed') fail(`the hot reload was not seen (${landed.how})`)
  if (landed.glided !== 0) fail(`the code placed ${landed.glided} cards differently from what was shown`)
  const after = fr.filter((f) => f.ts >= relAt)
  const final = after.at(-1).xs
  const dragGlide = after.filter((f) => Math.abs(f.xs[dragLabel] - final[dragLabel]) > 1).length
  log(`2: dropped card glided into its slot over ${dragGlide} frames`)
  if (dragGlide < 4) fail(`dropped card jumped into its slot (${dragGlide} frames)`)
  for (const label of [dragLabel, midLabel, lastLabel]) {
    // the dropped card starts its glide from under the pointer (where the
    // drag ghost was): judge each card from its farthest point on
    const dist = after.map((f) => Math.abs(f.xs[label] - final[label]))
    const from = dist.indexOf(Math.max(...dist))
    let prev = dist[from]
    for (const f of after.slice(from)) {
      const d = Math.abs(f.xs[label] - final[label])
      if (d > prev + 2) fail(`${label} jumped away from its final spot (${prev.toFixed(1)} → ${d.toFixed(1)} px) — a flash of the old order`)
      prev = d
    }
  }
  if (!(final[midLabel] < final[lastLabel] && final[lastLabel] < final[dragLabel])) fail(`final order wrong: ${JSON.stringify(final)}`)
  log('✓ 2/3: glides in, held until the code landed, no jump, code matched')

  const src = readFileSync(CARDS, 'utf8')
  if (src.indexOf(`'${dragLabel}'`) < src.indexOf(`'${lastLabel}'`)) fail('the stats array was not reordered in the source')
  const orders = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((el) => el.style.order), SEL)
  if (orders.some((o) => o)) fail(`inline order left behind after landing: ${orders}`)
  log('✓ 4: source reordered; no inline order left')

  const gaps = fr.slice(1).map((f, i) => f.ts - fr[i].ts).sort((x, y) => x - y)
  const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]
  const frames = { p50: pct(0.5), p95: pct(0.95), max: gaps.at(-1), under20: gaps.filter((g) => g < 20).length / gaps.length, n: gaps.length }
  log(`frames: p50 ${frames.p50.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms, ${(frames.under20 * 100).toFixed(0)}% under 20 ms`)
  if (frames.p95 > 20) fail(`below 60 fps: p95 ${frames.p95} ms`)

  // ---- 5: cancel — over a slot and back out: the row glides back -------------
  restore()
  await page.waitForTimeout(1200)
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
  await page.waitForTimeout(300)
  const d0 = await cards()
  await page.mouse.click(d0[0].left + 12, d0[0].top + 12)
  await page.waitForTimeout(200)
  await page.mouse.move(d0[0].cx, d0[0].cy)
  await page.mouse.down()
  await page.mouse.move(d0[0].cx, d0[0].top - 30, { steps: 4 })
  await page.mouse.move(d0[1].cx, d0[1].cy, { steps: 6 })
  await page.waitForTimeout(300)
  await record()
  await page.mouse.move(d0[1].cx, d0[1].top - 60, { steps: 2 })
  await page.waitForTimeout(400)
  const back = await stop()
  const backGlide = back.filter((f) => Math.abs(f.xs[d0[1].label] - d0[1].left) > 1 && Math.abs(f.xs[d0[1].label] - d0[0].left) > 1).length
  const backEnd = back.at(-1).xs
  log(`5: left the slot: middle card glided back over ${backGlide} frames`)
  if (Math.abs(backEnd[d0[1].label] - d0[1].left) > 1) fail('row did not go back when the pointer left every slot')
  if (backGlide < 6) fail(`row snapped back (${backGlide} frames)`)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.waitForTimeout(500)
  log('✓ 5: leaving the slot glides the row back')
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)

  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}reorder-frames.json`, JSON.stringify({ msToReflow, midGlide, dragGlide, landed, frames, cancelGlide: backGlide }, null, 1))
  log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

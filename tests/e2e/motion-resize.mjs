/**
 * e2e (goal loop n6): resize by dragging an edge, Canva-style. Zero tokens
 * (the resize codemod, /@s2c/manipulate). Against the demo stat cards:
 *
 *   1. LIVE REFLOW — select card 0 and pull its bottom edge down 64 px while
 *      the pointer is down: the card grows, its row grows with it and the
 *      section below is pushed down, within 50 ms of the pointer moving.
 *   2. HOLD — on release the size you dragged to stays on screen until the
 *      hot reload lands (no snap back to the old height), then the hold
 *      comes off in the reload's own task (__s2cLanded: landed).
 *   3. NO JUMP — from release to well after the reload, the card's height
 *      and the next section's top (every frame) only move toward their final
 *      values: no flash of the old size. If the code's size differs from
 *      what was dragged (scale snapping), it eases there over >= 4 frames.
 *   4. CODE — StatCards.tsx gains an h-* class on the card. Source restored.
 *   5. CANCEL — Escape mid-drag eases the card back (no snap).
 *   6. MOVE HOLD — an in-place move of the plan card keeps its spot until
 *      the code lands: its top never snaps back toward where it started.
 *   Frame intervals over all of it: p95 <= 20 ms (60 fps).
 *
 * Starts its own vite on :5263. Run from the repo root.
 */
import { chromium } from 'playwright'
import { spawn, execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const PORT = 5263
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const CARDS = `${ROOT}examples/demo-app/src/components/StatCards.tsx`
const OUT = `${ROOT}docs/motion/`
const log = (...a) => console.log('[e2e-motion-resize]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }
const restore = () => execSync('git checkout -- examples/demo-app/src/', { cwd: ROOT })

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const SEL = 'section[data-s2c*="StatCards"] > div'
const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  const boot = async () => {
    await page.goto(APP, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
      await page.waitForTimeout(500)
    }
    await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('tweakBtn').click())
    await page.waitForTimeout(300)
  }
  await boot()

  // frame recorder: card 0's height, the next section's top, frame times
  const record = () => page.evaluate((sel) => {
    globalThis.__FR__ = []
    globalThis.__REC__ = true
    const tick = (ts) => {
      const card = document.querySelector(sel)
      const next = card.parentElement.nextElementSibling
      globalThis.__FR__.push({ ts, h: card.getBoundingClientRect().height, below: next.getBoundingClientRect().top })
      if (globalThis.__REC__) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, SEL)
  const stop = () => page.evaluate(() => { globalThis.__REC__ = false; return globalThis.__FR__ })
  const card0 = () => page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect()
    const n = document.querySelector(sel).parentElement.nextElementSibling.getBoundingClientRect()
    return { left: r.left, top: r.top, w: r.width, h: r.height, bottom: r.bottom, cx: r.left + r.width / 2, below: n.top }
  }, SEL)

  // ---- 1: live reflow while the pointer is down ------------------------------
  const c = await card0()
  log(`card 0: ${c.w.toFixed(0)}×${c.h.toFixed(0)}, next section at ${c.below.toFixed(0)}`)
  await page.mouse.click(c.left + 12, c.top + 12)
  await page.waitForTimeout(200)
  await record()
  await page.mouse.move(c.cx, c.bottom)
  await page.mouse.down()
  const pullAt = await page.evaluate(() => performance.now())
  await page.mouse.move(c.cx, c.bottom + 64, { steps: 8 })
  await page.waitForTimeout(300)
  const during = await page.evaluate(() => globalThis.__FR__)
  const live = during.filter((f) => f.ts >= pullAt)
  const firstGrow = live.find((f) => f.h > c.h + 1 && f.below > c.below + 1)
  const msToReflow = firstGrow ? firstGrow.ts - pullAt : null
  const held = live.at(-1)
  log(`1: card grew and pushed the next section ${msToReflow?.toFixed(1)} ms into the pull; now h ${held.h.toFixed(0)}, below ${held.below.toFixed(0)} (status: ${await status()})`)
  if (msToReflow == null || msToReflow > 50) fail(`live reflow took ${msToReflow} ms (budget 50)`)
  if (held.h < c.h + 56 || held.below < c.below + 56) fail(`page not reflowed to the dragged size: ${JSON.stringify(held)}`)
  log('✓ 1: the card grows and the page reflows live')

  // ---- 2+3: release, hold until the code lands, no jump ----------------------
  const relAt = await page.evaluate(() => { globalThis.__s2cLanded = null; return performance.now() })
  await page.mouse.up()
  await page.waitForFunction(() => globalThis.__s2cLanded != null, null, { timeout: 20000 })
    .catch(async () => fail(`hold never released (status: ${await status()})`))
  await page.waitForTimeout(800)
  const landed = await page.evaluate(() => globalThis.__s2cLanded)
  const fr = await stop()
  log('2: landed:', JSON.stringify(landed), '| status:', await status())
  if (landed.how !== 'landed') fail(`the hot reload was not seen (${landed.how})`)
  const after = fr.filter((f) => f.ts >= relAt)
  const final = after.at(-1)
  for (const k of ['h', 'below']) {
    let prev = Math.abs(after[0][k] - final[k])
    for (const f of after) {
      const d = Math.abs(f[k] - final[k])
      if (d > prev + 1) fail(`${k} jumped away from its final value (${prev.toFixed(1)} → ${d.toFixed(1)} px): a flash of the old size`)
      prev = d
    }
  }
  const snapBack = after.filter((f) => f.h < held.h - 2 && f.h < final.h - 2)
  if (snapBack.length) fail(`card snapped back toward its old height before the code landed (${snapBack.length} frames)`)
  const easeFrames = after.filter((f) => Math.abs(f.h - final.h) > 1).length
  const codeDiff = Math.abs(final.h - held.h)
  log(`2/3: dragged to ${held.h.toFixed(0)}, code says ${final.h.toFixed(0)} (${codeDiff.toFixed(1)} px apart), eased over ${easeFrames} frames`)
  if (codeDiff > 1.5 && easeFrames < 4) fail(`code's size differed and the card jumped to it (${easeFrames} frames)`)
  if (final.h < c.h + 40) fail(`resize lost after landing (h ${final.h})`)
  log('✓ 2/3: held until the code landed, no snap back, no jump')

  const src = readFileSync(CARDS, 'utf8')
  const hClass = src.match(/rounded-lg[^"]*\bh-[\w[\].-]+/)?.[0]
  if (!hClass) fail('no h-* class landed on the card in StatCards.tsx')
  const inline = await page.evaluate((sel) => document.querySelector(sel).style.height, SEL)
  if (inline) fail(`inline height left behind after landing: ${inline}`)
  log(`✓ 4: source has ${hClass.match(/\bh-\S+/)[0]}; no inline height left`)

  const gaps = fr.slice(1).map((f, i) => f.ts - fr[i].ts).sort((x, y) => x - y)
  const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]
  const frames = { p50: pct(0.5), p95: pct(0.95), max: gaps.at(-1), under20: gaps.filter((g) => g < 20).length / gaps.length, n: gaps.length }
  log(`frames: p50 ${frames.p50.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms, ${(frames.under20 * 100).toFixed(0)}% under 20 ms`)
  if (frames.p95 > 20) fail(`below 60 fps: p95 ${frames.p95} ms`)

  // ---- 5: cancel mid-drag eases back ----------------------------------------
  restore()
  await page.waitForTimeout(1200)
  await boot()
  const d = await card0()
  await page.mouse.click(d.left + 12, d.top + 12)
  await page.waitForTimeout(200)
  await page.mouse.move(d.cx, d.bottom)
  await page.mouse.down()
  await page.mouse.move(d.cx, d.bottom + 80, { steps: 6 })
  await page.waitForTimeout(200)
  await record()
  await page.evaluate(() => {
    // the browser taking the gesture away (pen out of range): pointercancel
    const host = document.getElementById('s2c-overlay-host').shadowRoot
    const cv = host.querySelector('canvas')
    cv.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
  })
  await page.waitForTimeout(450)
  const back = await stop()
  await page.mouse.up()
  const backEase = back.filter((f) => f.h > d.h + 1 && f.h < d.h + 78).length
  log(`5: cancelled: card eased back over ${backEase} frames, ends at ${back.at(-1).h.toFixed(0)} (was ${d.h.toFixed(0)})`)
  if (Math.abs(back.at(-1).h - d.h) > 1) fail('cancel did not put the old size back')
  if (backEase < 4) fail(`cancel snapped back (${backEase} frames)`)
  log('✓ 5: cancel eases back')
  await page.keyboard.press('Escape')

  // ---- 6: in-place move holds until the code lands ---------------------------
  const PLAN = '[data-s2c*="ContactForm"]'
  await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), PLAN)
  await page.waitForTimeout(200)
  const p0 = await page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height } }, PLAN)
  await page.mouse.click(p0.left + 20, p0.top + 20)
  await page.waitForTimeout(200)
  log(`6: picked: ${await status()}`)
  await page.evaluate((s) => {
    globalThis.__FR__ = []; globalThis.__REC__ = true
    const tick = (ts) => { globalThis.__FR__.push({ ts, top: document.querySelector(s).getBoundingClientRect().top }); if (globalThis.__REC__) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }, PLAN)
  await page.mouse.move(p0.left + 40, p0.top + 40)
  await page.mouse.down()
  await page.mouse.move(p0.left + 40, p0.top + 76, { steps: 6 })
  await page.waitForTimeout(150)
  log(`6: dragging: ${await status()}`)
  const movedTop = await page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, PLAN)
  const mRel = await page.evaluate(() => { globalThis.__s2cLanded = null; return performance.now() })
  await page.mouse.up()
  await page.waitForFunction(() => globalThis.__s2cLanded != null, null, { timeout: 20000 })
    .catch(async () => fail(`move hold never released (status: ${await status()})`))
  await page.waitForTimeout(700)
  const mLanded = await page.evaluate(() => globalThis.__s2cLanded)
  const mf = (await stop()).filter((f) => f.ts >= mRel)
  const mFinal = mf.at(-1).top
  log(`6: moved ${(movedTop - p0.top).toFixed(0)} px; landed ${JSON.stringify(mLanded)}; final top ${(mFinal - p0.top).toFixed(0)} px from start | ${await status()}`)
  // a clipped element drags as a ghost (movedTop stays put); either way the drop holds
  const firstAfter = mf[0]?.top ?? p0.top
  if (Math.abs(firstAfter - p0.top) < 20) fail(`the moved card was back at its start right after release (top ${(firstAfter - p0.top).toFixed(0)} px)`)
  if (mLanded.prop !== 'move') fail(`move did not commit through the hold: ${JSON.stringify(mLanded)}`)
  const snapM = mf.filter((f) => f.top < Math.min(firstAfter, mFinal) - 2)
  if (snapM.length) fail(`moved card snapped back toward its start (${snapM.length} frames)`)
  log('✓ 6: an in-place move stays put until the code lands')
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)

  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}resize-frames.json`, JSON.stringify({ msToReflow, dragged: held.h, codeH: final.h, easeFrames, landed, frames, cancelEase: backEase, move: { landed: mLanded, snapBackFrames: snapM.length } }, null, 1))
  log('ALL CHECKS PASSED')
} finally {
  await b.close()
  vite.kill()
  restore()
}

/**
 * e2e (goal loop n4): erasing is physical. A scribble over an element fades it
 * out where it stands, then its neighbours GLIDE into the gap; when the change
 * is taken back (the run fails here, stubbed) the gap opens smoothly and the
 * element fades back in. No tokens: /@s2c/run is stubbed.
 *
 * Measured in the page, every animation frame from pen lift:
 *   - lift → first frame where the target visibly changed (opacity < 0.97): < 50 ms
 *   - the neighbour below travels through >= 6 in-between positions (a glide,
 *     not a jump), and ends exactly where the layout puts it
 *   - frame intervals over the whole motion: report p50/p95/max, and the share
 *     of frames under 20 ms (60 fps = 16.7 ms)
 *   - the run's snapshot still sees the target where it was (suspend: the
 *     motion never leaks into what the code is checked against)
 *   - after the failure the target is back exactly (style + pending mark)
 *
 * Writes docs/motion/erase-frames.json (frame log) for the timing report.
 * Needs the demo dev server on :5199 (S2C_STUB_MODEL=1 is enough).
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureDraw, assertInk, inkCount } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const OUT = new URL('../../docs/motion/', import.meta.url).pathname
const log = (...a) => console.log('[e2e-motion-erase]', ...a)
const fail = (m) => { throw new Error(`ASSERT: ${m}`) }

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default is auto */ }
  })
  await page.goto(APP, { waitUntil: 'networkidle' })
  for (let i = 0; i < 20; i++) {
    const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))
    if (ping.hasPipeline) break
    await page.waitForTimeout(500)
  }
  await ensureDraw(page)

  let snapshotRect = null
  let releaseRun = () => undefined
  const runHeld = new Promise((r) => { releaseRun = r })
  await page.route('**/@s2c/run', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}')
    const src = await page.evaluate(() => document.querySelector('[data-e2e-target]')?.getAttribute('data-s2c'))
    const n = (body.snapshot?.nodes ?? []).find((x) => x.srcLoc === src)
    snapshotRect = n ? (n.rect ?? n.bbox ?? true) : null
    await runHeld
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed failure' }) })
  })

  // a mid-sized, worded element with an in-flow neighbour below it
  const t = await page.evaluate(() => {
    const ok = (el) => {
      if (el.closest('#s2c-overlay-host')) return false
      const r = el.getBoundingClientRect()
      return r.top > 80 && r.bottom < innerHeight - 160 && r.width >= 120 && r.width <= 520 && r.height >= 30 && r.height <= 120 &&
        (el.textContent ?? '').trim().length > 0
    }
    const below = (el) => {
      const r = el.getBoundingClientRect()
      let n = el.nextElementSibling
      while (n && n.getBoundingClientRect().height === 0) n = n.nextElementSibling
      if (!n) return null
      const q = n.getBoundingClientRect()
      return q.top >= r.bottom - 1 && q.top < r.bottom + 80 && getComputedStyle(n).position === 'static' ? n : null
    }
    const els = [...document.querySelectorAll('[data-s2c]')].filter((el) => ok(el) && below(el))
    els.sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)
    const el = els[0]
    if (!el) return null
    el.setAttribute('data-e2e-target', '1')
    below(el).setAttribute('data-e2e-next', '1')
    const r = el.getBoundingClientRect()
    return { src: el.getAttribute('data-s2c'), x: r.left, y: r.top, w: r.width, h: r.height, tag: el.tagName, style: el.getAttribute('style') }
  })
  if (!t) fail('no target with a neighbour below on the demo page')
  log('target:', t.tag, t.src, `${Math.round(t.w)}x${Math.round(t.h)}`)

  // frame recorder: every rAF, the target's opacity and the neighbour's top
  await page.evaluate(() => {
    const el = document.querySelector('[data-e2e-target]')
    const nx = document.querySelector('[data-e2e-next]')
    globalThis.__FR__ = []
    const tick = (ts) => {
      const cs = getComputedStyle(el)
      globalThis.__FR__.push({ ts, op: cs.display === 'none' ? 0 : Number(cs.opacity), gone: cs.display === 'none', nextTop: nx.getBoundingClientRect().top })
      if (globalThis.__FR__.length < 400) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const nextTop0 = await page.evaluate(() => document.querySelector('[data-e2e-next]').getBoundingClientRect().top)

  const n0 = await inkCount(page)
  const x0 = t.x + t.w * 0.06, x1 = t.x + t.w * 0.94, y0 = t.y + t.h * 0.12, y1 = t.y + t.h * 0.88
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 8, i % 2 ? y1 : y0, { steps: 6 })
  await page.mouse.up()
  await assertInk(page, n0 + 1, 'the scribble')

  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-e2e-target]')).display === 'none', null, { timeout: 3000 })
    .catch(async () => fail(`the target never left the layout: ${JSON.stringify(await page.evaluate(() => ({ o: globalThis.__s2cOptimistic, pend: [...document.querySelectorAll("[data-s2c-pending]")].map((e) => e.getAttribute("data-s2c") + " " + e.getAttribute("style")), fr: globalThis.__FR__.slice(-3) })))}`))
  await page.waitForTimeout(450) // let the glide finish
  const erase = await page.evaluate(() => {
    const lift = globalThis.__LIFT__.at(-1)
    const fr = globalThis.__FR__.filter((f) => f.ts >= lift - 1)
    return { lift, fr, nextTopEnd: document.querySelector('[data-e2e-next]').getBoundingClientRect().top }
  })
  const first = erase.fr.find((f) => f.op < 0.97)
  const liftToVisible = first ? first.ts - erase.lift : null
  log(`lift → visibly fading: ${liftToVisible?.toFixed(1)} ms`, JSON.stringify(erase.fr.slice(0, 8).map((f) => [+(f.ts - erase.lift).toFixed(1), +f.op.toFixed(2)])))
  if (liftToVisible == null || liftToVisible >= 50) fail(`lift → visible took ${liftToVisible} ms (budget 50)`)
  const fadeFrames = erase.fr.filter((f) => !f.gone && f.op > 0.02 && f.op < 0.97).length
  log(`fade: ${fadeFrames} in-between frames`)
  if (fadeFrames < 4) fail(`the fade is a jump (${fadeFrames} in-between frames)`)
  const travel = nextTop0 - erase.nextTopEnd
  const tops = erase.fr.filter((f) => f.gone).map((f) => f.nextTop)
  const mid = tops.filter((y) => y < nextTop0 - 1 && y > erase.nextTopEnd + 1)
  log(`neighbour glides ${travel.toFixed(1)} px through ${mid.length} in-between frames`)
  if (travel < 10) fail(`neighbour did not move up into the gap (${travel} px)`)
  if (mid.length < 6) fail(`neighbour jumped instead of gliding (${mid.length} in-between frames)`)
  for (let i = 1; i < tops.length; i++) if (tops[i] > tops[i - 1] + 0.5) fail('neighbour glide is not monotonic')

  // frame timing over the whole motion (lift → end of glide)
  const motion = erase.fr.filter((f, i) => i > 0)
  const gaps = motion.map((f, i) => f.ts - erase.fr[i].ts).filter((g) => g > 0).sort((a, b) => a - b)
  const pct = (p) => gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))]
  const smooth = gaps.filter((g) => g < 20).length / gaps.length
  const frames = { p50: pct(0.5), p95: pct(0.95), max: gaps.at(-1), under20: smooth, n: gaps.length }
  log(`frames: p50 ${frames.p50.toFixed(1)} ms, p95 ${frames.p95.toFixed(1)} ms, max ${frames.max.toFixed(1)} ms, ${(smooth * 100).toFixed(0)}% under 20 ms`)
  if (frames.p95 > 20) fail(`motion below 60 fps: p95 frame ${frames.p95} ms`)

  // the run's snapshot was taken without the motion on it
  await page.waitForFunction(() => true)
  for (let i = 0; i < 100 && snapshotRect === null; i++) await page.waitForTimeout(100)
  if (snapshotRect === null) fail("the run's snapshot did not include the target — the erase leaked into it")
  log('✓ the run snapshot still saw the target')

  // take it back: the run fails → gap opens smoothly, target fades back in
  await page.evaluate(() => { globalThis.__FR__ = []; const el = document.querySelector('[data-e2e-target]'); const nx = document.querySelector('[data-e2e-next]')
    const tick = (ts) => { const cs = getComputedStyle(el); globalThis.__FR__.push({ ts, op: cs.display === 'none' ? 0 : Number(cs.opacity), gone: cs.display === 'none', nextTop: nx.getBoundingClientRect().top }); if (globalThis.__FR__.length < 120) requestAnimationFrame(tick) }
    requestAnimationFrame(tick) })
  releaseRun()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-e2e-target]')).display !== 'none', null, { timeout: 20000 })
    .catch(() => fail('the failed run never put the target back'))
  await page.waitForTimeout(700)
  const back = await page.evaluate(() => ({
    fr: globalThis.__FR__,
    style: document.querySelector('[data-e2e-target]').getAttribute('style'),
    pending: document.querySelector('[data-e2e-target]').getAttribute('data-s2c-pending'),
    nextTop: document.querySelector('[data-e2e-next]').getBoundingClientRect().top,
    anims: document.getAnimations().length,
  }))
  const backMid = back.fr.filter((f) => !f.gone && f.nextTop > erase.nextTopEnd + 1 && f.nextTop < nextTop0 - 1).length
  const fadeIn = back.fr.filter((f) => !f.gone && f.op > 0.02 && f.op < 0.97).length
  log(`take-back: neighbour ${backMid} in-between frames, fade-in ${fadeIn} frames`)
  if (backMid < 6) fail(`the gap snapped open (${backMid} in-between frames)`)
  if (fadeIn < 4) fail(`the target popped back (${fadeIn} fade frames)`)
  if (Math.abs(back.nextTop - nextTop0) > 0.5) fail(`neighbour not back where it was (${back.nextTop} vs ${nextTop0})`)
  if (back.style !== t.style || back.pending !== null) fail(`target not restored exactly (style ${t.style} → ${back.style}, pending ${back.pending})`)
  log('✓ take-back glides open, fades in, restores exactly')

  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}erase-frames.json`, JSON.stringify({
    target: { tag: t.tag, src: t.src }, liftToVisibleMs: liftToVisible, fadeFrames, glidePx: travel, glideFrames: mid.length,
    frames, takeBack: { glideFrames: backMid, fadeInFrames: fadeIn },
    log: erase.fr.map((f) => ({ t: +(f.ts - erase.lift).toFixed(1), op: +f.op.toFixed(3), gone: f.gone, nextTop: +f.nextTop.toFixed(1) })),
  }, null, 1))
  log('✓ erase is physical: fade, glide, 60 fps, exact take-back')
} finally {
  await b.close()
}

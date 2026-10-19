/**
 * e2e (goal loop n7): adding grows in, recolouring eases. Zero tokens: the
 * run is stubbed and the code's result (the hot reload) is simulated by the
 * DOM change React would make.
 *
 *   A. ADD — a caret between two navbar links:
 *      1. the pending ghost shows < 50 ms after lift and GROWS in (its width
 *         rises over >= 3 frames, it is visible on its first frame)
 *      2. the code's new link lands (inserted into the row): it grows in
 *         (opacity rises over >= 5 frames, starting faint), and the link it
 *         pushes glides right through >= 4 in-between spots and ends exactly
 *         where the layout puts it (no jump)
 *   B. RECOLOUR — a green ring round the "Team members" heading:
 *      1. the colour changes < 50 ms after lift
 *      2. it eases: >= 4 distinct in-between colours, ends exactly green,
 *         never back toward the old colour on the way
 *      3. the run fails: it eases back (>= 3 in-between colours) and ends at
 *         exactly the original colour, style attribute as before
 *   Frame intervals over all of it: p95 <= 20 ms (60 fps).
 *
 * Starts its own vite on :5264. Run from the repo root.
 * Writes docs/motion/add-recolour-frames.json.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { ensureDraw } from './lib/pen.mjs'

const PORT = 5264
const APP = `http://localhost:${PORT}/`
const ROOT = new URL('../../', import.meta.url).pathname
const OUT = `${ROOT}docs/motion/`
const GREEN = '#16a34a'
const log = (...a) => console.log('[e2e-motion-add-recolour]', ...a)
let failures = 0
const check = (label, ok, extra = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${extra ? ` — ${extra}` : ''}`)
  if (!ok) failures++
  return ok
}

const vite = spawn(`${ROOT}node_modules/.bin/vite`, ['--port', String(PORT), '--strictPort'], {
  cwd: `${ROOT}examples/demo-app`, env: { ...process.env, S2C_STUB_MODEL: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
})
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start')), 30000)
  vite.stdout.on('data', (d) => { if (/ready in/.test(String(d))) { clearTimeout(t); res() } })
})

const report = { intervals: [] }
const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: s.at(-1), under20: s.filter((x) => x <= 20).length / s.length }
}
const intervalsOf = (fr) => fr.slice(1).map((f, i) => f.ts - fr[i].ts)

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.addInitScript(() => {
    globalThis.__LIFT__ = []
    addEventListener('pointerup', (e) => globalThis.__LIFT__.push(e.timeStamp), true)
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ }
  })
  const open = async () => {
    await page.goto(APP, { waitUntil: 'networkidle' })
    for (let i = 0; i < 20; i++) {
      if ((await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()))).hasPipeline) break
      await page.waitForTimeout(500)
    }
    await ensureDraw(page)
  }
  const draw = async (pts, steps = 4) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps })
    await page.mouse.up()
  }
  const rectOf = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height }
  }, sel)
  let releaseRun = () => undefined
  const holdRun = async () => {
    await page.unroute('**/@s2c/run').catch(() => {})
    const held = new Promise((r) => { releaseRun = r })
    await page.route('**/@s2c/run', async (route) => {
      await held
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'stubbed failure' }) })
    })
  }

  // ---- A: add grows in ---------------------------------------------------------
  await open()
  await holdRun()
  const A = 'a[data-s2c="src/components/Navbar.tsx:7:11"]'
  const C = 'a[data-s2c="src/components/Navbar.tsx:8:11"]'
  // record every frame: the ghost's box, the pushed link's x, the new link's opacity
  await page.evaluate(({ a, c }) => {
    document.querySelector(c).setAttribute('data-e2e-pushed', 'c')
    document.querySelector(a).setAttribute('data-e2e-pushed', 'a')
    globalThis.__FR__ = []
    globalThis.__REC__ = true
    const layer = document.getElementById('s2c-overlay-host').shadowRoot.getElementById('pending')
    const tick = (ts) => {
      const g = layer.querySelector('.pg.ghost')
      const gr = g?.getBoundingClientRect()
      const fresh = document.querySelector('[data-e2e-fresh]')
      globalThis.__FR__.push({
        ts,
        ghostW: gr ? gr.width : null, ghostO: g ? Number(getComputedStyle(g).opacity) : null,
        ax: document.querySelector('[data-e2e-pushed=a]').getBoundingClientRect().left,
        cx: document.querySelector('[data-e2e-pushed=c]').getBoundingClientRect().left,
        freshO: fresh ? Number(getComputedStyle(fresh).opacity) : null,
      })
      if (globalThis.__REC__) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, { a: A, c: C })
  const a = await rectOf(A)
  const c = await rectOf(C)
  const gx = (a.x + a.w + c.x) / 2
  const y = a.y + a.h
  await draw([[gx - 9, y + 16], [gx - 4, y + 8], [gx, y], [gx + 4, y + 8], [gx + 9, y + 16]])
  await page.waitForFunction(() => !!globalThis.__s2cPreview, null, { timeout: 3000 }).catch(() => {})
  const coding = await page.waitForFunction(() => !!document.getElementById('s2c-overlay-host').dataset.flight || document.getElementById('s2c-overlay-host').dataset.mode === 'running', null, { timeout: 10000 }).then(() => true, () => false)
  check('A: the run started by itself (the code is being written)', coding)
  await page.waitForTimeout(150)
  // the code lands: the new link React would insert, between the two
  const pushedFinal = await page.evaluate(({ a, c }) => {
    const left = document.querySelector(a)
    const n = document.createElement('a')
    n.className = left.className
    n.href = '#'
    n.textContent = 'Blog'
    n.setAttribute('data-e2e-fresh', '1')
    n.setAttribute('data-s2c', 'src/components/Navbar.tsx:8:11')
    document.querySelector(c).setAttribute('data-s2c', 'src/components/Navbar.tsx:9:11')
    left.after(n)
    globalThis.__INSERTED__ = performance.now()
    // where the layout puts the pushed link, with no animation on
    const at = (el) => {
      const anims = el.getAnimations()
      const saved = anims.map((x) => x.currentTime)
      anims.forEach((x) => x.pause())
      anims.forEach((x) => { x.currentTime = x.effect.getTiming().duration })
      const fx = el.getBoundingClientRect().left
      anims.forEach((x, i) => { x.currentTime = saved[i]; x.play() })
      return fx
    }
    return { a: at(document.querySelector('[data-e2e-pushed=a]')), c: at(document.querySelector('[data-e2e-pushed=c]')) }
  }, { a: A, c: C })
  await page.waitForTimeout(600)
  const frA = await page.evaluate(() => { globalThis.__REC__ = false; return { fr: globalThis.__FR__, lift: globalThis.__LIFT__.at(-1), ins: globalThis.__INSERTED__, grown: globalThis.__s2cGrown ?? null } })
  releaseRun()
  const lift = frA.lift
  const ghostFrames = frA.fr.filter((f) => f.ghostW != null && f.ts >= lift)
  const firstGhost = ghostFrames[0]
  const msGhost = firstGhost ? firstGhost.ts - lift : null
  check('A1: ghost visible < 50 ms after lift', msGhost != null && msGhost < 50 && firstGhost.ghostO > 0.3, `${msGhost?.toFixed(1)} ms, opacity ${firstGhost?.ghostO}`)
  const ws = [...new Set(ghostFrames.slice(0, 15).map((f) => Math.round(f.ghostW * 10) / 10))]
  check('A1: the ghost grows in (width rises over >= 3 frames)', ws.length >= 3 && ws.at(-1) > ws[0], ws.join(','))
  check('A2: the addition was recognised as landing in the code\'s own task', !!frA.grown && frA.grown.added === 1, JSON.stringify(frA.grown))
  const after = frA.fr.filter((f) => f.ts >= frA.ins)
  const os = after.map((f) => f.freshO).filter((o) => o != null)
  const rising = [...new Set(os.filter((o) => o < 0.999).map((o) => o.toFixed(3)))]
  check('A2: the new link grows in (starts faint, >= 5 rising frames)', os.length > 0 && os[0] < 0.5 && rising.length >= 5 && os.at(-1) > 0.999, `${os.slice(0, 14).map((o) => o.toFixed(2)).join(',')}`)
  // the navbar's link group is pushed out from the right: whichever neighbour the layout moved must glide
  const which = Math.abs(pushedFinal.a - a.x) > Math.abs(pushedFinal.c - c.x) ? 'a' : 'c'
  const x0 = which === 'a' ? a.x : c.x
  const fin = pushedFinal[which]
  const xs = after.map((f) => f[`${which}x`])
  const mids = [...new Set(xs.filter((x) => Math.abs(x - fin) > 0.5 && Math.abs(x - x0) > 0.5).map((x) => x.toFixed(1)))]
  const dir = Math.sign(fin - x0)
  let mono = true
  for (let i = 1; i < xs.length; i++) if ((xs[i] - xs[i - 1]) * dir < -0.5) mono = false
  check('A2: the layout really moved a neighbour', Math.abs(fin - x0) > 10, `${which}: ${x0.toFixed(1)} → ${fin.toFixed(1)}`)
  check('A2: the pushed link glides aside (>= 4 in-between spots, never back)', mids.length >= 4 && mono && Math.abs(xs[0] - x0) < 1, `${which} from ${x0.toFixed(1)} via ${mids.length} to ${fin.toFixed(1)}`)
  check('A2: it ends exactly where the layout puts it', Math.abs(xs.at(-1) - fin) < 0.5, `${xs.at(-1)} vs ${fin}`)
  report.add = { liftToGhostMs: msGhost, ghostWidths: ws, grown: frA.grown, freshOpacity: os.slice(0, 20), pushed: which, pushedX: xs.slice(0, 20), pushedFinal: fin }
  report.intervals.push(...intervalsOf(frA.fr))
  await page.waitForTimeout(500)

  // ---- B: recolour eases -------------------------------------------------------
  await open()
  await holdRun()
  // green pen
  await page.keyboard.press('Alt+p')
  await page.waitForTimeout(500)
  await page.evaluate((hex) => {
    const input = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('penCustom')
    input.value = hex
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, GREEN)
  await page.waitForTimeout(300)
  await page.keyboard.press('Alt+p')
  await page.waitForTimeout(200)
  const m = await page.evaluate(() => {
    const el = [...document.querySelectorAll('section h2')].find((e) => e.textContent.trim() === 'Team members')
    el.setAttribute('data-e2e-recol', '1')
    const r = el.getBoundingClientRect()
    return { before: getComputedStyle(el).color, style: el.getAttribute('style'), rect: { x: r.x, y: r.y, w: r.width, h: r.height } }
  })
  await page.evaluate(() => {
    globalThis.__FR__ = []
    globalThis.__REC__ = true
    const el = document.querySelector('[data-e2e-recol]')
    const tick = (ts) => {
      globalThis.__FR__.push({ ts, c: getComputedStyle(el).color })
      if (globalThis.__REC__) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const r = m.rect
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2
  await draw(Array.from({ length: 25 }, (_, i) => [cx + (r.w / 2 + 12) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (r.h / 2 + 12) * Math.sin((i / 24) * 2.08 * Math.PI)]), 6)
  await page.waitForTimeout(700)
  const mid = await page.evaluate(() => ({ fr: globalThis.__FR__, lift: globalThis.__LIFT__.at(-1), now: performance.now() }))
  releaseRun()
  await page.waitForFunction(() => !document.querySelector('[data-e2e-recol]')?.getAttribute('data-s2c-pending'), null, { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(500)
  const frB = await page.evaluate(() => { globalThis.__REC__ = false; return globalThis.__FR__ })
  const end = await page.evaluate(() => { const el = document.querySelector('[data-e2e-recol]'); return { c: getComputedStyle(el).color, style: el.getAttribute('style') } })
  const rgb = (s) => { const n = s.match(/[\d.]+/g)?.map(Number) ?? []; return s.startsWith('color(srgb') ? n.slice(0, 3).map((v) => v * 255) : n.slice(0, 3) }
  const g0 = [22, 163, 74]
  const distTo = (s, t) => Math.hypot(...rgb(s).map((v, i) => v - t[i]))
  const o0 = rgb(m.before)
  const out = mid.fr.filter((f) => f.ts >= mid.lift)
  const firstChange = out.find((f) => f.c !== m.before)
  const msRec = firstChange ? firstChange.ts - mid.lift : null
  check('B1: colour changes < 50 ms after lift', msRec != null && msRec < 50, `${msRec?.toFixed(1)} ms`)
  const way = out.filter((f) => f.c !== m.before).map((f) => f.c)
  const between = [...new Set(way.filter((c) => distTo(c, g0) > 2))]
  let toward = true
  for (let i = 1; i < way.length; i++) if (distTo(way[i], g0) > distTo(way[i - 1], g0) + 1) toward = false
  check('B2: it eases (>= 4 in-between colours, only ever toward green)', between.length >= 4 && toward, `${between.length}: ${between.slice(0, 3).join(' | ')}`)
  check('B2: ends exactly green', distTo(way.at(-1) ?? m.before, g0) < 1.5, way.at(-1))
  const back = frB.filter((f) => f.ts > mid.now)
  const backMid = [...new Set(back.map((f) => f.c).filter((c) => distTo(c, g0) > 2 && distTo(c, o0) > 2))]
  check('B3: the take-back eases (>= 3 in-between colours)', backMid.length >= 3, `${backMid.length}`)
  check('B3: ends at exactly the original colour and style', end.c === m.before && end.style === m.style, `${end.c} style=${end.style}`)
  report.recolour = { liftToChangeMs: msRec, easedThrough: between.length, takeBackThrough: backMid.length, colours: way.slice(0, 14) }
  report.intervals.push(...intervalsOf(frB))

  const st = stats(report.intervals)
  check('frame intervals p95 <= 20 ms (60 fps)', st.p95 <= 20, JSON.stringify(st))
  check('no page errors', errors.length === 0, errors.join(' | '))
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}add-recolour-frames.json`, JSON.stringify({ ...report, intervals: undefined, frameStats: st }, null, 2))
  log(failures ? `FAIL (${failures})` : 'PASS')
  process.exitCode = failures ? 1 : 0
} finally {
  await b.close()
  vite.kill()
}

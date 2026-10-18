/**
 * Before/after table (goal loop n11): time from lifting the pen to the change
 * being visible on the page, per gesture, on the demo app.
 *
 * The same script runs on both sides:
 *   - BEFORE: a checkout of the old flow (no instant change). The change shows
 *     when the code lands and hot reload paints it. If the old flow stops at
 *     its ✓ Go gate (a delete), the script presses Go at once, so the number
 *     is a floor: a person adds their own reaction time on top.
 *   - AFTER: this branch. The change (hide / recolour) or a pending-marked
 *     preview (move / insert / new section) shows at pen lift.
 *
 * "Visible" is checked every animation frame by a watcher installed with
 * addInitScript, so it survives a full page reload during the run. Lift is the
 * pointerup event's own timestamp. Both are epoch ms (performance.timeOrigin).
 *
 * A gesture counts as visible when:
 *   scribble  the scribbled element is hidden or gone
 *   ring      the ringed element's colour changed
 *   move      a pending preview is up, or Send invite moved up
 *   insert    a pending preview is up, or the nav reads Overview,Blog,...
 *   section   a pending preview is up, or an FAQ section is on the page
 *
 * Env:
 *   S2C_SIDE=before|after   label only (default after)
 *   S2C_REPS=3              repeats for scribble and ring (no model, free)
 *   S2C_MODEL_REPS=1        repeats for move/insert/section
 *   S2C_STUB_MODEL=1        hold /@s2c/interpret and /@s2c/run open for the
 *                           model gestures (no tokens). Only meaningful AFTER,
 *                           where the preview does not wait on the server.
 *   S2C_ONLY=scribble,ring  subset
 *   S2C_OUT=file.json       write the samples
 * Needs the demo dev server on :5199 (S2C_APP to change). The demo source is
 * restored (git checkout + clean) after every gesture.
 */
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { ensureDraw, inkCount } from './lib/pen.mjs'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const SIDE = process.env.S2C_SIDE ?? 'after'
const REPS = Number(process.env.S2C_REPS ?? 3)
const MODEL_REPS = Number(process.env.S2C_MODEL_REPS ?? 1)
const STUB_MODEL = process.env.S2C_STUB_MODEL === '1'
const ONLY = process.env.S2C_ONLY?.split(',')
const DEMO_SRC = new URL('../../examples/demo-app/src', import.meta.url).pathname
const GREEN = '#16a34a'
const log = (...a) => console.log(`[latency:${SIDE}]`, ...a)
const restoreSource = () => {
  try { execFileSync('git', ['checkout', '--', DEMO_SRC], { stdio: 'ignore' }) } catch { /* nothing */ }
  try { execFileSync('git', ['clean', '-fdq', '--', DEMO_SRC], { stdio: 'ignore' }) } catch { /* nothing */ }
}

const b = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const samples = []
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(() => {
    try { localStorage.setItem('s2c:auto', 'auto') } catch { /* default */ }
    const KEY = 's2c:latency'
    const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? 'null') } catch { return null } }
    const write = (v) => { try { sessionStorage.setItem(KEY, JSON.stringify(v)) } catch { /* */ } }
    addEventListener('pointerup', (e) => {
      const s = read()
      if (s && s.armed && s.lift == null) { s.lift = performance.timeOrigin + e.timeStamp; write(s) }
    }, true)
    const pendingUp = () => (document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('pending')?.children.length ?? 0) > 0
    const visible = (el) => !!el && el.isConnected && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0
    const checks = {
      scribble: (s) => ![...document.querySelectorAll('[data-s2c]')].some((el) =>
        el.getAttribute('data-s2c') === s.src && (el.textContent ?? '').trim() === s.text && visible(el)),
      ring: (s) => {
        const el = [...document.querySelectorAll(s.sel)].find((e) => (e.textContent ?? '').trim() === s.text)
        return !!el && getComputedStyle(el)[s.prop] !== s.before
      },
      move: (s) => {
        if (pendingUp()) return true
        const el = [...document.querySelectorAll('[data-s2c]')].find((e) => (e.textContent ?? '').trim() === 'Send invite' && visible(e))
        return !!el && el.getBoundingClientRect().top < s.y - 60
      },
      insert: () => pendingUp() || [...document.querySelectorAll('nav a')].map((a) => (a.textContent ?? '').trim()).includes('Blog'),
      section: () => pendingUp() || [...document.querySelectorAll('[data-s2c]')].some((e) =>
        /\bFAQ\b|frequently asked/i.test(e.textContent ?? '') && e.getBoundingClientRect().height > 0),
    }
    const tick = () => {
      const s = read()
      if (s && s.lift != null && s.seen == null) {
        let ok = false
        try { ok = checks[s.kind](s) } catch { ok = false }
        if (ok) { s.seen = performance.timeOrigin + performance.now(); write(s) }
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('status')?.textContent ?? '').catch(() => '')
  const state = () => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('s2c:latency') ?? 'null') } catch { return null } }).catch(() => null)
  const arm = (spec) => page.evaluate((s) => sessionStorage.setItem('s2c:latency', JSON.stringify({ ...s, armed: true, lift: null, seen: null })), spec)
  const open = async () => {
    restoreSource()
    await page.goto(APP, { waitUntil: 'networkidle' })
    await page.evaluate(() => sessionStorage.removeItem('s2c:latency'))
    for (let i = 0; i < 40; i++) {
      const ping = await page.evaluate(() => fetch('/@s2c/ping').then((r) => r.json()).catch(() => ({})))
      if (ping.hasPipeline) break
      await page.waitForTimeout(500)
    }
    await page.waitForTimeout(600)
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
  const greenPen = async () => {
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
  }

  const gestures = {
    scribble: {
      model: false,
      setup: async () => {
        const t = await page.evaluate(() => {
          const els = [...document.querySelectorAll('[data-s2c]')].filter((el) => {
            if (el.closest('#s2c-overlay-host')) return false
            const r = el.getBoundingClientRect()
            return r.top > 80 && r.bottom < innerHeight - 20 && r.width >= 120 && r.width <= 420 && r.height >= 40 && r.height <= 160 &&
              (el.textContent ?? '').trim().length > 0
          })
          els.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)
          const el = els[0]
          const r = el.getBoundingClientRect()
          return { src: el.getAttribute('data-s2c'), text: (el.textContent ?? '').trim(), x: r.left, y: r.top, w: r.width, h: r.height }
        })
        const x0 = t.x + t.w * 0.06, x1 = t.x + t.w * 0.94, y0 = t.y + t.h * 0.1, y1 = t.y + t.h * 0.9
        const pts = [[x0, y0]]
        for (let i = 1; i <= 8; i++) pts.push([x0 + ((x1 - x0) * i) / 8, i % 2 ? y1 : y0])
        return { spec: { kind: 'scribble', src: t.src, text: t.text }, pts, steps: 6, what: `${t.src} "${t.text.slice(0, 24)}"` }
      },
    },
    ring: {
      model: false,
      setup: async () => {
        await greenPen()
        const c = { sel: 'section h2', text: 'Team members', prop: 'color' }
        const r = await page.evaluate(({ sel, text, prop }) => {
          const el = [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === text)
          const b = el.getBoundingClientRect()
          return { x: b.x, y: b.y, w: b.width, h: b.height, before: getComputedStyle(el)[prop] }
        }, c)
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2, pad = 12
        const pts = Array.from({ length: 25 }, (_, i) => [cx + (r.w / 2 + pad) * Math.cos((i / 24) * 2.08 * Math.PI), cy + (r.h / 2 + pad) * Math.sin((i / 24) * 2.08 * Math.PI)])
        return { spec: { kind: 'ring', ...c, before: r.before }, pts, steps: 6, what: 'Team members heading, green' }
      },
    },
    move: {
      model: true,
      setup: async () => {
        const btn = await rectOf('button[data-s2c^="src/components/ContactForm.tsx"]')
        const h2 = await rectOf('h2[data-s2c^="src/components/ContactForm.tsx"]')
        const x0 = btn.x + btn.w / 2, y0 = btn.y + btn.h / 2, x1 = h2.x + h2.w / 2, y1 = h2.y + h2.h / 2
        const shaft = []
        for (let i = 0; i <= 12; i++) shaft.push([x0 + ((x1 - x0) * i) / 12 + (i % 2 ? 1 : -1), y0 + ((y1 - y0) * i) / 12])
        return { spec: { kind: 'move', y: btn.y }, pts: [...shaft, [x1 - 14, y1 + 18], [x1, y1], [x1 + 14, y1 + 18]], what: 'arrow: Send invite up to the heading' }
      },
    },
    insert: {
      model: true,
      note: 'Blog',
      setup: async () => {
        const a = await rectOf('a[data-s2c="src/components/Navbar.tsx:7:11"]')
        const c = await rectOf('a[data-s2c="src/components/Navbar.tsx:8:11"]')
        const gx = (a.x + a.w + c.x) / 2, y = a.y + a.h
        return { spec: { kind: 'insert' }, pts: [[gx - 9, y + 16], [gx - 4, y + 8], [gx, y], [gx + 4, y + 8], [gx + 9, y + 16]], what: 'caret in the nav, note "Blog"' }
      },
    },
    section: {
      model: true,
      note: 'FAQ section',
      setup: async () => {
        const form = await rectOf('form[data-s2c^="src/components/ContactForm.tsx"]')
        const x = form.x + 10, y = form.y + form.h + 40, w = form.w - 20, h = 90
        const pts = []
        const side = (ax, ay, bx, by) => { for (let i = 0; i < 8; i++) pts.push([ax + ((bx - ax) * i) / 8, ay + ((by - ay) * i) / 8]) }
        side(x, y, x + w, y + 1); side(x + w, y + 1, x + w - 1, y + h); side(x + w - 1, y + h, x + 1, y + h - 1); side(x + 1, y + h - 1, x + 2, y + 3)
        pts.push([x + 6, y + 1])
        return { spec: { kind: 'section' }, pts, what: 'box below the form, note "FAQ section"' }
      },
    },
  }

  for (const [kind, g] of Object.entries(gestures)) {
    if (ONLY && !ONLY.includes(kind)) continue
    const reps = g.model ? MODEL_REPS : REPS
    for (let rep = 0; rep < reps; rep++) {
      await open()
      const held = []
      if (g.model && STUB_MODEL) {
        for (const p of ['**/@s2c/interpret', '**/@s2c/run']) {
          await page.route(p, (route) => { held.push(route) }) // never answered: nothing is spent
        }
      }
      const { spec, pts, steps, what } = await g.setup()
      const n0 = await inkCount(page)
      await arm(spec)
      await draw(pts, steps)
      if (g.note) {
        await page.waitForTimeout(450)
        await page.keyboard.type(g.note, { delay: 20 })
        await page.keyboard.press('Enter')
      }
      const t0 = Date.now()
      let s = null, pressedGo = false, lastSt = ''
      while (Date.now() - t0 < 240_000) {
        s = await state()
        if (s?.seen != null) break
        // the old flow's ✓ Go gate: press it at once (a floor for a person)
        const go = await page.evaluate(() => {
          const c = document.getElementById('s2c-overlay-host')?.shadowRoot?.getElementById('confirm')
          return !!c && c.style.display !== 'none' && c.offsetParent !== null
        }).catch(() => false)
        if (go && !pressedGo) {
          pressedGo = true
          await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click()).catch(() => {})
          log(`${kind}: pressed ✓ Go at ${Date.now() - t0} ms`)
        }
        const st = await status()
        if (st && st !== lastSt) { lastSt = st }
        await page.waitForTimeout(50)
      }
      const ms = s?.seen != null && s?.lift != null ? Math.round((s.seen - s.lift) * 10) / 10 : null
      log(`${kind} #${rep + 1} (${what}): ${ms == null ? 'NEVER visible' : `${ms} ms`}${pressedGo ? ' (Go pressed instantly)' : ''}; ink ${n0}→${await inkCount(page)}; status "${lastSt.slice(0, 80)}"`)
      samples.push({ side: SIDE, kind, rep: rep + 1, ms, pressedGo, stubbedModel: g.model && STUB_MODEL, what })
      // let a live run finish before the source is reset, so it cannot write after the reset
      if (!(g.model && STUB_MODEL)) {
        for (let i = 0; i < 1200; i++) {
          const st = await status()
          if ((await inkCount(page)) === 0 && /✓|⚠|✗/.test(st)) break
          await page.waitForTimeout(200)
        }
      }
      for (const r of held) await r.abort().catch(() => {})
      await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {})
      restoreSource()
    }
  }
} finally {
  await b.close()
  restoreSource()
  if (process.env.S2C_OUT) writeFileSync(process.env.S2C_OUT, JSON.stringify(samples, null, 2))
  log('samples:', JSON.stringify(samples.map((x) => [x.kind, x.ms])))
}

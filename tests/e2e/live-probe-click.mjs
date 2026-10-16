/**
 * Live e2e: CLICK PROBES — "clicking this changes that" is tested by clicking.
 *
 * The arrow from a button to a region is the acceptance test: click the
 * trigger in the real page, wait for it to settle, look at the region. This
 * file proves the verdict is right in the cases a toggle actually comes in,
 * including the two that fool a naive before/after:
 *
 *   A. a wired show/hide toggle                               → PASSED
 *   B. a button with no handler (looks finished, does nothing) → FAILED
 *   C. a button that only flips its OWN label ("Show tips" ↔
 *      "Hide tips") while the tips never appear; the region the
 *      arrow points at contains the button                     → FAILED
 *      (the trigger's own text changing is not the effect)
 *   D. a theme switch: only the region's classes change, no
 *      text, no nodes, nothing hidden                          → PASSED
 *   E. a dismiss button that unmounts the region (React's usual
 *      conditional render)                                     → PASSED
 *   F. A again with the arrow pointing at the whole card       → PASSED
 *   G. a button with no handler in a card with a ticking clock;
 *      the arrow points at the card                            → UNVERIFIED
 *      (the clock changes the card during any settle window,
 *      so a dead button would pass on a naive before/after)
 *   H. a wired toggle in a card with a ticking clock           → UNVERIFIED
 *      (honest: the click can't be told apart from the tick)
 *   I. G's dead button with the arrow at its own panel, which
 *      does not hold the clock                                 → FAILED
 *      (the idle watch only looks at the region, not the page)
 *   and: no navigation, no page errors, no request leaves the dev server.
 *
 * Zero tokens: the fixture component is written to disk by this test and
 * removed again; probes go through /@s2c/probe like run2 does.
 *
 * Needs the demo dev server: npm run dev   (port 5199)
 * Run FROM THE REPO ROOT: node tests/e2e/live-probe-click.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const REPO = new URL('../../', import.meta.url).pathname
const APPDIR = `${REPO}examples/demo-app`
const log = (...a) => console.log('[e2e-probe-click]', ...a)
const restore = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: REPO })
  execSync('git clean -fdq examples/demo-app/src examples/demo-app/server', { cwd: REPO })
}
const assert = (ok, msg) => { if (!ok) throw new Error(`ASSERT: ${msg}`) }

const FIXTURE = `import { useEffect, useState } from 'react'

function Clock() {
  const [t, setT] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), 1000)
    return () => clearInterval(id)
  }, [])
  return <span className="tabular-nums">{t}s</span>
}

export default function ProbeToggles() {
  const [stats, setStats] = useState(false)
  const [open, setOpen] = useState(false)
  const [tips, setTips] = useState(false)
  const [dark, setDark] = useState(false)
  const [note, setNote] = useState(true)
  return (
    <section id="pt" className="grid grid-cols-2 gap-4">
      <div id="pt-a" className="rounded border p-3">
        <button id="pt-a-btn" onClick={() => setOpen((o) => !o)}>Show details</button>
        <div id="pt-a-panel" className={open ? 'mt-2 block' : 'hidden'}>Here are the details</div>
      </div>
      <div id="pt-b" className="rounded border p-3">
        <button id="pt-b-btn">Show more</button>
        <div id="pt-b-panel" className="hidden">More words</div>
      </div>
      <div id="pt-c" className="rounded border p-3">
        <button id="pt-c-btn" onClick={() => setTips((t) => !t)}>{tips ? 'Hide tips' : 'Show tips'}</button>
        <p id="pt-c-panel" className="hidden">Tip: drag to draw</p>
      </div>
      <div id="pt-d" className={dark ? 'rounded border bg-gray-900 p-3 text-white' : 'rounded border bg-white p-3'}>
        <button id="pt-d-btn" onClick={() => setDark((d) => !d)}>Dark mode</button>
        <p>Theme preview</p>
      </div>
      <div id="pt-e" className="rounded border p-3">
        <button id="pt-e-btn" onClick={() => setNote(false)}>Dismiss</button>
        {note && <p id="pt-e-note">A note you can dismiss</p>}
      </div>
      <div id="pt-g" className="rounded border p-3">
        <button id="pt-g-btn">Show stats</button>
        <p id="pt-g-panel" className="hidden">Stats here</p>
        <p>Updated <Clock /> ago</p>
      </div>
      <div id="pt-h" className="rounded border p-3">
        <button id="pt-h-btn" onClick={() => setStats((s) => !s)}>Show stats</button>
        <p id="pt-h-panel" className={stats ? 'block' : 'hidden'}>Stats here</p>
        <p>Updated <Clock /> ago</p>
      </div>
    </section>
  )
}
`

restore()
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))
const navigations = []
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations.push(f.url()) })
const offsite = []
page.on('request', (r) => { if (!r.url().startsWith(APP.replace(/\/$/, '')) && !r.url().startsWith('data:')) offsite.push(r.url()) })

const sh = (fn, arg) => page.evaluate(fn, arg)

/** Ask the server to click `trigger` and watch `effect` (element ids). */
async function probeClick(trigger, effect) {
  return sh(async ([t, e]) => {
    const loc = (id) => document.getElementById(id)?.getAttribute('data-s2c')
    const spec = {
      actionIndex: 0, kind: 'click',
      trigger: { srcLoc: loc(t), label: `"${document.getElementById(t)?.textContent?.trim()}"` },
      effect: { srcLoc: loc(e), label: `the ${e}` },
      claim: `clicking ${t} changes ${e}`,
    }
    if (!spec.trigger.srcLoc || !spec.effect.srcLoc) return { ok: false, error: `not stamped: ${t}/${e}` }
    const res = await fetch('/@s2c/probe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': window.__S2C_TOKEN__ },
      body: JSON.stringify({ specs: [spec] }),
    })
    return res.json()
  }, [trigger, effect])
}

const fresh = async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null && document.getElementById('pt-a-btn'), null, { timeout: 15000 })
  await page.waitForTimeout(300)
}

try {
  writeFileSync(`${APPDIR}/src/components/ProbeToggles.tsx`, FIXTURE)
  const app = readFileSync(`${APPDIR}/src/App.tsx`, 'utf8')
  writeFileSync(`${APPDIR}/src/App.tsx`, app
    .replace("import WeeklySchedule from './components/WeeklySchedule'", "import WeeklySchedule from './components/WeeklySchedule'\nimport ProbeToggles from './components/ProbeToggles'")
    .replace('<ChevronTrail />', '<ChevronTrail />\n            <ProbeToggles />'))
  await page.waitForTimeout(1500)
  await page.goto(APP, { waitUntil: 'networkidle' })
  await fresh()

  const cases = [
    ['A wired toggle', 'pt-a-btn', 'pt-a-panel', 'passed'],
    ['B no handler', 'pt-b-btn', 'pt-b-panel', 'failed'],
    ['C label-only flip, region holds the button', 'pt-c-btn', 'pt-c', 'failed'],
    ['D theme switch (classes only)', 'pt-d-btn', 'pt-d', 'passed'],
    ['E dismiss unmounts the region', 'pt-e-btn', 'pt-e-note', 'passed'],
    ['F wired toggle, arrow at the whole card', 'pt-a-btn', 'pt-a', 'passed'],
    ['G dead button, card with a clock', 'pt-g-btn', 'pt-g', 'unverified'],
    ['H wired toggle, card with a clock', 'pt-h-btn', 'pt-h', 'unverified'],
    ['I dead button, arrow at its panel (clock outside)', 'pt-g-btn', 'pt-g-panel', 'failed'],
  ]
  const wrong = []
  for (const [name, t, e, want] of cases) {
    await fresh() // every case starts from the page as loaded: probes leave state
    const navs = navigations.length
    const r = await probeClick(t, e)
    const got = r.ok ? r.verdicts[0].status : `error: ${r.error}`
    log(`${name} → ${got}${r.ok ? ` · ${r.verdicts[0].reason}` : ''}`)
    if (got !== want) wrong.push(`${name}: want ${want}, got ${got}`)
    assert(navigations.length === navs, `${name}: the probe navigated the page`)
  }
  assert(wrong.length === 0, `wrong verdicts:\n  ${wrong.join('\n  ')}`)
  assert(errs.length === 0, `page errors: ${errs.join(' | ')}`)
  assert(offsite.length === 0, `requests left the dev server: ${offsite.join(', ')}`)
  log('✓ wired passes, no-op fails, label-only fails, class-only passes, unmount passes, a ticking region is unverified · 0 tokens')
} finally {
  await b.close()
  restore()
}

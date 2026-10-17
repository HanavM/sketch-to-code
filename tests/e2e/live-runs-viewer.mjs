/**
 * Live end-to-end for the run-history surface. Boots nothing itself — expects
 * the demo dev server on 5203 (`cd examples/demo-app && npx vite --port 5203`).
 *
 * Asserts:
 *  - GET /@s2c/runs.json returns the documented summary shape, newest-first
 *  - GET /@s2c/runs/<id>/settings.json returns {fidelity, notes, mode}
 *  - the page lists runs with ink thumbnails that actually paint
 *  - the per-run "Reuse settings" link carries exactly the settings payload,
 *    and following it applies that run's settings in the app
 *  - model-written text is escaped: a <script> in a run's `reading` renders
 *    as text and does not execute
 *
 *   node tests/e2e/live-runs-viewer.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = (process.env.S2C_APP ?? 'http://localhost:5203/').replace(/\/$/, '')
const RUNS = new URL('../../examples/demo-app/.sketch2code/runs/', import.meta.url).pathname
const log = (...a) => console.log('[e2e]', ...a)
const ok = (cond, msg) => {
  if (!cond) throw new Error(`FAILED: ${msg}`)
  log('ok -', msg)
}

// ── an XSS fixture bundle: model-written text is attacker-adjacent ──────────
const XSS_ID = 'run-1799999999999-xss'
const XSS_READING =
  '<script>window.__pwned = true</script><img src=x onerror="window.__pwned=true">' +
  ' " onmouseover="window.__pwned=true" \' also here'
const dir = join(RUNS, XSS_ID)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'result.json'), JSON.stringify({
  engine: 'model',
  checkpoint: 'deadbeefcafe1234567890',
  changedFiles: ['src/<img src=x onerror=alert(1)>.tsx'],
  reading: XSS_READING,
  tokens: { input: 1234, cacheRead: 5678, output: 90 },
  codemod: { handled: [0], refused: [] },
  fidelity: { resemblance: 0.9, keep: { asymmetry: true, rhythm: true, proportions: true, placement: true }, fill: 'realized', palette: 'sketch' },
  candidates: [
    { index: 0, score: 0.4, files: ['a.tsx'], chosen: false, tokens: { input: 1, cacheRead: 2, output: 3 } },
    { index: 1, score: 0.95, files: ['a.tsx'], chosen: true },
  ],
}, null, 2))
writeFileSync(join(dir, 'notes.json'), JSON.stringify([
  { id: 'n0', text: '</script><script>window.__pwned=true</script>', scope: 'run' },
]))
writeFileSync(join(dir, 'verify-1.json'), JSON.stringify([{ kind: 'add', index: 0, verdict: { satisfied: true } }]))
// a half-written bundle, to prove a corrupt run can't 500 the endpoint
const BAD_ID = 'run-1799999999998-corrupt'
mkdirSync(join(RUNS, BAD_ID), { recursive: true })
writeFileSync(join(RUNS, BAD_ID, 'result.json'), '{"changedFiles": ["x.tsx",')
// a run where likeness, not pass/fail, is what got measured
const COMP_ID = 'run-1799999999997-comp'
mkdirSync(join(RUNS, COMP_ID), { recursive: true })
writeFileSync(join(RUNS, COMP_ID, 'verify-1.json'),
  JSON.stringify([{ kind: 'composition', index: 0, score: 0.71, flaws: ['traced'], notes: [] }]))
// ── a run history, so the page has something to list on a fresh clone ──────
// The checks below were written against the owner's Mac, which has 40+ real
// bundles. A fresh checkout (the cloud container, CI) has none, and every
// "> 20 thumbnails" / "a verified run exists" check failed for that reason
// alone (s2c-036). These 24 are shaped like real bundles: an evidence.png that
// decodes, a checkpoint, a two-action verify, notes on some, fidelity on some
// and none on the rest (the pre-fidelity case).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAYAAAC09K7GAAAAFklEQVR4nGNk+M/wn4EIwDiqkL4KAX/zBf3uXVy5AAAAAElFTkSuQmCC',
  'base64')
const HISTORY = []
for (let i = 0; i < 24; i++) {
  const id = `run-17999999990${String(i).padStart(2, '0')}-hist`
  const d = join(RUNS, id)
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, 'evidence.png'), PNG)
  writeFileSync(join(d, 'result.json'), JSON.stringify({
    engine: 'model',
    mode: i % 3 === 0 ? 'design' : 'gesture',
    checkpoint: `${String(i).padStart(2, '0')}c0ffee1234567890abcdef`,
    changedFiles: ['src/components/StatCards.tsx'],
    reading: `history fixture ${i}`,
    tokens: { input: 100 + i, cacheRead: 0, output: 10 },
    ...(i % 2 === 0
      ? { fidelity: { resemblance: 0.5, keep: { asymmetry: true, rhythm: false, proportions: true, placement: true }, fill: 'realized', palette: 'sketch' } }
      : {}),
  }))
  if (i % 4 === 0) writeFileSync(join(d, 'notes.json'), JSON.stringify([{ id: 'n0', text: `make it bigger ${i}`, scope: 'run' }]))
  writeFileSync(join(d, 'verify-1.json'), JSON.stringify([
    { kind: 'modify', index: 0, verdict: { satisfied: true } },
    { kind: 'add', index: 1, verdict: { satisfied: i % 5 !== 0 } },
  ]))
  HISTORY.push(d)
}
const FIXTURES = [dir, join(RUNS, BAD_ID), join(RUNS, COMP_ID), ...HISTORY]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } })
const page = await ctx.newPage()
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

try {
  // ── endpoint 1 ───────────────────────────────────────────────────────────
  const listRes = await page.request.get(`${BASE}/@s2c/runs.json`)
  ok(listRes.status() === 200, 'GET /@s2c/runs.json → 200')
  const runs = await listRes.json()
  // the 3 fixtures above, plus whatever history this checkout has (the owner's Mac: 40+, a fresh clone: none)
  ok(Array.isArray(runs) && runs.length >= FIXTURES.length, `runs.json is an array of ${runs.length} runs`)

  const KEYS = ['id', 'at', 'mode', 'reading', 'summaryScore', 'tokens', 'changedFiles',
    'fidelity', 'notes', 'codemod', 'candidates']
  const bad = []
  for (const r of runs) {
    const fail = (why) => bad.push(`${r.id}: ${why}`)
    for (const k of KEYS) if (!(k in r)) fail(`missing "${k}"`)
    if (!(typeof r.at === 'number' && r.at > 0)) fail(`at is not ms epoch (${r.at})`)
    if (!['gesture', 'design', 'screenshot'].includes(r.mode)) fail(`bad mode ${r.mode}`)
    if (!Array.isArray(r.changedFiles)) fail('changedFiles is not an array')
    if (!(Array.isArray(r.notes) && r.notes.every((n) => typeof n === 'string'))) fail('notes are not strings')
    if (!(typeof r.codemod?.handled === 'number' && typeof r.codemod?.refused === 'number')) fail('codemod not counts')
    if (!['input', 'cacheRead', 'output'].every((k) => typeof r.tokens?.[k] === 'number')) fail('bad tokens')
    if (!(r.reading === null || typeof r.reading === 'string')) fail('reading is neither string nor null')
    if (!(r.candidates === null || Array.isArray(r.candidates))) fail('candidates is neither array nor null')
    if (r.summaryScore) {
      if (!['verified', 'composition'].includes(r.summaryScore.kind)) fail('bad score kind')
      if (!(r.summaryScore.score >= 0 && r.summaryScore.score <= 1)) fail('score out of 0..1')
    }
    if (r.fidelity && !(typeof r.fidelity.resemblance === 'number' && 'keep' in r.fidelity
      && ['outline', 'filled', 'realized'].includes(r.fidelity.fill)
      && ['app', 'sketch'].includes(r.fidelity.palette))) fail('fidelity not normalized')
  }
  ok(bad.length === 0, `all ${runs.length} entries match the documented shape${bad.length ? `: ${bad.join(' | ')}` : ''}`)
  const descending = runs.every((r, i) => i === 0 || runs[i - 1].at >= r.at)
  ok(descending, 'runs.json is newest-first')
  ok(runs.some((r) => r.id === BAD_ID), 'the corrupt bundle is listed, not fatal')
  ok(runs.find((r) => r.id === BAD_ID).changedFiles.length === 0, 'corrupt bundle degrades to empty fields')
  const xss = runs.find((r) => r.id === XSS_ID)
  ok(xss.reading === XSS_READING, 'reading round-trips verbatim in JSON')
  ok(xss.candidates.length === 2 && xss.candidates[1].chosen === true, 'candidates array is carried through')
  const comp = runs.find((r) => r.id === COMP_ID)
  ok(comp.summaryScore.kind === 'composition' && Math.abs(comp.summaryScore.score - 0.71) < 1e-9,
    'a likeness-only run reports the composition score')
  ok(runs.some((r) => r.summaryScore?.kind === 'verified' && r.summaryScore.total > 1),
    'real runs report satisfied/total')
  ok(runs.some((r) => r.notes.length > 0), 'some run carries typed notes')

  // cheapness: 57 bundles, no PNG reads
  const t0 = Date.now()
  await page.request.get(`${BASE}/@s2c/runs.json`)
  log(`runs.json served ${runs.length} runs in ${Date.now() - t0}ms`)

  // ── endpoint 2 ───────────────────────────────────────────────────────────
  const withFidelity = runs.find((r) => r.fidelity && r.id !== XSS_ID)
  const sRes = await page.request.get(`${BASE}/@s2c/runs/${withFidelity.id}/settings.json`)
  ok(sRes.status() === 200, `GET /@s2c/runs/${withFidelity.id}/settings.json → 200`)
  const settings = await sRes.json()
  ok(Object.keys(settings).sort().join(',') === 'fidelity,mode,notes',
    `settings.json is exactly {fidelity, notes, mode} — got ${JSON.stringify(settings)}`)
  ok(JSON.stringify(settings.fidelity) === JSON.stringify(withFidelity.fidelity),
    'settings.fidelity matches the summary fidelity')

  const oldRun = runs.find((r) => r.fidelity === null && !r.id.endsWith('-corrupt') && !r.id.endsWith('-comp'))
  const oldSettings = await (await page.request.get(`${BASE}/@s2c/runs/${oldRun.id}/settings.json`)).json()
  ok(oldSettings.fidelity === null, `a pre-fidelity bundle (${oldRun.id}) yields fidelity: null`)

  const missing = await page.request.get(`${BASE}/@s2c/runs/run-does-not-exist/settings.json`)
  ok(missing.status() === 404, 'unknown run → 404')

  // ── the page ─────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/@s2c/runs`, { waitUntil: 'networkidle' })
  const cards = page.locator('article.run')
  const n = await cards.count()
  ok(n === runs.length, `page lists all ${n} runs`)

  // ink thumbnails really painted (naturalWidth > 0, not just present).
  // They are lazy, so only the ones near the viewport have decoded yet — that
  // is the point: the page stays cheap until you scroll.
  const inkStats = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('.ink img')]
    const near = imgs.slice(0, 6)
    return {
      total: imgs.length,
      nearPainted: near.filter((i) => i.complete && i.naturalWidth > 0).length,
      lazyBelow: imgs.filter((i) => !i.complete).length,
      first: imgs[0]?.getAttribute('src'),
    }
  })
  ok(inkStats.total > 20, `${inkStats.total} ink thumbnails on the page`)
  ok(inkStats.nearPainted === 6, `the 6 thumbnails above the fold decoded (${inkStats.first})`)
  log(`${inkStats.lazyBelow} thumbnails still lazy below the fold`)

  // scrolling down decodes a later one too
  await page.locator('article.run').nth(12).scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  const later = await page.evaluate(() => {
    const img = [...document.querySelectorAll('.ink img')][12]
    return img ? { complete: img.complete, w: img.naturalWidth } : null
  })
  ok(later && later.complete && later.w > 0, `a thumbnail below the fold decodes on scroll (${later?.w}px)`)
  await page.evaluate(() => window.scrollTo(0, 0))

  // git restore line, copy-able
  const restore = await page.locator('article.run .cmd code').first().textContent()
  ok(/^git restore --source=[0-9a-f]{10} -- \S/.test(restore), `restore command present: ${restore}`)

  // raw files still reachable
  const rawLinks = await page.locator(`article.run[data-run="${XSS_ID}"] details.raw a`).count()
  ok(rawLinks >= 3, `raw bundle disclosure exposes ${rawLinks} files`)
  const rawFile = await page.request.get(`${BASE}/@s2c/runs?id=${XSS_ID}&file=result.json`)
  ok(rawFile.status() === 200 && (await rawFile.json()).engine === 'model', 'raw bundle file still served')

  // ── the reuse control ────────────────────────────────────────────────────
  const card = page.locator(`article.run[data-run="${withFidelity.id}"]`)
  // Reuse is a link since d13d837: the app reads ?s2c-reuse=<id> on boot and
  // applies that run's settings, so there is no clipboard round trip to test.
  const btn = card.locator('a.reuse')
  const payloadAttr = await btn.getAttribute('data-payload')
  ok(JSON.stringify(JSON.parse(payloadAttr)) === JSON.stringify(settings),
    'data-payload on the reuse link is byte-identical to settings.json')
  ok(await btn.getAttribute('data-settings-url') === `/@s2c/runs/${withFidelity.id}/settings.json`,
    'reuse link carries the settings endpoint url')
  ok(await btn.getAttribute('href') === `/?s2c-reuse=${encodeURIComponent(withFidelity.id)}`,
    'reuse link points the app at this run')
  // follow it, then come back for the escaping checks
  await btn.click()
  await page.waitForFunction(() => {
    const h = document.getElementById('s2c-overlay-host')
    return /^settings from /.test(h?.shadowRoot?.getElementById('status')?.textContent ?? '')
  }, null, { timeout: 15000 })
  const applied = await page.evaluate(() =>
    document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  ok(applied.includes(withFidelity.id) && applied.includes('50%'),
    `following Reuse applies that run's settings in the app: "${applied.slice(0, 70)}"`)
  ok(!new URL(page.url()).searchParams.has('s2c-reuse'), 'the app drops ?s2c-reuse once applied (a reload does not re-apply)')
  await page.goto(`${BASE}/@s2c/runs`, { waitUntil: 'networkidle' })

  // ── escaping ─────────────────────────────────────────────────────────────
  const xssCard = page.locator(`article.run[data-run="${XSS_ID}"]`)
  const readingText = await xssCard.locator('p.reading').textContent()
  ok(readingText.includes('<script>window.__pwned = true</script>'), 'the script tag renders as literal text')
  ok(await page.evaluate(() => window.__pwned === undefined), 'no injected script executed')
  ok(await xssCard.locator('script, img[src="x"]').count() === 0, 'no element was created from the reading')
  ok((await xssCard.locator('.notes li').first().textContent()).includes('</script>'), 'note text escaped too')
  ok((await xssCard.locator('.files').textContent()).includes('<img src=x'), 'file paths escaped too')
  ok(pageErrors.length === 0, `no page errors (${pageErrors.join('; ') || 'none'})`)

  // the same fixture on the per-run detail page
  await page.goto(`${BASE}/@s2c/runs?id=${XSS_ID}`, { waitUntil: 'networkidle' })
  ok(await page.evaluate(() => window.__pwned === undefined), 'detail page does not execute the reading either')
  ok((await page.locator('pre').first().textContent()).includes('<script>'), 'detail page shows raw json as text')

  // ── screenshots ──────────────────────────────────────────────────────────
  const shots = process.env.S2C_SHOTS || '.'
  await page.goto(`${BASE}/@s2c/runs`, { waitUntil: 'networkidle' })
  await page.setViewportSize({ width: 1280, height: 1100 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/s2c-runs-1280.png` })
  await page.evaluate(() => window.scrollBy(0, 900))
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${shots}/s2c-runs-1280-scrolled.png` })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.setViewportSize({ width: 600, height: 1000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/s2c-runs-600.png` })
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 0, `no horizontal overflow at 600px (${overflow}px)`)

  log('ALL ASSERTIONS PASSED')
} finally {
  await browser.close()
  for (const f of FIXTURES) rmSync(f, { recursive: true, force: true })
}

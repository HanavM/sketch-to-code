/**
 * s2c-002: the reading survives the instant render's reload.
 *
 * The instant render is real here: a ring with two eyes drawn in empty space
 * becomes a mounted component, which is a new module, which vite answers with
 * a full reload. The model reading is stubbed IN THE BROWSER, and stubbed the
 * way the bug needs: `/@s2c/interpret` never answers, so the page that asked
 * dies waiting (exactly what a 10 s model call does). The page that comes back
 * must put the drawing back and collect the answer from
 * `/@s2c/interpret/result` by the id it parked. Zero tokens: neither model
 * route reaches the dev server.
 *
 * Phase 1: answer arrives after one "pending" long-poll → preview, ink back,
 *          ✓ Go sends the parked strokes, the reading's raw and the instant file.
 * Phase 2: the server no longer knows the id (dev server restarted) → a plain
 *          sentence, the drawing still back, no preview.
 *
 * Before the fix, phase 1 ends with no ink, no preview, and (when the reload
 * is slow enough to see it) "interpret failed: Failed to fetch".
 */
import { chromium } from 'playwright'
import { execSync } from 'node:child_process'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-reload-reading]', ...a)
const reset = () => {
  execSync('git checkout -- examples/demo-app/src/', { cwd: process.cwd() })
  execSync('git clean -fdq examples/demo-app/src/', { cwd: process.cwd() })
}
reset()

const READING = {
  ok: true,
  v2: {
    interpretation: {
      reading: 'a smiling badge beside the content',
      rejected: [],
      actions: [{ kind: 'add', targets: [{ rect: { x: 1130, y: 260, w: 100, h: 80 }, tag: 'div', text: '' }], instruction: 'stub', needsConfirm: false }],
    },
    raw: { stub: 'raw-reading-7' },
    tokens: { input: 0, cacheRead: 0, output: 0 },
  },
}

async function phase(name, resultReplies) {
  reset()
  const b = await chromium.launch()
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
  let loads = 0
  page.on('load', () => { loads++ })
  const asked = []
  const polled = []
  let runBody = null
  // the page that asks never hears back: the reading outlives it
  await page.route('**/@s2c/interpret', (r) => { asked.push(r.request().postDataJSON()) })
  await page.route('**/@s2c/interpret/result', (r) => {
    const body = r.request().postDataJSON()
    polled.push(body)
    const reply = resultReplies[Math.min(polled.length - 1, resultReplies.length - 1)]
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
  })
  await page.route('**/@s2c/run', (r) => {
    runBody = r.request().postDataJSON()
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
  })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  const mode = () => page.evaluate(() => document.getElementById('s2c-overlay-host').dataset.mode)
  const status = () => page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
  for (let i = 0; i < 3 && (await mode()) !== 'draw'; i++) {
    await page.keyboard.press('Alt+KeyD')
    await page.waitForTimeout(140)
  }
  const draw = async (pts) => {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 })
    await page.mouse.up()
  }
  const cx = 1180, cy = 300
  const ring = []
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 2
    ring.push([cx + Math.cos(t) * 46, cy + Math.sin(t) * 34])
  }
  await draw(ring)
  await draw([[cx - 16, cy - 6], [cx - 8, cy - 6]])
  await draw([[cx + 8, cy - 6], [cx + 16, cy - 6]])
  const drawn = await page.evaluate(() => window.__S2C_DEBUG__.strokes().map((s) => s.id))
  const loadsBefore = loads
  await page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('run').click())

  // the instant render's reload, and the new page's overlay booting. Vite
  // decides whether a new module is a hot update or a full reload, and it does
  // not always decide the same way (see the dev log: "page reload
  // src/components/SketchShape.tsx" on some runs, only "hmr update" on
  // others). When it hot-updates, reload by hand once the component is on the
  // page: the in-flight reading dies exactly as it does under vite's reload.
  const t0 = Date.now()
  while (loads === loadsBefore && Date.now() - t0 < 6000) await page.waitForTimeout(50)
  let byVite = loads !== loadsBefore
  if (!byVite) {
    await page.waitForFunction(() => document.querySelector('.s2c-etch') != null, { timeout: 10000 })
      .catch(() => { throw new Error(`[${name}] ASSERT: the instant render mounted nothing`) })
    if (asked.length !== 1) throw new Error(`[${name}] ASSERT: no reading in flight to cut off (${asked.length} asked: ${JSON.stringify(asked.map((a) => [a.readingId, a.strokes?.length]))})`)
    await page.reload()
  }
  if (loads === loadsBefore) throw new Error(`[${name}] ASSERT: no reload, so this test proves nothing`)
  log(`[${name}] reload by ${byVite ? 'vite itself' : 'the test (vite hot-updated this time)'}`)
  await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
  return { b, page, asked, polled, drawn, mode, status, runBody: () => runBody }
}

// ---- phase 1: collected after the reload --------------------------------
{
  const p = await phase('collect', [{ state: 'pending' }, { state: 'done', status: 200, reply: READING }])
  await p.page.waitForFunction(() => document.getElementById('s2c-overlay-host').dataset.mode === 'preview', { timeout: 15000 })
    .catch(async () => { throw new Error(`ASSERT: no preview after the reload: mode ${await p.mode()} · "${await p.status()}"`) })
  const st = await p.status()
  const strokes = await p.page.evaluate(() => window.__S2C_DEBUG__.strokes().map((s) => s.id))
  log(`preview after the reload · "${st.slice(0, 80)}" · ink ${strokes.length}/${p.drawn.length} · polls ${p.polled.length}`)
  if (p.asked.length !== 1) throw new Error(`ASSERT: expected exactly one reading request, got ${p.asked.length}`)
  const id = p.asked[0].readingId
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id ?? '')) throw new Error(`ASSERT: interpret carried no reading id: ${id}`)
  if (!p.polled.every((q) => q.readingId === id)) throw new Error('ASSERT: the new page asked for a different reading')
  if (p.polled.length < 2) throw new Error('ASSERT: the long-poll did not go round again on "pending"')
  if (!st.includes('a smiling badge beside the content')) throw new Error(`ASSERT: status is not the collected reading: "${st}"`)
  if (/failed/i.test(st)) throw new Error(`ASSERT: status says failed: "${st}"`)
  if (JSON.stringify(strokes) !== JSON.stringify(p.drawn)) throw new Error(`ASSERT: ink not restored: ${JSON.stringify(strokes)} vs ${JSON.stringify(p.drawn)}`)
  const parked = await p.page.evaluate(() => sessionStorage.getItem('s2c:reading'))
  if (parked) throw new Error('ASSERT: the park outlived its answer')
  // a component is mounted from the instant render, and only one
  const etched = await p.page.evaluate(() => document.querySelectorAll('.s2c-etch').length)
  if (etched !== 1) throw new Error(`ASSERT: expected the instant component on the page once, got ${etched}`)

  await p.page.evaluate(() => document.getElementById('s2c-overlay-host').shadowRoot.getElementById('confirm').click())
  await p.page.waitForTimeout(500)
  const rb = p.runBody()
  if (!rb) throw new Error('ASSERT: ✓ Go did not POST /@s2c/run')
  if (rb.strokes?.length !== p.drawn.length) throw new Error(`ASSERT: run sent ${rb.strokes?.length} strokes, drew ${p.drawn.length}`)
  if (JSON.stringify(rb.rawInterpretation) !== JSON.stringify(READING.v2.raw)) throw new Error('ASSERT: run did not carry the collected reading')
  if (typeof rb.instant !== 'string' || !rb.instant.length) throw new Error(`ASSERT: run lost the instant component (${rb.instant}); it would write a second one`)
  log(`✓ Go after the reload · strokes ${rb.strokes.length} · instant ${rb.instant} · raw carried`)
  await p.page.keyboard.press('Escape')
  await p.b.close()
}

// ---- phase 2: the server no longer has it --------------------------------
{
  const p = await phase('lost', [{ state: 'unknown' }])
  await p.page.waitForFunction(
    () => /Your drawing is back/.test(document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent),
    { timeout: 15000 },
  ).catch(async () => { throw new Error(`ASSERT: no plain sentence for a lost reading: "${await p.status()}"`) })
  const st = await p.status()
  const m = await p.mode()
  const strokes = await p.page.evaluate(() => window.__S2C_DEBUG__.strokes().length)
  log(`lost reading · "${st.slice(0, 90)}" · mode ${m} · ink ${strokes}`)
  if (m === 'preview') throw new Error('ASSERT: a lost reading must not preview')
  if (strokes !== p.drawn.length) throw new Error(`ASSERT: ink not restored for a re-run: ${strokes}/${p.drawn.length}`)
  if (/fetch|HTTP/i.test(st)) throw new Error(`ASSERT: developer words in the sentence: "${st}"`)
  await p.b.close()
}

reset()
log('ALL PASS')

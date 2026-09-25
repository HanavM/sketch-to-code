/**
 * Reuse a past run's settings.
 *
 * The runs page links into the app with ?s2c-reuse=<id>; the overlay fetches
 * that run's settings from its bundle and applies them. Asserts the link
 * exists, the settings actually land on the controls, the URL parameter is
 * dropped so a reload can't silently re-apply, and an unknown id fails
 * visibly instead of quietly.
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-reuse]', ...a)
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })

// a run whose settings differ from the defaults, so "applied" is observable
const runs = await (await fetch(new URL('/@s2c/runs.json', APP))).json()
const target = runs.find((r) => r.fidelity && (r.fidelity.resemblance !== 0.5 || r.fidelity.palette !== 'app'))
  ?? runs.find((r) => r.fidelity)
if (!target) throw new Error('no run with recorded fidelity to reuse')
const want = (await (await fetch(new URL(`/@s2c/runs/${target.id}/settings.json`, APP))).json()).fidelity
log('reusing', target.id, JSON.stringify(want))

// the page offers it as a link into the app
await page.goto(new URL('/@s2c/runs', APP).href, { waitUntil: 'networkidle' })
const href = await page.evaluate(() => document.querySelector('.reuse')?.getAttribute('href'))
if (!href || !href.includes('s2c-reuse=')) throw new Error(`reuse control is not a link into the app: ${href}`)
log('✓ runs page links into the app:', href)

// start from settings that are NOT the target's, so a no-op would fail
await page.goto(APP, { waitUntil: 'networkidle' })
await page.evaluate(() => {
  localStorage.setItem('s2c:fidelity', JSON.stringify({
    resemblance: 0.05, keep: { asymmetry: false, rhythm: false, proportions: false, placement: false },
    palette: 'sketch', fill: 'outline',
  }))
})

await page.goto(new URL(`/?s2c-reuse=${target.id}`, APP).href, { waitUntil: 'networkidle' })
await page.waitForTimeout(700)

const got = await page.evaluate(() => {
  const root = document.getElementById('s2c-overlay-host').shadowRoot
  return {
    stored: JSON.parse(localStorage.getItem('s2c:fidelity') ?? 'null'),
    status: root.getElementById('status').textContent,
    slider: Number(root.querySelector('#fidelityPanel input[type=range]').value) / 100,
    url: location.search,
  }
})
log('applied:', JSON.stringify(got.stored), '| status:', got.status.slice(0, 90))
for (const k of ['resemblance', 'palette', 'fill']) {
  if (JSON.stringify(got.stored[k]) !== JSON.stringify(want[k])) {
    throw new Error(`ASSERT ${k}: got ${JSON.stringify(got.stored[k])}, wanted ${JSON.stringify(want[k])}`)
  }
}
if (JSON.stringify(got.stored.keep) !== JSON.stringify(want.keep)) throw new Error('ASSERT keep locks not applied')
if (Math.abs(got.slider - want.resemblance) > 0.01) throw new Error(`ASSERT slider shows ${got.slider}, stored ${want.resemblance}`)
if (got.url.includes('s2c-reuse')) throw new Error('ASSERT the parameter survived — a reload would re-apply it')
if (!/settings from/i.test(got.status)) throw new Error(`ASSERT status does not report the restore: ${got.status}`)
log('✓ settings applied to the controls, parameter dropped, restore reported')

// an unknown run must say so rather than fail silently
await page.goto(new URL('/?s2c-reuse=run-does-not-exist', APP).href, { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const missing = await page.evaluate(() =>
  document.getElementById('s2c-overlay-host').shadowRoot.getElementById('status').textContent)
if (!/couldn't reuse/i.test(missing)) throw new Error(`ASSERT unknown id is silent: ${missing}`)
log('✓ unknown run reports:', missing.slice(0, 60))

log('ALL REUSE CHECKS PASSED')
await b.close()

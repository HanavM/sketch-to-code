/**
 * Live e2e: THE DOCK — a bar the page ends above, not one it continues behind.
 *
 * The claim is about the HOST PAGE's layout, which is the one thing a unit test
 * cannot see: docking must reserve real space, so that when you scroll to the
 * very bottom there is nothing of the app underneath the bar. And undocking must
 * give that space back EXACTLY — including to an app that had a padding-bottom
 * of its own, which we borrow rather than own.
 *
 * Phases, all zero-token:
 *   1. floating: the page reserves nothing
 *   2. docked: full width, flush to the bottom, body padding == the bar's height,
 *      and the document grows by exactly that
 *   3. scrolled to the very end: every sample along the bar hits the bar
 *   4. back to floating: the page's own padding is restored, not zeroed
 *   5. an app that already had padding-bottom gets its own value back
 *   6. hiding the toolbar while docked returns the floor too
 *
 * Run FROM THE REPO ROOT: node tests/e2e/live-dock.mjs
 */
import { chromium } from 'playwright'

const APP = process.env.S2C_APP ?? 'http://localhost:5199/'
const log = (...a) => console.log('[e2e-dock]', ...a)

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
const errs = []
page.on('pageerror', (e) => errs.push(String(e)))

const sh = (fn, arg) => page.evaluate(fn, arg)
const state = () =>
  sh(() => {
    const host = document.getElementById('s2c-overlay-host')
    const hud = host.shadowRoot.getElementById('hud').getBoundingClientRect()
    return {
      skin: host.dataset.skin,
      hud: {
        x: Math.round(hud.x), right: Math.round(hud.right),
        bottom: Math.round(hud.bottom), h: Math.round(hud.height),
      },
      pad: getComputedStyle(document.body).paddingBottom,
      inline: document.body.style.paddingBottom,
      doc: document.documentElement.scrollHeight,
      cssVar: getComputedStyle(document.documentElement).getPropertyValue('--s2c-dock-height').trim(),
      vw: window.innerWidth,
      vh: window.innerHeight,
    }
  })

/** Cycle with the key until the named skin is showing. */
async function setSkin(want) {
  for (let i = 0; i < 4; i++) {
    if ((await sh(() => window.__S2C_DEBUG__.skin())) === want) return
    await page.keyboard.press('Alt+u')
    await page.waitForTimeout(220)
  }
  throw new Error(`could not reach ${want} — stuck in ${await sh(() => window.__S2C_DEBUG__.skin())}`)
}

await page.goto(APP, { waitUntil: 'networkidle' })
await page.waitForFunction(() => window.__S2C_DEBUG__ != null, { timeout: 15000 })
await page.waitForTimeout(400)

// ── 1. floating reserves nothing ─────────────────────────────────────────
await setSkin('glass')
const float = await state()
log('floating:', JSON.stringify({ pad: float.pad, doc: float.doc, hudX: float.hud.x }))
if (float.pad !== '0px') throw new Error(`floating reserved space: ${float.pad}`)
if (float.hud.x < 40) throw new Error('the floating bar is not inset from the edge — is it docked?')

// ── 2. docked: full width, flush, and the page makes room ───────────────
await setSkin('dock')
await page.waitForTimeout(350)
const dock = await state()
log('docked:', JSON.stringify({ pad: dock.pad, doc: dock.doc, hud: dock.hud, cssVar: dock.cssVar }))
if (dock.hud.x !== 0 || dock.hud.right !== dock.vw) {
  throw new Error(`the dock does not span the window: ${JSON.stringify(dock.hud)}`)
}
if (Math.abs(dock.hud.bottom - dock.vh) > 1) {
  throw new Error(`the dock is not flush with the bottom: ${dock.hud.bottom} of ${dock.vh}`)
}
if (dock.pad !== `${dock.hud.h}px`) {
  throw new Error(`the page reserved ${dock.pad} for a ${dock.hud.h}px bar`)
}
if (dock.doc - float.doc !== dock.hud.h) {
  throw new Error(`the document grew by ${dock.doc - float.doc}, not the bar's ${dock.hud.h}`)
}
if (dock.cssVar !== `${dock.hud.h}px`) {
  throw new Error(`--s2c-dock-height is ${JSON.stringify(dock.cssVar)}, so an app cannot react to it`)
}

// ── 3. nothing of the app ends up underneath it ─────────────────────────
await sh(() => window.scrollTo(0, document.documentElement.scrollHeight))
await page.waitForTimeout(350)
const under = await sh(() => {
  const hud = document.getElementById('s2c-overlay-host').shadowRoot
    .getElementById('hud').getBoundingClientRect()
  const hits = []
  for (let x = 20; x < window.innerWidth; x += 60) {
    const el = document.elementFromPoint(x, hud.top + hud.height / 2)
    hits.push(el?.id === 's2c-overlay-host' ? 'bar' : (el?.tagName?.toLowerCase() ?? 'none'))
  }
  return hits
})
log('scrolled to the end · under the bar:', [...new Set(under)].join(','))
if (under.some((h) => h !== 'bar')) {
  throw new Error(`app content is trapped under the dock: ${under.join(',')}`)
}

// ── 4. undocking gives the space back, and removes what it added ────────
await sh(() => window.scrollTo(0, 0))
await setSkin('glass')
await page.waitForTimeout(350)
const back = await state()
log('back to floating:', JSON.stringify({ pad: back.pad, inline: JSON.stringify(back.inline), doc: back.doc }))
if (back.pad !== '0px') throw new Error(`the dock kept ${back.pad} of the page after leaving`)
if (back.inline !== '') throw new Error(`it left an inline style behind: ${JSON.stringify(back.inline)}`)
if (back.doc !== float.doc) throw new Error(`the document did not return to ${float.doc}: ${back.doc}`)
if (back.cssVar !== '') throw new Error(`--s2c-dock-height outlived the dock: ${back.cssVar}`)

// ── 5. an app with its own padding-bottom gets ITS value back ───────────
// The failure this guards against is ours to cause: reserving space by writing
// over a padding the app set itself, then "restoring" it to zero.
await sh(() => { document.body.style.paddingBottom = '37px' })
await setSkin('dock')
await page.waitForTimeout(300)
const borrowed = await state()
if (borrowed.pad === '37px') throw new Error('the dock did not reserve anything over the app’s own padding')
await setSkin('glass')
await page.waitForTimeout(300)
const given = await state()
log('app had 37px · during dock:', borrowed.pad, '· after:', given.pad)
if (given.pad !== '37px') throw new Error(`the app's own padding came back as ${given.pad}, not 37px`)
await sh(() => { document.body.style.paddingBottom = '' })

// ── 6. hiding the toolbar returns the floor ────────────────────────────
await setSkin('dock')
await page.waitForTimeout(300)
await page.keyboard.press('Alt+h')
await page.waitForTimeout(350)
const hidden = await state()
log('docked but hidden:', JSON.stringify({ pad: hidden.pad }))
if (hidden.pad !== '0px') {
  throw new Error(`a hidden dock still reserves ${hidden.pad} for a bar that is not there`)
}
await page.keyboard.press('Alt+h')
await page.waitForTimeout(350)
if ((await state()).pad === '0px') throw new Error('showing the dock again did not reserve the space')

await setSkin('glass')
const real = errs.filter((e) => !/ResizeObserver/.test(e))
log('page errors:', real.length, real.slice(0, 2))
if (real.length) throw new Error(`ASSERT: page errors: ${real[0]}`)
await b.close()
log('E2E PASS — the dock spans the window, the page ends above it, and undocking gives every pixel back')

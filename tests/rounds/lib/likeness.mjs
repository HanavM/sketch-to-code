/**
 * How much does a built page look like its target? Measured on pictures, with
 * no knowledge of how either page was made, so the pipeline cannot grade its
 * own homework (the same rule as tests/bench/lib/score.mjs).
 *
 * Two picture measures, both 0..1, computed in a browser canvas (no image deps):
 *
 *   colour    — both shots shrunk to a 32x23 grid; 1 minus the mean RGB
 *               distance per cell. Catches "the gradient / dark theme / yellow
 *               page is missing", which a box-matching score never sees.
 *   structure — both shots as 160x112 greyscale; mean SSIM over 8x8 windows.
 *               Catches where the ink is: big type, cards, rules, empty space.
 *
 * Layout (block placement) is the bench's own IoU region score, run against
 * regions measured off the target's [data-r] elements, so the answer key is
 * the target itself, not a hand-typed guess.
 *
 * likeness = 0.35 colour + 0.35 structure + 0.30 layout (layout falls back to
 * the picture measures alone when a page has no regions).
 */
import { readFileSync } from 'node:fs'

const GRID = { w: 32, h: 23 }
const GREY = { w: 160, h: 112 }

/** Runs inside the page: decode two PNG data URLs, return {colour, structure}. */
function compareInPage([a, b, GRID, GREY]) {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
  const pixels = (img, w, h) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingQuality = 'high'
    x.drawImage(img, 0, 0, img.naturalWidth, Math.min(img.naturalHeight, img.naturalWidth * 900 / 1280), 0, 0, w, h)
    return x.getImageData(0, 0, w, h).data
  }
  return Promise.all([load(a), load(b)]).then(([ia, ib]) => {
    const ca = pixels(ia, GRID.w, GRID.h), cb = pixels(ib, GRID.w, GRID.h)
    let d = 0
    for (let i = 0; i < ca.length; i += 4) {
      d += Math.hypot(ca[i] - cb[i], ca[i + 1] - cb[i + 1], ca[i + 2] - cb[i + 2])
    }
    const colour = 1 - d / (GRID.w * GRID.h) / 441.7
    const grey = (p) => { const g = new Float32Array(p.length / 4); for (let i = 0; i < g.length; i++) g[i] = 0.299 * p[i * 4] + 0.587 * p[i * 4 + 1] + 0.114 * p[i * 4 + 2]; return g }
    const ga = grey(pixels(ia, GREY.w, GREY.h)), gb = grey(pixels(ib, GREY.w, GREY.h))
    const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, W = 8
    let sum = 0, n = 0
    for (let y = 0; y + W <= GREY.h; y += W / 2) for (let x = 0; x + W <= GREY.w; x += W / 2) {
      let ma = 0, mb = 0
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const k = (y + j) * GREY.w + x + i; ma += ga[k]; mb += gb[k] }
      ma /= W * W; mb /= W * W
      let va = 0, vb = 0, cov = 0
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const k = (y + j) * GREY.w + x + i; const da = ga[k] - ma, db = gb[k] - mb; va += da * da; vb += db * db; cov += da * db }
      va /= W * W - 1; vb /= W * W - 1; cov /= W * W - 1
      sum += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2)); n++
    }
    return { colour, structure: Math.max(0, sum / n) }
  })
}

const dataUrl = (png) => `data:image/png;base64,${(Buffer.isBuffer(png) ? png : readFileSync(png)).toString('base64')}`

/** Compare two screenshots (paths or Buffers). Needs any open Playwright page. */
export async function pictureLikeness(page, a, b) {
  return page.evaluate(compareInPage, [dataUrl(a), dataUrl(b), GRID, GREY])
}

/**
 * Lift over a blank page: 0 = no closer than an empty white screen, 1 = the
 * target. Needed because on a mostly-white target a blank page already scores
 * ~95% colour and ~89% structure (measured, round 1), so raw numbers flatter.
 */
export function lift(v, blankV) {
  if (blankV >= 0.999) return v >= 0.999 ? 1 : 0
  return Math.max(0, Math.min(1, (v - blankV) / (1 - blankV)))
}

/**
 * Blend into one likeness, 0..1. Picture measures count as lift over the
 * target's blank-page baseline when one is given. layout: 0..1 or null.
 */
export function blend({ colour, structure }, layout, baseline = null) {
  const c = baseline ? lift(colour, baseline.colour) : colour
  const s = baseline ? lift(structure, baseline.structure) : structure
  if (layout == null) return (c + s) / 2
  return 0.35 * c + 0.35 * s + 0.3 * layout
}

/**
 * Open a target page and read off what a build is measured against: its first
 * screen as a PNG, and every [data-r] element's box as a bench region
 * ({role, rect, must}).
 */
export async function measureTarget(browser, htmlPath, viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport })
  await page.goto(`file://${htmlPath}`)
  await page.waitForTimeout(150)
  const png = await page.screenshot({ animations: 'disabled' }) // moving pages: compare the first frame, same as the build
  const regions = await page.evaluate(() => [...document.querySelectorAll('[data-r]')].map((el) => {
    const r = el.getBoundingClientRect()
    return { role: el.dataset.r, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, must: el.hasAttribute('data-must') }
  }))
  await page.close()
  return { png, regions }
}

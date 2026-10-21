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
 *   structure — both shots as 160x112 greyscale; mean SSIM over 8x8 windows,
 *               each window matched at its best offset within 2 cells (about
 *               16px at 1280 wide). Catches where the ink is: big type, cards,
 *               rules, empty space. Version 2 (2026-10-21): plain SSIM gave the
 *               target itself, moved 20px down, as little as 0% lift (round-1
 *               e4), so "the build sits a bit low" read as "built nothing".
 *               Placement is the layout score's job; this one asks whether the
 *               ink looks the same. The old number is kept as structureStrict.
 *
 * Version 3 (2026-10-21): colour and structure are also scored after the one
 * global zoom (0.88-1.16) and offset (up to 128px) that best lays the build's
 * ink over the target's (colourAligned / structureAligned, each the better of
 * aligned and unmoved). Round-2 settings came out nearly identical but 8%
 * bigger and ~30px lower and scored 0% on both; aligned it is 55%. A single
 * global transform cannot make an unrelated page fit: every target scored
 * against the other targets of its round stays at most 20% lift on v2 and
 * aligned alike (tests/rounds/crossink.mjs). The headline likeness uses the
 * aligned pair; overallV2 keeps the old number.
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
const SHIFT = 2 // cells (160 wide grid: 1 cell = 8px at 1280)
export const LIKENESS_VERSION = 3
// v3 global alignment search: zooms of the build, offsets in 16px coarse cells (+-128px)
export const ALIGN = { scales: [0.88, 0.92, 0.96, 1, 1.04, 1.08, 1.12, 1.16], cells: 8 }

/** Runs inside the page: decode two PNG data URLs, return {colour, structure}. */
function compareInPage([a, b, GRID, GREY, SHIFT, ALIGN]) {
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
    const C1 = (0.01 * 255) ** 2, C2 = (0.03 * 255) ** 2, W = 8, N = W * W
    const ssimPair = (ga, gb) => {
      const stats = (g, x, y) => { let m = 0; for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) m += g[(y + j) * GREY.w + x + i]; m /= N; let v = 0; for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) { const d = g[(y + j) * GREY.w + x + i] - m; v += d * d } return [m, v / (N - 1)] }
      const ssimAt = (x, y, ma, va, bx, by) => {
        const [mb, vb] = stats(gb, bx, by)
        let cov = 0
        for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) cov += (ga[(y + j) * GREY.w + x + i] - ma) * (gb[(by + j) * GREY.w + bx + i] - mb)
        cov /= N - 1
        return ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
      }
      let sum = 0, strict = 0, n = 0
      for (let y = 0; y + W <= GREY.h; y += W / 2) for (let x = 0; x + W <= GREY.w; x += W / 2) {
        const [ma, va] = stats(ga, x, y)
        const s0 = ssimAt(x, y, ma, va, x, y)
        let best = s0
        for (let dy = -SHIFT; dy <= SHIFT; dy++) for (let dx = -SHIFT; dx <= SHIFT; dx++) {
          const bx = x + dx, by = y + dy
          if ((dx || dy) && bx >= 0 && by >= 0 && bx + W <= GREY.w && by + W <= GREY.h) best = Math.max(best, ssimAt(x, y, ma, va, bx, by))
        }
        sum += best; strict += s0; n++
      }
      return { structure: Math.max(0, sum / n), structureStrict: Math.max(0, strict / n) }
    }
    const { structure, structureStrict } = ssimPair(ga, gb)
    // v3 aligned: find the one global zoom + offset that best lays the build's
    // ink over the target's (coarse 80x56 ink maps, normalised correlation),
    // then score colour and structure on the aligned build. "Same page, drawn
    // 8% bigger and 30px lower" (round-2 settings) then reads as the same ink;
    // placement stays the layout score's job. One global transform cannot make
    // an unrelated page fit, which a per-window search could (checked with
    // tests/rounds/crossink.mjs).
    const drawn = (img, w, h, s, ox, oy) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h
      const x = c.getContext('2d', { willReadFrequently: true })
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.imageSmoothingQuality = 'high'
      const sh = Math.min(img.naturalHeight, img.naturalWidth * 900 / 1280)
      x.drawImage(img, 0, 0, img.naturalWidth, sh, ox * w, oy * h, w * s, h * s)
      return x.getImageData(0, 0, w, h).data
    }
    const CW = 80, CH = 56, ink = (p) => grey(p).map((v) => 255 - v)
    const ta = ink(pixels(ia, CW, CH))
    let best = { r: -2, s: 1, ox: 0, oy: 0 }
    for (const s of ALIGN.scales) {
      const bw = Math.round(CW * s), bh = Math.round(CH * s)
      const tb = ink(pixels(ib, bw, bh))
      for (let dy = -ALIGN.cells; dy <= ALIGN.cells; dy++) for (let dx = -ALIGN.cells; dx <= ALIGN.cells; dx++) {
        // build pixel (i,j) lands on target (i+dx, j+dy); off-picture counts as white (0 ink)
        let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
          const bx = x - dx, by = y - dy
          const a = ta[y * CW + x], b = bx >= 0 && by >= 0 && bx < bw && by < bh ? tb[by * bw + bx] : 0
          sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b
        }
        const n = CW * CH, cov = sab - sa * sb / n, va = saa - sa * sa / n, vb = sbb - sb * sb / n
        const r = va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : -1
        if (r > best.r + 1e-9 || (Math.abs(r - best.r) <= 1e-9 && Math.abs(s - 1) + Math.abs(dx) + Math.abs(dy) < Math.abs(best.s - 1) + Math.abs(best.ox) + Math.abs(best.oy))) best = { r, s, ox: dx, oy: dy }
      }
    }
    const A = { s: best.s, x: best.ox / CW, y: best.oy / CH }
    const gbA = grey(drawn(ib, GREY.w, GREY.h, A.s, A.x, A.y))
    const cbA = drawn(ib, GRID.w, GRID.h, A.s, A.x, A.y)
    let dA = 0
    for (let i = 0; i < ca.length; i += 4) dA += Math.hypot(ca[i] - cbA[i], ca[i + 1] - cbA[i + 1], ca[i + 2] - cbA[i + 2])
    const aligned = ssimPair(ga, gbA)
    const align = { scale: A.s, dx: Math.round(A.x * 1280), dy: Math.round(A.y * 900), r: best.r }
    // The unmoved build is always a candidate too: the coarse ink fit can pick
    // a zoom whose fine structure is worse than leaving the build where it is.
    return { colour, structure, structureStrict, colourAligned: Math.max(colour, 1 - dA / (GRID.w * GRID.h) / 441.7),
      structureAligned: Math.max(structure, aligned.structure), align }
  })
}

const dataUrl = (png) => `data:image/png;base64,${(Buffer.isBuffer(png) ? png : readFileSync(png)).toString('base64')}`

/** Compare two screenshots (paths or Buffers). Needs any open Playwright page. */
export async function pictureLikeness(page, a, b) {
  return page.evaluate(compareInPage, [dataUrl(a), dataUrl(b), GRID, GREY, SHIFT, ALIGN])
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
  // pass {colour: colourAligned, structure: structureAligned} for v3
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

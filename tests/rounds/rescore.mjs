/**
 * Re-score saved side-by-sides with the current likeness measure, so a change
 * to the measure can be compared on old builds without rebuilding (zero tokens).
 *   node tests/rounds/rescore.mjs tests/rounds/round1/built/*-cmp.png
 * Crops target (left) and built (right) out of each cmp.mjs picture, scales
 * both back to 1280x900 and prints colour / structure (v2) / structureStrict
 * (v1) as lift over a blank page, plus how the target itself scores when
 * moved 16px and 40px down (what "right page, a bit low" earns).
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { pictureLikeness, lift } from './lib/likeness.mjs'

const files = process.argv.slice(2)
const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.setContent('<body></body>')
// cmp.mjs layout: images inside 1px #999 borders at x 11..645 / 656..1290, y 47..492
const cut = (src, sx, dy = 0) => page.evaluate(([src, sx, dy]) => new Promise((res) => {
  const i = new Image(); i.onload = () => {
    const c = document.createElement('canvas'); c.width = 1280; c.height = 900
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1280, 900)
    x.imageSmoothingQuality = 'high'; x.drawImage(i, sx, 47, 635, 446, 0, dy, 1280, 900)
    res(c.toDataURL('image/png'))
  }; i.src = src
}), [src, sx, dy])
const buf = (u) => Buffer.from(u.split(',')[1], 'base64')
const blank = buf(await cut('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 0))
const pct = (x) => `${Math.round(x * 100)}%`.padStart(4)
const rows = []
console.log('page | colour | structure v2 | strict v1 | target moved 16px: v2 / v1 | moved 40px: v2 / v1')
for (const f of files) {
  const src = 'data:image/png;base64,' + readFileSync(f).toString('base64')
  const t = buf(await cut(src, 11)), b = buf(await cut(src, 656))
  const b16 = buf(await cut(src, 11, 16)), b40 = buf(await cut(src, 11, 40))
  const [pb, p0, p16, p40] = [await pictureLikeness(page, t, blank), await pictureLikeness(page, t, b), await pictureLikeness(page, t, b16), await pictureLikeness(page, t, b40)]
  const L = (p, k) => lift(p[k], pb[k])
  if (process.env.RESCORE_RAW) console.log(JSON.stringify({ pb, p0 }))
  const row = { id: basename(f).replace(/-cmp\.png$/, ''), colour: L(p0, 'colour'), structure: L(p0, 'structure'), strict: L(p0, 'structureStrict'),
    moved16: [L(p16, 'structure'), L(p16, 'structureStrict')], moved40: [L(p40, 'structure'), L(p40, 'structureStrict')],
    aligned: { colour: L(p0, 'colourAligned'), structure: L(p0, 'structureAligned'), align: p0.align, moved40: L(p40, 'structureAligned') } }
  rows.push(row)
  console.log(`${row.id} | ${pct(row.colour)} | ${pct(row.structure)} | ${pct(row.strict)} | ${pct(row.moved16[0])} / ${pct(row.moved16[1])} | ${pct(row.moved40[0])} / ${pct(row.moved40[1])} || aligned: colour ${pct(row.aligned.colour)} struct ${pct(row.aligned.structure)} moved40 ${pct(row.aligned.moved40)} (x${row.aligned.align.scale} ${row.aligned.align.dx},${row.aligned.align.dy})`)
}
await browser.close()
if (process.env.RESCORE_JSON) (await import('node:fs')).writeFileSync(process.env.RESCORE_JSON, JSON.stringify(rows, null, 1))

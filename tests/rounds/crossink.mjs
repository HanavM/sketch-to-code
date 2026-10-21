/**
 * Sanity check for the likeness measure, zero tokens: every target in a round
 * scored against every OTHER target of that round (unrelated pages must score
 * low), as lift over blank, for v2 structure and v3 ink measures.
 *   node tests/rounds/crossink.mjs round2
 */
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { pictureLikeness, lift } from './lib/likeness.mjs'

const round = process.argv[2] || 'round1'
const dir = join('tests/rounds', round, 'ref')
const ids = readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))
const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.setContent('<body></body>')
const blank = Buffer.from(await page.screenshot())
const pct = (x) => `${Math.round(x * 100)}`.padStart(3)
const keys = ['colour', 'structure', 'colourAligned', 'structureAligned']
const worst = Object.fromEntries(keys.map((k) => [k, 0]))
for (const a of ids) {
  const A = join(dir, a + '.png')
  const pb = await pictureLikeness(page, A, blank)
  const best = Object.fromEntries(keys.map((k) => [k, 0]))
  for (const b of ids) if (b !== a) {
    const p = await pictureLikeness(page, A, join(dir, b + '.png'))
    for (const k of keys) best[k] = Math.max(best[k], lift(p[k], pb[k]))
  }
  for (const k of keys) worst[k] = Math.max(worst[k], best[k])
  console.log(`${a.padEnd(22)} best unrelated lift: ${keys.map((k) => `${k} ${pct(best[k])}%`).join(' · ')}`)
}
console.log(`round max: ${keys.map((k) => `${k} ${pct(worst[k])}%`).join(' · ')}`)
await browser.close()

/**
 * Round 9, auto-sketched: harder than round 8 (a giant word sliced into three offset bands, frosted glass cards over
 * blurred blobs, a bento of clip-text, punched holes, conic rings and a notched tile, a halftone dot sun behind italic
 * serif type, a vertical-title editorial with a striped picture, drop cap and outlined marquee; a spreadsheet with formula
 * bar and selected cell, map + listing cards with price pins, a channel with an open thread panel, flight results with
 * filters and route lines, a billing page with plan cards, usage meters and invoices).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round9 && node tests/rounds/autoplan.mjs round9
 *   node tests/bench/run.mjs --set round9auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round9`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

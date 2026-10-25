/**
 * Round 19, auto-sketched: harder than round 18 (a stained-glass arched window under rotating light rays with a blended outline headline, a sculpture of overlapping giant words in three faces with a gradient-filled word, a vertical word, a diagonal marquee and a spinning text-on-a-circle badge, a night market of swaying glowing lanterns over layered hills with a flickering neon sign, a spinning record half out of a halftone sleeve with a tonearm and animated EQ bars, a magazine cover with a masthead half behind the figure, cover lines, a circle-text ring and a barcode; a flight seat map with a tooltip and fare summary, team member settings with a permission matrix and an open row menu, a cloud drive with a context menu, details panel and upload toast, a live order-tracking map with a route and timeline, an invoice editor with an open client dropdown beside its PDF preview).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round19 && node tests/rounds/autoplan.mjs round19
 *   node tests/bench/run.mjs --set round19auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round19`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

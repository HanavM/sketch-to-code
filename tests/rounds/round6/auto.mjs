/**
 * Round 6, auto-sketched: harder than round 5 (3D perspective cards over a grid floor, clip-split kinetic type,
 * SVG path waves, glass devices over a mesh gradient, brutalist zine grid with duotone and sticker; mega-menu open
 * over a store, 4-chart dashboard with filters, 3-pane mail client, checkout with summary, week calendar with overlaps).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round6 && node tests/rounds/autoplan.mjs round6
 *   node tests/bench/run.mjs --set round6auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round6`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

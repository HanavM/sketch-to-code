/**
 * Round 15, auto-sketched: harder than round 14 (text on circular SVG paths around a conic orb, misregistered CMYK multiply numerals on a dot grid, a word split across five 3D folds, an extruded stroked headline beside an SVG-clipped striped blob, a vertical title over a contour map; a notebook, an email builder, a hotel search with an open date popover, a bank dashboard under a transfer modal with an error, an issue page under a command palette).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round15 && node tests/rounds/autoplan.mjs round15
 *   node tests/bench/run.mjs --set round15auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round15`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

/**
 * Round 8, auto-sketched: harder than round 7 (3D perspective card stack with an outlined word, text on a circular
 * path beside an echo stack, masonry tiles with mesh gradients and tilted stickers, topographic SVG lines behind
 * gradient knockout type, a diagonal clip split with a blend-mode giant numeral and grain; three-pane mail with a
 * compose window, analytics with an open date-range popover, a design editor with selection handles, a cinema seat
 * map with a summary, a docs page with code, callout, table and contents).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round8 && node tests/rounds/autoplan.mjs round8
 *   node tests/bench/run.mjs --set round8auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round8`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

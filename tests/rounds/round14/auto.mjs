/**
 * Round 14, auto-sketched: harder than round 13 (variable-weight wave type with blend over stripes, a word masking layered gradients with torn cut-outs and tape, a 3D ring of notched tickets over a grid floor, skewed parallax layers with a ring-masked sun and outlined marquee, a 3x3 glow glyph grid with mixed weights; a kanban with detail drawer, a database console, a product page, an observability dashboard, a three-pane support inbox).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round14 && node tests/rounds/autoplan.mjs round14
 *   node tests/bench/run.mjs --set round14auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round14`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

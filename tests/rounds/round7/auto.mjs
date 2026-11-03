/**
 * Round 7, auto-sketched: harder than round 6 (bento tiles with an orb and outline number spilling across tiles,
 * variable-weight letter wave + rotated band, layered parallax skyline, isometric SVG cubes with leader labels, torn
 * clip-path collage with tape and blend headline; kanban with swimlanes, funnel + stacked bars + cohort grid, code
 * editor with terminal, product page with swatches and sizes, admin table with bulk bar and open filter menu).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round7 && node tests/rounds/autoplan.mjs round7
 *   node tests/bench/run.mjs --set round7auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round7`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

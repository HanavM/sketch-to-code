/**
 * Round 11, auto-sketched: harder than round 10 (3D card stack and spinning cube in perspective over a 3D floor, a 300px gradient-clipped word under a fade mask with a masked arch picture, blurred blobs and a circular text ring, a variable-weight ladder with two tilted counter-running marquees, layered paper waves with a sun, a scroll progress bar and a tilted card;
 * a code editor with explorer, tabs, highlighted code, minimap and a terminal panel, a CRM board with a deal drawer,
 * a three-pane mail client, an analytics dashboard with KPI sparklines, line chart, donut and table, a week calendar
 * with overlapping events, a mini month and a now line).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round11 && node tests/rounds/autoplan.mjs round11
 *   node tests/bench/run.mjs --set round11auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round11`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

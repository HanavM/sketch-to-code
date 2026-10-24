/**
 * Round 17, auto-sketched: harder than round 16 (skewed kinetic marquees with a spinning text badge and a clipped photo, a two-colour riso overprint with offset type and grain, a synthwave striped sun over a perspective grid floor with extruded type, a diagonal-clipped editorial with text wrapped round a circle, a drop cap and a ticker, an asymmetric animated bento; a gantt timeline with dependencies, a log explorer with histogram and JSON drawer, a design editor with layers, selection and properties, a music player with queue and player bar, a CRM contact with timeline, deal stepper and open dropdown).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round17 && node tests/rounds/autoplan.mjs round17
 *   node tests/bench/run.mjs --set round17auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round17`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

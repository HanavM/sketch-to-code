/**
 * Round 28, auto-sketched: harder than round 27 (a cut-paper jazz poster with clip-path figures, multiply blends, outlined type and a dashed stamp; a headline cut into three offset clip-path slices with an outline echo, a tilted moving ticker and scanlines; a glass terrarium globe with layered highlights, leaves, soil and frosted leader-line cards; a metro map poster of SVG lines and stations with a legend; a guilloché watch dial in a conic steel case with sub-dials and SVG hands; a SQL query builder with schema tree, highlighted editor, results and a plan graph; a patient chart with vitals sparklines, a medication dose grid, lab range bars and notes; a podcast editor with waveform lanes, cut regions, markers, playhead and meters; a trip itinerary with a dashed timeline, route map with pins, weather and budget; a CI pipeline with a job graph of curved wires, an ANSI log and a status matrix).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round28 && node tests/rounds/autoplan.mjs round28
 *   node tests/bench/run.mjs --set round28auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round28`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

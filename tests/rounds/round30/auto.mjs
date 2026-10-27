/**
 * Round 30, auto-sketched: harder than round 29 (a chess poster on a perspective board with a giant knight glyph and a
 * chess clock; letter-tile mosaic type, each tile its own shape, turn and fill, over a masked dot fade; noir venetian-blind
 * light (skewed, masked stripes) behind difference-blended italic type, credits and a film strip; a conic kaleidoscope with
 * a masked ray ring and screen-blended triangles; a year wheel with twelve month labels turned round a circle, a needle and
 * moon phases; a recruiting ATS with stage chevrons, a candidate table and a scorecard profile; an inventory page under a
 * dimmed scanner modal; a month calendar with spanning events and a pointer popover; a node-wire workflow editor with a
 * minimap; a music studio with waveform clips, a playhead, a mixer with meters and an EQ curve).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round30 && node tests/rounds/autoplan.mjs round30
 *   node tests/bench/run.mjs --set round30auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round30`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

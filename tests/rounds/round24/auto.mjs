/**
 * Round 24, auto-sketched: harder than round 23 (stacked offset letterpress layers with a vertical label and a turned ribbon, paper hills with drop-shadow layers and a notched ticket, a 4x5 grid of clip-path and radius shapes under a difference headline, a polaroid scrapbook with tape, an SVG circled word and a dashed arrow, a glitch headline split into clipped colour clones with marquees and an SVG ring; a grouped task database, a CSS street map with a route and a ride sheet, a video call grid with screen share and chat, a repo page with file list, heatmap and language bar, a checkout with stepper, error field and order summary).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round24 && node tests/rounds/autoplan.mjs round24
 *   node tests/bench/run.mjs --set round24auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round24`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

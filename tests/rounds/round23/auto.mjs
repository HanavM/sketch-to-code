/**
 * Round 23, auto-sketched: harder than round 22 (clip-path collage shards with difference type, a spinning CSS 3D cube, conic ring with circular text on a path, a dark bento grid of mini visuals, a CRT terminal with scanlines and glow; a design tool with layers, canvas selection and properties, flight search results with filters and sliders, threaded chat with reactions, a trading desk with candlesticks and an order book, an invoice editor with a paper, settings and activity).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round23 && node tests/rounds/autoplan.mjs round23
 *   node tests/bench/run.mjs --set round23auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round23`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

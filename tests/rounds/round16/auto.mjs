/**
 * Round 16, auto-sketched: harder than round 15 (a difference-blend word across a black/cream split over a masked halftone disc, frosted glass panes over blurred glow blobs and a hollow giant numeral, a per-letter arched title over a conic sunburst, a broken-grid editorial with a cropped giant number, multiply photos and CSS columns, a 3D-tilted phone mockup with floating chips; a spreadsheet with a selected range and chart, a week calendar with overlapping events and an event popover, a split code diff with a comment thread, a chat with thread panel and emoji picker, a checkout with an open address autocomplete and tooltip).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round16 && node tests/rounds/autoplan.mjs round16
 *   node tests/bench/run.mjs --set round16auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round16`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

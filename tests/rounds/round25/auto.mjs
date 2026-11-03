/**
 * Round 25, auto-sketched: harder than round 24 (a type specimen with stacked filled and outlined giant letters, metric lines, a ruler, glyph grid and kerning panel; a neon diner with glowing type, a perspective checker floor, a dotted-leader menu, chrome gradient text and a clip-path starburst; a Swiss poster with overlapping giant numerals, a turned red band, SVG text on a circle and vertical type; a botanical archive with scalloped masked plate cards, SVG plants and a wavy underline; a vinyl shop with a groove-gradient record, tonearm and serrated price badge; an email client, a dark analytics dashboard with SVG charts and a donut, a cloud drive with selection bar, context menu and upload toast, a hotel search with an open two-month date picker, and an invite modal over a blurred members page).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round25 && node tests/rounds/autoplan.mjs round25
 *   node tests/bench/run.mjs --set round25auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round25`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

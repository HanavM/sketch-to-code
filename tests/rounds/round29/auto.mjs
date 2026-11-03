/**
 * Round 29, auto-sketched: harder than round 28 (a risograph festival poster with halftone dot discs, multiply overprints
 * and a notched ticket; a brutalist 4x3 grid with vertical index, giant solid and outlined numerals and a hard-shadow
 * button; an isometric city block of clip-path building faces on a diamond lot; an art-deco cinema with a conic sunburst,
 * a double-line arch, gold clipped-gradient type and a hexagon button; a deep-sea page with blurred light rays, SVG waves,
 * a glowing jellyfish, bubbles and a frosted depth card; a spreadsheet with formula bar, selected range, conditional
 * colours, a comment and a bar chart; a Gantt chart with groups, progress bars, milestones, dependency wires and a today
 * line; a support inbox with ticket list, chat bubbles, internal note, typing dots and customer panel; a design tool with
 * layers, a selected card with handles and guides, a cursor tag and a colour picker; a trading desk with candlesticks,
 * order book depth, positions and an order form).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round29 && node tests/rounds/autoplan.mjs round29
 *   node tests/bench/run.mjs --set round29auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round29`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

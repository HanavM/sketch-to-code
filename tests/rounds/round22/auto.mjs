/**
 * Round 22, auto-sketched: harder than round 21 (difference-blend type over a split two-tone page with letters knocked off the baseline and a floating blob, a CSS 3D isometric town with three-faced towers, frosted glass cards over blurred colour blobs and grain, a brutalist magazine spread with a ticker, multiplied photo blocks, a drop cap and text wrapped round a circle, a risograph poster with halftone dot screens and misregistered type; a swimlane kanban with a tilted dragged card and a WIP limit, a product page with gallery, swatches and a size grid with sold-out sizes, a week calendar with overlapping events and a now line, a code editor with tree, highlighted code, minimap and terminal, a spreadsheet with frozen header, conditional fills and a selected range).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round22 && node tests/rounds/autoplan.mjs round22
 *   node tests/bench/run.mjs --set round22auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round22`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

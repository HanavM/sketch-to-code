/**
 * Round 20, auto-sketched: harder than round 19 (a misregistered riso poster in multiply blend over a halftone sun, a brutalist ruled grid with a vertical ticker, aurora blobs behind fanned frosted-glass cards, layered paper-cut hills under a conic sun with an arched text-path title and a perforated ticket, a 3D-tilted phone over a giant outline numeral with floating chips; a week calendar with overlapping events and a popover, a three-pane team chat with reactions and a thread, a spreadsheet with a selected range, formula bar and floating chart, a checkout with a field error and card visual, a dark code-review diff with an inline suggestion).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round20 && node tests/rounds/autoplan.mjs round20
 *   node tests/bench/run.mjs --set round20auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round20`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

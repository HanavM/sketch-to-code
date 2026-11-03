/**
 * Round 27, auto-sketched: harder than round 26 (a fanned tarot deck in perspective with foil rings and an ornament rule; a glass perfume bottle with mist blurs, reflection and tracked Didot type; clay 3D shapes with layered inset shadows, gradient text and a pressed button; a film festival with a stacked-shadow title, a turned sprocket strip, an SVG laurel and a notched ticket; a radial climate wheel of SVG wedges with a glowing core; a photo editor with crop grid, histogram and sliders; a meal planner with a week grid, prep timeline, checklist and donut; a smart home with a conic thermostat dial, toggles and an energy chart; a claim form with radio cards, errors, a dropzone and an open date picker; a cluster map of hexagon pods with a log panel and events table).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round27 && node tests/rounds/autoplan.mjs round27
 *   node tests/bench/run.mjs --set round27auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round27`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

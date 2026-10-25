/**
 * Round 21, auto-sketched: harder than round 20 (kinetic marquee type in opposing directions with an outline row and a spinning text-path badge, a 3D card stack in perspective under an extruded headline, a conic gradient clipped into giant type with a circular striped window, a duotone shard and a mask-faded grid, a Swiss grid with a rotated giant numeral and an orbiting ring round a red disc, a synthwave neon floor in perspective under a mask-striped sun and chrome title; a three-pane mail client, an analytics dashboard with sparklines, line chart, donut and table, a gantt timeline with dependencies and milestones, a music player with library, album view and player bar, a team settings page with members table, toggles and a danger zone).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round21 && node tests/rounds/autoplan.mjs round21
 *   node tests/bench/run.mjs --set round21auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round21`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

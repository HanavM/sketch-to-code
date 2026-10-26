/**
 * Round 26, auto-sketched: harder than round 25 (blend-mode circles over a gradient mesh with a difference headline and outlined type; an origami crane of clip-path facets with a skewed title band; an observatory with a starfield, dashed orbits, a ringed planet and glass stats; a ransom-note zine with per-letter tilted boxes, a torn clip-path band and a taped polaroid; a synth panel of conic-gradient knobs with SVG patch cables; a video editor with tracks, clips and playhead, a banking dashboard with a gradient card, stacked bars and budget rings, a property map with price pins and an open sort menu, a permission matrix with checkboxes and toggles, and three phone screens side by side).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round26 && node tests/rounds/autoplan.mjs round26
 *   node tests/bench/run.mjs --set round26auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round26`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

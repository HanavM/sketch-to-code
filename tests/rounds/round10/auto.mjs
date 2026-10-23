/**
 * Round 10, auto-sketched: harder than round 9 (a giant word extruded by stacked text-shadows over a checkerboard
 * floor with a spinning star, three skewed clip-path gradient panels under a difference-blend circle, a CRT terminal
 * with scanlines, glowing type and a blinking cursor, a Bauhaus grid of 48 quarter/half-circle, triangle and stripe tiles
 * under a title panel, an arch picture crossed by a difference-blend serif headline with a spinning badge; a video call
 * grid with chat, a pull-request diff with an inline review comment, a music playlist with a player bar, a trading desk
 * with candles, order book and buy/sell forms, an onboarding wizard with a stepper, radio cards and a drop zone).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round10 && node tests/rounds/autoplan.mjs round10
 *   node tests/bench/run.mjs --set round10auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round10`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

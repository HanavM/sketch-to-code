/**
 * Round 18, auto-sketched: harder than round 17 (a chrome-gradient clipped title over a spinning conic blob with a 3D-tilted glass card stack and a vertical ticker, a brutalist bordered grid with hollow numerals, a wobbling sticker and a difference-blend circle, an isometric city of 3D-faced blocks with drifting clouds, a diagonal duotone split with a difference-blend word, vertical nav and an animated ring, a torn-paper collage with a polaroid, tape, a hand-drawn arrow and a bobbing sticky note; a kanban with swimlanes, a WIP limit and a tilted dragged card, a code editor with syntax colours, minimap, autocomplete and terminal, an analytics dashboard with sparklines, area chart, donut, funnel and an open date picker, a three-pane email client with a floating compose window, a map booking page with price pins and a popup).
 * Written WITHOUT tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round18 && node tests/rounds/autoplan.mjs round18
 *   node tests/bench/run.mjs --set round18auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round18`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

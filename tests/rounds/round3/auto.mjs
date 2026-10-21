/**
 * Round 3, auto-sketched: hardest pages (layered depth, motion, gradient and blended type,
 * brutalist cards, vertical type; users table, kanban, calendar, chat, analytics). Written WITHOUT
 * tuning the rules first; every page drawn from autoplan.json by one rule set.
 *
 *   node tests/rounds/measure.mjs round3 && node tests/rounds/autoplan.mjs round3
 *   node tests/bench/run.mjs --set round3auto [--dry] [--only c1]
 */
import { readFileSync, readdirSync } from 'node:fs'
import { pageMaker } from '../lib/pages.mjs'

const DIR = new URL('./', import.meta.url).pathname
const page = pageMaker(DIR)
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))
const title = (id) => readFileSync(`${DIR}${id}.html`, 'utf8').match(/<title>([^<]*)/)?.[1] ?? id

export default readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort().map((id) => {
  const a = auto[id]
  if (!a) throw new Error(`autoplan.json has no ${id}: run node tests/rounds/autoplan.mjs round3`)
  return { ...page(id, id.startsWith('c') ? 'creative' : 'everyday', title(id), a.plan, a.notes), auto: true }
})

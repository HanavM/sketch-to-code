/**
 * Round 1, auto-sketched (approach n2): the same targets and the same mark
 * shapes as sketches.mjs, but which block gets which mark and the words typed
 * come from autoplan.json (node tests/rounds/autoplan.mjs round1), one rule set
 * for every page instead of a plan per page.
 *
 *   node tests/bench/run.mjs --set round1auto [--dry] [--only c1]
 */
import { readFileSync } from 'node:fs'
import hand, { page } from './sketches.mjs'

const DIR = new URL('./', import.meta.url).pathname
const auto = JSON.parse(readFileSync(`${DIR}autoplan.json`, 'utf8'))

export default hand.map((h) => {
  const a = auto[h.id]
  if (!a) throw new Error(`autoplan.json has no ${h.id}: run node tests/rounds/autoplan.mjs round1`)
  return { ...page(h.id, h.kind, h.title, a.plan, a.notes), auto: true }
})

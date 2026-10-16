/**
 * Compare the --words arms of the bench (s2c-016): how much of the intent the
 * sketch carries alone, and how few words it needs. Reads the per-arm result
 * files run.mjs writes (out/results.<mode>.words-<arm>.json) and prints
 * lib/words.mjs armTable. Zero tokens: it only reads files.
 *
 *   node tests/bench/run.mjs --set rough --words all
 *   node tests/bench/run.mjs --set rough --words content
 *   node tests/bench/run.mjs --set rough --words none
 *   node tests/bench/words-compare.mjs [--mode auto]
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORD_MODES, armTable } from './lib/words.mjs'

const i = process.argv.indexOf('--mode')
const mode = i === -1 ? 'auto' : process.argv[i + 1]
const OUT = new URL('./out/', import.meta.url).pathname
const arms = {}
for (const w of WORD_MODES) {
  const f = join(OUT, `results.${mode}.words-${w}.json`)
  if (existsSync(f)) arms[w] = JSON.parse(readFileSync(f, 'utf8'))
}
if (!Object.keys(arms).length) {
  console.error(`no results.${mode}.words-*.json in ${OUT}: run the bench with --words first`)
  process.exit(1)
}
console.log(armTable(arms))

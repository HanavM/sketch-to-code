/**
 * The s2c-013 head-to-head: structured reading (--mode auto) vs a screenshot
 * sent to the model (--mode screenshot), N runs each on the rough set.
 * Reads saved result files; zero tokens.
 *
 *   node tests/bench/mode-compare.mjs <dir>   # dir holds auto.run1.json … screenshot.run3.json
 *
 * Realized % counts a page that failed to run (error) as not realized: a
 * reading that never came back is what the user got. The "ran" column
 * says how many pages ran at all, so a flaky arm can't hide.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? new URL('./out/s2c-013/', import.meta.url).pathname
const rowsOf = (f) => {
  const d = JSON.parse(readFileSync(join(dir, f), 'utf8'))
  return Array.isArray(d) ? d : d.results
}
const runs = {}
for (const f of readdirSync(dir).filter((f) => /^(auto|screenshot)\.run\d+\.json$/.test(f)).sort()) {
  const mode = f.split('.')[0]
  ;(runs[mode] ??= []).push({ file: f, rows: rowsOf(f) })
}
if (!Object.keys(runs).length) {
  console.error(`no auto.runN.json / screenshot.runN.json in ${dir}`)
  process.exit(1)
}

const tok = (r) => (r.tokens ? r.tokens.input + r.tokens.output : 0)
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)}%` : '—')
const lines = ['| arm | run | realized | ran | failed | billed tokens | median s/page |', '|---|---|---|---|---|---|---|']
const summary = {}
for (const [mode, list] of Object.entries(runs)) {
  let R = 0, J = 0
  for (const { file, rows } of list) {
    const judged = rows.filter((r) => r.judged !== false)
    const real = judged.filter((r) => !r.error && r.realized).length
    const ran = judged.filter((r) => !r.error).length
    const secs = judged.filter((r) => r.runMs).map((r) => r.runMs / 1000).sort((a, b) => a - b)
    const med = secs.length ? secs[Math.floor(secs.length / 2)].toFixed(0) : '—'
    lines.push(`| ${mode} | ${file.match(/run(\d+)/)[1]} | ${pct(real, judged.length)} (${real}/${judged.length}) | ${ran} | ${judged.length - ran} | ${judged.reduce((a, r) => a + tok(r), 0).toLocaleString('en-US')} | ${med} |`)
    R += real
    J += judged.length
  }
  summary[mode] = { realized: J ? R / J : null, pages: J }
  lines.push(`| **${mode}** | all | **${pct(R, J)}** (${R}/${J}) | | | | |`)
}
console.log(lines.join('\n'))

// per page: realized count per arm, so "where structure loses" is visible
const ids = [...new Set(Object.values(runs).flatMap((l) => l.flatMap((x) => x.rows.map((r) => r.id))))]
const modes = Object.keys(runs)
const page = [`\n| page | ${modes.join(' | ')} |`, `|---|${modes.map(() => '---').join('|')}|`]
for (const id of ids) {
  const cells = modes.map((m) => {
    const got = runs[m].map(({ rows }) => rows.find((r) => r.id === id)).filter(Boolean)
    return got.map((r) => (r.error ? 'E' : r.realized ? '✓' : '✗')).join(' ')
  })
  page.push(`| ${id} | ${cells.join(' | ')} |`)
}
console.log(page.join('\n'))
if (summary.auto && summary.screenshot) {
  const gap = 100 * (summary.auto.realized - summary.screenshot.realized)
  console.log(`\nauto − screenshot: ${gap.toFixed(0)} points · auto ${(100 * summary.auto.realized).toFixed(0)}%` +
    ` · SEED test (gap ≥ 15 AND auto ≥ 60%): ${gap >= 15 && summary.auto.realized >= 0.6 ? 'MET' : 'NOT MET'}`)
}

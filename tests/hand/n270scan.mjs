// n270: on kept hand sketches, which fix notes (typed after the first Run) the new readings pick up. No build, no tokens.
// node tests/hand/n270scan.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pluralNamed, smallPartNamed } from '../../packages/pipeline/dist/fixcheck.js'
const files = []
const walk = (d, depth = 0) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === 'digest.json') files.push(p); else if (depth < 4 && statSync(p).isDirectory()) walk(p, depth + 1) } }
walk(new URL('.', import.meta.url).pathname)
const seen = new Set(); let total = 0; const parts = new Map(), plurals = new Map()
for (const f of files) {
  let d; try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
  const first = d.events?.find((e) => e.op === 'run')?.at ?? Infinity
  for (const n of d.notesTyped ?? []) {
    if (n.at <= first || seen.has(n.text)) continue
    seen.add(n.text); total++
    if (smallPartNamed(n.text)) parts.set(n.text, smallPartNamed(n.text))
    else if (pluralNamed(n.text)) plurals.set(n.text, pluralNamed(n.text))
  }
}
console.log(`${String(total)} different fix notes; small part ${String(parts.size)}; plural ${String(plurals.size)}`)
console.log('PART', [...parts.keys()].join(' | '))
console.log('PLURAL', [...plurals.keys()].join(' | '))

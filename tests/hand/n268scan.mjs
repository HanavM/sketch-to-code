// n268: what the new note rules change on kept hand sketches (no build, no tokens): every note read as a look-only note,
// and every note typed under a box of real size. node tests/hand/n268scan.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { lookNote } from '../../packages/pipeline/dist/typedcopy.js'
const root = new URL('./', import.meta.url).pathname
const digests = []
const walk = (d, depth) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name)
  if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.name === 'digest.json') digests.push(p) } }
for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith('out-')) walk(join(root, e.name), 0)
const seen = new Set(), looks = new Map()
let notes = 0
for (const f of digests) {
  let d; try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
  if (!d.notesTyped?.length) continue
  const key = `${d.round}/${d.id}`
  for (const n of d.notesTyped) { const k = `${key}|${n.text}`; if (seen.has(k)) continue; seen.add(k); notes++
    if (lookNote(n.text)) looks.set(n.text, (looks.get(n.text) ?? 0) + 1) }
}
console.log(`${notes} distinct notes on ${digests.length} digests; read as look-only: ${[...looks.values()].reduce((a, b) => a + b, 0)}`)
for (const [t, c] of [...looks].sort((a, b) => b[1] - a[1])) console.log(c, JSON.stringify(t))

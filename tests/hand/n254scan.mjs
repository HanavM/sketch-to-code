// n254: what the two tap rules change, read off every kept hand sketch (no build, no tokens).
// node tests/hand/n254scan.mjs <old-ink-dist/inkfill.js>
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { inkFills, pageFill } from '../../packages/ink/dist/inkfill.js'
const old = await import(process.argv[2])
const root = new URL('./', import.meta.url).pathname
const seen = new Set(), digests = []
const walk = (d, depth) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name)
  if (e.isDirectory() && depth < 4) walk(p, depth + 1); else if (e.name === 'digest.json') digests.push(p) } }
for (const e of readdirSync(root, { withFileTypes: true })) if (e.isDirectory() && e.name.startsWith('out-')) walk(join(root, e.name), 0)
const walkPts = (way) => { const out = []; for (let i = 0; i < way.length; i++) { const a = way[i]; if (i === 0) out.push({ x: a[0], y: a[1], t: 0 }); else { const z = way[i - 1], n = Math.max(1, Math.ceil(Math.hypot(a[0] - z[0], a[1] - z[1]) / 6)); for (let k = 1; k <= n; k++) out.push({ x: z[0] + (a[0] - z[0]) * k / n, y: z[1] + (a[1] - z[1]) * k / n, t: 0 }) } } return out }
let pages = 0, changed = 0, fades = 0, oldFades = 0
for (const f of digests) {
  let d; try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
  if (!d.strokesDrawn?.length) continue
  const key = `${d.round}/${d.id}`; if (seen.has(key)) continue; seen.add(key); pages++
  const pens = d.events.filter((e) => e.op === 'pen')
  const fr = d.events.find((e) => e.op === 'run')?.at ?? Infinity
  const strokes = d.strokesDrawn.filter((s) => s.at < fr).map((s, k) => ({ id: `s${k}`, color: [...pens].filter((p) => p.at < s.at).pop()?.color ?? null, points: walkPts(s.way) }))
  const P = { w: 1280, h: 900 }
  const a = old.inkFills(strokes, P), b = inkFills(strokes, P)
  const pa = old.pageFill(a), pb = pageFill(b)
  if (pa?.colors.length > 1) oldFades++
  if (pb?.colors.length > 1) fades++
  const diffs = a.map((x) => ({ x, y: b.find((v) => v.dotId === x.dotId) })).filter(({ x, y }) => (y?.target ?? null) !== x.target)
  if (diffs.length) { changed++; console.log(key, diffs.map(({ x, y }) => `tap ${x.at.x},${x.at.y} ${x.color}: ${x.target ?? 'page'} -> ${y?.target ?? 'page'}`).join(' | '), '| page', pa?.css ?? '-', '->', pb?.css ?? '-') }
}
console.log({ pages, changed, pageFadesBefore: oldFades, pageFadesNow: fades })

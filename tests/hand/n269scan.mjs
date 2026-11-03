// n269: what the new tap rules change on kept hand sketches (no build, no tokens): page fills before and after.
// Before is read by leaving out the page-dot reading and the open-mark reading. node tests/hand/n269scan.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { inkFills, pageFill, tapDots } from '../../packages/ink/dist/index.js'
const P = { w: 1280, h: 900 }
const files = []
const walk = (d, depth = 0) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === 'digest.json') files.push(p); else if (depth < 4 && statSync(p).isDirectory()) walk(p, depth + 1) } }
walk(new URL('.', import.meta.url).pathname)
const seen = new Set(); let total = 0, withPageTaps = 0
for (const f of files.sort()) {
  let d; try { d = JSON.parse(readFileSync(f, 'utf8')) } catch { continue }
  if (!d.strokesDrawn?.length) continue
  const firstRun = d.events?.find((e) => e.op === 'run')?.at ?? Infinity
  let pen = null; const st = []
  const ev = [...(d.events ?? []).filter((e) => e.op === 'pen').map((e) => ({ at: e.at - 0.5, pen: e.color ?? null })), ...d.strokesDrawn.map((s) => ({ at: s.at, way: s.way }))].sort((a, b) => a.at - b.at)
  for (const e of ev) { if (e.at >= firstRun) continue; if ('pen' in e) pen = e.pen; else {
    const pts = []; e.way.forEach((p, i) => { if (!i) { pts.push({ x: p[0], y: p[1], t: 0 }); return } const z = e.way[i - 1], n = Math.max(1, Math.ceil(Math.hypot(p[0] - z[0], p[1] - z[1]) / 6)); for (let k = 1; k <= n; k++) pts.push({ x: z[0] + (p[0] - z[0]) * k / n, y: z[1] + (p[1] - z[1]) * k / n, t: 0 }) })
    st.push({ id: `s${String(st.length)}`, color: pen, points: pts }) } }
  const key = JSON.stringify(st.map((s) => [s.color, s.points[0]]))
  if (seen.has(key)) continue; seen.add(key); total++
  const fills = inkFills(st, P), dots = tapDots(st, P).filter((x) => x.page)
  const page = fills.filter((x) => x.target === null)
  if (page.length) withPageTaps++
  const open = fills.filter((x) => x.target && !st.find((s) => s.id === x.target && Math.hypot(s.points[0].x - s.points[s.points.length - 1].x, s.points[0].y - s.points[s.points.length - 1].y) <= Math.max(28, s.points.length * 0.9)))
  if (dots.length || open.length) console.log(f.replace(/.*tests\/hand\//, ''), `r${d.round} ${d.id}`, 'dots', dots.map((x) => `${x.color}@${x.at.x},${x.at.y}`).join(' '), '| open', open.map((x) => `${x.color}@${x.at.x},${x.at.y}`).join(' '), '| page', JSON.stringify(pageFill(fills)?.colors))
}
console.log(`${String(total)} sketches, ${String(withPageTaps)} with page taps`)

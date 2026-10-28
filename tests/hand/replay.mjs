/**
 * Replay a hand sketch (n32): the same strokes, pen colours and notes a person drew in an earlier
 * step, in the same order, through a running session.mjs, then Run once and score. Used to measure a
 * tool change on an already-sketched page with the sketch held still. Correction notes typed after the
 * first Run, and note drags, are left out (the point is whether the first build now gets it right).
 *
 *   node tests/hand/replay.mjs <digest.json> [--port 5390] [--fixes]
 *
 * --fixes (n37): after the first Run, type the same correction notes at the same spots and Run again,
 * so a change to how fix notes are handled is measured with the fix held still too.
 */
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
const [file] = process.argv.slice(2)
const port = (() => { const i = process.argv.indexOf('--port'); return i === -1 ? 5390 : Number(process.argv[i + 1]) })()
const d = JSON.parse(readFileSync(file, 'utf8'))
// plain http, no client timeout: a run can take many minutes
const post = (body) => new Promise((ok, bad) => {
  const req = request({ host: 'localhost', port, method: 'POST', timeout: 0 }, (res) => {
    let s = ''; res.on('data', (c) => { s += c }); res.on('end', () => { try { ok(JSON.parse(s)) } catch (e) { bad(e) } })
  })
  req.on('error', bad); req.end(JSON.stringify(body))
})
const call = async (body) => { const j = await post(body); if (j.ok === false) throw new Error(`${body.op}: ${j.error}`); return j }
const firstRun = d.events.find((e) => e.op === 'run')?.at ?? Infinity
const ops = [
  ...d.strokesDrawn.map((s) => ({ at: s.at, op: { op: 'stroke', pts: s.way } })),
  ...d.events.filter((e) => e.op === 'pen').map((e) => ({ at: e.at - 0.5, op: { op: 'pen', color: e.color ?? null } })),
  ...d.notesTyped.map((n) => ({ at: n.at, op: { op: 'note', x: n.x, y: n.y, text: n.text, whole: n.whole } })),
].filter((o) => o.at < firstRun).sort((a, b) => a.at - b.at)
await call({ op: 'open', round: d.round, id: d.id })
for (const o of ops) { const r = await call(o.op); if (o.op.op === 'note') console.log('note', JSON.stringify(o.op.text), '->', r.status ?? '') }
await call({ op: 'look', name: 'threads' })
const run = await call({ op: 'run' })
console.log('run', JSON.stringify(run).slice(0, 400))
if (process.argv.includes('--fixes')) {
  const fixes = d.notesTyped.filter((n) => n.at > firstRun).sort((a, b) => a.at - b.at)
  for (const n of fixes) { const r = await call({ op: 'note', x: n.x, y: n.y, text: n.text, whole: n.whole }); console.log('fix', JSON.stringify(n.text), '->', r.status ?? '') }
  if (fixes.length) { await call({ op: 'look', name: 'fix-threads' }); const r2 = await call({ op: 'run' }); console.log('run2', JSON.stringify(r2).slice(0, 600)) }
}
const done = await call({ op: 'done' })
console.log('done', JSON.stringify(done).slice(0, 600))

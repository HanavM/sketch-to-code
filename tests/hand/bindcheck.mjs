/**
 * n189: does each note land on the mark it was typed for? Replays a digest's strokes, pen colours and notes typed
 * before the first Run (paced at their recorded times, since strokes drawn in one sitting cluster), through a running
 * session.mjs, then asks what every note is bound to and compares with the sketcher's intent (n189/expected.json).
 * No build is run: this measures only the binding, the count of note moves a person would have to make.
 *
 *   node tests/hand/bindcheck.mjs <digest.json>... [--port 5390]
 */
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
const files = process.argv.slice(2).filter((a) => a.endsWith('.json'))
const port = (() => { const i = process.argv.indexOf('--port'); return i === -1 ? 5390 : Number(process.argv[i + 1]) })()
const expected = JSON.parse(readFileSync(new URL('./n189/expected.json', import.meta.url), 'utf8'))
const post = (body) => new Promise((ok, bad) => {
  const req = request({ host: 'localhost', port, method: 'POST', timeout: 0 }, (res) => {
    let s = ''; res.on('data', (c) => { s += c }); res.on('end', () => { try { ok(JSON.parse(s)) } catch (e) { bad(e) } })
  })
  req.on('error', bad); req.end(JSON.stringify(body))
})
const call = async (body) => { const j = await post(body); if (j.ok === false) throw new Error(`${body.op}: ${j.error}`); return j }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let wrongAll = 0, allNotes = 0
for (const file of files) {
  const d = JSON.parse(readFileSync(file, 'utf8'))
  const firstRun = d.events.find((e) => e.op === 'run')?.at ?? Infinity
  const ops = [
    ...d.strokesDrawn.map((s) => ({ at: s.at, op: { op: 'stroke', pts: s.way } })),
    ...d.events.filter((e) => e.op === 'moveBar' && e.x != null).map((e) => ({ at: e.at - 0.75, op: { op: 'moveBar', x: e.x, y: e.y } })),
    ...d.events.filter((e) => e.op === 'pen').map((e) => ({ at: e.at - 0.5, op: { op: 'pen', color: e.color ?? null } })),
    ...d.notesTyped.map((n) => ({ at: n.at, op: { op: 'note', x: n.x, y: n.y, text: n.text, whole: n.whole } })),
  ].filter((o) => o.at < firstRun).sort((a, b) => a.at - b.at)
  await call({ op: 'open', round: d.round, id: d.id })
  const t0 = Date.now()
  for (const o of ops) {
    const wait = o.at - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
    await call(o.op)
  }
  const b = await call({ op: 'bound' })
  const want = expected[d.id] ?? []
  let wrong = 0
  for (const [pre, ids, any] of want) {
    const n = b.notes.find((x) => x.text.startsWith(pre))
    const got = (n?.marks ?? []).map((m) => m.i).sort((a, z) => a - z)
    const ok = any ? got.length > 0 && got.every((i) => ids.includes(i)) : got.length === ids.length && got.every((i, k) => i === [...ids].sort((a, z) => a - z)[k])
    if (!ok) wrong++
    console.log(`${ok ? 'ok   ' : 'WRONG'} ${d.id.slice(0, 2)} ${JSON.stringify(pre).padEnd(16)} want ${JSON.stringify(ids)} got ${JSON.stringify(got)}${ok ? '' : ' of ' + JSON.stringify(n?.all ?? []) + ' ' + JSON.stringify((n?.marks ?? []).map((m) => m.box))}`)
  }
  console.log(`== ${d.id}: ${want.length - wrong}/${want.length} notes on their mark`)
  wrongAll += wrong; allNotes += want.length
}
console.log(`TOTAL: ${allNotes - wrongAll}/${allNotes} right, ${wrongAll} would need moving`)

// node tests/bench/focusdiff.mjs tests/bench/out/plain : which typed notes would change focus vs the old 24px-slack rule (run after --dry --plain)
import { readFileSync, readdirSync } from 'node:fs'
import { buildEvidence } from '@s2c/pipeline'
const dir = process.argv[2]
const rect = (st) => { let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for (const p of st.points){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)} return {x:x0,y:y0,w:x1-x0,h:y1-y0} }
const dist = (p,r)=>Math.hypot(Math.max(r.x-p.x,0,p.x-(r.x+r.w)),Math.max(r.y-p.y,0,p.y-(r.y+r.h)))
function oldFocus(ids, given, at, strokes){ if(ids.length<2)return; let f=(given??[]).filter(i=>ids.includes(i)); if(!f.length&&at){const d=new Map();for(const s of strokes){if(!ids.includes(s.id)||!s.points.length)continue;d.set(s.id,dist(at,rect(s)))} if(!d.size)return; const b=Math.min(...d.values()); f=ids.filter(i=>(d.get(i)??1e9)<=b+24)} return f.length>0&&f.length<ids.length?f:undefined }
let changed=0,total=0
for (const f of readdirSync(dir).filter(f=>f.endsWith('.wire.json'))) {
  const w = JSON.parse(readFileSync(dir+'/'+f))
  const ev = buildEvidence(w.strokes, w.snapshot, w.notes ?? [])
  for (const n of w.notes ?? []) {
    if (n.anchor?.kind !== 'strokes') continue
    total++
    const o = oldFocus(n.anchor.strokeIds, n.anchor.focus, n.at, w.strokes)
    const nn = ev.notes.find(x=>x.id===n.id)?.focus
    if (JSON.stringify(o)!==JSON.stringify(nn)) { changed++; console.log(f.split('.')[0], JSON.stringify(n.text).slice(0,70), 'old', JSON.stringify(o), 'new', JSON.stringify(nn)) }
  }
}
console.log(`changed ${changed} of ${total} strokes notes`)

/**
 * Offline interpreter smoke: real model call (Azure gpt-4o), no browser.
 * Case A: two arrows between card1 and card3 → expect ONE swap (or coherent
 *         pair of moves), never deletes.
 * Case B: a ribbon drawn in FOUR separate strokes → expect ONE design action
 *         citing all four strokes, background layer — never arrows/lines.
 */
import { interpretV2 } from '../../packages/pipeline/dist/index.js'

const style = {
  display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row',
  gap: '0', padding: '0', margin: '0', backgroundColor: 'rgb(255,255,255)',
  color: 'rgb(17,24,39)', fontSize: '14px', fontWeight: '400', borderRadius: '8px',
}
const N = (id, tag, text, x, y, w, h, parent, depth, srcLoc) =>
  ({ id, tag, srcLoc, rect: { x, y, w, h }, text, classes: [], style, parent, depth })

const snapshot = {
  nodes: [
    N('e0', 'body', '', 0, 0, 1280, 900, null, 0, null),
    N('e1', 'main', '', 40, 60, 1200, 800, 'e0', 1, 'src/App.tsx:5:5'),
    N('e2', 'div', 'Revenue $48,210', 80, 100, 300, 150, 'e1', 2, 'src/StatCards.tsx:9:7'),
    N('e3', 'div', 'Active users 3,904', 420, 100, 300, 150, 'e1', 2, 'src/StatCards.tsx:9:7'),
    N('e4', 'div', 'Conversion 4.7%', 760, 100, 300, 150, 'e1', 2, 'src/StatCards.tsx:9:7'),
    N('e5', 'form', 'Invite a teammate', 80, 320, 500, 380, 'e1', 2, 'src/Form.tsx:3:5'),
  ],
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
  url: 'http://t/', takenAt: 0, truncated: false,
}

const line = (id, pts, t0 = 0) => ({
  id,
  points: pts.map(([x, y], i) => ({ x, y, t: t0 + i * 12 })),
})
const seg = (x0, y0, x1, y1, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])

// ---- Case A: two arrows card1 <-> card3 (each: shaft + drawn head) ----
const arrowA = line('s0', [
  ...seg(240, 140, 890, 140), // shaft L->R (over the cards' upper area)
  ...seg(890, 140, 868, 126, 6), // head wing 1
  ...seg(868, 126, 890, 140, 6),
  ...seg(890, 140, 868, 154, 6), // head wing 2
], 0)
const arrowB = line('s1', [
  ...seg(880, 210, 230, 210), // shaft R->L (lower area)
  ...seg(230, 210, 252, 196, 6),
  ...seg(252, 196, 230, 210, 6),
  ...seg(230, 210, 252, 224, 6),
], 1600)

console.log('=== CASE A: two arrows (swap) ===')
const a = await interpretV2([arrowA, arrowB], snapshot)
console.log('reading:', a.interpretation.reading)
for (const act of a.interpretation.actions) {
  console.log(' action:', act.kind, 'targets:', act.targets.map((t) => `${t.tag}"${t.text.slice(0, 16)}"`).join(','), act.dest ? `dest:${act.dest.text.slice(0, 16)}` : '', act.needsConfirm ? '⚠' : '')
}
console.log(' rejected:', a.interpretation.rejected, '| tokens:', JSON.stringify(a.tokens))
const kinds = a.interpretation.actions.map((x) => x.kind)
if (kinds.includes('delete')) throw new Error('CASE A FAIL: interpreted as delete')
const okA = kinds.includes('swap') || kinds.filter((k) => k === 'move').length === 2
console.log(okA ? 'CASE A PASS' : 'CASE A WEAK (no swap/move-pair)')

// ---- Case B: ribbon in four strokes across the cards ----
const wave = (x0, x1, id, t0) => {
  const pts = []
  const n = 40
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n
    pts.push([x, 175 + Math.sin(x / 55) * 52])
  }
  return line(id, pts, t0)
}
const ribbon = [
  wave(70, 340, 'r0', 0),
  wave(335, 610, 'r1', 900),
  wave(605, 880, 'r2', 1800),
  wave(875, 1120, 'r3', 2700),
]

console.log('\n=== CASE B: four-stroke ribbon ===')
const bRes = await interpretV2(ribbon, snapshot)
console.log('reading:', bRes.interpretation.reading)
for (const act of bRes.interpretation.actions) {
  console.log(' action:', act.kind, 'strokes cited:', act.svgPaths?.length ?? 0, 'layer:', act.layer, 'region:', act.region ? `${Math.round(act.region.w)}x${Math.round(act.region.h)}` : null)
}
console.log(' rejected:', bRes.interpretation.rejected, '| tokens:', JSON.stringify(bRes.tokens))
const acts = bRes.interpretation.actions
if (acts.some((x) => x.kind === 'delete' || x.kind === 'move')) throw new Error('CASE B FAIL: destructive/move reading')
const designs = acts.filter((x) => x.kind === 'design' || x.kind === 'add')
if (designs.length !== 1) throw new Error(`CASE B FAIL: expected 1 design action, got ${designs.length} (${acts.map((x) => x.kind)})`)
if ((designs[0].svgPaths?.length ?? 0) < 3) throw new Error('CASE B FAIL: design does not cite the ribbon strokes')
console.log('CASE B PASS')

// ---- Case C: jagged zigzag confined to ONE card → delete, not decoration ----
const zig = (() => {
  const pts = []
  const zigs = 7
  for (let i = 0; i <= zigs * 6; i++) {
    const u = i / (zigs * 6)
    pts.push([428 + u * 284, (Math.floor(i / 3) % 2 === 0) ? 112 : 238])
  }
  return line('z0', pts, 0)
})()
console.log('\n=== CASE C: delete-scribble on one card ===')
const c = await interpretV2([zig], snapshot)
console.log('reading:', c.interpretation.reading)
for (const act of c.interpretation.actions) {
  console.log(' action:', act.kind, 'targets:', act.targets.map((t) => t.text.slice(0, 20)))
}
console.log(' tokens:', JSON.stringify(c.tokens))
const ck = c.interpretation.actions.map((x) => x.kind)
if (ck.includes('design') || ck.includes('add')) throw new Error('CASE C FAIL: read as decoration')
if (!ck.includes('delete')) throw new Error('CASE C FAIL: no delete action')
const delTargets = c.interpretation.actions.find((x) => x.kind === 'delete').targets
if (!delTargets.some((t) => t.text.includes('Active users'))) throw new Error('CASE C FAIL: wrong delete target')
console.log('CASE C PASS')

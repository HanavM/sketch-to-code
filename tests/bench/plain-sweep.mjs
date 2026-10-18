/**
 * plain-sweep.mjs — how often the no-model readings hold up on rough marks
 * (s2c-052). Zero tokens, no browser.
 *
 * The bench has one scribble (r01) and one green ring (r12), and both are read
 * right (run.mjs --set rough --dry --plain). One mark each says nothing about a
 * hurried hand. This draws thousands of them with the bench's own rough
 * generators (lib/rough.mjs), on the base page's real snapshot as the overlay
 * sent it (fixtures/base-snapshot.json, captured from r01's dry run), and puts
 * each through plainReading exactly as /@s2c/interpret would. Every sample is
 * judged by lib/plain.mjs against an answer key built for it.
 *
 * Families:
 *   scribble    a scratch-out over one of 7 elements, from well inside it to
 *               overshooting it by 25%                         want: delete it
 *   ring        a coloured loop round one of 4 elements, 0.8 to 1.4 turns,
 *               loose to very wobbly                           want: recolour it
 *   probe-*     marks that mean something else: a default-ink ring (asks),
 *               a coloured arrow (move), a coloured 3-sided box (add), a
 *               coloured underline, a wobbly ring        want: never fire
 *   gap-*       deletes a person also makes that no rule covers yet: a two-
 *               stroke X, a strike-through               (counted, not failed)
 *
 * The number that matters is bad fires (wrong + false-fire): a plain reading
 * skips the model, so a wrong one is applied with nothing else asked.
 *
 *   npm run build && node tests/bench/plain-sweep.mjs [--n 200] [--json out.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { plainReading } from '@s2c/pipeline'
import { rscribble, rring, rline, rarrow, rbox } from './lib/rough.mjs'
import { rngFrom } from './lib/draw.mjs'
import { judgePlain, tallyPlain, subtreeText } from './lib/plain.mjs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
const N = Number(arg('n', 200))
const SNAP = JSON.parse(readFileSync(new URL('./fixtures/base-snapshot.json', import.meta.url), 'utf8'))
const node = (text) => {
  const n = SNAP.nodes.find((x) => x.text === text || x.text.startsWith(text))
  if (!n) throw new Error(`no element "${text}" in the base snapshot`)
  return n
}
// every text on the page, as the answer keys' `kept` list draws from it
const ALL_TEXTS = SNAP.nodes.filter((n) => n.text).map((n) => n.text)

/** A wire stroke the way the overlay records one: page px, ~16 ms apart. */
const toWire = (pts, i, color) => ({
  id: `s${i}`,
  points: pts.map((p, k) => ({ x: p.x, y: p.y, t: 1000 + 16 * k })),
  ...(color ? { color } : {}),
})

/** Delete key: the target's own text is gone, every text outside it stays. */
function deleteKey(target) {
  const inside = subtreeText(SNAP, target.id)
  const first = SNAP.nodes.find((n) => n.text && inside.includes(n.text))
  return {
    edits: [
      { check: 'absent', text: first.text, must: true },
      ...ALL_TEXTS.filter((t) => !inside.includes(t)).map((t) => ({ check: 'kept', text: t })),
    ],
  }
}
const recolorKey = (target, prop) => ({ edits: [{ check: prop, text: target.text, must: true }, { check: 'kept', text: target.text }] })
const noRuleKey = { edits: [{ check: 'order', text: 'n/a', must: true }] }

const U = (r, a, b) => a + (b - a) * r()
const rowsBy = new Map()
const bucket = new Map() // family -> label -> rows
function record(family, label, keySpec, strokes) {
  const wire = { strokes, snapshot: SNAP, mode: 'gesture', notes: [] }
  let plain
  try {
    plain = plainReading(wire.strokes, wire.snapshot, 'gesture', [])
  } catch (err) {
    plain = { ok: false, reason: `threw: ${String(err)}` }
  }
  const row = judgePlain(keySpec, wire, plain)
  if (!rowsBy.has(family)) rowsBy.set(family, [])
  rowsBy.get(family).push(row)
  if (label) {
    if (!bucket.has(family)) bucket.set(family, new Map())
    const b = bucket.get(family)
    if (!b.has(label)) b.set(label, [])
    b.get(label).push(row)
  }
}

// ── scribble: a scratch-out over one element ───────────────────────────────
const SCRIBBLE_TARGETS = ['Pricing', 'Ship faster with Acme', 'The deploy platform', 'Get started', 'Instant previews', '"We cut our release']
const card3 = SNAP.nodes.find((n) => n.tag === 'article' && subtreeText(SNAP, n.id).includes('Usage-based billing'))
for (const [ti, t] of [...SCRIBBLE_TARGETS.map(node), card3].entries()) {
  for (let i = 0; i < N; i++) {
    const r = rngFrom(1_000_003 * (ti + 1) + i)
    // how much of the element the scribble's box spans: 0.5 = well inside it,
    // 1.25 = a quarter past its edges, which hurried hands do
    const f = U(r, 0.5, 1.25)
    const fh = Math.min(1.25, f * U(r, 0.8, 1.2))
    const R = t.rect
    const w = R.w * f
    const h = Math.max(12, R.h * fh)
    const cx = R.x + R.w / 2 + U(r, -0.08, 0.08) * R.w
    const cy = R.y + R.h / 2 + U(r, -0.08, 0.08) * R.h
    const passes = Math.max(3, Math.round(U(r, 0.6, 1.6) * Math.max(5, w / 40)))
    const pts = rscribble(cx - w / 2, cy - h / 2, w, h, { seed: 7919 * i + ti, passes })
    const label = f < 0.75 ? 'span <75%' : f <= 1 ? 'span 75-100%' : 'span >100% (overshoots)'
    record('scribble', label, deleteKey(t), [toWire(pts, 0)])
    record(`scribble:${t.tag}${t.text ? ` "${t.text.slice(0, 18)}"` : ' card 3'}`, null, deleteKey(t), [toWire(pts, 0)])
  }
}

// ── ring: one loop in a picked colour round one element ─────────────────────
const RING_TARGETS = [['Get started', 'bg'], ['Ship faster with Acme', 'color'], ['Pricing', 'color'], ['Priya N.', 'color']]
for (const [ti, [text, prop]] of RING_TARGETS.entries()) {
  const t = node(text)
  for (let i = 0; i < N; i++) {
    const r = rngFrom(2_000_003 * (ti + 1) + i)
    const R = t.rect
    const turns = U(r, 0.8, 1.4)
    const wobble = U(r, 1, 4)
    // a ring has to clear what it goes round: 1.05x to 1.6x its half-size,
    // with a floor so a 20 px link still gets a loop a hand can draw
    const rx = Math.max(18, (R.w / 2) * U(r, 1.05, 1.6))
    const ry = Math.max(14, (R.h / 2) * U(r, 1.1, 1.9))
    const cx = R.x + R.w / 2 + U(r, -0.06, 0.06) * R.w
    const cy = R.y + R.h / 2 + U(r, -0.1, 0.1) * R.h
    const pts = rring(cx, cy, rx, ry, { seed: 104729 * i + ti, turns, wobble })
    const color = ['#16a34a', '#dc2626', '#2563eb', '#9333ea'][i % 4]
    const label = turns < 0.95 ? 'turns <0.95 (open)' : turns <= 1.15 ? 'turns 0.95-1.15' : 'turns >1.15 (overdrawn)'
    record('ring', label, recolorKey(t, prop), [toWire(pts, 0, color)])
    record(`ring:${t.tag} "${t.text.slice(0, 18)}"`, null, recolorKey(t, prop), [toWire(pts, 0, color)])
  }
}

// ── probes: marks that mean something else, must never fire ────────────────
{
  const btn = node('Get started')
  const h1 = node('Ship faster with Acme')
  const quote = node('"We cut our release')
  const footer = SNAP.nodes.find((n) => n.tag === 'footer')
  for (let i = 0; i < N; i++) {
    const r = rngFrom(3_000_017 + i)
    const B = btn.rect
    // default ink: "change this", not how. The overlay asks; no rule may answer
    record('probe: ring, default ink', null, noRuleKey, [toWire(rring(B.x + B.w / 2, B.y + B.h / 2, B.w * U(r, 0.55, 0.8), B.h * U(r, 0.6, 0.95), { seed: i, turns: U(r, 0.9, 1.3), wobble: U(r, 1, 4) }), 0)])
    // the s2c-049 worry: a shaky ring must never read as a scratch-out
    record('probe: very wobbly ring, default ink', null, noRuleKey, [toWire(rring(B.x + B.w / 2, B.y + B.h / 2, B.w * U(r, 0.55, 0.8), B.h * U(r, 0.6, 0.95), { seed: 50_000 + i, turns: U(r, 0.9, 1.6), wobble: U(r, 4, 9) }), 0)])
    const col = '#16a34a'
    const Q = quote.rect
    record('probe: coloured arrow (a move)', null, noRuleKey, [toWire(rarrow(Q.x + Q.w / 2 + U(r, -100, 100), Q.y + Q.h / 2, 640 + U(r, -80, 80), 372 + U(r, -6, 6), { seed: i }), 0, col)])
    const F = footer.rect
    record('probe: coloured 3-sided box (an add)', null, noRuleKey, [toWire(rbox(F.x + 300 + U(r, -40, 40), F.y + 8, 500 * U(r, 0.7, 1.2), F.h - 16, { seed: i, sides: 3 }), 0, col)])
    const H = h1.rect
    const ux = 640 - 220 * U(r, 0.7, 1.3)
    record('probe: coloured underline', null, noRuleKey, [toWire(rline(ux, H.y + H.h + 4, 1280 - ux, H.y + H.h + 4 + U(r, -4, 4), { seed: i }), 0, col)])
  }
}

// ── gaps: deletes no rule covers yet (counted as missed, not failed) ───────
{
  for (const [ti, text] of ['Pricing', 'Features', 'About', 'Get started'].entries()) {
    const t = node(text)
    for (let i = 0; i < Math.ceil(N / 4); i++) {
      const r = rngFrom(4_000_037 * (ti + 1) + i)
      const R = t.rect
      const px = R.w * U(r, 0.0, 0.2)
      const py = R.h * U(r, -0.1, 0.2)
      record('gap: two-stroke X', null, deleteKey(t), [
        toWire(rline(R.x - px, R.y - py, R.x + R.w + px, R.y + R.h + py, { seed: 2 * i, slop: 3 }), 0),
        toWire(rline(R.x + R.w + px, R.y - py, R.x - px, R.y + R.h + py, { seed: 2 * i + 1, slop: 3 }), 1),
      ])
    }
  }
  const h1 = node('Ship faster with Acme')
  for (let i = 0; i < N; i++) {
    const r = rngFrom(5_000_011 + i)
    const H = h1.rect
    record('gap: strike-through, no words', null, deleteKey(h1), [toWire(rline(420 + U(r, -30, 30), H.y + H.h / 2 + U(r, -6, 6), 860 + U(r, -30, 30), H.y + H.h / 2 + U(r, -6, 6), { seed: i, slop: 10 }), 0)])
  }
}

// ── report ──────────────────────────────────────────────────────────────────
const pct = (x) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`)
const line = (name, rows) => {
  const t = tallyPlain(rows)
  return `| ${name} | ${t.total} | ${t.right} | ${t.missed} | ${t.wrong} | ${t['false-fire']} | ${t.declined} | ${pct(t.freeRate)} |`
}
const out = ['| family | n | right | missed | wrong | false fire | declined ok | read free |', '|---|---|---|---|---|---|---|---|']
for (const [fam, rows] of rowsBy) {
  out.push(line(fam, rows))
  for (const [label, brows] of bucket.get(fam) ?? []) out.push(line(`  ${fam} · ${label}`, brows))
}
console.log(out.join('\n'))
const reasons = new Map()
for (const [fam, rows] of rowsBy) {
  if (fam.includes(':')) continue // the per-element rows repeat the family's samples
  for (const r of rows) {
    if (r.outcome === 'right' || r.outcome === 'declined') continue
    const why = (r.why ?? r.reason ?? '').replace(/\b(s\d+|e\d+)\b/g, '#').replace(/\d+%/g, 'N%')
    const k = `${fam.split(':')[0]} · ${r.outcome} · ${why}`
    reasons.set(k, (reasons.get(k) ?? 0) + 1)
  }
}
console.log('\nwhy, for every sample not read right (top 20):')
for (const [k, c] of [...reasons].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  ${String(c).padStart(5)}  ${k}`)
const bad = [...rowsBy].filter(([f]) => !f.startsWith('gap') && !f.includes(':')).flatMap(([, r]) => r).filter((r) => r.outcome === 'wrong' || r.outcome === 'false-fire').length
console.log(`\nbad fires (wrong + false fire, gaps excluded): ${bad}`)
const json = arg('json', null)
if (json) writeFileSync(json, JSON.stringify(Object.fromEntries([...rowsBy].map(([f, r]) => [f, tallyPlain(r)])), null, 2))

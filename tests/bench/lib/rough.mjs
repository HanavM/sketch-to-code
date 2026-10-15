/**
 * rough.mjs — the marks a person actually makes in three seconds.
 *
 * draw.mjs draws the tidy set: closed rectangles, square corners, sub-pixel
 * tremor. SEED.md says the product is judged on the opposite: "quick, loose
 * marks: a box, an arrow, a scribble, a word ... If a user has to draw
 * carefully, that's a bug in the tool." These primitives are the loose version:
 *
 *   - boxes that don't close (or overshoot their start), with corners that
 *     overshoot and sides that bow, slightly skewed
 *   - lines that over- or under-shoot their ends and sag in the middle
 *   - rings drawn as a drifting 1.1-turn loop, not a circle
 *   - partial boxes (two or three sides: "you know what I mean")
 *   - delete scribbles, strike-throughs and arrows for EDITS on existing UI,
 *     which the tidy set never draws (s2c-012: every tidy page reads as design)
 *
 * The wobble is LOW-frequency (a sway every ~60 px, a few px wide), not more
 * tremor. That is both what a hurried hand does and a hard constraint: the
 * reader calls a stroke a delete-scribble when it has >= 4 sharp (>60°) turns
 * at 8 px resampling and sits inside one element (intent2.ts). High-frequency
 * noise on a ring around a button would turn "change this" into "delete this",
 * which is a broken benchmark, not a rough one. `sharpTurns` below replicates
 * that count so tests can hold every rough primitive to it.
 *
 * Deterministic: everything is seeded from the call's own arguments.
 */
import { jitter, rngFrom, seedFrom, walk } from './draw.mjs'

const SPACING = 6

/** Seeded wobble: amp px, a control point every `period` samples (~period*6 px). */
function sway(points, amp, seed, period = 10) {
  return jitter(points, amp, seed, period)
}

/**
 * A loose straight line. Ends over/undershoot by up to `slop` px along the
 * line, the middle sags by up to `bow` of its length.
 */
export function rline(x1, y1, x2, y2, opts = {}) {
  const seed = opts.seed ?? seedFrom(x1, y1, x2, y2, 7)
  const r = rngFrom(seed)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const slop = opts.slop ?? 8
  const s0 = (r() * 2 - 1) * slop
  const s1 = (r() * 2 - 1) * slop
  const a = { x: x1 - ux * s0, y: y1 - uy * s0 }
  const b = { x: x2 + ux * s1, y: y2 + uy * s1 }
  const sag = (r() * 2 - 1) * (opts.bow ?? 0.03) * len
  const m = { x: (a.x + b.x) / 2 - uy * sag, y: (a.y + b.y) / 2 + ux * sag }
  return sway(walk([a, m, b], SPACING), opts.wobble ?? 2.5, seed)
}

/**
 * A loose rectangle as one stroke. Corners are displaced and overshoot, and
 * the stroke either stops short of where it began (`gap`, the default) or runs
 * past it (`overlap`). `sides` < 4 draws only that many sides (a partial box).
 */
export function rbox(x, y, w, h, opts = {}) {
  const seed = opts.seed ?? seedFrom(x, y, w, h, 11)
  const r = rngFrom(seed)
  const jit = Math.min(10, 0.04 * Math.min(w, h) + 3)
  const d = () => (r() * 2 - 1) * jit
  const skew = (opts.skew ?? 0.015) * (r() < 0.5 ? -1 : 1)
  // corners clockwise from top-left, displaced and sheared
  const c = [
    { x: x + d(), y: y + d() },
    { x: x + w + d(), y: y + d() + skew * w },
    { x: x + w + d() + skew * h, y: y + h + d() },
    { x: x + d() + skew * h, y: y + h + d() - skew * w },
  ]
  const over = opts.overshoot ?? 6
  const sides = Math.max(1, Math.min(4, opts.sides ?? 4))
  const wp = [c[0]]
  for (let i = 0; i < sides; i++) {
    const from = c[i]
    const to = c[(i + 1) % 4]
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1
    const ux = (to.x - from.x) / len
    const uy = (to.y - from.y) / len
    const last = i === sides - 1
    if (last && sides === 4) {
      // closing side: stop short, or run on past the start
      const end = opts.close === 'overlap' ? -(10 + r() * 10) : 8 + r() * 10
      wp.push({ x: to.x - ux * end, y: to.y - uy * end })
    } else {
      // a hurried corner: run a few px past it, then turn
      const o = over * (0.5 + r())
      wp.push({ x: to.x + ux * o, y: to.y + uy * o })
    }
  }
  return sway(walk(wp, SPACING), opts.wobble ?? 2.5, seed)
}

/**
 * A ring around something: a 1.1-turn loop whose radius drifts, so it neither
 * closes nor stays round. Lexicon: "a ring/box around an element + a note =
 * modify it".
 */
export function rring(cx, cy, rx, ry, opts = {}) {
  const seed = opts.seed ?? seedFrom(cx, cy, rx, ry, 13)
  const r = rngFrom(seed)
  const turns = opts.turns ?? 1.1
  const start = -Math.PI * (0.6 + r() * 0.3)
  const steps = Math.max(24, Math.round((2 * Math.PI * Math.max(rx, ry) * turns) / SPACING))
  const drift = 0.12 * (r() < 0.5 ? -1 : 1)
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = start + 2 * Math.PI * turns * t
    const k = 1 + drift * t
    pts.push({ x: cx + rx * k * Math.cos(a), y: cy + ry * k * Math.sin(a) })
  }
  return sway(pts, opts.wobble ?? 2, seed)
}

/**
 * A hand-written-looking line of text whose size and pitch drift. Many
 * reversals by construction: a design-mode text placeholder, never drawn over
 * existing UI (see draw.mjs note (2)).
 */
export function rtext(x, y, w, opts = {}) {
  const seed = opts.seed ?? seedFrom(x, y, w, 17)
  const r = rngFrom(seed)
  const amp = opts.amp ?? 5
  const pts = []
  let phase = 0
  const slope = (r() * 2 - 1) * 0.04
  for (let px = 0; px <= w; px += 3.5) {
    const wl = 22 + 12 * r()
    phase += (2 * Math.PI * 3.5) / wl
    const a = amp * (0.6 + 0.6 * r())
    pts.push({ x: x + px, y: y + slope * px + a * Math.sin(phase) })
  }
  return jitter(pts, 0.6, seed)
}

/**
 * The delete scribble: a loose back-and-forth over one element, confined to
 * it. Deliberately MANY sharp turns — that is what makes it a delete.
 */
export function rscribble(x, y, w, h, opts = {}) {
  const seed = opts.seed ?? seedFrom(x, y, w, h, 19)
  const r = rngFrom(seed)
  const passes = opts.passes ?? Math.max(5, Math.round(w / 40))
  const wp = []
  for (let i = 0; i <= passes; i++) {
    const px = x + (w * i) / passes + (r() * 2 - 1) * 6
    const top = y + h * (0.1 + 0.15 * r())
    const bot = y + h * (0.75 + 0.15 * r())
    wp.push({ x: px, y: i % 2 === 0 ? top : bot })
  }
  return sway(walk(wp, SPACING), 1.2, seed, 6)
}

/** An arrow as ONE stroke: shaft, then a quick two-barb head. */
export function rarrow(x1, y1, x2, y2, opts = {}) {
  const seed = opts.seed ?? seedFrom(x1, y1, x2, y2, 23)
  const r = rngFrom(seed)
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const head = opts.head ?? Math.min(28, len * 0.25)
  const spread = 0.5 + r() * 0.2
  const barb = (sgn) => ({
    x: x2 - head * (ux * Math.cos(spread) - sgn * uy * Math.sin(spread)),
    y: y2 - head * (uy * Math.cos(spread) + sgn * ux * Math.sin(spread)),
  })
  const sag = (r() * 2 - 1) * 0.06 * len
  const mid = { x: (x1 + x2) / 2 - uy * sag, y: (y1 + y2) / 2 + ux * sag }
  const shaft = sway(walk([{ x: x1, y: y1 }, mid, { x: x2, y: y2 }], SPACING), 2, seed)
  const tip = walk([{ x: x2, y: y2 }, barb(1), { x: x2, y: y2 }, barb(-1)], SPACING)
  return [...shaft, ...tip.slice(1)]
}

// ── measures ────────────────────────────────────────────────────────────────

function resample(points, spacing) {
  if (points.length < 2) return points.slice()
  const out = [points[0]]
  let acc = 0
  for (let i = 1; i < points.length; i++) {
    let a = points[i - 1]
    const b = points[i]
    let d = Math.hypot(b.x - a.x, b.y - a.y)
    while (d > 0 && acc + d >= spacing) {
      const f = (spacing - acc) / d
      const q = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
      out.push(q)
      a = q
      d = Math.hypot(b.x - a.x, b.y - a.y)
      acc = 0
    }
    acc += d
  }
  return out
}

/**
 * Sharp (>60°) turns at 8 px resampling — the same count intent2.ts sends the
 * reader as `directionReversals`. >= 4 and confined to one element = delete.
 */
export function sharpTurns(points) {
  const rs = resample(points, 8)
  let n = 0
  for (let i = 2; i < rs.length; i++) {
    const a1 = Math.atan2(rs[i - 1].y - rs[i - 2].y, rs[i - 1].x - rs[i - 2].x)
    const a2 = Math.atan2(rs[i].y - rs[i - 1].y, rs[i].x - rs[i - 1].x)
    let d = Math.abs(a2 - a1)
    if (d > Math.PI) d = 2 * Math.PI - d
    if (d > Math.PI / 3) n++
  }
  return n
}

/** Distance from p to segment ab. */
function segDist(p, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/**
 * Roughness of a stroke against the shape it was meant to be: mean distance
 * of its points from the ideal outline (a closed polygon or an open polyline,
 * given as waypoints), plus the closing gap for closed shapes. This is the
 * stated measure the tidy/rough comparison uses (tests/bench/rough.test.ts).
 */
export function deviation(points, ideal, closed = true) {
  const segs = []
  for (let i = 1; i < ideal.length; i++) segs.push([ideal[i - 1], ideal[i]])
  if (closed) segs.push([ideal[ideal.length - 1], ideal[0]])
  let sum = 0
  for (const p of points) sum += Math.min(...segs.map(([a, b]) => segDist(p, a, b)))
  return sum / points.length
}

/** End-to-start distance: a closed tidy box is ~0, a rough one is not. */
export function closingGap(points) {
  const a = points[0]
  const b = points[points.length - 1]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

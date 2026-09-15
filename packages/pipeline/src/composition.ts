/**
 * Composition fidelity — does the rendered drawing still have the SHAPE the
 * user drew?
 *
 * The depiction path had exactly one dial with two settings, and both miss:
 *   fidelity 'verbatim'   → trace every wobble (a vectorized scan)
 *   fidelity 'recognized' → keep only the noun, redraw from a symbolic prior
 *
 * The second is the one that bites. Told "rebuild pristine: almost-straight →
 * straight, almost-symmetric → symmetric, almost-equal → equal", a code model
 * has no numeric handle on how far "almost" went, so it snaps everything to
 * the prior it already has: a perfect <ellipse>, a dead-straight spine, three
 * cloned legs on a uniform 8px pitch, one side mirrored with scale(-1,1). The
 * user's lopsided, big-clawed, low-wide creature comes back as clip art. The
 * skill ASKS for composition in prose ("big front claws → big front claws")
 * but nothing ever measured whether it survived.
 *
 * This module measures it. Both a stroke set and a generated SVG reduce to the
 * same signature: a coarse occupancy grid normalized into the drawing's own
 * bounding box, plus the asymmetries and irregularities that carry character.
 * Normalizing into the own-bbox is deliberate — the skill tells the agent to
 * snap sizes to the app's spacing scale, so absolute px IoU would punish
 * correct work. What must survive is where the mass sits RELATIVE to the rest,
 * which is exactly what a normalized grid compares.
 *
 * Pure math over geometry we already own: no pixels, no model, no tokens.
 */
import { bboxOf, bboxUnion, type BBox, type Stroke } from '@s2c/ink'

/** Grid resolution per axis. 16 is coarse enough to ignore stroke jitter and
 *  fine enough to separate a claw from a body. */
const GRID = 16

export interface CompositionSignature {
  /** GRID×GRID row-major ink mass, normalized to sum 1 (empty ⇒ all zeros). */
  grid: number[]
  /** Whole-drawing aspect ratio (w/h). */
  aspect: number
  /** 0 = perfect mirror symmetry about the vertical axis, 1 = wholly one-sided. */
  lateralAsymmetry: number
  /** Same about the horizontal axis. */
  verticalAsymmetry: number
  /** Coefficient of variation of the spacing between repeated similar parts
   *  (≥3 required), else null. 0 = machine-even pitch. */
  repeatPitchVariation: number | null
  /** How many repeated parts that figure came from. */
  repeatCount: number
  /** Direction changes per unit of normalized path length. High ⇒ the wobble
   *  was traced rather than rebuilt. */
  detailDensity: number
  /** Number of distinct parts (stroke clusters / drawn primitives). */
  partCount: number
}

interface Pt { x: number; y: number }
interface Part { points: Pt[]; box: BBox }

// ---------- signature construction ----------

function emptySignature(): CompositionSignature {
  return {
    grid: new Array(GRID * GRID).fill(0),
    aspect: 1,
    lateralAsymmetry: 0,
    verticalAsymmetry: 0,
    repeatPitchVariation: null,
    repeatCount: 0,
    detailDensity: 0,
    partCount: 0,
  }
}

/** L1 distance between a grid and its mirror, halved to land in 0..1. */
function asymmetry(grid: number[], axis: 'vertical' | 'horizontal'): number {
  let diff = 0
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      const mirrored = axis === 'vertical'
        ? grid[r * GRID + (GRID - 1 - c)]!
        : grid[(GRID - 1 - r) * GRID + c]!
      diff += Math.abs(grid[r * GRID + c]! - mirrored)
    }
  }
  return diff / 2
}

/**
 * Spacing regularity of the largest set of mutually-similar parts. Legs of a
 * creature, teeth of a comb, items of a list: drawn by hand they land on an
 * uneven pitch, and that unevenness is signal. Parts are "similar" when their
 * areas are within 2.5× and aspects within 2×.
 */
function pitchVariation(parts: Part[]): { cv: number | null; count: number } {
  if (parts.length < 3) return { cv: null, count: 0 }
  // Parts arrive normalized into the unit square, so a fixed epsilon keeps a
  // perfectly vertical or horizontal part (zero width or height — legs, rules,
  // tick marks) from collapsing its area and aspect to degenerate values.
  const EPS = 0.01
  const area = (p: Part) => (p.box.w + EPS) * (p.box.h + EPS)
  const aspect = (p: Part) => (p.box.w + EPS) / (p.box.h + EPS)

  let best: Part[] = []
  for (const seed of parts) {
    const kin = parts.filter((p) => {
      const ar = area(p) / area(seed)
      const as = aspect(p) / aspect(seed)
      return ar >= 0.4 && ar <= 2.5 && as >= 0.5 && as <= 2
    })
    if (kin.length > best.length) best = kin
  }
  if (best.length < 3) return { cv: null, count: 0 }

  // order along whichever axis the group is more spread out on
  const cx = best.map((p) => p.box.x + p.box.w / 2)
  const cy = best.map((p) => p.box.y + p.box.h / 2)
  const spread = (v: number[]) => Math.max(...v) - Math.min(...v)
  const along = spread(cx) >= spread(cy) ? cx : cy
  const sorted = [...along].sort((a, b) => a - b)

  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i]! - sorted[i - 1]!)
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
  if (mean <= 0.0001) return { cv: null, count: 0 }
  const variance = gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length
  return { cv: Math.sqrt(variance) / mean, count: best.length }
}

/** Turns per unit length — the wobble fingerprint. */
function detailDensity(parts: Part[]): number {
  let turns = 0
  let length = 0
  for (const p of parts) {
    const pts = p.points
    for (let i = 1; i < pts.length; i++) {
      length += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
    }
    for (let i = 2; i < pts.length; i++) {
      const a = Math.atan2(pts[i - 1]!.y - pts[i - 2]!.y, pts[i - 1]!.x - pts[i - 2]!.x)
      const b = Math.atan2(pts[i]!.y - pts[i - 1]!.y, pts[i]!.x - pts[i - 1]!.x)
      let d = Math.abs(b - a)
      if (d > Math.PI) d = 2 * Math.PI - d
      // count only real direction changes; sampling noise is ~0
      if (d > 0.35) turns++
    }
  }
  return length > 0 ? turns / length : 0
}

/** Re-walk a polyline at a uniform arc-length step. */
function resampleUniform(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]!]
  let carry = 0
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const seg = Math.hypot(b.x - a.x, b.y - a.y)
    if (seg <= 1e-9) continue
    let d = step - carry
    while (d <= seg) {
      const t = d / seg
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      d += step
    }
    carry = (carry + seg) % step
  }
  const last = pts[pts.length - 1]!
  const tail = out[out.length - 1]!
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > step / 2) out.push(last)
  return out
}

function signatureFromParts(parts: Part[]): CompositionSignature {
  const raw = parts.filter((p) => p.points.length >= 2)
  if (raw.length === 0) return emptySignature()

  let box = raw[0]!.box
  for (const p of raw) box = bboxUnion(box, p.box)
  const w = Math.max(1e-6, box.w)
  const h = Math.max(1e-6, box.h)

  // Resample BOTH origins — captured strokes and curves flattened out of
  // generated source — at one step proportional to the drawing's diagonal, so
  // detailDensity measures the form and never the sample rate or the canvas
  // size it happened to be drawn on.
  const step = Math.max(1e-6, Math.hypot(w, h) / 400)
  const usable = raw
    .map((p) => ({ points: resampleUniform(p.points, step), box: p.box }))
    .filter((p) => p.points.length >= 2)
  if (usable.length === 0) return emptySignature()

  // Normalize every part into the drawing's own unit square, then accumulate
  // ink mass by walking each polyline and depositing segment length into the
  // cells it crosses. Length-weighted (not point-weighted) so a densely
  // resampled stroke doesn't outvote a sparse one of the same size.
  const grid = new Array(GRID * GRID).fill(0)
  const unit: Part[] = []
  for (const p of usable) {
    const pts = p.points.map((pt) => ({ x: (pt.x - box.x) / w, y: (pt.y - box.y) / h }))
    unit.push({
      points: pts,
      box: { x: (p.box.x - box.x) / w, y: (p.box.y - box.y) / h, w: p.box.w / w, h: p.box.h / h },
    })
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!
      const b = pts[i]!
      const seg = Math.hypot(b.x - a.x, b.y - a.y)
      const steps = Math.max(1, Math.ceil(seg * GRID * 2))
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps
        const x = a.x + (b.x - a.x) * t
        const y = a.y + (b.y - a.y) * t
        const c = Math.min(GRID - 1, Math.max(0, Math.floor(x * GRID)))
        const r = Math.min(GRID - 1, Math.max(0, Math.floor(y * GRID)))
        grid[r * GRID + c] += seg / steps
      }
    }
  }
  const total = grid.reduce((a, b) => a + b, 0)
  if (total > 0) for (let i = 0; i < grid.length; i++) grid[i] /= total

  const { cv, count } = pitchVariation(unit)
  return {
    grid,
    aspect: w / h,
    lateralAsymmetry: asymmetry(grid, 'vertical'),
    verticalAsymmetry: asymmetry(grid, 'horizontal'),
    repeatPitchVariation: cv,
    repeatCount: count,
    detailDensity: detailDensity(unit),
    partCount: usable.length,
  }
}

/** Signature of what the user actually drew. One stroke = one part. */
export function compositionFromStrokes(strokes: Stroke[]): CompositionSignature {
  const drawn = strokes.filter((s) => s.points.length >= 2)
  if (drawn.length === 0) return emptySignature()

  // Raw captured points go in as-is; signatureFromParts resamples every part
  // at one drawing-relative step, so strokes and generated curves are measured
  // on identical terms.
  const parts: Part[] = drawn.map((s) => ({
    points: s.points.map((p) => ({ x: p.x, y: p.y })),
    box: bboxOf(s.points),
  }))
  return signatureFromParts(parts)
}

// ---------- reading geometry back out of generated source ----------

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi

function numbers(s: string): number[] {
  return (s.match(NUM) ?? []).map(Number).filter((n) => Number.isFinite(n))
}

/** Flatten one cubic into line segments. */
function cubic(out: Pt[], p0: Pt, p1: Pt, p2: Pt, p3: Pt): void {
  const n = 12
  for (let i = 1; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
}

/**
 * Sample an SVG path `d` into a polyline. Supports M/L/H/V/C/S/Q/T/Z in both
 * cases; A is approximated by its chord (rare in generated icon code, and its
 * endpoint is what matters for composition).
 */
export function samplePath(d: string): Pt[] {
  const tokens = d.match(/[a-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []
  const pts: Pt[] = []
  let cur: Pt = { x: 0, y: 0 }
  let start: Pt = { x: 0, y: 0 }
  let prevCtrl: Pt | null = null
  let cmd = ''
  let i = 0

  const next = () => Number(tokens[i++])
  const isCmd = (t: string) => /^[a-z]$/i.test(t)

  while (i < tokens.length) {
    if (isCmd(tokens[i]!)) cmd = tokens[i++]!
    const rel = cmd === cmd.toLowerCase()
    const base = rel ? cur : { x: 0, y: 0 }
    switch (cmd.toUpperCase()) {
      case 'M': {
        cur = { x: base.x + next(), y: base.y + next() }
        start = cur
        pts.push(cur)
        cmd = rel ? 'l' : 'L' // subsequent pairs are implicit lineto
        prevCtrl = null
        break
      }
      case 'L': {
        cur = { x: base.x + next(), y: base.y + next() }
        pts.push(cur)
        prevCtrl = null
        break
      }
      case 'H': {
        cur = { x: base.x + next(), y: cur.y }
        pts.push(cur)
        prevCtrl = null
        break
      }
      case 'V': {
        cur = { x: cur.x, y: base.y + next() }
        pts.push(cur)
        prevCtrl = null
        break
      }
      case 'C': {
        const c1 = { x: base.x + next(), y: base.y + next() }
        const c2 = { x: base.x + next(), y: base.y + next() }
        const end = { x: base.x + next(), y: base.y + next() }
        cubic(pts, cur, c1, c2, end)
        prevCtrl = c2
        cur = end
        break
      }
      case 'S': {
        const c1 = prevCtrl ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur
        const c2 = { x: base.x + next(), y: base.y + next() }
        const end = { x: base.x + next(), y: base.y + next() }
        cubic(pts, cur, c1, c2, end)
        prevCtrl = c2
        cur = end
        break
      }
      case 'Q': {
        const q = { x: base.x + next(), y: base.y + next() }
        const end = { x: base.x + next(), y: base.y + next() }
        // quadratic → cubic
        cubic(pts, cur,
          { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
          { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) }, end)
        prevCtrl = q
        cur = end
        break
      }
      case 'T': {
        const q: Pt = prevCtrl ? { x: 2 * cur.x - prevCtrl.x, y: 2 * cur.y - prevCtrl.y } : cur
        const end = { x: base.x + next(), y: base.y + next() }
        cubic(pts, cur,
          { x: cur.x + (2 / 3) * (q.x - cur.x), y: cur.y + (2 / 3) * (q.y - cur.y) },
          { x: end.x + (2 / 3) * (q.x - end.x), y: end.y + (2 / 3) * (q.y - end.y) }, end)
        prevCtrl = q
        cur = end
        break
      }
      case 'A': {
        next(); next(); next(); next(); next()
        cur = { x: base.x + next(), y: base.y + next() }
        pts.push(cur)
        prevCtrl = null
        break
      }
      case 'Z': {
        pts.push(start)
        cur = start
        prevCtrl = null
        break
      }
      default:
        i++ // unknown command — skip a token and keep going
    }
  }
  return pts
}

const ellipsePoints = (cx: number, cy: number, rx: number, ry: number): Pt[] => {
  const out: Pt[] = []
  for (let k = 0; k <= 48; k++) {
    const a = (k / 48) * Math.PI * 2
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) })
  }
  return out
}

const attr = (tag: string, name: string): number | null => {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["'{]\\s*(-?[\\d.]+)`))
  return m ? Number(m[1]) : null
}

interface Xform { tx: number; ty: number; sx: number; sy: number }
const IDENT: Xform = { tx: 0, ty: 0, sx: 1, sy: 1 }

function parseTransform(t: string): Xform {
  const x = { ...IDENT }
  const tr = t.match(/translate\(([^)]*)\)/)
  if (tr) {
    const n = numbers(tr[1]!)
    x.tx = n[0] ?? 0
    x.ty = n[1] ?? 0
  }
  const sc = t.match(/scale\(([^)]*)\)/)
  if (sc) {
    const n = numbers(sc[1]!)
    x.sx = n[0] ?? 1
    x.sy = n[1] ?? x.sx
  }
  return x
}

const applyXform = (p: Pt, x: Xform): Pt => ({ x: x.tx + p.x * x.sx, y: x.ty + p.y * x.sy })

/**
 * Extract drawn geometry from generated component source.
 *
 * Handles the three idioms the codegen agent actually emits: literal elements,
 * path data hoisted into a `const foo = [...]` array rendered via `.map()`,
 * and a `<g transform="translate(w,0) scale(-1,1)">` mirror group — the last
 * one matters most, since missing it would read a mirrored crab as one-sided
 * and mask the very symmetry collapse we're hunting.
 */
export function compositionFromSource(code: string): CompositionSignature {
  // string-array constants, so `{side.map(d => <path d={d}/>)}` resolves
  const arrays = new Map<string, string[]>()
  const arrayRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g
  for (let m = arrayRe.exec(code); m; m = arrayRe.exec(code)) {
    const items = [...(m[2] ?? '').matchAll(/['"`]([^'"`]*)['"`]/g)].map((x) => x[1]!)
    if (items.length) arrays.set(m[1]!, items)
  }

  const parts: Part[] = []
  const push = (raw: Pt[], x: Xform) => {
    if (raw.length < 2) return
    const pts = x === IDENT ? raw : raw.map((p) => applyXform(p, x))
    parts.push({ points: pts, box: bboxOf(pts.map((p) => ({ ...p, t: 0 }))) })
  }

  // Walk tags in order, tracking the transform stack for <g>.
  const stack: Xform[] = [IDENT]
  const tagRe = /<\/?\s*(g|path|ellipse|circle|rect|line|polyline|polygon)\b([^>]*)>/gi
  for (let m = tagRe.exec(code); m; m = tagRe.exec(code)) {
    const whole = m[0]
    const name = m[1]!.toLowerCase()
    const body = m[2] ?? ''
    const top = stack[stack.length - 1]!

    if (whole.startsWith('</')) {
      if (name === 'g' && stack.length > 1) stack.pop()
      continue
    }
    if (name === 'g') {
      const t = body.match(/transform\s*=\s*["'{]([^"'}]*)/)
      const x = t ? parseTransform(t[1]!) : IDENT
      const composed: Xform = {
        tx: top.tx + x.tx * top.sx, ty: top.ty + x.ty * top.sy,
        sx: top.sx * x.sx, sy: top.sy * x.sy,
      }
      // self-closing <g/> contributes nothing and never opens a scope
      if (!/\/\s*>$/.test(whole)) stack.push(composed)
      continue
    }

    switch (name) {
      case 'path': {
        const lit = body.match(/\bd\s*=\s*["']([^"']+)["']/)
        if (lit) { push(samplePath(lit[1]!), top); break }
        // d={d} inside a .map() over a known const array → every entry
        const ref = body.match(/\bd\s*=\s*\{\s*([A-Za-z_$][\w$]*)\s*\}/)
        if (ref) {
          const src = arrays.get(ref[1]!)
            // `{side.map((d) => <path d={d}/>)}` — the binder is not the array
            ?? arrays.get([...arrays.keys()].find((k) =>
              new RegExp(`\\b${k}\\.map\\s*\\(`).test(code)) ?? '')
          for (const d of src ?? []) push(samplePath(d), top)
        }
        break
      }
      case 'ellipse': {
        const cx = attr(body, 'cx') ?? 0, cy = attr(body, 'cy') ?? 0
        const rx = attr(body, 'rx'), ry = attr(body, 'ry')
        if (rx !== null && ry !== null) push(ellipsePoints(cx, cy, rx, ry), top)
        break
      }
      case 'circle': {
        const cx = attr(body, 'cx') ?? 0, cy = attr(body, 'cy') ?? 0
        const r = attr(body, 'r')
        if (r !== null) push(ellipsePoints(cx, cy, r, r), top)
        break
      }
      case 'rect': {
        const x = attr(body, 'x') ?? 0, y = attr(body, 'y') ?? 0
        const w = attr(body, 'width'), h = attr(body, 'height')
        if (w !== null && h !== null) {
          push([{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }], top)
        }
        break
      }
      case 'line': {
        const x1 = attr(body, 'x1'), y1 = attr(body, 'y1')
        const x2 = attr(body, 'x2'), y2 = attr(body, 'y2')
        if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
          push([{ x: x1, y: y1 }, { x: x2, y: y2 }], top)
        }
        break
      }
      case 'polyline':
      case 'polygon': {
        const p = body.match(/points\s*=\s*["']([^"']+)["']/)
        if (p) {
          const n = numbers(p[1]!)
          const out: Pt[] = []
          for (let k = 0; k + 1 < n.length; k += 2) out.push({ x: n[k]!, y: n[k + 1]! })
          if (name === 'polygon' && out.length) out.push(out[0]!)
          push(out, top)
        }
        break
      }
    }
  }
  return signatureFromParts(parts)
}

// ---------- comparison ----------

export type CompositionFlaw = 'traced' | 'over-regularized' | 'mirrored' | 'evened' | 'displaced'

export interface CompositionVerdict {
  /** 0..1 — how much of the drawn composition survived. */
  score: number
  /** Grid-overlap term alone (0..1). */
  massSimilarity: number
  flaws: CompositionFlaw[]
  /** Numeric, agent-actionable sentences. Empty when nothing is wrong. */
  notes: string[]
  sketch: CompositionSignature
  rendered: CompositionSignature
}

const pct = (v: number) => `${Math.round(v * 100)}%`
const r2 = (v: number) => v.toFixed(2)

/**
 * Direction changes per unit length above which an output reads as traced ink
 * rather than a rebuilt form. Calibrated on this repo's own generated
 * components: rebuilt icons measure 0.00–1.11, paths fitted straight off the
 * strokes measure 3.80–17.27.
 */
const TRACED_TURNS_PER_UNIT = 2.5

/**
 * Compare drawn vs rendered. Both signatures are normalized into their own
 * bounding box, so snapping to the app's spacing scale — which the skill
 * REQUIRES — costs nothing here; only the internal arrangement is judged.
 */
export function scoreComposition(
  sketch: CompositionSignature,
  rendered: CompositionSignature,
): CompositionVerdict {
  const flaws: CompositionFlaw[] = []
  const notes: string[] = []

  // mass overlap: 1 - ½·L1 between two distributions summing to 1
  let l1 = 0
  for (let i = 0; i < sketch.grid.length; i++) l1 += Math.abs(sketch.grid[i]! - rendered.grid[i]!)
  const massSimilarity = rendered.partCount === 0 ? 0 : 1 - l1 / 2

  if (rendered.partCount === 0) {
    return {
      score: 0, massSimilarity: 0, flaws: ['displaced'],
      notes: ['no drawn geometry found in the generated source'],
      sketch, rendered,
    }
  }

  // ① the wobble was traced instead of rebuilt.
  // Absolute, not relative to the sketch: "rectify, don't reproduce" holds
  // however shaky the ink was, so a wobbly sketch never licenses a wobbly
  // output. The threshold sits in the empirical gap between rebuilt icons
  // (≤1.2 turns/unit) and paths fitted straight off the strokes (≥3.8).
  if (rendered.detailDensity > TRACED_TURNS_PER_UNIT) {
    flaws.push('traced')
    notes.push(
      `the output traces the ink (${r2(rendered.detailDensity)} direction changes per unit length; a rebuilt ` +
      `form sits near ${r2(sketch.detailDensity)} or below) — redraw it with smooth continuous curves ` +
      `instead of emitting the fitted stroke paths`,
    )
  }

  // ② lateral character flattened into a mirror
  if (sketch.lateralAsymmetry > 0.12 && rendered.lateralAsymmetry < sketch.lateralAsymmetry * 0.45) {
    flaws.push('mirrored')
    notes.push(
      `the sketch is lopsided left-to-right (asymmetry ${r2(sketch.lateralAsymmetry)}) but the output is ` +
      `near-symmetric (${r2(rendered.lateralAsymmetry)}) — you mirrored one side; keep the two sides different ` +
      `the way they were drawn`,
    )
  }
  if (sketch.verticalAsymmetry > 0.12 && rendered.verticalAsymmetry < sketch.verticalAsymmetry * 0.45) {
    flaws.push('over-regularized')
    notes.push(
      `the sketch's mass sits unevenly top-to-bottom (asymmetry ${r2(sketch.verticalAsymmetry)}); the output ` +
      `evened it out (${r2(rendered.verticalAsymmetry)})`,
    )
  }

  // ③ hand-drawn irregular pitch snapped to a machine-even one
  const sp = sketch.repeatPitchVariation
  const rp = rendered.repeatPitchVariation
  if (sp !== null && sp > 0.15 && rp !== null && rp < sp * 0.35) {
    flaws.push('evened')
    notes.push(
      `the ${sketch.repeatCount} repeated parts were drawn on an uneven pitch (variation ${r2(sp)}) and were ` +
      `rendered evenly spaced (${r2(rp)}) — vary their spacing/length as drawn instead of cloning one template`,
    )
  }

  // ④ overall proportions lost
  const ar = sketch.aspect > 0 && rendered.aspect > 0 ? rendered.aspect / sketch.aspect : 1
  if (ar > 1.6 || ar < 0.625) {
    flaws.push('displaced')
    notes.push(
      `proportions changed: the sketch is ${r2(sketch.aspect)}:1 (w:h), the output ${r2(rendered.aspect)}:1`,
    )
  }

  // ⑤ the arrangement itself moved
  if (massSimilarity < 0.45) {
    if (!flaws.includes('displaced')) flaws.push('displaced')
    notes.push(
      `only ${pct(massSimilarity)} of the drawn layout is reproduced — the parts are not where they were drawn`,
    )
  }

  // mass overlap dominates; each distinct flaw costs a fixed slice
  const score = Math.max(0, Math.min(1, massSimilarity * 0.7 + 0.3 - flaws.length * 0.1))
  return { score, massSimilarity, flaws, notes, sketch, rendered }
}

/**
 * Compact numeric brief handed to the codegen agent BEFORE it draws, so
 * "big front claws, low wide body" stops being a vibe it has to guess at.
 * This is the cheap half of the fix: the measurements already exist, and
 * stating them costs ~60 tokens.
 */
export function compositionBrief(sig: CompositionSignature): string {
  const lines = [
    `overall ${r2(sig.aspect)}:1 (w:h), ${sig.partCount} drawn part(s)`,
    `left-right asymmetry ${r2(sig.lateralAsymmetry)}, top-bottom ${r2(sig.verticalAsymmetry)} ` +
    `(0 = perfectly symmetric; PRESERVE this — do not mirror one side onto the other unless it is near 0)`,
  ]
  if (sig.repeatPitchVariation !== null) {
    lines.push(
      `${sig.repeatCount} repeated parts, spacing variation ${r2(sig.repeatPitchVariation)} ` +
      `(0 = evenly spaced; reproduce the unevenness rather than cloning one template on a uniform pitch)`,
    )
  }
  // quadrant mass tells the agent WHERE the weight is, in words it can act on
  const quad = [0, 0, 0, 0]
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      quad[(r < GRID / 2 ? 0 : 2) + (c < GRID / 2 ? 0 : 1)]! += sig.grid[r * GRID + c]!
    }
  }
  lines.push(
    `ink mass by quadrant — top-left ${pct(quad[0]!)}, top-right ${pct(quad[1]!)}, ` +
    `bottom-left ${pct(quad[2]!)}, bottom-right ${pct(quad[3]!)}`,
  )
  return lines.join('\n')
}

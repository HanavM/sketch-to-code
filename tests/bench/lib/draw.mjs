/**
 * draw.mjs — a tiny DSL for synthesising hand-drawn strokes for the sketch
 * benchmark. Every primitive returns a POLYLINE (`{x, y}[]`) or an array of
 * polylines, in PAGE coordinates. Ids and timestamps are NOT added here: the
 * runner drags these with a real mouse through Playwright, and `toStrokes()`
 * below is what turns polylines into wire `Stroke`s (`packages/ink/src/types.ts`:
 * `{ id, points: Array<{x, y, t}> }`).
 *
 * ---------------------------------------------------------------------------
 * THE VOCABULARY WE ARE SPEAKING (quoted from the code that reads these marks)
 * ---------------------------------------------------------------------------
 * From `SKETCH_SKILL` (packages/pipeline/src/skill.ts) — the lexicon these
 * primitives exist to hit, verbatim:
 *
 *   | rectangle | container / card / input — decide by size, position, contents |
 *   | rectangle with an X through it | image placeholder |
 *   | circle (top of card/row, corner of navbar) | avatar or icon slot |
 *   | horizontal squiggle/wavy lines | body text, one drawn line ~ one text line |
 *   | single thicker/longer line, or large writing | heading (thicker = higher level) |
 *   | rounded rect with a short label | button (label = the actual copy) |
 *   | ruled rows x columns, first row emphasized | data table (first row = header) |
 *   | full-width rect at top / tall rect at side | navbar / sidebar |
 *   | repeated similar boxes | a LIST — one component x N via .map |
 *
 *   "Alignment and proximity are intent: a row of shapes = flex row; a column =
 *    stack; consistent gaps = one gap-* value."
 *   "Cardinality is intent: the user drew 3 cards -> render exactly 3 items."
 *   "Scribble/zigzag hatching inside or between boundary strokes = a FILLED
 *    region: render solid (or shaded) fill bounded by the clean boundary —
 *    NEVER redraw the hatching strokes themselves."
 *   "Several rough, roughly-parallel or overdrawn strokes = ONE clean stroke."
 *   "Rectify, don't reproduce: wobbly boxes become clean components with proper
 *    padding; scribbled text becomes readable type. Never render the wobble."
 *
 * From `DESIGN_INTERPRET_PROMPT` (packages/pipeline/src/intent2.ts) — the mode
 * these sketches run in; everything drawn is NEW UI, nothing is a command:
 *
 *   "boxes = containers/cards/inputs, labeled rounded rects = buttons, squiggly
 *    lines = text placeholders, scribble/hatching between or inside boundary
 *    lines = a FILLED/shaded region ..., circles = avatars/icons, a smooth wavy
 *    band = ONE decorative ribbon (even if drawn in several strokes)"
 *
 * From `INTERPRET_PROMPT` (same file) — the convention that constrains how we
 * are allowed to draw squiggles and hatching:
 *
 *   "DELETE-SCRIBBLE vs DECORATIVE WAVE — decide from the exact stroke
 *    features, which are size-invariant: a delete mark has MANY direction
 *    reversals (directionReversals >= 4) and is confined (mostlyInsideElement
 *    set, or touching one element it covers); a decorative wave is smooth
 *    (directionReversals <= 2 per stroke) and sweeps across a whole section.
 *    Reversals >= 4 + confined to one element = DELETE that element."
 *
 * So: `box` is a container, `circle` is an avatar/icon, `textLine` is one line
 * of copy, `hatch` is a FILL (never "draw these diagonal lines"), and `wave` is
 * the one-ribbon decoration — deliberately smooth so it can never be read as a
 * strikethrough.
 *
 * ---------------------------------------------------------------------------
 * (1) HAND JITTER AND SAMPLING DENSITY — why the defaults are what they are
 * ---------------------------------------------------------------------------
 * A real mouse drag emits a point per frame: at ~60Hz and a comfortable
 * 300-400 px/s that is a sample every 5-7 px, with a slow perpendicular tremor
 * rather than per-sample white noise. Hence `SPACING = 6` and a SMOOTH
 * (cosine-interpolated value-noise) perpendicular offset with `NOISE = 0.9` px.
 *
 * The noise amplitude has a hard ceiling, and it comes from the delete-mark
 * detector in `interpret()` (packages/pipeline/src/intent2.ts): it resamples
 * every stroke at 8 px and counts turns sharper than 60 degrees as
 * `directionReversals`. Alternating offsets of +-A over an 8 px step turn the
 * direction by 2*atan(2A/8) per segment, so A must stay under ~2.3 px or plain
 * hand tremor on a straight line starts manufacturing "reversals" and a box
 * edge begins to look like a scribble. Below 1 px there is a comfortable
 * margin; the noise is also smooth, which keeps per-segment turns far smaller
 * than that worst case. Raise `noise` past ~1.5 px only deliberately.
 *
 * Everything is seeded from its own arguments, so a given call always produces
 * the same wobble — a benchmark has to be reproducible, and identical geometry
 * must not drift between runs.
 *
 * ---------------------------------------------------------------------------
 * (2) DO NOT REUSE `hatch` / `textLine` OVER EXISTING UI
 * ---------------------------------------------------------------------------
 * `hatch` and `textLine` are back-and-forth strokes: by construction they have
 * MANY direction reversals. Per the convention quoted above, a stroke with
 * `directionReversals >= 4` that is CONFINED to one element reads as
 * "DELETE THIS ELEMENT", and that reading "outranks any aesthetic reading".
 * Benchmark sketches are drawn on an EMPTY page, so there is nothing to delete
 * and nothing can be confined to an element — which is the only reason these
 * primitives are safe here.
 *
 * If you reuse this DSL to draw over a page that already has UI, `hatch` inside
 * an existing card will delete that card, and a `textLine` that fits inside one
 * existing element will delete it too. For markup over existing UI, use `wave`
 * (smooth, <= 2 reversals, sweeps across a section) or draw in empty space.
 */

// ---------------------------------------------------------------------------
// defaults
// ---------------------------------------------------------------------------

/** Px between sampled points — a 60Hz drag at ~360 px/s. */
export const SPACING = 6
/** Perpendicular hand tremor in px. Keep well under 2.3 (see header). */
export const NOISE = 0.9

// ---------------------------------------------------------------------------
// deterministic smooth noise
// ---------------------------------------------------------------------------

/** mulberry32 — small, fast, deterministic. */
export function rngFrom(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** FNV-1a over the numeric arguments: same call -> same wobble, every run. */
export function seedFrom(...nums) {
  let h = 2166136261 >>> 0
  for (const n of nums) {
    const v = Math.round((Number.isFinite(n) ? n : 0) * 1000) | 0
    h = Math.imul(h ^ (v & 0xffff), 16777619) >>> 0
    h = Math.imul(h ^ (v >>> 16), 16777619) >>> 0
  }
  return h >>> 0
}

/**
 * `n` values in [-1, 1] that drift rather than hop: value noise with a control
 * point every `period` samples, cosine-interpolated. White noise per sample
 * would be a tremor at 60Hz, which no hand has.
 */
export function smoothSeries(n, rng, period = 5) {
  const ctrl = []
  for (let i = 0; i < Math.ceil(n / period) + 2; i++) ctrl.push(rng() * 2 - 1)
  const out = []
  for (let i = 0; i < n; i++) {
    const f = i / period
    const i0 = Math.floor(f)
    const w = (1 - Math.cos((f - i0) * Math.PI)) / 2
    out.push(ctrl[i0] * (1 - w) + ctrl[i0 + 1] * w)
  }
  return out
}

// ---------------------------------------------------------------------------
// core helpers
// ---------------------------------------------------------------------------

function dropDuplicates(pts, eps = 0.01) {
  const out = []
  for (const p of pts) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < eps && Math.abs(last.y - p.y) < eps) continue
    out.push(p)
  }
  return out
}

/** Walk a waypoint path at ~`spacing` px, keeping every waypoint exactly (so
 *  corners stay sharp — the classifier counts corners to tell rect from blob). */
export function walk(waypoints, spacing) {
  const wp = dropDuplicates(waypoints)
  if (wp.length < 2) return wp.slice()
  const out = [{ x: wp[0].x, y: wp[0].y }]
  for (let i = 1; i < wp.length; i++) {
    const a = wp[i - 1]
    const b = wp[i]
    const d = Math.hypot(b.x - a.x, b.y - a.y)
    const steps = Math.max(1, Math.round(d / spacing))
    for (let k = 1; k <= steps; k++) {
      out.push({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps })
    }
  }
  return dropDuplicates(out)
}

/**
 * Add perpendicular hand tremor to a sampled polyline.
 * Applied by default inside every primitive; exported so specs can wobble their
 * own paths. `amount` is the peak offset in px (see the header for the ceiling).
 */
export function jitter(points, amount = NOISE, seed = 1, period = 5) {
  if (amount <= 0 || points.length < 2) return points.map((p) => ({ x: p.x, y: p.y }))
  const rng = rngFrom(seed)
  const n = points.length
  const series = smoothSeries(n, rng, period)
  const out = []
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    // unit normal to the local tangent
    const nx = -dy / len
    const ny = dx / len
    // taper the ends: a drag starts and stops ON the intended point
    const taper = Math.min(1, Math.min(i, n - 1 - i) / 3)
    const k = series[i] * amount * taper
    out.push({ x: points[i].x + nx * k, y: points[i].y + ny * k })
  }
  return out
}

function stroke(waypoints, opts = {}, seedKey = 0) {
  const spacing = opts.spacing ?? SPACING
  const noise = opts.noise ?? NOISE
  const seed = opts.seed ?? seedKey
  return jitter(walk(waypoints, spacing), noise, seed)
}

// ---------------------------------------------------------------------------
// primitives — each returns ONE polyline
// ---------------------------------------------------------------------------

/**
 * The general primitive: a polyline through `waypoints` (`{x,y}[]`), resampled
 * and wobbled. Use it for anything the named shapes don't cover — a chevron for
 * a dropdown/accordion row, a caret, an arrow shaft.
 */
export function path(waypoints, opts = {}) {
  return stroke(waypoints, opts, seedFrom(waypoints.length, waypoints[0]?.x, waypoints[0]?.y))
}

/** A straight line. Lexicon: a single long/thick line = a heading or a rule. */
export function line(x1, y1, x2, y2, opts = {}) {
  return stroke([{ x: x1, y: y1 }, { x: x2, y: y2 }], opts, seedFrom(x1, y1, x2, y2))
}

/**
 * A rectangle as ONE continuous stroke that returns to its start (closed, so it
 * classifies as rect/rounded-rect rather than an open polyline).
 * `opts.radius` rounds the corners — the lexicon's "rounded rect with a short
 * label" is a button, a sharp rect is a container/input.
 */
export function box(x, y, w, h, opts = {}) {
  const r = Math.max(0, Math.min(opts.radius ?? 0, Math.min(w, h) / 2))
  const wp = []
  if (r <= 0.5) {
    wp.push({ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y })
  } else {
    const corner = (cx, cy, from) => {
      const steps = 4
      for (let i = 0; i <= steps; i++) {
        const a = from + (Math.PI / 2) * (i / steps)
        wp.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
      }
    }
    wp.push({ x: x + r, y })
    wp.push({ x: x + w - r, y })
    corner(x + w - r, y + r, -Math.PI / 2)
    wp.push({ x: x + w, y: y + h - r })
    corner(x + w - r, y + h - r, 0)
    wp.push({ x: x + r, y: y + h })
    corner(x + r, y + h - r, Math.PI / 2)
    wp.push({ x, y: y + r })
    corner(x + r, y + r, Math.PI)
  }
  return stroke(wp, opts, seedFrom(x, y, w, h, r))
}

/** A circle, drawn in one revolution from 12 o'clock. Lexicon: avatar / icon slot. */
export function circle(cx, cy, r, opts = {}) {
  const spacing = opts.spacing ?? SPACING
  const steps = Math.max(16, Math.round((2 * Math.PI * r) / spacing))
  const wp = []
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / steps
    wp.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) })
  }
  // already at the right density; only wobble it
  return jitter(dropDuplicates(wp), opts.noise ?? NOISE, opts.seed ?? seedFrom(cx, cy, r))
}

/**
 * The squiggle people draw to mean "a line of text". `y` is the baseline the
 * squiggle oscillates about; bigger `amp` reads as bigger writing, which the
 * lexicon takes as a heading ("thicker = higher level").
 *
 * WARNING: many direction reversals by construction — see note (2) in the
 * header. Safe on an empty page, a delete gesture over existing UI.
 */
export function textLine(x, y, w, opts = {}) {
  const amp = opts.amp ?? 4
  const wavelength = opts.wavelength ?? 26
  const spacing = opts.spacing ?? 3.5
  const steps = Math.max(6, Math.round(w / spacing))
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const px = x + w * t
    pts.push({ x: px, y: y + amp * Math.sin((2 * Math.PI * (px - x)) / wavelength) })
  }
  return jitter(pts, opts.noise ?? 0.5, opts.seed ?? seedFrom(x, y, w, amp))
}

/**
 * Several `textLine`s stacked — a paragraph. Returns an ARRAY of polylines, one
 * per line, because the lexicon counts them: "one drawn line ~ one text line".
 * Each line costs one stroke against the sketch's stroke budget, so 2-3 lines
 * is usually the right amount of ink to mean "body copy".
 */
export function textBlock(x, y, w, lines = 3, gap = 22, opts = {}) {
  const out = []
  for (let i = 0; i < lines; i++) {
    // last line short, the way a paragraph actually ends
    const lw = i === lines - 1 && lines > 1 ? w * 0.62 : w
    out.push(textLine(x, y + i * gap, lw, { ...opts, seed: opts.seed ? opts.seed + i : undefined }))
  }
  return out
}

/**
 * A smooth decorative ribbon: ONE long wave across a section. Deliberately
 * gentle (few, wide crests) so `directionReversals` stays at the "decorative
 * wave" end of the convention instead of the delete end. `y` is its centreline.
 */
export function wave(x, y, w, opts = {}) {
  const amp = opts.amp ?? 20
  const crests = opts.crests ?? 1.5
  const spacing = opts.spacing ?? 8
  const steps = Math.max(12, Math.round(w / spacing))
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    pts.push({ x: x + w * t, y: y + amp * Math.sin(2 * Math.PI * crests * t) })
  }
  return jitter(pts, opts.noise ?? NOISE, opts.seed ?? seedFrom(x, y, w, amp, crests))
}

/**
 * Diagonal zigzag filling a region — the lexicon's "scribble/zigzag hatching
 * inside or between boundary strokes = a FILLED region". ONE continuous stroke,
 * because the fill is one intent (and because strokes are the scarce resource).
 * The reader must render a solid/shaded fill, never these lines.
 *
 * WARNING: maximal direction reversals — see note (2) in the header.
 */
export function hatch(x, y, w, h, opts = {}) {
  // Shading a tall region with full-height passes gives a handful of giant
  // triangles, which reads as a drawing rather than as a fill. People scribble
  // a big area in BANDS instead: zigzag across, drop down, zigzag back. So the
  // fill is a serpentine — still one continuous stroke, because it is one
  // intent (and strokes are the scarce resource in this benchmark).
  const maxRow = opts.rowHeight ?? Math.min(150, Math.max(80, w / 8))
  let rows = Math.max(1, Math.round(h / maxRow))
  // An ODD number of rows (and of passes per row) finishes in the corner
  // diagonally opposite the start. Finish directly across from the start and
  // the chord over the path length falls under the closedness threshold, at
  // which point the fill classifies as a closed rectangle — a second container
  // where a fill was meant.
  if (rows % 2 === 0) rows += 1
  const rowH = h / rows
  // pitch roughly constant in px: shading reads as shading at a human pitch,
  // not at a pitch proportional to the thing being shaded
  const step = opts.step ?? Math.min(56, Math.max(26, w / 18))
  let passes = Math.max(3, Math.round(w / step))
  if (passes % 2 === 0) passes += 1
  const dx = w / passes
  const wp = []
  for (let r = 0; r < rows; r++) {
    const top = y + r * rowH
    const bot = top + rowH
    const leftToRight = r % 2 === 0
    for (let i = 0; i <= passes; i++) {
      wp.push({ x: leftToRight ? x + dx * i : x + w - dx * i, y: i % 2 === 0 ? top : bot })
    }
  }
  return stroke(wp, { spacing: opts.spacing ?? 12, noise: opts.noise, seed: opts.seed }, seedFrom(x, y, w, h, step))
}

/**
 * "Rectangle with an X through it" = image placeholder. Three polylines (the
 * box, then both diagonals) — budget for it.
 */
export function imageBox(x, y, w, h, opts = {}) {
  return [
    box(x, y, w, h, opts),
    line(x, y, x + w, y + h, opts),
    line(x + w, y, x, y + h, opts),
  ]
}

// ---------------------------------------------------------------------------
// layout combinators — these return ARRAYS of polylines
// ---------------------------------------------------------------------------

/** `n` boxes side by side (each `w` x `h`, `gap` apart). "A row of shapes = flex row." */
export function row(n, x, y, w, h, gap = 24, opts = {}) {
  const out = []
  for (let i = 0; i < n; i++) out.push(box(x + i * (w + gap), y, w, h, opts))
  return out
}

/** `n` boxes stacked (each `w` x `h`, `gap` apart). "A column = stack." */
export function col(n, x, y, w, h, gap = 24, opts = {}) {
  const out = []
  for (let i = 0; i < n; i++) out.push(box(x, y + i * (h + gap), w, h, opts))
  return out
}

// ---------------------------------------------------------------------------
// wire format
// ---------------------------------------------------------------------------

/**
 * Polylines -> wire `Stroke[]` with monotonically increasing `t` across the
 * WHOLE set, so draw order and timing are realistic: people draw top-to-bottom,
 * left-to-right, with a pause between strokes.
 *
 * - `dt` is the per-point interval (12ms at 6px spacing ~ 500 px/s, a normal
 *   drag speed).
 * - `gap` is the [min, max] pause between strokes, default 200-600ms. It is
 *   deterministic (seeded), and it stays under the 900ms window that
 *   `groupStrokes` (packages/ink/src/group.ts) uses to decide which strokes
 *   belong to one object, so consecutive marks on one component group together.
 * - `startId` seeds the id sequence: 's1' -> s1, s2, s3...
 */
export function toStrokes(polylines, opts = {}) {
  const dt = opts.dt ?? 12
  const [gapMin, gapMax] = opts.gap ?? [200, 600]
  const rng = rngFrom(opts.seed ?? 20250101)
  const m = /^(.*?)(\d*)$/.exec(opts.startId ?? 's1')
  const prefix = m[1] || 's'
  let num = m[2] ? Number(m[2]) : 1
  let t = opts.t0 ?? 0
  const out = []
  for (const poly of polylines) {
    const points = poly.map((p, i) => ({ x: p.x, y: p.y, t: t + i * dt }))
    t = (points[points.length - 1]?.t ?? t) + Math.round(gapMin + rng() * (gapMax - gapMin))
    out.push({ id: `${prefix}${num++}`, points })
  }
  return out
}

/** Bounding box of a set of polylines — handy for runners and assertions. */
export function bounds(polylines) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of polylines) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

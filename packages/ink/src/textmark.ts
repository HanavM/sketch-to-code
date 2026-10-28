/**
 * Is this stroke a line of text?
 *
 * The squiggle people draw to mean "words go here" is the one mark that must
 * never come back as itself. Page 05 of the bench drew the sketch back at us:
 * every text squiggle became a literal wavy SVG path. The prompt was fixed to
 * say so (docs/findings.md, "Fixed, and the fix is verified"), but the prompt
 * is not the only thing that turns ink into paths. Grounding fitted an svgPath
 * for EVERY stroke an add/design action cited, and from there:
 *
 *   - the scaffold wrote each one into a component before codegen, labelled
 *     "these paths ARE the drawing … keep them";
 *   - the trace rung forced every such action to fidelity 'verbatim';
 *   - the composition check, at the trace rung, scored a squiggle that came
 *     back as real words as a failed likeness;
 *   - the instant render mounted squiggles drawn in empty space as SVG.
 *
 * Each of those is a deterministic push toward tracing, and the prompt was
 * arguing against all of them. So this is decided here, from the ink, and the
 * squiggle never becomes a path at all: the model still gets the stroke (it is
 * cited, it sets the region) and is told it stands for text.
 *
 * Geometry, calibrated on the bench's own generators (tests/bench/lib):
 * a text squiggle is a short-wavelength oscillation (22–40 px) of small
 * amplitude (4–6 px) along a roughly horizontal chord. Its perpendicular
 * travel per unit of length is ~0.5–0.8. A decorative wave (pages 08, 14) has
 * the same shape at 20× the wavelength: travel ~0.15. A hurried straight line
 * sways a few px every ~60 px: travel well under 0.3. Boxes and rings close on
 * themselves; arrows have one barb pair, not a train of crests.
 */
import type { Point } from './types.js'
import { resampleBySpacing } from './resample.js'

export interface TextMarkMeasure {
  /** End-to-end length (the line of text's width). */
  chord: number
  /** Angle of the chord from horizontal, degrees, 0–90. */
  tilt: number
  /** Spread of the stroke across its chord (max − min perpendicular offset). */
  thickness: number
  /** Perpendicular travel per px of chord: how hard it oscillates. */
  travel: number
  /** Turning points across the chord (hysteresis-filtered). */
  crests: number
  /** Ink length / chord: ~1 for a line, ≫ 1 for a loop or a box. */
  sinuosity: number
}

/** Below this chord a mark is a tick or a dot, not a line of anything. */
const MIN_CHORD = 30
/** A line of text is written roughly level. */
const MAX_TILT = 25
/** Body text to a big heading; a scribbled-over block is not a line. */
const MAX_THICKNESS = 40
/**
 * A display word drawn to size: one zigzag as tall as the letters (round 2, c2:
 * "NOISE" set at 300px drawn ~200px tall). Taller than MAX_THICKNESS is allowed
 * only for a lone line that is still clearly a LINE: far wider than tall and
 * level. A scratch-out over a block is about as tall as it is wide.
 */
const MAX_DISPLAY_THICKNESS = 320
const DISPLAY_MIN_ASPECT = 2.5
const DISPLAY_MAX_TILT = 12
/** Chord per crest, as a share of the zigzag's height. */
const DISPLAY_MIN_CREST_GAP = 0.5
const DISPLAY_MAX_SINUOSITY = 2.5
/**
 * A SHORT giant word ("01", "03" set at 360-420px) drawn to size. Its letters are
 * barely wider than tall, so a zigzag as tall as them can't be 2.5x wider: held to
 * that, the bench drew "01" a third as tall and it built at half size (round 3 c4,
 * round 4 c5). Allowed down to 1.1x wider than tall, but only as a FEW big crests
 * (2-3) at least 100px tall: a hatch or scratch-out over a block packs many crests
 * tight (bench hatch: one every 0.1-0.4x its height, 10+ crests).
 */
const SHORT_DISPLAY_MIN_ASPECT = 1.1
const SHORT_DISPLAY_MIN_THICKNESS = 100
const SHORT_DISPLAY_MAX_CRESTS = 3
const SHORT_DISPLAY_MIN_CREST_GAP = 0.33
const SHORT_DISPLAY_MAX_SINUOSITY = 3
/** Text oscillates hard; decoration and sway do not (see header). */
const MIN_TRAVEL = 0.35
/** A train of crests — one barb pair or a single bump is not writing. */
const MIN_CRESTS = 3
/** Perpendicular movement smaller than this is hand tremor, not a crest. */
const HYSTERESIS = 1.5
/** An oscillating line's ink is longer than its chord, a box's far longer. */
const MAX_SINUOSITY = 3

/**
 * `axis: 'fit'` measures along the least-squares line through the ink instead of
 * first-to-last point. A big zigzag that ends mid-crest has a chord tilted by up
 * to its own height, which reads it as sloped and far taller than it is.
 */
export function measureTextMark(points: Point[], axis: 'ends' | 'fit' = 'ends'): TextMarkMeasure | null {
  if (points.length < 4) return null
  let a = points[0]!
  const b = points[points.length - 1]!
  let dx = b.x - a.x
  let dy = b.y - a.y
  let chord = Math.hypot(dx, dy)
  if (chord < 1) return null
  if (axis === 'fit') {
    const n = points.length
    let mx = 0, my = 0
    for (const p of points) { mx += p.x / n; my += p.y / n }
    let sxx = 0, sxy = 0, syy = 0
    for (const p of points) { sxx += (p.x - mx) ** 2; sxy += (p.x - mx) * (p.y - my); syy += (p.y - my) ** 2 }
    // principal axis of the ink
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy)
    let fx = Math.cos(th), fy = Math.sin(th)
    if (fx * dx + fy * dy < 0) { fx = -fx; fy = -fy }
    let lo = Infinity, hi = -Infinity
    for (const p of points) { const t = (p.x - mx) * fx + (p.y - my) * fy; lo = Math.min(lo, t); hi = Math.max(hi, t) }
    chord = hi - lo
    if (chord < 1) return null
    dx = fx * chord
    dy = fy * chord
    a = { ...a, x: mx + fx * lo, y: my + fy * lo }
  }
  const ux = dx / chord
  const uy = dy / chord
  let tilt = (Math.atan2(Math.abs(dy), Math.abs(dx)) * 180) / Math.PI

  // even spacing first, so travel and crest counts don't depend on how fast
  // the pen moved; then a 3-tap average to take off pointer quantisation
  const rs = resampleBySpacing(points, 3)
  const off = rs.map((p) => (p.x - a.x) * -uy + (p.y - a.y) * ux)
  const sm = off.map((_, i) => {
    const lo = Math.max(0, i - 1)
    const hi = Math.min(off.length - 1, i + 1)
    let s = 0
    for (let j = lo; j <= hi; j++) s += off[j]!
    return s / (hi - lo + 1)
  })
  let min = Infinity
  let max = -Infinity
  let travel = 0
  let ink = 0
  for (let i = 0; i < sm.length; i++) {
    min = Math.min(min, sm[i]!)
    max = Math.max(max, sm[i]!)
    if (i > 0) travel += Math.abs(sm[i]! - sm[i - 1]!)
  }
  for (let i = 1; i < points.length; i++) {
    ink += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  }

  // turning points with hysteresis: a crest only counts once the stroke has
  // come back from it by more than tremor
  let crests = 0
  let dir = 0
  let hi = sm[0]!
  let lo = sm[0]!
  for (const v of sm) {
    if (dir === 0) {
      // no direction yet: wait until the stroke has clearly left its start
      hi = Math.max(hi, v)
      lo = Math.min(lo, v)
      if (v < hi - HYSTERESIS) { dir = -1; lo = v }
      else if (v > lo + HYSTERESIS) { dir = 1; hi = v }
    } else if (dir > 0) {
      if (v > hi) hi = v
      else if (v < hi - HYSTERESIS) { crests++; dir = -1; lo = v }
    } else {
      if (v < lo) lo = v
      else if (v > lo + HYSTERESIS) { crests++; dir = 1; hi = v }
    }
  }
  if (!Number.isFinite(tilt)) tilt = 90
  return { chord, tilt, thickness: max - min, travel: travel / chord, crests, sinuosity: ink / chord }
}

/** Why this stroke reads as a line of text, or null when it doesn't. */
export function textMarkReason(points: Point[]): string | null {
  let m = measureTextMark(points)
  if (!m) return null
  if (m.chord < MIN_CHORD || m.tilt > MAX_TILT) return null
  if (m.thickness > MAX_THICKNESS) {
    // maybe a display word drawn to size: judge it along the ink's own axis
    const d = displayMeasure(points)
    if (!d) return null
    m = d.m
    if (d.short) return `a ${Math.round(m.chord)}x${Math.round(m.thickness)}px zigzag (${m.crests} crests) reads as a short giant word`
  }
  if (m.sinuosity > MAX_SINUOSITY) return null
  if (m.travel < MIN_TRAVEL || m.crests < MIN_CRESTS) return null
  return (
    `a level ${Math.round(m.chord)}px squiggle (${m.crests} crests, ` +
    `${Math.round(m.thickness)}px tall) reads as a line of text`
  )
}

/**
 * A stroke taller than body ink that is still a line of display type: the measure
 * it qualifies by (along the ink's axis first, then end to end) and whether it is
 * a short giant word. Null when it is neither.
 */
function displayMeasure(points: Point[]): { m: TextMarkMeasure; short: boolean } | null {
  const fit = measureTextMark(points, 'fit')
  if (fit && isDisplayLine(fit)) return { m: fit, short: false }
  // near-square ink has no reliable principal axis (it tilts ~40deg): a short word
  // is judged end to end too, and must be level either way
  for (const m of [fit, measureTextMark(points)]) if (m && isShortDisplayWord(m)) return { m, short: true }
  return null
}

/** A level zigzag far wider than tall, taller than body or title ink: a display word drawn to size. */
function isDisplayLine(m: TextMarkMeasure): boolean {
  return (
    m.thickness <= MAX_DISPLAY_THICKNESS &&
    m.chord >= DISPLAY_MIN_ASPECT * m.thickness &&
    m.tilt <= DISPLAY_MAX_TILT &&
    // a hatch fill packs its crests tighter and doubles back harder (bench hatch:
    // a crest every 0.43x its height, ink 2.9x its chord)
    m.chord / Math.max(1, m.crests) >= DISPLAY_MIN_CREST_GAP * m.thickness &&
    m.sinuosity <= DISPLAY_MAX_SINUOSITY
  )
}

/** A few big crests about as tall as wide, level: a short word ("01") drawn at its real height. */
function isShortDisplayWord(m: TextMarkMeasure): boolean {
  return (
    m.thickness >= SHORT_DISPLAY_MIN_THICKNESS &&
    m.thickness <= MAX_DISPLAY_THICKNESS &&
    m.chord >= SHORT_DISPLAY_MIN_ASPECT * m.thickness &&
    m.chord < DISPLAY_MIN_ASPECT * m.thickness &&
    m.tilt <= DISPLAY_MAX_TILT &&
    m.crests >= 2 &&
    m.crests <= SHORT_DISPLAY_MAX_CRESTS &&
    m.chord / m.crests >= SHORT_DISPLAY_MIN_CREST_GAP * m.thickness &&
    m.sinuosity <= SHORT_DISPLAY_MAX_SINUOSITY &&
    m.travel >= MIN_TRAVEL
  )
}

export const isTextMark = (points: Point[]): boolean => textMarkReason(points) !== null

/**
 * What a stack of text squiggles says about TYPE SIZE.
 *
 * Round 1 (c1): a two-line heading drawn 240px tall came back one line at half
 * size. The model was told each squiggle is "a line of text" and left to guess
 * size from the region, and it guessed the app's default h1. The one honest
 * size signal in the ink is the SPACING between stacked lines: that is the line
 * height the person drew, and font size follows from it. A squiggle's own
 * wobble height is how the pen moved, not how big the letters are, so a single
 * line gets no size claim here (its region still bounds it).
 */
export interface TextStack {
  /** Squiggle stroke ids, top to bottom. */
  strokes: string[]
  lines: number
  /** Union of the lines' boxes, page px. */
  box: { x: number; y: number; w: number; h: number }
  /** Median distance between consecutive line centres. */
  linePitchPx: number
  /** Font size implied by that pitch (display type sets tighter than body). */
  fontPx: number
}

interface LineGeom { id: string; x0: number; x1: number; cy: number; y0: number; y1: number }

function lineGeom(id: string, points: Point[]): LineGeom {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x)
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y)
  }
  return { id, x0, x1, y0, y1, cy: (y0 + y1) / 2 }
}

/** A lone squiggle this tall (px, crest to trough) is a heading drawn to size. */
export const LONE_HEADING_INK = 17
/** Font px per px of a lone heading squiggle's height (bench: 28px title drawn ~19px tall). */
const LONE_FONT_PER_INK = 1.45

/** Font size for a drawn line pitch: headings ~1.1 line-height, body ~1.5. */
export function fontForPitch(pitch: number): number {
  return Math.round(pitch / (pitch >= 48 ? 1.1 : 1.5))
}

/**
 * Group text squiggles into stacks (same left edge, evenly stepped down) and
 * read a type size from each stack of two or more lines; a lone squiggle drawn
 * heading-tall gives a one-line stack sized from its height.
 */
export function textStacks(marks: Array<{ id: string; points: Point[] }>): TextStack[] {
  const ls = marks
    .filter((m) => isTextMark(m.points))
    .map((m) => lineGeom(m.id, m.points))
    .sort((a, b) => a.cy - b.cy)
  const used = new Set<string>()
  const out: TextStack[] = []
  for (const first of ls) {
    if (used.has(first.id)) continue
    const stack = [first]
    used.add(first.id)
    for (const next of ls) {
      if (used.has(next.id)) continue
      const last = stack[stack.length - 1]!
      const w = Math.max(last.x1 - last.x0, next.x1 - next.x0)
      const gap = next.cy - last.cy
      const sameEdge =
        Math.abs(next.x0 - last.x0) <= Math.max(40, 0.15 * w) ||
        Math.abs((next.x0 + next.x1) / 2 - (last.x0 + last.x1) / 2) <= Math.max(40, 0.15 * w) // centred copy
      const pitchOk = stack.length < 2 || Math.abs(gap - (last.cy - stack[stack.length - 2]!.cy)) <= 0.35 * gap
      // one stack is one hand: similar wobble height and comparable length
      const tl = last.y1 - last.y0
      const tn = next.y1 - next.y0
      const sameHand = Math.max(tl, tn) <= 1.6 * Math.min(tl, tn) + 2
      const lenOk = Math.min(last.x1 - last.x0, next.x1 - next.x0) >= 0.35 * w
      if (gap > tl && gap <= 200 && sameEdge && pitchOk && sameHand && lenOk) {
        stack.push(next)
        used.add(next.id)
      }
    }
    if (stack.length < 2) {
      // a lone squiggle: only its height can say size. Body text wobbles a few px;
      // a heading drawn tall (>= LONE_HEADING_INK px across) is drawn that big on purpose.
      // across the chord, so a line written on a slight slope doesn't read taller
      const pts = marks.find((m) => m.id === first.id)!.points
      let t = measureTextMark(pts)?.thickness ?? 0
      if (t > MAX_THICKNESS) t = Math.min(t, measureTextMark(pts, 'fit')?.thickness ?? t)
      if (t < LONE_HEADING_INK) continue
      const fontPx = Math.round(LONE_FONT_PER_INK * Math.min(t, MAX_DISPLAY_THICKNESS))
      const pitch = Math.round(fontPx * 1.2)
      out.push({
        strokes: [first.id],
        lines: 1,
        box: { x: Math.round(first.x0), y: Math.round(first.cy - pitch / 2), w: Math.round(first.x1 - first.x0), h: pitch },
        linePitchPx: pitch,
        fontPx,
      })
      continue
    }
    const gaps = stack.slice(1).map((l, i) => l.cy - stack[i]!.cy).sort((a, b) => a - b)
    const pitch = gaps[Math.floor(gaps.length / 2)]!
    const x0 = Math.min(...stack.map((l) => l.x0))
    const x1 = Math.max(...stack.map((l) => l.x1))
    const y0 = stack[0]!.cy - pitch / 2
    out.push({
      strokes: stack.map((l) => l.id),
      lines: stack.length,
      box: { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(pitch * stack.length) },
      linePitchPx: Math.round(pitch),
      fontPx: fontForPitch(pitch),
    })
  }
  return out
}

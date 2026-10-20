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
import type { Point } from '@s2c/ink'
import { resampleBySpacing } from '@s2c/ink'

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
/** Text oscillates hard; decoration and sway do not (see header). */
const MIN_TRAVEL = 0.35
/** A train of crests — one barb pair or a single bump is not writing. */
const MIN_CRESTS = 3
/** Perpendicular movement smaller than this is hand tremor, not a crest. */
const HYSTERESIS = 1.5
/** An oscillating line's ink is longer than its chord, a box's far longer. */
const MAX_SINUOSITY = 3

export function measureTextMark(points: Point[]): TextMarkMeasure | null {
  if (points.length < 4) return null
  const a = points[0]!
  const b = points[points.length - 1]!
  const dx = b.x - a.x
  const dy = b.y - a.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1) return null
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
  const m = measureTextMark(points)
  if (!m) return null
  if (m.chord < MIN_CHORD || m.tilt > MAX_TILT || m.thickness > MAX_THICKNESS) return null
  if (m.sinuosity > MAX_SINUOSITY) return null
  if (m.travel < MIN_TRAVEL || m.crests < MIN_CRESTS) return null
  return (
    `a level ${Math.round(m.chord)}px squiggle (${m.crests} crests, ` +
    `${Math.round(m.thickness)}px tall) reads as a line of text`
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

/** Font size for a drawn line pitch: headings ~1.1 line-height, body ~1.5. */
export function fontForPitch(pitch: number): number {
  return Math.round(pitch / (pitch >= 48 ? 1.1 : 1.5))
}

/**
 * Group text squiggles into stacks (same left edge, evenly stepped down) and
 * read a type size from each stack of two or more lines.
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
    if (stack.length < 2) continue
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

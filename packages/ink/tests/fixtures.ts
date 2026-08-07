/**
 * Synthetic hand-drawn-ish strokes. Seeded RNG so tests are deterministic.
 * Jitter emulates mouse wobble; timestamps emulate real drawing speed.
 */
import type { Point, Stroke } from '../src/types.js'

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface DrawOpts {
  jitter?: number
  seed?: number
  t0?: number
  /** px per ms drawing speed */
  speed?: number
  id?: string
}

let strokeCounter = 0

/** Sample a polyline path (list of waypoints) into a jittered stroke. */
export function drawPath(waypoints: Array<[number, number]>, opts: DrawOpts = {}): Stroke {
  const jitter = opts.jitter ?? 1.2
  const rng = mulberry32(opts.seed ?? 42)
  const speed = opts.speed ?? 0.8
  let t = opts.t0 ?? 0
  const pts: Point[] = []
  for (let w = 1; w < waypoints.length; w++) {
    const [x0, y0] = waypoints[w - 1]!
    const [x1, y1] = waypoints[w]!
    const segLen = Math.hypot(x1 - x0, y1 - y0)
    const steps = Math.max(2, Math.round(segLen / 3))
    for (let i = w === 1 ? 0 : 1; i <= steps; i++) {
      const u = i / steps
      pts.push({
        x: x0 + u * (x1 - x0) + (rng() - 0.5) * 2 * jitter,
        y: y0 + u * (y1 - y0) + (rng() - 0.5) * 2 * jitter,
        t: (t += 3 / speed),
      })
    }
  }
  return { id: opts.id ?? `s${strokeCounter++}`, points: pts }
}

export function drawRect(x: number, y: number, w: number, h: number, opts: DrawOpts = {}): Stroke {
  return drawPath(
    [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x + 1, y + 1]],
    opts,
  )
}

export function drawEllipse(cx: number, cy: number, rx: number, ry: number, opts: DrawOpts = {}): Stroke {
  const rng = mulberry32(opts.seed ?? 7)
  const jitter = opts.jitter ?? 1.2
  const speed = opts.speed ?? 0.8
  let t = opts.t0 ?? 0
  const pts: Point[] = []
  const steps = Math.max(24, Math.round((Math.PI * (rx + ry)) / 3))
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI - Math.PI / 2
    pts.push({
      x: cx + rx * Math.cos(a) + (rng() - 0.5) * 2 * jitter,
      y: cy + ry * Math.sin(a) + (rng() - 0.5) * 2 * jitter,
      t: (t += 3 / speed),
    })
  }
  return { id: opts.id ?? `s${strokeCounter++}`, points: pts }
}

export const drawCircle = (cx: number, cy: number, r: number, opts: DrawOpts = {}) =>
  drawEllipse(cx, cy, r, r, opts)

export function drawLine(x0: number, y0: number, x1: number, y1: number, opts: DrawOpts = {}): Stroke {
  return drawPath([[x0, y0], [x1, y1]], opts)
}

export function drawTriangle(cx: number, cy: number, size: number, opts: DrawOpts = {}): Stroke {
  const h = (size * Math.sqrt(3)) / 2
  return drawPath(
    [
      [cx, cy - (2 / 3) * h],
      [cx + size / 2, cy + h / 3],
      [cx - size / 2, cy + h / 3],
      [cx + 1, cy - (2 / 3) * h + 1],
    ],
    opts,
  )
}

export function drawDiamond(cx: number, cy: number, w: number, h: number, opts: DrawOpts = {}): Stroke {
  return drawPath(
    [
      [cx, cy - h / 2],
      [cx + w / 2, cy],
      [cx, cy + h / 2],
      [cx - w / 2, cy],
      [cx + 1, cy - h / 2 + 1],
    ],
    opts,
  )
}

/** Single-stroke arrow: shaft then V-head drawn without lifting. */
export function drawArrow(x0: number, y0: number, x1: number, y1: number, opts: DrawOpts = {}): Stroke {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const len = Math.hypot(x1 - x0, y1 - y0)
  const head = Math.max(10, len * 0.18)
  const wing = (150 * Math.PI) / 180
  const w1: [number, number] = [
    x1 + head * Math.cos(ang + wing),
    y1 + head * Math.sin(ang + wing),
  ]
  const w2: [number, number] = [
    x1 + head * Math.cos(ang - wing),
    y1 + head * Math.sin(ang - wing),
  ]
  return drawPath([[x0, y0], [x1, y1], w1, [x1, y1], w2], opts)
}

/** Two-stroke arrow: shaft stroke + separate V-head stroke. */
export function drawArrowTwoStroke(
  x0: number, y0: number, x1: number, y1: number, opts: DrawOpts = {},
): [Stroke, Stroke] {
  const ang = Math.atan2(y1 - y0, x1 - x0)
  const len = Math.hypot(x1 - x0, y1 - y0)
  const head = Math.max(10, len * 0.18)
  const wing = (150 * Math.PI) / 180
  const shaft = drawLine(x0, y0, x1, y1, opts)
  const lastT = shaft.points[shaft.points.length - 1]!.t
  const v = drawPath(
    [
      [x1 + head * Math.cos(ang + wing), y1 + head * Math.sin(ang + wing)],
      [x1, y1],
      [x1 + head * Math.cos(ang - wing), y1 + head * Math.sin(ang - wing)],
    ],
    { ...opts, t0: lastT + 150, id: undefined },
  )
  return [shaft, v]
}

/** Zigzag scribble (delete gesture) covering a box. */
export function drawScribble(x: number, y: number, w: number, h: number, opts: DrawOpts = {}): Stroke {
  const waypoints: Array<[number, number]> = []
  const zigs = 7
  for (let i = 0; i <= zigs; i++) {
    waypoints.push([x + (i / zigs) * w, i % 2 === 0 ? y : y + h])
  }
  return drawPath(waypoints, opts)
}

/** Caret ^ */
export function drawCaret(cx: number, cy: number, size: number, opts: DrawOpts = {}): Stroke {
  return drawPath(
    [
      [cx - size / 2, cy + size / 2],
      [cx, cy - size / 2],
      [cx + size / 2, cy + size / 2],
    ],
    opts,
  )
}

/**
 * Fake handwriting: a run of small connected wiggly glyph-like squiggles.
 * Not real letters — just matches handwriting's statistics (small, dense, wiggly,
 * multiple strokes in quick succession).
 */
export function drawHandwriting(
  x: number, y: number, opts: DrawOpts & { glyphs?: number; glyphH?: number } = {},
): Stroke[] {
  const rng = mulberry32(opts.seed ?? 99)
  const glyphs = opts.glyphs ?? 6
  const glyphH = opts.glyphH ?? 14
  const strokes: Stroke[] = []
  let cx = x
  let t0 = opts.t0 ?? 0
  for (let g = 0; g < glyphs; g++) {
    const gw = glyphH * (0.4 + rng() * 0.5)
    const waypoints: Array<[number, number]> = []
    const wiggles = 3 + Math.floor(rng() * 4)
    for (let i = 0; i <= wiggles; i++) {
      waypoints.push([
        cx + (i / wiggles) * gw + (rng() - 0.5) * gw * 0.7,
        y + rng() * glyphH,
      ])
    }
    strokes.push(drawPath(waypoints, { ...opts, t0, jitter: 0.8, id: undefined }))
    const last = strokes[strokes.length - 1]!
    t0 = last.points[last.points.length - 1]!.t + 60 + rng() * 120
    cx += gw + glyphH * 0.25
  }
  return strokes
}

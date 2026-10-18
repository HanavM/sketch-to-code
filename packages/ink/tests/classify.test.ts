import { describe, expect, it } from 'vitest'
import { classifyStroke } from '../src/classify.js'
import { textProbability } from '../src/entropy.js'
import type { ShapeKind } from '../src/types.js'
import {
  drawCaret, drawCircle, drawDiamond, drawEllipse, drawHandwriting, drawLine,
  drawPath, drawRect, drawScribble, drawTriangle, mulberry32,
} from './fixtures.js'

const topKind = (s: ReturnType<typeof classifyStroke>): ShapeKind => s.candidates[0]!.kind

/** classification helper that tolerates near-synonyms */
const expectKind = (actual: ShapeKind, allowed: ShapeKind[]) => {
  expect(allowed, `expected one of [${allowed.join(', ')}], got ${actual}`).toContain(actual)
}

describe('classifyStroke on synthetic hand-drawn shapes', () => {
  it('rectangles at several sizes and seeds', () => {
    for (const [w, h, seed] of [[120, 80, 1], [200, 40, 2], [60, 60, 3], [300, 150, 4]] as const) {
      const s = drawRect(10, 10, w, h, { seed, jitter: 1.5 })
      expectKind(topKind(classifyStroke(s)), ['rect', 'rounded-rect'])
    }
  })

  it('circles', () => {
    for (const seed of [1, 2, 3]) {
      const s = drawCircle(100, 100, 50, { seed, jitter: 1.2 })
      expectKind(topKind(classifyStroke(s)), ['circle', 'ellipse'])
    }
  })

  it('ellipses (elongated) are ellipse, not circle', () => {
    for (const seed of [1, 2]) {
      const s = drawEllipse(100, 100, 80, 35, { seed, jitter: 1.2 })
      const top = topKind(classifyStroke(s))
      expectKind(top, ['ellipse', 'rounded-rect'])
      expect(top).not.toBe('circle')
    }
  })

  it('straight lines', () => {
    for (const [x1, y1] of [[300, 0], [200, 200], [0, 250]] as const) {
      const s = drawLine(10, 10, 10 + x1, 10 + y1, { seed: 5, jitter: 1 })
      expect(topKind(classifyStroke(s))).toBe('line')
    }
  })

  it('triangles', () => {
    for (const seed of [1, 2]) {
      const s = drawTriangle(150, 150, 120, { seed, jitter: 1.5 })
      expectKind(topKind(classifyStroke(s)), ['triangle'])
    }
  })

  it('diamonds', () => {
    const s = drawDiamond(150, 150, 120, 120, { seed: 3, jitter: 1.5 })
    expectKind(topKind(classifyStroke(s)), ['diamond', 'triangle', 'rect'])
  })

  it('zigzag scribbles', () => {
    for (const seed of [1, 2]) {
      const s = drawScribble(50, 50, 120, 60, { seed, jitter: 1.5 })
      expectKind(topKind(classifyStroke(s)), ['scribble', 'polyline'])
    }
  })

  it('caret', () => {
    const s = drawCaret(100, 100, 30, { seed: 1, jitter: 0.8 })
    expectKind(topKind(classifyStroke(s)), ['caret', 'polyline'])
  })
})

describe('text vs shape (entropy discriminator)', () => {
  it('handwriting scores as text', () => {
    for (const seed of [1, 9, 42]) {
      const strokes = drawHandwriting(50, 50, { seed, glyphs: 6 })
      expect(textProbability(strokes), `seed ${seed}`).toBeGreaterThan(0.62)
    }
  })

  it('shapes do not score as text', () => {
    expect(textProbability([drawRect(10, 10, 120, 80, { seed: 1 })])).toBeLessThan(0.62)
    expect(textProbability([drawCircle(100, 100, 50, { seed: 1 })])).toBeLessThan(0.62)
    expect(textProbability([drawLine(0, 0, 200, 100, { seed: 1 })])).toBeLessThan(0.62)
  })

  it('a big scribble is not text (it is a delete gesture)', () => {
    expect(textProbability([drawScribble(50, 50, 150, 80, { seed: 1 })])).toBeLessThan(0.75)
  })
})

// s2c-053: a person ringing something often goes round 1.15–1.5 times. The
// endpoints then sit a quarter-lap apart, and the old closedness test read the
// stroke as an open line or polyline (137 of 200 overdrawn rings in the
// plain sweep).
describe('overdrawn loops', () => {
  const CLOSED: ShapeKind[] = ['circle', 'ellipse', 'rect', 'rounded-rect']
  /** An ellipse drawn `turns` times round, growing by `drift` over the stroke, as a hurried hand does. */
  const loop = (cx: number, cy: number, rx: number, ry: number, turns: number, seed: number, drift = 0.1, jitter = 1.5) => {
    const rng = mulberry32(seed)
    const steps = Math.round((2 * Math.PI * Math.max(rx, ry) * turns) / 4)
    const start = -Math.PI * (0.6 + rng() * 0.3)
    const points = []
    for (let i = 0; i <= steps; i++) {
      const u = i / steps
      const a = start + 2 * Math.PI * turns * u
      const k = 1 + drift * u
      points.push({ x: cx + rx * k * Math.cos(a) + (rng() - 0.5) * 2 * jitter, y: cy + ry * k * Math.sin(a) + (rng() - 0.5) * 2 * jitter, t: i * 16 })
    }
    return { id: `loop${seed}`, points }
  }

  it('a 1.3-turn rough loop is an ellipse, not a line', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      expectKind(topKind(classifyStroke(loop(200, 100, 110, 28, 1.3, seed, 0.12))), ['ellipse', 'circle', 'rounded-rect'])
    }
  })

  it('1.15 to 1.5 turns, round and flat', () => {
    for (const [turns, rx, ry, seed] of [[1.15, 60, 55, 6], [1.25, 120, 30, 7], [1.4, 50, 50, 8], [1.5, 150, 45, 9]] as const) {
      expectKind(topKind(classifyStroke(loop(300, 200, rx, ry, turns, seed))), CLOSED)
    }
  })

  it('a box drawn round once and a third is still a box', () => {
    const s = drawPath([[10, 10], [210, 10], [210, 110], [10, 110], [10, 12], [140, 14]], { seed: 3, jitter: 1.5 })
    expectKind(topKind(classifyStroke(s)), ['rect', 'rounded-rect'])
  })

  it('a ring with a tail heading off is not read as just a ring', () => {
    // one lap, then the pen leaves for somewhere else: a ring plus an arrow
    const ring = loop(200, 200, 60, 40, 1.05, 11, 0.02)
    const end = ring.points[ring.points.length - 1]!
    for (let i = 1; i <= 40; i++) ring.points.push({ x: end.x + i * 6, y: end.y + i * 2, t: end.t + i * 16 })
    expect(CLOSED).not.toContain(topKind(classifyStroke(ring)))
  })
})

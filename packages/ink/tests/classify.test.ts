import { describe, expect, it } from 'vitest'
import { classifyStroke } from '../src/classify.js'
import { textProbability } from '../src/entropy.js'
import type { ShapeKind } from '../src/types.js'
import {
  drawCaret, drawCircle, drawDiamond, drawEllipse, drawHandwriting, drawLine,
  drawRect, drawScribble, drawTriangle,
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

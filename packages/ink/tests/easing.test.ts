import { describe, expect, it } from 'vitest'
import { strokeToEasing } from '../src/easing.js'
import type { Point } from '../src/types.js'

/** Straight-line stroke whose progress follows fn(t) over 600ms. */
function stroke(fn: (t: number) => number, n = 60): Point[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    return { x: 100 + fn(t) * 300, y: 200, t: t * 600 }
  })
}

describe('strokeToEasing', () => {
  it('constant speed ≈ linear', () => {
    const e = strokeToEasing(stroke((t) => t))
    expect(e?.type).toBe('bezier')
    if (e?.type === 'bezier') {
      // control points near the diagonal
      expect(Math.abs(e.y1 - e.x1)).toBeLessThan(0.25)
      expect(Math.abs(e.y2 - e.x2)).toBeLessThan(0.25)
    }
  })

  it('slow start, fast finish = ease-in shape', () => {
    const e = strokeToEasing(stroke((t) => t * t * t))
    expect(e?.type).toBe('bezier')
    if (e?.type === 'bezier') expect(e.y1).toBeLessThan(e.x1) // sags below diagonal
  })

  it('fast start, slow settle = ease-out shape', () => {
    const e = strokeToEasing(stroke((t) => 1 - (1 - t) ** 3))
    expect(e?.type).toBe('bezier')
    if (e?.type === 'bezier') expect(e.y1).toBeGreaterThan(e.x1) // bulges above
  })

  it('overshoot-and-settle = spring', () => {
    const e = strokeToEasing(stroke((t) => 1 - Math.exp(-5 * t) * Math.cos(9 * t) * 1.25))
    expect(e?.type).toBe('spring')
    if (e?.type === 'spring') {
      expect(e.overshoot).toBeGreaterThan(0.04)
      expect(e.css.startsWith('linear(')).toBe(true)
    }
  })

  it('degenerate strokes return null', () => {
    expect(strokeToEasing([])).toBeNull()
    expect(strokeToEasing(stroke((t) => t, 3))).toBeNull()
    const frozen = stroke((t) => t).map((p) => ({ ...p, t: 0 }))
    expect(strokeToEasing(frozen)).toBeNull()
  })
})

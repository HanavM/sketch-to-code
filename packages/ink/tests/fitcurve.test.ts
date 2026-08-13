import { describe, expect, it } from 'vitest'
import { fitCurve, toSvgPath } from '../src/fitcurve.js'
import type { Point } from '../src/types.js'
import { drawPath, mulberry32 } from './fixtures.js'

const P = (x: number, y: number): Point => ({ x, y, t: 0 })

/** Evaluate a fitted bezier chain at many samples; max distance to polyline. */
function chainMaxError(points: Point[], beziers: ReturnType<typeof fitCurve>): number {
  const samples: Array<{ x: number; y: number }> = []
  for (const b of beziers) {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20
      const u = 1 - t
      samples.push({
        x: u ** 3 * b[0].x + 3 * u * u * t * b[1].x + 3 * u * t * t * b[2].x + t ** 3 * b[3].x,
        y: u ** 3 * b[0].y + 3 * u * u * t * b[1].y + 3 * u * t * t * b[2].y + t ** 3 * b[3].y,
      })
    }
  }
  let worst = 0
  for (const s of samples) {
    let best = Infinity
    for (const p of points) best = Math.min(best, Math.hypot(s.x - p.x, s.y - p.y))
    worst = Math.max(worst, best)
  }
  return worst
}

describe('fitCurve (Schneider)', () => {
  it('fits a straight line with one segment', () => {
    const pts = Array.from({ length: 30 }, (_, i) => P(i * 10, i * 5))
    const bez = fitCurve(pts, 2)
    expect(bez).toHaveLength(1)
    expect(bez[0]![0]).toMatchObject({ x: 0, y: 0 })
    expect(bez[0]![3]).toMatchObject({ x: 290, y: 145 })
  })

  it('fits a sine ribbon within tolerance and few segments', () => {
    const pts = Array.from({ length: 120 }, (_, i) =>
      P(i * 4, 60 * Math.sin((i / 120) * Math.PI * 3)),
    )
    const bez = fitCurve(pts, 2.5)
    expect(bez.length).toBeGreaterThanOrEqual(2)
    expect(bez.length).toBeLessThanOrEqual(10)
    expect(chainMaxError(pts, bez)).toBeLessThan(6)
    // endpoints preserved exactly
    expect(bez[0]![0].x).toBeCloseTo(0)
    expect(bez[bez.length - 1]![3].x).toBeCloseTo(476)
  })

  it('handles jittered hand-drawn input without exploding segment count', () => {
    const rng = mulberry32(5)
    const pts = Array.from({ length: 200 }, (_, i) =>
      P(i * 3 + (rng() - 0.5) * 2, 40 * Math.sin(i / 18) + (rng() - 0.5) * 2),
    )
    const bez = fitCurve(pts, 3)
    expect(bez.length).toBeLessThan(24)
    expect(chainMaxError(pts, bez)).toBeLessThan(9)
  })

  it('degenerate inputs are safe', () => {
    expect(fitCurve([], 2)).toHaveLength(0)
    expect(fitCurve([P(5, 5)], 2)).toHaveLength(0)
    expect(fitCurve([P(5, 5), P(5, 5)], 2)).toHaveLength(0)
    expect(fitCurve([P(0, 0), P(10, 0)], 2)).toHaveLength(1)
  })
})

describe('toSvgPath', () => {
  it('emits a bbox-local M/C path with 1-decimal coords', () => {
    const stroke = drawPath(
      [[300, 200], [380, 160], [460, 220], [540, 170]],
      { seed: 3, jitter: 1 },
    )
    const res = toSvgPath(stroke.points, { tolerance: 2 })
    expect(res).not.toBeNull()
    expect(res!.d).toMatch(/^M[\d.]+,[\d.]+( C[\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+ [\d.-]+,[\d.-]+)+$/)
    // bbox-local: starts near origin, not at page coords
    const m = /^M([\d.]+),([\d.]+)/.exec(res!.d)!
    expect(Number(m[1])).toBeLessThan(20)
    expect(Number(m[2])).toBeLessThan(80)
    expect(res!.segments).toBeGreaterThanOrEqual(1)
  })

  it('returns null for degenerate strokes', () => {
    expect(toSvgPath([P(1, 1)])).toBeNull()
  })
})

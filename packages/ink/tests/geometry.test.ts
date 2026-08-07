import { describe, expect, it } from 'vitest'
import {
  bboxContains, bboxGap, bboxOf, convexHull, largestQuad, largestTriangle,
  minAreaRect, pathLength, pointInPolygon, polygonArea, polygonPerimeter,
} from '../src/geometry.js'
import { dedupe, resampleBySpacing, resampleToCount } from '../src/resample.js'
import { rdp } from '../src/simplify.js'
import type { Point } from '../src/types.js'

const P = (x: number, y: number): Point => ({ x, y, t: 0 })

describe('geometry', () => {
  it('convex hull of a square with interior points', () => {
    const pts = [P(0, 0), P(10, 0), P(10, 10), P(0, 10), P(5, 5), P(3, 7)]
    const hull = convexHull(pts)
    expect(hull).toHaveLength(4)
    expect(polygonArea(hull)).toBeCloseTo(100)
    expect(polygonPerimeter(hull)).toBeCloseTo(40)
  })

  it('min-area rect of a rotated rectangle', () => {
    // 20x10 rect rotated 30°
    const a = (30 * Math.PI) / 180
    const corners = [
      [0, 0], [20, 0], [20, 10], [0, 10],
    ].map(([x, y]) => P(x! * Math.cos(a) - y! * Math.sin(a), x! * Math.sin(a) + y! * Math.cos(a)))
    const er = minAreaRect(convexHull(corners))
    expect(er.area).toBeCloseTo(200, 0)
    expect(er.short).toBeCloseTo(10, 0)
    expect(er.long).toBeCloseTo(20, 0)
  })

  it('largest triangle in a square is half its area', () => {
    const hull = convexHull([P(0, 0), P(10, 0), P(10, 10), P(0, 10)])
    expect(largestTriangle(hull).area).toBeCloseTo(50)
  })

  it('largest quad in a square is the square', () => {
    const hull = convexHull([P(0, 0), P(10, 0), P(10, 10), P(0, 10)])
    expect(largestQuad(hull).area).toBeCloseTo(100)
  })

  it('largest quad in a regular octagon', () => {
    const hull = convexHull(
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * 2 * Math.PI
        return P(Math.cos(a) * 10, Math.sin(a) * 10)
      }),
    )
    // max quad inscribed in circle radius 10 = square with diagonal 20 → area 200
    expect(largestQuad(hull).area).toBeCloseTo(200, 0)
  })

  it('point in polygon', () => {
    const square = [P(0, 0), P(10, 0), P(10, 10), P(0, 10)]
    expect(pointInPolygon(P(5, 5), square)).toBe(true)
    expect(pointInPolygon(P(15, 5), square)).toBe(false)
  })

  it('bbox helpers', () => {
    const b1 = bboxOf([P(0, 0), P(10, 20)])
    expect(b1).toEqual({ x: 0, y: 0, w: 10, h: 20 })
    expect(bboxGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 5, h: 5 })).toBeCloseTo(10)
    expect(bboxGap({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(0)
    expect(bboxContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 20, h: 20 })).toBe(true)
    expect(bboxContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 90, y: 10, w: 20, h: 20 })).toBe(false)
  })
})

describe('resample + simplify', () => {
  it('dedupe removes near-duplicates but keeps endpoints', () => {
    const pts = [P(0, 0), P(0.5, 0), P(1, 0), P(50, 0), P(50.2, 0)]
    const out = dedupe(pts, 3)
    expect(out[0]).toEqual(P(0, 0))
    expect(out[out.length - 1]!.x).toBeCloseTo(50.2)
    expect(out.length).toBeLessThan(pts.length)
  })

  it('resampleBySpacing yields near-equidistant points', () => {
    const line = Array.from({ length: 50 }, (_, i) => P(i * 7.3, 0))
    const out = resampleBySpacing(line, 10)
    for (let i = 2; i < out.length - 1; i++) {
      const d = Math.hypot(out[i]!.x - out[i - 1]!.x, out[i]!.y - out[i - 1]!.y)
      expect(d).toBeCloseTo(10, 5)
    }
  })

  it('resampleToCount returns exactly n points spanning the path', () => {
    const line = [P(0, 0), P(100, 0)]
    const out = resampleToCount(line, 64)
    expect(out).toHaveLength(64)
    expect(out[0]!.x).toBeCloseTo(0)
    expect(out[63]!.x).toBeCloseTo(100, 0)
  })

  it('rdp collapses a straight line to endpoints and keeps corners', () => {
    const line = Array.from({ length: 20 }, (_, i) => P(i * 5, 0))
    expect(rdp(line, 1)).toHaveLength(2)
    const corner = [...Array.from({ length: 10 }, (_, i) => P(i * 5, 0)), ...Array.from({ length: 10 }, (_, i) => P(45, (i + 1) * 5))]
    const out = rdp(corner, 1)
    expect(out.length).toBeGreaterThanOrEqual(3)
    // corner point survives
    expect(out.some((p) => p.x === 45 && p.y === 0)).toBe(true)
  })

  it('pathLength', () => {
    expect(pathLength([P(0, 0), P(3, 4)])).toBeCloseTo(5)
  })
})

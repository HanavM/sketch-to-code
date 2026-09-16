import { describe, expect, it } from 'vitest'
import { BRIDGE_MAX_MS, BRIDGE_MAX_PX, BRIDGE_MIN_SPAN, pathD, shouldBridge, strokeDiagonal } from '../src/stroke-capture.js'

const pt = (x: number, y: number, t: number) => ({ x, y, t })

describe('strokeDiagonal', () => {
  it('is zero for a single point', () => {
    expect(strokeDiagonal([pt(5, 5, 0)])).toBe(0)
  })

  it('is the bbox diagonal, not the path length', () => {
    // a right-angle path: 30 across, 40 down — diagonal is the 3-4-5 hypotenuse
    const d = strokeDiagonal([pt(0, 0, 0), pt(30, 0, 1), pt(30, 40, 2)])
    expect(d).toBeCloseTo(50, 5)
  })
})

describe('shouldBridge — the trackpad-hop gate', () => {
  const end = pt(100, 100, 1000)

  it('bridges a quick, precise re-press after a gesture-sized stroke', () => {
    expect(shouldBridge(end, true, pt(102, 101, 1000 + BRIDGE_MAX_MS))).toBe(true)
  })

  it('refuses when the interrupted stroke was letter-sized, not gesture-sized', () => {
    expect(shouldBridge(end, false, pt(100, 100, 1000 + 10))).toBe(false)
  })

  it('refuses once the gap exceeds BRIDGE_MAX_MS — a deliberate new stroke, not a hop', () => {
    expect(shouldBridge(end, true, pt(100, 100, 1000 + BRIDGE_MAX_MS + 1))).toBe(false)
  })

  it('refuses once the landing point exceeds BRIDGE_MAX_PX — handwriting jumps further than this', () => {
    const p = pt(100 + BRIDGE_MAX_PX + 1, 100, 1000 + 10)
    expect(shouldBridge(end, true, p)).toBe(false)
  })

  it('refuses with no prior stroke to bridge from', () => {
    expect(shouldBridge(null, true, pt(100, 100, 1000))).toBe(false)
  })

  it('is exact at the boundary (<=), not just under it', () => {
    const p = pt(100 + BRIDGE_MAX_PX, 100, 1000 + BRIDGE_MAX_MS)
    expect(shouldBridge(end, true, p)).toBe(true)
  })
})

describe('pathD', () => {
  it('renders a single point as a bare moveto', () => {
    expect(pathD([pt(1, 2, 0)])).toBe('M1.0 2.0')
  })

  it('renders two points as a straight line — no curve possible yet', () => {
    expect(pathD([pt(0, 0, 0), pt(10, 0, 1)])).toBe('M0.0 0.0L10.0 0.0')
  })

  it('starts and ends exactly on the drawn endpoints once smoothed', () => {
    const points = [pt(0, 0, 0), pt(10, 4, 1), pt(20, -3, 2), pt(30, 0, 3)]
    const d = pathD(points)
    expect(d.startsWith('M0.0 0.0')).toBe(true)
    expect(d.endsWith('L30.0 0.0')).toBe(true)
  })

  it('smooths interior points through quadratic curves, not straight segments', () => {
    const d = pathD([pt(0, 0, 0), pt(10, 10, 1), pt(20, 0, 2)])
    expect(d).toContain('Q')
  })
})

describe('BRIDGE_MIN_SPAN matches @s2c/ink small-vs-letter cutoff', () => {
  it('is 72, the same bbox-diagonal threshold features.ts uses', () => {
    expect(BRIDGE_MIN_SPAN).toBe(72)
  })
})

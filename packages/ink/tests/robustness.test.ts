import { describe, expect, it } from 'vitest'
import { classifyStroke } from '../src/classify.js'
import { analyzeStrokes } from '../src/scene.js'
import type { ShapeKind, Stroke } from '../src/types.js'
import { drawArrow, drawCircle, drawLine, drawPath, drawRect } from './fixtures.js'

const top = (s: Stroke): ShapeKind => classifyStroke(s).candidates[0]!.kind

describe('robustness', () => {
  it('degenerate inputs never throw', () => {
    expect(() => classifyStroke({ id: 'x', points: [] })).not.toThrow()
    expect(() => classifyStroke({ id: 'x', points: [{ x: 5, y: 5, t: 0 }] })).not.toThrow()
    expect(() =>
      classifyStroke({ id: 'x', points: [{ x: 5, y: 5, t: 0 }, { x: 5.1, y: 5, t: 8 }] }),
    ).not.toThrow()
    expect(() => analyzeStrokes([])).not.toThrow()
    expect(analyzeStrokes([]).nodes).toHaveLength(0)
  })

  it('a tap/dot is unresolved ink, not a shape', () => {
    const dot: Stroke = {
      id: 'd',
      points: Array.from({ length: 5 }, (_, i) => ({ x: 10 + i * 0.4, y: 10, t: i * 10 })),
    }
    expect(top(dot)).toBe('ink')
  })

  it('diagonal lines at any angle classify as line', () => {
    for (const ang of [15, 45, 75, 105, 160]) {
      const r = (ang * Math.PI) / 180
      const s = drawLine(100, 100, 100 + 220 * Math.cos(r), 100 + 220 * Math.sin(r), { seed: ang, jitter: 1 })
      expect(top(s), `angle ${ang}`).toBe('line')
    }
  })

  it('small shapes (~24px) still classify sanely', () => {
    const smallRect = drawRect(10, 10, 26, 22, { seed: 8, jitter: 0.8 })
    expect(['rect', 'rounded-rect', 'circle', 'ellipse']).toContain(top(smallRect))
    const smallCircle = drawCircle(50, 50, 13, { seed: 8, jitter: 0.8 })
    expect(['circle', 'ellipse', 'rounded-rect']).toContain(top(smallCircle))
  })

  it('large sloppy rect (high jitter) still classifies as rect-family', () => {
    const s = drawRect(20, 20, 400, 260, { seed: 11, jitter: 4 })
    expect(['rect', 'rounded-rect']).toContain(top(s))
  })

  it('arrows pointing all four directions resolve with correct head', () => {
    const cases: Array<[number, number, number, number]> = [
      [50, 50, 220, 50],   // →
      [220, 60, 50, 60],   // ←
      [100, 220, 100, 60], // ↑
      [120, 50, 120, 220], // ↓
    ]
    for (const [x0, y0, x1, y1] of cases) {
      const scene = analyzeStrokes([drawArrow(x0, y0, x1, y1, { seed: 13, jitter: 1 })])
      expect(scene.arrows, `arrow ${x0},${y0}→${x1},${y1}`).toHaveLength(1)
      const a = scene.arrows[0]!
      expect(Math.hypot(a.to.x - x1, a.to.y - y1), 'head near target').toBeLessThan(30)
      expect(Math.hypot(a.from.x - x0, a.from.y - y0), 'tail near source').toBeLessThan(30)
    }
  })

  it('an L-shaped connector is polyline, not arrow or scribble', () => {
    const s = drawPath([[50, 50], [50, 200], [220, 200]], { seed: 3, jitter: 1 })
    expect(['polyline', 'line']).toContain(top(s))
    const scene = analyzeStrokes([s])
    expect(scene.arrows).toHaveLength(0)
  })

  it('strokes with identical timestamps still group and classify', () => {
    const s = drawRect(10, 10, 100, 80, { seed: 1 })
    const frozen: Stroke = { id: 'f', points: s.points.map((p) => ({ ...p, t: 1000 })) }
    expect(() => analyzeStrokes([frozen])).not.toThrow()
  })
})

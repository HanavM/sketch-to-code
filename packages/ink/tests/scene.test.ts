import { describe, expect, it } from 'vitest'
import { encodePng } from '../src/png.js'
import { renderScene } from '../src/render.js'
import { analyzeStrokes } from '../src/scene.js'
import {
  drawArrow, drawArrowTwoStroke, drawCircle, drawHandwriting, drawLine, drawRect,
} from './fixtures.js'

describe('grouping', () => {
  it('strokes drawn far apart in time/space form separate groups', () => {
    const r1 = drawRect(10, 10, 100, 60, { seed: 1, t0: 0 })
    const lastT = r1.points[r1.points.length - 1]!.t
    const r2 = drawRect(400, 300, 100, 60, { seed: 2, t0: lastT + 5000 })
    const scene = analyzeStrokes([r1, r2])
    expect(scene.groups).toHaveLength(2)
    expect(scene.nodes).toHaveLength(2)
  })

  it('handwriting strokes drawn together stay in one group → one TextRegion', () => {
    const strokes = drawHandwriting(50, 50, { seed: 7, glyphs: 5 })
    const scene = analyzeStrokes(strokes)
    expect(scene.textRegions).toHaveLength(1)
    expect(scene.textRegions[0]!.strokeIds).toHaveLength(strokes.length)
    // handwriting must NOT leak into shape nodes
    expect(scene.nodes).toHaveLength(0)
  })
})

describe('arrows in scenes', () => {
  it('single-stroke arrow detected with correct direction', () => {
    const a = drawArrow(50, 50, 250, 60, { seed: 3, jitter: 1 })
    const scene = analyzeStrokes([a])
    expect(scene.arrows).toHaveLength(1)
    const arrow = scene.arrows[0]!
    // head is at the (250,60) end
    expect(arrow.to.x).toBeGreaterThan(200)
    expect(arrow.from.x).toBeLessThan(100)
  })

  it('two-stroke arrow detected with correct direction', () => {
    const [shaft, head] = drawArrowTwoStroke(50, 200, 250, 200, { seed: 4, jitter: 1 })
    const scene = analyzeStrokes([shaft, head])
    expect(scene.arrows).toHaveLength(1)
    const arrow = scene.arrows[0]!
    expect(arrow.to.x).toBeGreaterThan(200)
    expect(arrow.from.x).toBeLessThan(100)
  })

  it('a plain rectangle is not an arrow', () => {
    const scene = analyzeStrokes([drawRect(10, 10, 100, 60, { seed: 1 })])
    expect(scene.arrows).toHaveLength(0)
  })

  it('a plain line is not an arrow', () => {
    const scene = analyzeStrokes([drawLine(10, 10, 200, 20, { seed: 1 })])
    expect(scene.arrows).toHaveLength(0)
  })
})

describe('mixed scene', () => {
  it('rect + circle + arrow + handwriting all resolve', () => {
    const rect = drawRect(50, 50, 150, 90, { seed: 1, t0: 0 })
    let t = rect.points[rect.points.length - 1]!.t + 3000
    const circle = drawCircle(400, 100, 45, { seed: 2, t0: t })
    t = circle.points[circle.points.length - 1]!.t + 3000
    const arrow = drawArrow(210, 95, 350, 100, { seed: 3, t0: t })
    t = arrow.points[arrow.points.length - 1]!.t + 3000
    const hw = drawHandwriting(60, 200, { seed: 4, glyphs: 5, t0: t })

    const scene = analyzeStrokes([rect, circle, arrow, ...hw])
    expect(scene.textRegions).toHaveLength(1)
    expect(scene.arrows).toHaveLength(1)
    const kinds = scene.nodes.map((n) => n.kind)
    expect(kinds).toContain('arrow')
    expect(kinds.some((k) => k === 'rect' || k === 'rounded-rect')).toBe(true)
    expect(kinds.some((k) => k === 'circle' || k === 'ellipse')).toBe(true)
  })
})

describe('mixed groups', () => {
  it('circle + handwriting drawn in one breath split into shape + text', () => {
    const circle = drawCircle(150, 150, 60, { seed: 11, t0: 0 })
    let t = circle.points[circle.points.length - 1]!.t + 200 // fast, same group
    const hw = drawHandwriting(230, 130, { seed: 12, glyphs: 4, glyphH: 16, t0: t })
    const scene = analyzeStrokes([circle, ...hw])
    expect(scene.textRegions).toHaveLength(1)
    expect(scene.textRegions[0]!.strokeIds).toHaveLength(hw.length)
    const kinds = scene.nodes.map((n) => n.kind)
    expect(kinds.some((k) => k === 'circle' || k === 'ellipse')).toBe(true)
  })
})

describe('render + png', () => {
  it('renders a labeled scene and encodes a valid PNG', () => {
    const rect = drawRect(50, 50, 150, 90, { seed: 1 })
    const scene = analyzeStrokes([rect])
    const raster = renderScene(scene, { labels: true })
    expect(raster.width).toBeGreaterThan(50)
    expect(raster.height).toBeGreaterThan(50)
    // some ink pixels are dark
    let darkCount = 0
    for (let i = 0; i < raster.data.length; i += 4) {
      if (raster.data[i]! < 100) darkCount++
    }
    expect(darkCount).toBeGreaterThan(100)
    const png = encodePng(raster)
    // PNG magic
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(png.length).toBeGreaterThan(100)
  })
})

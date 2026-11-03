import { describe, expect, it } from 'vitest'
import { shapeOf } from '../src/shapemark.js'
import { polygonOutline, softenGentle, outlineMark } from '../src/outline.js'
import { pageRingsOutlined, pageRingThickness } from '../src/hollowring.js'

const P = (w: number[][]) => w.map(([x, y]) => ({ x: x!, y: y! }))
// round 47 c2, as drawn
const fish = P([[230, 428], [258, 395], [325, 380], [392, 395], [420, 428], [460, 388], [460, 468], [420, 428], [392, 461], [325, 476], [258, 461], [230, 428]])
const bubble = P([[1114, 380], [1131, 387], [1138, 404], [1131, 421], [1114, 428], [1097, 421], [1090, 404], [1097, 387], [1114, 380]])
const ring = (cx: number, cy: number, r: number, n = 12) => P(Array.from({ length: n + 1 }, (_, i) => [Math.round(cx + r * Math.cos(i / n * 2 * Math.PI)), Math.round(cy + r * Math.sin(i / n * 2 * Math.PI))]))

describe('n224: a figure drawn in one stroke keeps its outline', () => {
  it('a fish body and tail is an outline, not a box', () => {
    expect(shapeOf(fish)).toBeNull()
    const m = outlineMark('s', fish)
    expect(m?.outline?.points.length).toBeGreaterThan(12)
    expect(m?.box).toMatchObject({ x: 230, w: 230 })
  })
  it('the tail tips and the waist stay exactly where drawn', () => {
    const pts = polygonOutline(fish)!.points
    for (const [x, y] of [[460, 388], [460, 468], [420, 428]]) expect(pts).toContainEqual({ x, y })
  })
  it('the back is rounded off, not facets', () => {
    expect(polygonOutline(fish)!.points).not.toContainEqual({ x: 325, y: 380 })
  })
  it('softening a polygon with only gentle corners gives it more points', () => {
    expect(softenGentle(ring(0, 0, 100, 12).slice(0, -1)).length).toBe(48)
  })
  it('a star is an outline', () => {
    const star = P(Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? 40 : 100; const a = (i / 10) * 2 * Math.PI; return [Math.round(200 + r * Math.sin(a)), Math.round(200 - r * Math.cos(a))] }))
    expect(polygonOutline(star)).not.toBeNull()
  })
  it('a soft bumpy blob never takes the many-corners path', () => {
    const blob = P(Array.from({ length: 73 }, (_, i) => { const a = (i % 72) / 72 * 2 * Math.PI, r = 200 + 18 * Math.sin(6 * a); return [Math.round(400 + r * Math.cos(a)), Math.round(400 + r * Math.sin(a))] }))
    expect(polygonOutline(blob)?.corners ?? 0).toBeLessThanOrEqual(8)
  })
  it('a scribble going over itself is no outline', () => {
    const w: number[][] = []
    for (let k = 0; k < 8; k++) w.push([100 + k * 3, 100], [200 - k * 2, 150], [100 + k, 200], [200, 100 + k * 3])
    w.push([100, 100])
    expect(polygonOutline(P(w))).toBeNull()
  })
})

describe('n224: a ring drawn in eight moves is a ring', () => {
  it('not a turned square', () => {
    const m = shapeOf(bubble)
    expect(m?.shape).toBe('ellipse')
    expect(m?.tilt).toBeUndefined()
  })
  it('a square really turned stays a turned box', () => {
    const c = 200, r = 60, a = 15 * Math.PI / 180
    const corner = (k: number) => [c + r * Math.cos(a + k * Math.PI / 2), c + r * Math.sin(a + k * Math.PI / 2)]
    expect(shapeOf(P([corner(0), corner(1), corner(2), corner(3), corner(0)]))?.tilt).toBeTruthy()
  })
})

describe('n224: a note on the page saying the round things are outlines', () => {
  it('reads the round things', () => {
    expect(pageRingsOutlined(['Deep Blue bold', 'small outline bubbles'])).toBe(true)
    expect(pageRingsOutlined(['hollow rings'])).toBe(true)
    expect(pageRingsOutlined(['outlined buttons', 'small bubbles', 'green dots'])).toBe(false)
  })
  it('only up to 120px', () => {
    expect(pageRingThickness({ w: 33, h: 33 })).toBe(2)
    expect(pageRingThickness({ w: 200, h: 200 })).toBeNull()
  })
})

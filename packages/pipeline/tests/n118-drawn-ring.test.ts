import { describe, expect, it } from 'vitest'
import { drawnRings, drawnRingBrief, verifyDrawnRings } from '../src/drawnring.js'

// walk waypoints at ~6px, like the hand
const walk = (way: number[][]) => {
  const pts: { x: number; y: number }[] = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) pts.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n })
  }
  pts.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]! })
  return pts
}
// round 38 e3 budget, as drawn in n108: four arcs, four pen colours
const budget = [
  { id: 'o', color: '#f97316', points: walk([[270, 275], [303, 279], [333, 291], [350, 320], [360, 370], [362, 420], [357, 513]]) },
  { id: 't', color: '#0d9488', points: walk([[357, 513], [330, 531], [300, 542], [250, 545], [200, 530], [159, 487]]) },
  { id: 'i', color: '#6366f1', points: walk([[159, 487], [144, 458], [136, 426], [140, 380], [159, 333]]) },
  { id: 'g', color: '#e7e5e4', points: walk([[159, 333], [181, 309], [208, 290], [240, 278], [270, 275]]) },
]
const n = (x: number, y: number, w: number, h: number, text = '') => ({ rect: { x, y, w, h }, text })

describe('n118 a ring drawn in coloured arcs is that chart', () => {
  it('reads the four arcs as one ring with its segments in drawn order from the top', () => {
    const [g] = drawnRings(budget)
    expect(g).toBeTruthy()
    expect(g!.segments.map((s) => s.colour)).toEqual(['#f97316', '#0d9488', '#6366f1', '#e7e5e4'])
    expect(g!.segments[0]!.startDeg).toBeLessThan(20)
    expect(g!.segments[0]!.share).toBeGreaterThan(28)
    expect(g!.d).toBeGreaterThan(220)
    expect(g!.d).toBeLessThan(260)
  })
  it('a counter-clockwise ring gives the same clockwise order', () => {
    const rev = budget.slice().reverse().map((s) => ({ ...s, points: s.points.slice().reverse() }))
    const [g] = drawnRings(rev)
    expect(g!.segments.map((s) => s.colour)).toEqual(['#f97316', '#0d9488', '#6366f1', '#e7e5e4'])
    expect(g!.segments[0]!.startDeg).toBeLessThan(20)
  })
  it('straight coloured lines, one-colour rings and open chains are not charts', () => {
    const lines = ['#f97316', '#0d9488', '#dc2626'].map((c, k) => ({ id: `l${k}`, color: c, points: walk([[594, 231 + 70 * k], [1186, 231 + 70 * k]]) }))
    expect(drawnRings(lines)).toEqual([])
    expect(drawnRings(budget.map((s) => ({ ...s, color: '#f97316' })))).toEqual([])
    expect(drawnRings(budget.slice(0, 3))).toEqual([])
    expect(drawnRings(budget.map((s) => ({ ...s, color: undefined })))).toEqual([])
  })
  it('tells the build the size, centre and segments', () => {
    const s = drawnRingBrief(budget)
    expect(s).toContain('DRAWN CHARTS')
    expect(s).toContain('#f97316 about')
    expect(s).toMatch(/round x=2\d\d, y=4\d\d/)
  })
  it('passes a chart at the drawn place and names one built big and low (n116)', () => {
    const [g] = drawnRings(budget)
    const half = g!.d / 2
    expect(verifyDrawnRings(budget, { nodes: [n(g!.cx - half, g!.cy - half + 5, g!.d, g!.d)] }).satisfied).toBe(true)
    const v = verifyDrawnRings(budget, { nodes: [n(136, 324, 259, 260)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('low')
  })
})

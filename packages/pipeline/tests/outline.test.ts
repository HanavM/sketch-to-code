import { describe, expect, it } from 'vitest'
import { shapeOf } from '../src/shapemark.js'
import { outlineMark, polygonOutline, outlineBrief, verifyOutlines, clipOf, polyIoU } from '../src/outline.js'
import { fadeVerdict, gradientOf } from '../src/inkcolour.js'
import { splitRegions } from '@s2c/ink'
// @ts-expect-error — plain .mjs bench module, no types
import { walk, jitter } from '../../../tests/bench/lib/draw.mjs'

type P = { x: number; y: number }
const hand = (wp: number[][], seed = 1): P[] => jitter(walk(wp.map(([x, y]) => ({ x, y })), 6), 0.9, seed)

// round 33 c5 cabin stays (n49): the two mountains, as drawn
const LEFT = [[2, 898], [2, 832], [320, 470], [700, 898], [4, 898]]
const RIGHT = [[420, 898], [948, 540], [1278, 815], [1278, 898], [422, 898]]
// round 2 c3 glass blobs: a smooth closed blob (a glow), never a polygon
const BLOB = [[330, 80], [460, 110], [540, 220], [530, 380], [420, 500], [280, 510], [160, 420], [120, 280], [180, 140], [330, 80]]

const node = (id: string, tag: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}) =>
  ({ id, tag, rect, style, text: '', parent: null })

describe('n51: a shape drawn as its outline is built as that outline', () => {
  it('reads both mountains as outlines (not boxes or rings) and keeps their peaks', () => {
    for (const [wp, seed] of [[LEFT, 1], [RIGHT, 2]] as const) {
      const pts = hand(wp as unknown as number[][], seed)
      expect(shapeOf(pts)).toBeNull()
      const o = polygonOutline(pts)
      expect(o).not.toBeNull()
      expect(o!.corners).toBeGreaterThanOrEqual(3)
      expect(o!.corners).toBeLessThanOrEqual(5)
    }
    const m = outlineMark('L', hand(LEFT))!
    expect(m.shape).toBe('box')
    expect(Math.abs(m.box.y - 470)).toBeLessThan(6)
    expect(m.outline!.points.some((p) => Math.abs(p.x - 320) < 8 && Math.abs(p.y - 470) < 8)).toBe(true)
  })
  it('a smooth blob is no outline shape (glows keep their soft look)', () => {
    expect(polygonOutline(hand(BLOB))).toBeNull()
  })
  it('a wave across a panel is the side it cuts off', () => {
    const panel = { id: 'panel', points: walk([[2, 2], [640, 2], [640, 898], [2, 898], [2, 4]].map(([x, y]) => ({ x, y })), 6) }
    const wave = { id: 'wave', points: walk([[2, 700], [60, 640], [200, 585], [380, 560], [500, 580], [590, 650], [638, 760]].map(([x, y]) => ({ x, y })), 6) }
    const cut = splitRegions([panel, wave] as never)[0]!
    const m = outlineMark('wave', wave.points, cut)!
    expect(m.outline!.cut).toEqual({ holder: 'panel' })
    expect(outlineBrief([{ shapeMarks: [m] }])).toMatch(/clip-path: polygon\(/)
  })
  it('the brief gives the exact clip-path and the tapped colour', () => {
    const m = outlineMark('L', hand(LEFT))!
    m.outline!.fill = { colors: ['#312e81'], css: '#312e81' }
    const b = outlineBrief([{ shapeMarks: [m] }])
    expect(b).toContain('SHAPES DRAWN AS OUTLINES')
    expect(b).toContain(clipOf(m))
    expect(b).toContain('background #312e81')
    expect(b).toMatch(/triangle|closed outline/)
  })
  it('checks the page: a box in its place fails, the clipped shape passes', () => {
    const m = outlineMark('L', hand(LEFT))!
    const box = node('a', 'div', { ...m.box })
    const bad = verifyOutlines([m], { nodes: [box] })
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/plain <div> box/)
    const good = verifyOutlines([m], { nodes: [node('b', 'div', { ...m.box }, { clipPath: clipOf(m) })] })
    expect(good.satisfied).toBe(true)
    // a rough triangle in percent still covers it
    const pct = verifyOutlines([m], { nodes: [node('c', 'div', { ...m.box }, { clipPath: 'polygon(0% 100%, 45% 0%, 100% 100%)' })] })
    expect(pct.satisfied).toBe(true)
    // an upside-down triangle does not
    const flip = verifyOutlines([m], { nodes: [node('d', 'div', { ...m.box }, { clipPath: 'polygon(0% 0%, 100% 0%, 45% 100%)' })] })
    expect(flip.satisfied).toBe(false)
  })
  it('IoU of a polygon with itself is 1', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    expect(polyIoU(sq, sq)).toBeGreaterThan(0.99)
  })
})

describe('n51: a fade from taps runs the way it was tapped', () => {
  const fade = { colors: ['#38bdf8', '#1580bd'], angle: 187 }
  it('reads computed gradients', () => {
    expect(gradientOf('linear-gradient(rgb(56, 189, 248), rgb(21, 128, 189))')!.angle).toBe(180)
    expect(gradientOf('linear-gradient(to top, rgb(56, 189, 248), rgb(21, 128, 189))')!.angle).toBe(0)
    expect(gradientOf('linear-gradient(187deg, rgb(56, 189, 248), rgb(21, 128, 189))')!.stops).toHaveLength(2)
  })
  it('passes the right fade, fails the same fade the wrong way round', () => {
    const r = { x: 0, y: 0, w: 640, h: 900 }
    expect(fadeVerdict(fade, [node('a', 'div', r, { backgroundImage: 'linear-gradient(187deg, rgb(56, 189, 248), rgb(21, 128, 189))' })] as never).ok).toBe(true)
    expect(fadeVerdict(fade, [node('a', 'div', r, { backgroundImage: 'linear-gradient(rgb(21, 128, 189), rgb(56, 189, 248))' })] as never).ok).toBe(false)
    expect(fadeVerdict(fade, [node('a', 'div', r, { backgroundImage: 'linear-gradient(to top, rgb(56, 189, 248), rgb(21, 128, 189))' })] as never).ok).toBe(false)
    expect(fadeVerdict(fade, [node('a', 'div', r, { backgroundColor: 'rgb(56, 189, 248)' })] as never).ok).toBe(false)
  })
})

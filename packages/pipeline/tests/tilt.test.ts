import { describe, expect, it } from 'vitest'
import { shapeOf, tiltOf, verifyShapeMarks, type ShapeMark } from '../src/shapemark.js'
import { tiltBrief, verifyTilts, angleOf } from '../src/tilt.js'
// @ts-expect-error — plain .mjs bench module, no types
import { walk, jitter } from '../../../tests/bench/lib/draw.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import { rbox, rring } from '../../../tests/bench/lib/rough.mjs'

type P = { x: number; y: number }
const hand = (wp: number[][], seed = 1): P[] => jitter(walk(wp.map(([x, y]) => ({ x, y })), 6), 0.9, seed)

// round 31 c3 (n27): the three cards of a fanned stack, as drawn by hand
const NAVY = [[708, 192], [1045, 150], [1070, 370], [735, 410], [708, 192]]
const BLUE = [[790, 300], [1126, 322], [1115, 518], [775, 515], [790, 300]]
const PINK = [[836, 466], [1172, 452], [1184, 672], [845, 688], [836, 466]]

describe('n31: a box drawn turned keeps its angle', () => {
  it('reads each card of the fanned stack as a box turned the way it was drawn', () => {
    const page = [hand(NAVY, 3), hand(BLUE, 4), hand(PINK, 5)]
    const [navy, blue, pink] = page.map((p) => shapeOf(p, page)!) as [ShapeMark, ShapeMark, ShapeMark]
    for (const m of [navy, blue, pink]) expect(m.shape).toBe('box')
    expect(navy.tilt!.deg).toBeLessThan(-5)
    expect(navy.tilt!.deg).toBeGreaterThan(-9)
    expect(blue.tilt!.deg).toBeGreaterThan(2)
    expect(pink.tilt!.deg).toBeLessThan(-1.5)
    expect(pink.tilt!.weak).toBeUndefined()
    // the same slight angle on its own is a box drawn askew: upright
    expect(shapeOf(page[2]!)!.tilt).toBeUndefined()
    // its own size, not the space it takes
    expect(Math.abs(navy.tilt!.w - 340)).toBeLessThan(12)
    expect(navy.box.w).toBeGreaterThan(navy.tilt!.w)
  })

  it('leaves upright boxes upright and rings rings', () => {
    expect(shapeOf(hand([[76, 560], [255, 560], [255, 616], [76, 616], [76, 560]]))!.tilt).toBeUndefined()
    for (const s of [1, 2, 3]) {
      const b = shapeOf(rbox(0, 0, 300, 120, { seed: s }))
      expect(b?.shape).toBe('box')
      expect(b?.tilt, `rbox ${s}`).toBeUndefined()
    }
    for (const s of [1, 2, 3]) expect(shapeOf(rring(200, 200, 80, 80, { seed: s }))?.shape, `rring ${s}`).toBe('ellipse')
    expect(tiltOf(hand([[100, 100], [400, 100], [400, 300], [100, 300], [100, 100]]))).toBeNull()
    for (const s of [1, 2, 3]) expect(shapeOf(rbox(0, 0, 300, 120, { seed: s }), [])?.tilt, `rbox alone ${s}`).toBeUndefined()
  })

  it('tells codegen the angle and checks it on the page', () => {
    const navy: ShapeMark = { strokeId: 's1', ...shapeOf(hand(NAVY, 3))! }
    expect(tiltBrief([{ shapeMarks: [navy] }])).toMatch(/rotate\(-\d/)
    const t = navy.tilt!
    const rect = { ...navy.box }
    const turned = (deg: number) => {
      const r = deg * Math.PI / 180
      return `matrix(${Math.cos(r)}, ${Math.sin(r)}, ${-Math.sin(r)}, ${Math.cos(r)}, 0, 0)`
    }
    expect(Math.round(angleOf(turned(-7)))).toBe(-7)
    const ok = verifyTilts([navy], { nodes: [{ id: 'a', tag: 'div', rect, style: { transform: turned(t.deg) } }] })
    expect(ok.satisfied).toBe(true)
    const flat = verifyTilts([navy], { nodes: [{ id: 'a', tag: 'div', rect, style: {} }] })
    expect(flat.satisfied).toBe(false)
    const wrong = verifyTilts([navy], { nodes: [{ id: 'a', tag: 'div', rect, style: { transform: turned(-t.deg) } }] })
    expect(wrong.satisfied).toBe(false)
    expect(wrong.reason).toMatch(/right side higher/)
  })
})

describe('n31: boxes drawn side by side keep their gap', () => {
  const mk = (id: string, x: number, w: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y: 128, w, h: 420 } })
  const marks = [mk('a', 64, 300), mk('b', 392, 420), mk('c', 840, 340)]
  const node = (id: string, x: number, w: number) => ({ id, tag: 'div', rect: { x, y: 118, w, h: 440 } })
  it('frames built touching are a miss naming the gap; frames built apart pass', () => {
    const touching = verifyShapeMarks(marks, { nodes: [] }, { nodes: [node('1', 54, 338), node('2', 392, 440), node('3', 832, 360)] })
    expect(touching.satisfied).toBe(false)
    expect(touching.reason).toMatch(/28px apart; built, they touch/)
    const apart = verifyShapeMarks(marks, { nodes: [] }, { nodes: [node('1', 64, 300), node('2', 392, 420), node('3', 840, 340)].map((n) => ({ ...n, rect: { ...n.rect, y: 128, h: 420 } })) })
    expect(apart.satisfied).toBe(true)
  })
})

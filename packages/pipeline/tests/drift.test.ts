import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { verifyPageDrift } from '../src/drift.js'

let id = 0
const node = (x: number, y: number, w: number, h: number, text = ''): DomNode => ({
  id: `n${id++}`, tag: 'div', srcLoc: 'src/App.tsx:1:1', rect: { x, y, w, h }, text, classes: [`c${id}`],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: 'normal', padding: '0px',
    margin: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px',
  },
  parent: null, depth: 1,
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 800, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false })

// round 7 e1 kanban, drawn regions from the run record (n98)
const drawn = [
  { x: 4, y: 3, w: 1273, h: 50 }, // top bar
  { x: 28, y: 75, w: 282, h: 9 }, // column heads (text lines)
  { x: 342, y: 75, w: 282, h: 8 },
  { x: 28, y: 111, w: 1224, h: 9 }, // lane rule + label
  { x: 27, y: 135, w: 283, h: 70 }, // cards
  { x: 28, y: 243, w: 283, h: 70 },
  { x: 342, y: 135, w: 282, h: 74 },
  { x: 28, y: 470, w: 1224, h: 9 },
]
const placed = drawn.map((region, index) => ({ index, region }))

describe('verifyPageDrift', () => {
  it('names blocks built lower down the page (round 7 e1: heads +13, rule +17, cards +41)', () => {
    const built = [
      node(0, 0, 1280, 56),
      node(28, 76, 290, 20, 'To do'), node(342, 76, 290, 20, 'In progress'),
      node(28, 120, 1224, 24),
      node(28, 176, 290, 76), node(28, 284, 290, 76), node(342, 176, 290, 81),
      node(28, 512, 1224, 24),
    ]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/sit lower than drawn/)
    expect(v.reason).toMatch(/action 4 top at 176px, drawn at 135px \(41px low\)/)
    expect(v.offsets.find((o) => o.index === 0)!.dy).toBe(-3)
  })

  it('passes a build whose blocks land within 16px', () => {
    const built = [
      node(0, 0, 1280, 56),
      node(28, 70, 290, 20, 'To do'), node(342, 70, 290, 20, 'In progress'),
      node(28, 104, 1224, 24),
      node(28, 140, 290, 76), node(28, 246, 290, 76), node(342, 138, 290, 81),
      node(28, 466, 1224, 24),
    ]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeUndefined()
  })

  it('says nothing when blocks are off both ways (round 7 e4: likely mismatches, a repair ran out the clock)', () => {
    const built = [
      node(0, 0, 1280, 56),
      node(28, 100, 290, 20, 'To do'), node(342, 50, 290, 20, 'In progress'),
      node(28, 140, 1224, 24),
      node(28, 110, 290, 76), node(28, 270, 290, 76), node(342, 160, 290, 81),
      node(28, 440, 1224, 24),
    ]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBe(true)
  })

  it('says nothing for a small edit or when blocks cannot be matched', () => {
    expect(verifyPageDrift(snap([]), snap([]), placed.slice(0, 3)).unverifiable).toBe(true)
    const v = verifyPageDrift(snap([]), snap([node(600, 600, 40, 40)]), placed)
    expect(v.unverifiable).toBe(true)
  })
})

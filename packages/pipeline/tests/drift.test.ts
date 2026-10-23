import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { uniformShift, verifyPageDrift } from '../src/drift.js'

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
    expect(v.reason).toMatch(/never pull a block up with a negative margin/)
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
  it('matches a block by its quoted copy before its size (round 7 e4: size row matched a wrapper, drift unreported)', () => {
    const rows = [
      { region: { x: 734, y: 218, w: 158, h: 8 }, quote: '$189', built: node(734, 256, 70, 34, '$189') },
      { region: { x: 734, y: 273, w: 81, h: 8 }, quote: 'Colour: Indigo', built: node(734, 340, 100, 16, 'Colour: Indigo') },
      { region: { x: 734, y: 393, w: 483, h: 38 }, quote: 'XS', built: node(734, 484, 90, 44, 'XS') },
      { region: { x: 733, y: 521, w: 405, h: 52 }, quote: 'Add to bag', built: node(734, 608, 410, 54, 'Add to bag') },
      { region: { x: 734, y: 592, w: 142, h: 8 }, quote: '✓ Free delivery', built: node(734, 682, 160, 18, '✓ Free delivery by Oct 27') },
      { region: { x: 52, y: 119, w: 77, h: 77 }, quote: null, built: node(52, 124, 84, 84) },
    ]
    // wrappers sitting near the drawn tops, the size-only match's favourites
    const decoys = [node(734, 386, 482, 40), node(734, 214, 160, 12), node(734, 516, 405, 56)]
    const v = verifyPageDrift(snap([]), snap([...rows.map((r) => r.built), ...decoys]), rows.map((r, index) => ({ index, region: r.region, quote: r.quote })))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/lower than drawn/)
    expect(v.offsets.find((o) => o.index === 2)?.dy).toBe(91)
  })
  it('names a whole board shifted ~13px the same way, each block under 16px (round 7 e1 n112 run 1, 48%)', () => {
    const built = [
      node(0, 0, 1280, 56),
      node(28, 82, 290, 20, 'To do'), node(342, 82, 290, 20, 'In progress'),
      node(28, 117, 1224, 24),
      node(28, 149, 290, 76), node(28, 257, 290, 76), node(342, 148, 290, 81),
      node(28, 476, 1224, 24),
    ]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/sit about 1\dpx lower than drawn, the same way/)
    expect(v.reason).toMatch(/never use a negative margin/)
  })

  it('names the n113 board: heads +6, cards 8-11px low (likeness 72 vs 77 in place)', () => {
    const offs = [[3, 0], [79, 85], [79, 85], [80, 85], [79, 85], [115, 114], [135, 144], [243, 252], [135, 144], [255, 264],
      [135, 144], [136, 144], [203, 212], [482, 479], [501, 513], [501, 513], [621, 633], [501, 513], [501, 513]]
      .map(([drawn, built], index) => ({ index, drawn: drawn!, built: built!, dy: built! - drawn! }))
    expect(uniformShift(offs)).toMatch(/15 of 18 blocks below the top all sit about [89]px lower/)
    expect(uniformShift(offs.map((o) => ({ ...o, built: o.drawn + (o.index % 2 ? 7 : -2), dy: o.index % 2 ? 7 : -2 })))).toBeNull()
  })

  it('passes small same-way offsets under the shift median (a page built in place)', () => {
    const built = [
      node(0, 0, 1280, 56),
      node(28, 75, 290, 20, 'To do'), node(342, 75, 290, 20, 'In progress'),
      node(28, 103, 1224, 24),
      node(28, 144, 290, 76), node(28, 252, 290, 76), node(342, 141, 290, 81),
      node(28, 470, 1224, 24),
    ]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(true)
  })
})

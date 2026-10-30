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
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false })

// round 38 e3 budget (n119 try 4): header, heading, donut, legend, and a tall Categories panel on the right
const panel = { x: 552, y: 155, w: 664, h: 730 }
const regions = [
  { x: 56, y: 70, w: 70, h: 16 }, // logo line
  { x: 56, y: 165, w: 150, h: 22 }, // Spending
  { x: 135, y: 285, w: 205, h: 270 }, // donut box
  { x: 100, y: 690, w: 30, h: 80 }, // legend swatches
  panel,
]
const placed = regions.map((region, index) => ({ index, region }))

describe('n120: a big drawn panel lands at its drawn top', () => {
  it('fails a panel built ~145px low on a page with too few blocks for the whole-page check', () => {
    const built = [node(56, 72, 70, 16), node(56, 168, 150, 24), node(135, 290, 205, 268), node(100, 692, 30, 80), node(552, 300, 664, 700)]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(false)
    expect(v.unverifiable).toBeFalsy()
    expect(v.reason).toMatch(/action 4 \(a big drawn panel\) top at 300px, drawn at 155px \(145px low\)/)
  })
  it('passes the same panel built at its drawn top, and stays unverifiable on a small page with no big block off', () => {
    const built = [node(56, 72, 70, 16), node(56, 168, 150, 24), node(135, 290, 205, 268), node(100, 692, 30, 80), node(552, 160, 664, 720)]
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBe(true)
  })
  it('fails a lone big panel off even when the whole-page check would pass (1 of 8 blocks off)', () => {
    const more = [...regions, { x: 56, y: 200, w: 120, h: 12 }, { x: 600, y: 220, w: 300, h: 10 }, { x: 600, y: 300, w: 300, h: 10 }]
    const built = [node(56, 72, 70, 16), node(56, 168, 150, 24), node(135, 290, 205, 268), node(100, 692, 30, 80), node(552, 260, 664, 640),
      node(56, 200, 120, 12), node(600, 220, 300, 10), node(600, 300, 300, 10)]
    const v = verifyPageDrift(snap([]), snap(built), more.map((region, index) => ({ index, region })))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/big drawn panel\) top at 260px, drawn at 155px/)
  })
  it('lets a big panel within 32px pass, and never judges small or full-page blocks this way', () => {
    const built = [node(56, 72, 70, 16), node(56, 168, 150, 24), node(135, 290, 205, 268), node(100, 692, 30, 80), node(552, 180, 664, 700)]
    expect(verifyPageDrift(snap([]), snap(built), placed).satisfied).toBe(true)
    const backdrop = [{ index: 0, region: { x: 0, y: 0, w: 1280, h: 900 } }, { index: 1, region: { x: 56, y: 165, w: 150, h: 22 } }]
    expect(verifyPageDrift(snap([]), snap([node(0, 80, 1280, 900), node(56, 168, 150, 24)]), backdrop).satisfied).toBe(true)
  })
})

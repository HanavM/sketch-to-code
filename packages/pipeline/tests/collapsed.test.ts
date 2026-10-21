import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { describeCollapsed, findCollapsedFills } from '../src/collapsed.js'

let id = 0
const node = (srcLoc: string | null, w: number, h: number, bg = 'rgba(0, 0, 0, 0)', extra: Partial<DomNode['style']> = {}, text = ''): DomNode => ({
  id: `e${id++}`, tag: 'div', srcLoc, rect: { x: 0, y: 0, w, h }, text, classes: ['w-full', 'rounded-t-md'],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: 'normal', padding: '0px',
    margin: '0px', backgroundColor: bg, color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px', ...extra,
  },
  parent: null, depth: 0,
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false })

describe('findCollapsedFills', () => {
  it('flags gradient bars that rendered with 0 height (round-3 e5 chart)', () => {
    const bars = Array.from({ length: 8 }, () => node('src/App.tsx:68:19', 90, 0, 'rgba(0, 0, 0, 0)', { backgroundImage: 'linear-gradient(...)' }))
    const found = findCollapsedFills(snap([]), snap(bars))
    expect(found).toEqual([{ srcLoc: 'src/App.tsx:68:19', count: 8, axis: 'height', sample: 'w-full rounded-t-md' }])
    expect(describeCollapsed(found[0]!)).toMatch(/8 filled boxes render with 0 height.*explicit px height/)
  })

  it('flags a solid fill collapsed to 0 width', () => {
    expect(findCollapsedFills(snap([]), snap([node('src/P.tsx:3:5', 0, 8, 'rgb(99, 102, 241)')]))[0]?.axis).toBe('width')
  })

  it('ignores visible bars, unfilled empty boxes, hairlines, text and unstamped nodes', () => {
    const after = snap([
      node('a:1:1', 90, 120, 'rgb(99, 102, 241)'),
      node('a:2:1', 90, 0),
      node('a:3:1', 200, 1, 'rgb(226, 232, 240)'),
      node('a:4:1', 2, 0, 'rgb(0, 0, 0)'),
      node(null, 90, 0, 'rgb(0, 0, 0)'),
      node('a:5:1', 90, 0, 'rgb(0, 0, 0)', {}, 'label'),
    ])
    expect(findCollapsedFills(snap([]), after)).toEqual([])
  })

  it('does not blame this edit for collapses already on the page', () => {
    const old = node('a:9:1', 90, 0, 'rgb(0, 0, 0)')
    expect(findCollapsedFills(snap([old]), snap([old]))).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { describeCollapsed, findCollapsedFills, readsZero, rowText } from '../src/collapsed.js'

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

describe('n124: a bar its row shows as zero is empty on purpose', () => {
  let k = 0
  const at = (srcLoc: string | null, parent: string | null, x: number, y: number, w: number, h: number, text = '', bg = 'rgba(0, 0, 0, 0)'): DomNode => ({
    ...node(srcLoc, w, h, bg, {}, text), id: `z${k++}`, parent, rect: { x, y, w, h },
  })
  // the budget page: each category row is label + amount over a track holding a fill
  const row = (i: number, label: string, amount: string, fillW: number): DomNode[] => {
    const r = at('src/App.tsx:60:9', 'panel', 700, 200 + i * 60, 400, 40)
    const head = at('src/App.tsx:61:11', r.id, 700, 200 + i * 60, 400, 20)
    const l = at('src/App.tsx:62:13', head.id, 700, 200 + i * 60, 80, 20, label)
    const a = at('src/App.tsx:63:13', head.id, 1000, 200 + i * 60, 100, 20, amount)
    const track = at('src/App.tsx:65:11', r.id, 700, 228 + i * 60, 400, 8, '', 'rgb(231, 229, 228)')
    const fill = at('src/App.tsx:66:13', track.id, 700, 228 + i * 60, fillW, 8, '', 'rgb(249, 115, 22)')
    return [r, head, l, a, track, fill]
  }
  const panel = { ...at('src/App.tsx:50:7', null, 680, 150, 440, 400), id: 'panel' }

  it('reads zero amounts and not others', () => {
    for (const t of ['$0 of $300', 'Fun $0', '0%', '0 / 5', '0 of 12 done', '€0.00']) expect(readsZero(t), t).toBe(true)
    for (const t of ['$10 of $300', '$1,120 of $1,120', '100%', '$520 of $400', '2026', '10 / 5', '$0.50']) expect(readsZero(t), t).toBe(false)
  })

  it('does not flag the $0 bar of round 38 budget, still flags a real collapse', () => {
    const page = [panel, ...row(0, 'Travel', '$520 of $400', 400), ...row(1, 'Fun', '$0 of $300', 0), ...row(2, 'Savings', '$460 of $500', 0)]
    const excused: string[] = []
    const found = findCollapsedFills(snap([]), snap(page), excused)
    expect(found).toEqual([{ srcLoc: 'src/App.tsx:66:13', count: 1, axis: 'width', sample: 'w-full rounded-t-md' }])
    expect(excused).toHaveLength(1)
    expect(excused[0]).toMatch(/Fun \$0 of \$300|\$0 of \$300 Fun/)
    expect(rowText(snap(page), page.find((n) => n.parent && n.rect.w === 0 && n.rect.y === 288)!)).toMatch(/\$0 of \$300/)
  })

  it('a zero in a neighbouring row never excuses this bar (flat list, labels by position)', () => {
    // all labels and bars siblings in one panel: fall back to the line just above the bar
    const flat = [panel,
      at('src/App.tsx:70:9', 'panel', 700, 200, 80, 20, 'Fun $0 of $300'),
      at('src/App.tsx:71:9', 'panel', 700, 228, 0, 8, '', 'rgb(249, 115, 22)'),
      at('src/App.tsx:70:9', 'panel', 700, 260, 80, 20, 'Bills $150 of $180'),
      at('src/App.tsx:71:9', 'panel', 700, 288, 0, 8, '', 'rgb(249, 115, 22)'),
      ...Array.from({ length: 8 }, (_, i) => at('src/App.tsx:80:9', 'panel', 700, 400 + i * 10, 80, 10, `x${i}`)),
    ]
    const excused: string[] = []
    const found = findCollapsedFills(snap([]), snap(flat), excused)
    expect(excused).toHaveLength(1)
    expect(found[0]?.count).toBe(1)
  })
})

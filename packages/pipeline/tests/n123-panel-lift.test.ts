import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { liftPanel, planPanelLifts } from '../src/panellift.js'

let id = 0
const node = (rect: DomNode['rect'], srcLoc: string | null = null, text = '', style: Partial<DomNode['style']> = {}): DomNode => ({
  id: `n${id++}`, tag: text ? 'h2' : 'div', srcLoc, rect, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(28, 25, 23)', fontSize: '13px', fontWeight: '400', borderRadius: '0', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })

// round 38 e3 budget, n122 try 3: Categories drawn at y 152, built at 276 (124px low) in a grid row under a heading
// that sits in the left column only
const PANEL = { x: 554, y: 152, w: 650, h: 730 }
const placed = [
  { index: 0, region: { x: 40, y: 60, w: 120, h: 24 } },
  { index: 1, region: { x: 120, y: 280, w: 280, h: 280 } },
  { index: 2, region: PANEL },
  { index: 3, region: { x: 594, y: 231, w: 592, h: 300 } }, // the bar rows, inside the panel
]
const page = (panelY: number, extra: DomNode[] = [], style: Partial<DomNode['style']> = {}) => snap([
  node({ x: 0, y: 0, w: 1280, h: 1100 }, 'src/App.jsx:5:5'),
  node({ x: 40, y: 50, w: 120, h: 30 }, 'src/App.jsx:7:7', 'pocket'),
  node({ x: 40, y: 160, w: 400, h: 40 }, 'src/App.jsx:9:7', 'Spending'),
  node({ x: 40, y: 260, w: 1180, h: 760 }, 'src/App.jsx:11:7'), // the grid row: an ancestor of the panel
  node({ x: PANEL.x, y: panelY, w: PANEL.w, h: 720 }, 'src/App.jsx:14:9', '', style),
  node({ x: 594, y: panelY + 40, w: 592, h: 300 }, 'src/App.jsx:15:11'),
  ...extra,
])

describe('n123: a big drawn panel built far below its drawn top is moved there in code', () => {
  it('plans a lift by the measured pixels when the strip above it is clear', () => {
    const plan = planPanelLifts(page(276), placed)
    expect(plan.lifts).toEqual([{ index: 2, srcLoc: 'src/App.jsx:14:9', dy: 124, drawn: 152, built: 276 }])
    expect(plan.refused).toEqual([])
  })
  it('leaves a panel within tolerance, or built high, alone', () => {
    expect(planPanelLifts(page(170), placed).lifts).toEqual([])
    const high = planPanelLifts(page(100), placed)
    expect(high.lifts).toEqual([])
    expect(high.refused[0]?.reason).toMatch(/high/)
  })
  it('refuses when a heading sits in the strip it would move into', () => {
    const plan = planPanelLifts(page(276, [node({ x: 600, y: 200, w: 300, h: 30 }, 'src/App.jsx:12:9', 'Categories')]), placed)
    expect(plan.lifts).toEqual([])
    expect(plan.refused[0]?.reason).toMatch(/in the way.*Categories/)
  })
  it('refuses a panel already positioned or rendered more than once', () => {
    expect(planPanelLifts(page(276, [], { position: 'relative' }), placed).lifts).toEqual([])
    const twice = page(276, [node({ x: 10, y: 1050, w: 20, h: 20 }, 'src/App.jsx:14:9')])
    expect(planPanelLifts(twice, placed).refused[0]?.reason).toMatch(/more than once/)
  })
  it('writes position relative and the negative top on the element, merging an existing style', () => {
    const root = mkdtempSync(join(tmpdir(), 'n123-'))
    writeFileSync(join(root, 'App.jsx'), [
      'export default function App() {',
      '  return (',
      '    <main>',
      '      <section className="rounded-xl bg-white p-6">x</section>',
      '      <aside style={{ background: "#fff" }}>y</aside>',
      '    </main>',
      '  )',
      '}',
    ].join('\n'))
    const a = liftPanel(root, { index: 2, srcLoc: 'App.jsx:4:7', dy: 124, drawn: 152, built: 276 })
    expect(a.ok).toBe(true)
    expect(readFileSync(join(root, 'App.jsx'), 'utf8')).toContain(`<section style={{ position: 'relative', top: -124 }} className="rounded-xl bg-white p-6">`)
    const b = liftPanel(root, { index: 2, srcLoc: 'App.jsx:5:7', dy: 60, drawn: 100, built: 160 })
    expect(b.ok).toBe(true)
    expect(readFileSync(join(root, 'App.jsx'), 'utf8')).toContain(`<aside style={{ background: "#fff", position: 'relative', top: -60 }}>`)
  })
  it('refuses an element its classes already offset, or a component', () => {
    const root = mkdtempSync(join(tmpdir(), 'n123-'))
    writeFileSync(join(root, 'App.jsx'), 'const A = () => (\n  <div>\n    <div className="relative top-4">x</div>\n    <Card>y</Card>\n  </div>\n)\n')
    expect(liftPanel(root, { index: 0, srcLoc: 'App.jsx:3:5', dy: 50, drawn: 0, built: 50 }).ok).toBe(false)
    expect(liftPanel(root, { index: 0, srcLoc: 'App.jsx:4:5', dy: 50, drawn: 0, built: 50 }).ok).toBe(false)
  })
})

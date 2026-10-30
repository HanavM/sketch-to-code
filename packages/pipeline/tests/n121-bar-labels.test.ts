import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { barsOf, isBarInk, verifyBarLabels } from '../src/barlabels.js'
import { inkColoursBrief, verifyInkColours } from '../src/inkcolour.js'
import type { GroundedAction } from '../src/intent2.js'

let id = 0
const node = (rect: DomNode['rect'], style: Partial<DomNode['style']> = {}, text = ''): DomNode => ({
  id: `n${id++}`, tag: text ? 'span' : 'div', srcLoc: null, rect, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(28, 25, 23)', fontSize: '13px', fontWeight: '400', borderRadius: '0', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })

// round 38 e3 budget: bars drawn in the Categories panel as level lines in coloured pens, words in a list note
const LINES: Array<[string, string, number, number]> = [['s13', '#f97316', 137, 590], ['s14', '#0d9488', 172, 255], ['s15', '#dc2626', 206, 590], ['s16', '#f5f5f4', 241, 590]]
const act = (extra: Partial<GroundedAction> = {}): GroundedAction => ({
  kind: 'design', targets: [], instruction: 'Categories card', rejected: [],
  shapeMarks: LINES.map(([strokeId, , y, w]) => ({ strokeId, shape: 'line', box: { x: 594, y, w, h: 0 }, from: { x: 594, y }, to: { x: 594 + w, y } })),
  inkColours: LINES.map(([strokeId, color, y, w]) => ({ strokeId, mark: 'line', paint: 'text', color, box: { x: 594, y, w, h: 0 }, how: 'pen' })),
  ...extra,
} as unknown as GroundedAction)
const rgb = (h: string) => `rgb(${String(parseInt(h.slice(1, 3), 16))}, ${String(parseInt(h.slice(3, 5), 16))}, ${String(parseInt(h.slice(5, 7), 16))})`
const built = (labelColour: (c: string) => string) => snap(LINES.flatMap(([, c, y, w]) => [
  node({ x: 594, y: y - 3, w: 590, h: 6 }, { backgroundColor: 'rgb(245, 245, 244)' }),
  node({ x: 594, y: y - 3, w: w - 20, h: 6 }, { backgroundColor: rgb(c) }),
  node({ x: 594, y: y - 24, w: 40, h: 16 }, { color: labelColour(c) }, 'Rent'),
  node({ x: 1100, y: y - 24, w: 84, h: 16 }, { color: labelColour(c) }, '$1,120 of $1,120'),
]))

describe('n121: a level line drawn in a colour is a bar, and its labels stay dark', () => {
  it('reads wordless coloured level lines as bars; the pale track joins vivid ones', () => {
    expect(barsOf([act()]).map((b) => b.strokeId)).toEqual(['s13', 's14', 's15', 's16'])
  })
  it('never reads a dark pen line, a line with words, a short line or a lone white line as a bar', () => {
    const a = act()
    const dark = { ...a.inkColours![0]!, color: '#1c1917' }
    expect(isBarInk(dark, a)).toBe(false)
    const worded = act({ shapeMarks: a.shapeMarks!.map((m, k) => (k === 0 ? { ...m, words: 'See our projects →' } : m)) })
    expect(isBarInk(worded.inkColours![0]!, worded)).toBe(false)
    const short = act({ shapeMarks: a.shapeMarks!.map((m) => ({ ...m, to: { x: m.from!.x + 80, y: m.from!.y } })) })
    expect(barsOf([short])).toEqual([])
    const white = act({ inkColours: [{ ...a.inkColours![3]!, color: '#ffffff' }] })
    expect(barsOf([white])).toEqual([])
  })
  it('tells the build a bar with dark labels, not coloured text', () => {
    const b = inkColoursBrief({ actions: [act()], pageFill: null } as never)
    expect(b).toContain('a BAR (a progress or amount bar), not text')
    expect(b).toContain('NEVER #f97316')
    expect(b).not.toMatch(/that text or rule is coloured #f97316/)
  })
  it('checks bars as thin coloured blocks, so dark labels pass the ink-colour check', () => {
    const v = verifyInkColours([act()], null as never, built(() => 'rgb(28, 25, 23)'))
    expect(v.satisfied).toBe(true)
    const none = verifyInkColours([act()], null as never, snap([node({ x: 594, y: 120, w: 40, h: 16 }, { color: rgb('#f97316') }, 'Rent')]))
    expect(none.satisfied).toBe(false)
    expect(none.reason).toMatch(/a bar; no thin block was built on that line: build a thin strip/)
    expect(none.reason).not.toMatch(/paint its text/)
  })
  it('fails labels built in their bar colour (n120 try 1), passes dark ones', () => {
    const bad = verifyBarLabels([act()], built((c) => rgb(c)))
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/words beside the bars drawn in colour took their bar's colour \("Rent" is #f97316/)
    const good = verifyBarLabels([act()], built(() => 'rgb(28, 25, 23)'))
    expect(good.satisfied).toBe(true)
    expect(good.unverifiable).toBeFalsy()
  })
  it('leaves words a note gave their own colour, and pages with no bars, alone', () => {
    expect(verifyBarLabels([act()], built((c) => rgb(c)), () => true).unverifiable).toBe(true)
    expect(verifyBarLabels([act({ inkColours: [] })], built(() => 'rgb(0,0,0)')).unverifiable).toBe(true)
  })
})

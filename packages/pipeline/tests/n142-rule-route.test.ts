import { describe, expect, it } from 'vitest'
import { markRuleLabels, ruleLabelBrief, verifyRuleLabels, ruleHolder, spansHolder } from '../src/ruleline.js'
import { routeBrief, routeLines, verifyRoutes } from '../src/routeline.js'
import { shapeOf, type ShapeMark } from '../src/shapemark.js'
import { textPlaceBrief } from '../src/textplace.js'
import { verifyLineSpan } from '../src/linespan.js'
import { lineCopy } from '../src/textrules.js'

/** A hand stroke through waypoints, every ~6px. */
function walk(way: number[][]): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let i = 0; i < way.length - 1; i++) {
    const [a, b] = [way[i]!, way[i + 1]!]
    const n = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / 6))
    for (let k = 0; k < n; k++) out.push({ x: a[0]! + ((b[0]! - a[0]!) * k) / n, y: a[1]! + ((b[1]! - a[1]!) * k) / n })
  }
  out.push({ x: way.at(-1)![0]!, y: way.at(-1)![1]! })
  return out
}
const mark = (id: string, way: number[][]): ShapeMark => ({ ...shapeOf(walk(way))!, strokeId: id })
const VP = { w: 1280, h: 900 }

describe('n142: words typed just above a full-width divider are a small label over a rule', () => {
  // round 40 e4: sidebar box 2..320, header line 320..940 at y 80, upright at 940
  const sidebar = mark('s1', [[2, 2], [320, 2], [320, 898], [2, 898], [2, 4]])
  const upright = mark('s3', [[940, 2], [940, 898]])
  const header = (): ShapeMark => ({ ...mark('s2', [[320, 80], [940, 80]]), words: 'Refund not received bold', wordsAt: { x: 440, y: 40 } })

  it('the column of a line between a sidebar and an upright divider', () => {
    const h = ruleHolder(header().box, [sidebar, upright], VP)
    expect(h.x).toBe(320); expect(h.x + h.w).toBe(940)
    expect(spansHolder(header().box, h)).toBe(true)
  })
  it('support inbox: the title over the header divider is a left label, not a heading', () => {
    const m = header()
    markRuleLabels([m], [sidebar, upright], VP)
    expect(m.rule?.side).toBe('left')
    const brief = ruleLabelBrief([{ shapeMarks: [m] }])
    expect(brief).toMatch(/ORDINARY text/)
    expect(brief).toMatch(/"Refund not received"/)
    // no heading sized by the line, no centring
    expect(textPlaceBrief([{ shapeMarks: [m] }], VP)).not.toMatch(/big heading/)
    expect(lineCopy(m)).toBeNull()
  })
  it('recipe: "Pantry bold" typed above a line across the whole page is a left label', () => {
    const m: ShapeMark = { ...mark('p', [[2, 70], [1278, 70]]), words: 'Pantry bold', wordsAt: { x: 90, y: 34 } }
    markRuleLabels([m], [], VP)
    expect(m.rule?.side).toBe('left')
  })
  it('a note typed ON a road line is about the line (ride booking), never a label', () => {
    const m: ShapeMark = { ...mark('r', [[500, 253], [1278, 253]]), words: 'white roads, thick', wordsAt: { x: 1160, y: 253 } }
    markRuleLabels([m], [], VP)
    expect(m.rule).toBeUndefined()
  })
  it('a heading typed on a long line that does not span its column keeps the heading rule', () => {
    const m: ShapeMark = { ...mark('h', [[640, 155], [1140, 155]]), words: 'Lemon ricotta pancakes', wordsAt: { x: 890, y: 152 } }
    markRuleLabels([m], [], VP)
    expect(m.rule).toBeUndefined()
  })
  it('a note asking for big type over a full line stays a heading', () => {
    const m: ShapeMark = { ...mark('b', [[2, 70], [1278, 70]]), words: 'Pantry big bold', wordsAt: { x: 90, y: 34 } }
    markRuleLabels([m], [], VP)
    expect(m.rule).toBeUndefined()
  })
  it('checked: a 60px heading at the right fails; 16px at the left passes; line-span leaves it alone', () => {
    const m = header(); markRuleLabels([m], [sidebar, upright], VP)
    const big = { nodes: [{ id: 'a', rect: { x: 560, y: 20, w: 378, h: 70 }, text: 'Refund not received', textBox: { x: 560, y: 24, w: 378, h: 60 }, style: { fontSize: '60px' } }] }
    const v = verifyRuleLabels([m], big)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/about 16px/)
    expect(v.reason).toMatch(/left-align/)
    const ok = { nodes: [{ id: 'a', rect: { x: 340, y: 30, w: 160, h: 24 }, text: 'Refund not received', textBox: { x: 340, y: 32, w: 150, h: 20 }, style: { fontSize: '16px' } }] }
    expect(verifyRuleLabels([m], ok).satisfied).toBe(true)
    expect(verifyLineSpan([m], ok).unverifiable).toBe(true)
  })
})

describe('n142: a long open polyline is a route line', () => {
  const route = { id: 'rt', color: '#111827', points: walk([[640, 253], [1000, 253], [1040, 268], [1055, 300], [1055, 630]]) }
  it('ride booking: the route along a road and down another is found, with its bend', () => {
    const r = routeLines([route])
    expect(r).toHaveLength(1)
    expect(r[0]!.pts[0]).toEqual({ x: 640, y: 253 })
    expect(r[0]!.pts.at(-1)).toEqual({ x: 1055, y: 630 })
    expect(routeBrief([route])).toMatch(/ROUTE LINE/)
  })
  it('a white pen route is built dark', () => {
    expect(routeLines([{ ...route, color: '#ffffff' }])[0]!.color).toBe('#111827')
  })
  it('a straight line, a box, a short stroke and a mountain ridge are not routes', () => {
    expect(routeLines([{ id: 'l', points: walk([[500, 253], [1278, 253]]) }])).toHaveLength(0)
    expect(routeLines([{ id: 'b', points: walk([[70, 126], [450, 126], [450, 180], [70, 180], [70, 128]]) }])).toHaveLength(0)
    expect(routeLines([{ id: 's', points: walk([[10, 10], [60, 10], [60, 60]]) }])).toHaveLength(0)
    expect(routeLines([{ id: 'm', points: walk([[100, 600], [300, 300], [450, 500], [650, 250], [900, 600]]) }])).toHaveLength(0)
  })
  it('checked: missing without an svg over it, passes with one', () => {
    expect(verifyRoutes([route], { nodes: [{ tag: 'div', rect: { x: 500, y: 253, w: 778, h: 380 } }] }).satisfied).toBe(false)
    expect(verifyRoutes([route], { nodes: [{ tag: 'svg', rect: { x: 0, y: 0, w: 1280, h: 900 } }, { tag: 'path', rect: { x: 638, y: 250, w: 420, h: 382 } }] }).satisfied).toBe(true)
  })
})

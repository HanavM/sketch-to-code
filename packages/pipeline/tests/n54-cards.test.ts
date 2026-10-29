import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { verifyShapeMarks } from '../src/shapemark.js'
import { cardsBrief, holdsMarks, markAreasAndEdges, markCards, verifyCards } from '../src/areas.js'

const VP = { w: 1280, h: 900 }
// round 33 e3 invoice, as drawn in n50
const big = (): ShapeMark => ({ strokeId: 'card', shape: 'box', box: { x: 260, y: 50, w: 760, h: 800 } })
const pay = (): ShapeMark => ({ strokeId: 'pay', shape: 'box', box: { x: 324, y: 602, w: 125, h: 46 } })
const lines = [
  { x: 324, y: 122, w: 182, h: 0 }, { x: 831, y: 118, w: 125, h: 0 }, { x: 324, y: 214, w: 54, h: 0 },
  { x: 324, y: 360, w: 632, h: 0 }, { x: 809, y: 546, w: 147, h: 0 }, { x: 324, y: 602, w: 125, h: 46 },
]
const inner = [{ x: 260, y: 50, w: 760, h: 800 }, ...lines]
const notes = [
  { text: 'Invoice #1042, bold', focus: ['card'] },
  { text: 'Total £1,820, big bold', focus: ['card'] },
  { text: 'Pay now', focus: ['pay'] },
]
const panel = (x: number, y: number, w: number, h: number, bg = 'rgb(255, 255, 255)', extra: Record<string, string> = {}) =>
  ({ id: `p${x}${y}`, tag: 'div', parent: 'page', rect: { x, y, w, h }, style: { backgroundColor: bg, ...extra } })
const page = { id: 'page', tag: 'main', parent: null, rect: { x: 0, y: 0, w: 1280, h: 900 }, style: { backgroundColor: 'rgb(241, 245, 249)' } }

describe('a big box round other drawn marks is a card (n54)', () => {
  it('counts the marks inside a box, not the box itself', () => {
    expect(holdsMarks(big().box, inner)).toBe(6)
    expect(holdsMarks(pay().box, inner)).toBe(0)
  })
  it('a "big bold" note on a line inside a container never makes it a big-word area', () => {
    const marks = [big(), pay()]
    markAreasAndEdges(marks, notes, VP, inner)
    expect(marks[0]!.area).toBeUndefined()
    expect(marks[0]!.word).toBeUndefined()
    // with nothing drawn inside, the same note still marks a big word's area (n14 kept)
    const lone = [big()]
    markAreasAndEdges(lone, [{ text: 'huge 09', focus: ['card'] }], VP, [])
    expect(lone[0]!.area).toBe(true)
  })
  it('marks the container a white card, or its tapped colour, and leaves small or named boxes alone', () => {
    const marks = [big(), pay()]
    markCards(marks, inner, notes)
    expect(marks[0]!.card).toEqual({ fill: null })
    expect(marks[1]!.card).toBeUndefined()
    const tapped = [big()]
    markCards(tapped, inner, notes, [{ strokeId: 'card', color: '#fef3c7' }])
    expect(tapped[0]!.card).toEqual({ fill: '#fef3c7' })
    const pic = [big()]
    markCards(pic, inner, [{ text: 'map of the area', focus: ['card'] }])
    expect(pic[0]!.card).toBeUndefined()
    const bare = [big()]
    markCards(bare, inner, [{ text: 'rows on the page, no card', focus: ['card'] }])
    expect(bare[0]!.card).toBeUndefined()
  })
  it('tells the build the card and its exact edges', () => {
    const marks = [big()]
    markCards(marks, inner, notes)
    const b = cardsBrief([{ shapeMarks: marks }])
    expect(b).toMatch(/CARD/)
    expect(b).toMatch(/left 260px, top 50px, width 760px, height 800px/)
    expect(b).toMatch(/never a giant word/)
  })
  it('checks a panel shows there, at the drawn edges within 8px', () => {
    const marks = [big()]
    markCards(marks, inner, notes)
    expect(verifyCards(marks, { nodes: [page], viewport: VP }).satisfied).toBe(false)
    expect(verifyCards(marks, { nodes: [page, panel(260, 50, 760, 800, 'rgb(241, 245, 249)')], viewport: VP }).satisfied).toBe(false)
    expect(verifyCards(marks, { nodes: [page, panel(264, 48, 754, 796)], viewport: VP }).satisfied).toBe(true)
    expect(verifyCards(marks, { nodes: [page, panel(260, 50, 760, 800, 'rgb(241, 245, 249)', { border: '1px solid rgb(226, 232, 240)' })], viewport: VP }).satisfied).toBe(true)
    const off = verifyCards(marks, { nodes: [page, panel(280, 50, 720, 800)], viewport: VP })
    expect(off.satisfied).toBe(false)
    expect(off.reason).toMatch(/left edge at 280 \(drawn 260\), right edge at 1000 \(drawn 1020\)/)
  })
})

describe('a wide box keeps its drawn sides (n54)', () => {
  const before = { nodes: [{ id: 'm', tag: 'main', rect: { x: 0, y: 0, w: 1280, h: 900 } }] }
  const usage: ShapeMark = { strokeId: 'u', shape: 'box', box: { x: 200, y: 300, w: 880, h: 250 } }
  const n = (x: number, w: number) => ({ id: 'u', tag: 'section', rect: { x, y: 300, w, h: 250 } })
  it('passes when each side is within 8px', () => {
    expect(verifyShapeMarks([usage], before, { nodes: [...before.nodes, n(205, 872)] }).satisfied).toBe(true)
  })
  it('names the sides when a centred panel is built 16px in on each side (round 33 billing)', () => {
    const v = verifyShapeMarks([usage], before, { nodes: [...before.nodes, n(216, 847)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/spans x 200 to 1080.*216 to 1063.*exactly 880px wide/)
  })
  it('leaves narrow boxes to the centre slack', () => {
    const small: ShapeMark = { strokeId: 's', shape: 'box', box: { x: 200, y: 300, w: 200, h: 100 } }
    expect(verifyShapeMarks([small], before, { nodes: [...before.nodes, { id: 's', tag: 'div', rect: { x: 212, y: 300, w: 176, h: 100 } }] }).satisfied).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { markOpenRows, openRowsBrief, verifyOpenRows } from '../src/openrows.js'

const box = (x: number, y: number, w: number, h: number) => ({ shape: 'box', box: { x, y, w, h } })
// round 42 e3 shopping cart as drawn in n162: three thumbs, a stepper on row 1, the summary panel and its button
const shapes = [box(60, 202, 96, 96), box(60, 343, 96, 96), box(60, 484, 96, 96), box(544, 230, 104, 40), box(820, 180, 400, 290), box(850, 385, 340, 56)]
const ROWS = 'rows: Linen throw, Sand · 130 × 170, $89; Stoneware mug, Sage · set of 2, $48; Oak tray, Natural, $62; dividers'
const notes = [{ text: 'Your cart big bold', x: 130, y: 130 }, { text: ROWS, x: 420, y: 330 }, { text: '− 1 + (mug 2)', x: 596, y: 250 }, { text: 'Summary bold', x: 895, y: 221 }]
const node = (t: string | undefined, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, ...(t ? { text: t, textBox: { x, y, w, h } } : {}) })
const rowsPage = [node(undefined, 60, 202, 700, 96), node('Linen throw', 180, 230, 90, 18), node(undefined, 60, 202, 96, 96)]

describe('n172 a control drawn on row 1 repeats on every row', () => {
  it('finds the stepper inside row 1 and gives each row its own value from "(mug 2)"', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes, notes)
    const c = p!.openRows!.controls!
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ x: 544, y: 230, w: 104, h: 40, label: '− 1 +', values: ['1', '2', '1'] })
    const brief = openRowsBrief([p!])
    expect(brief).toContain('EVERY row has')
    expect(brief).toContain('middles at y 250, 391, 532')
    expect(brief).toContain('"Stoneware mug" 2')
    expect(brief).not.toContain('(mug 2)')
  })
  it('the thumbs and the panel are no row controls; no control without one drawn', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes.filter((s) => s.box.x !== 544), notes)
    expect(p!.openRows!.controls).toBeUndefined()
  })
  it('a box drawn outside row 1 band is not a row control', () => {
    const moved = shapes.map((s) => (s.box.x === 544 ? box(544, 320, 104, 40) : s))
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], moved, notes)
    expect(p!.openRows!.controls).toBeUndefined()
  })
  it('checked on the page: a stepper on one row fails, on every row passes', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes, notes)
    const one = verifyOpenRows([p!], { nodes: [...rowsPage, node(undefined, 1176 - 640, 375, 104, 32)] })
    expect(one.satisfied).toBe(false)
    expect(one.reason).toContain('only 1 of the 3 rows')
    const all = verifyOpenRows([p!], { nodes: [...rowsPage, node(undefined, 538, 234, 104, 32), node(undefined, 538, 375, 104, 32), node(undefined, 538, 516, 104, 32)] })
    expect(all.satisfied).toBe(true)
  })
})

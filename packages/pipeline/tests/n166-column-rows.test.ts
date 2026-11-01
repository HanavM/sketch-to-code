import { describe, expect, it } from 'vitest'
import { markOpenRows, openRowItems, openRowsBrief, verifyOpenRows } from '../src/openrows.js'

const box = (x: number, y: number, w: number, h: number) => ({ shape: 'box', box: { x, y, w, h } })
// round 42 e3 shopping cart as drawn in n162: header rule, title line, three thumbs, a stepper, the summary panel, its rule and button
const shapes = [box(60, 202, 96, 96), box(60, 343, 96, 96), box(60, 484, 96, 96), box(544, 230, 104, 40), box(820, 180, 400, 290), box(850, 385, 340, 56)]
const ROWS = 'rows: Linen throw, Sand · 130 × 170, $89; Stoneware mug, Sage · set of 2, $48; Oak tray, Natural, $62; dividers'
const notes = [{ text: 'Your cart big bold', x: 130, y: 130 }, { text: ROWS, x: 420, y: 330 }, { text: '− 1 + (mug 2)', x: 596, y: 250 }, { text: 'Summary bold', x: 895, y: 221 }]
const node = (t: string | undefined, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, ...(t ? { text: t, textBox: { x, y, w, h } } : {}) })

describe('n166 rows typed beside a drawn column run up to the panel', () => {
  it('reads one row per ; segment, a lower-case segment being a look', () => {
    expect(openRowItems(ROWS)).toEqual(['Linen throw, Sand · 130 × 170, $89', 'Stoneware mug, Sage · set of 2, $48', 'Oak tray, Natural, $62'])
    // the old reading still holds for one segment and a look tail
    expect(openRowItems('list: Docs, Photos, Music; blue, green icons')).toEqual(['Docs', 'Photos', 'Music'])
  })
  it('cart: rows start at the column, a box apart, and end short of the summary panel', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes, notes)
    const o = p!.openRows!
    expect(o).toBeDefined()
    expect(o.column).toMatchObject({ x: 60, boxes: 3, panelX: 820 })
    expect(o.field.x).toBe(60)
    expect(o.field.x + o.field.w).toBe(760)
    expect(o.firstMid).toBe(250)
    expect(o.pitch).toBe(141)
    expect(o.first).toBe('Linen throw')
    const brief = openRowsBrief([p!])
    expect(brief).toContain('x 60 to x 760')
    expect(brief).toContain('RIGHT end')
  })
  it('no panel: the same margin from the page edge', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes.filter((s) => s.box.x < 800), notes)
    expect(p!.openRows!.field.x + p!.openRows!.field.w).toBe(1220)
  })
  it('a lone box is no column', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], [box(60, 202, 96, 96), box(820, 180, 400, 290)], notes)
    expect(p!.openRows).toBeUndefined()
  })
  it('checks the row runs to the panel on the page', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 420, y: 330 }], shapes, notes)
    // n172: the stepper drawn on row 1 is on every row
    const steppers = [234, 375, 516].map((y) => node(undefined, 538, y, 104, 32))
    const good = { nodes: [node(undefined, 60, 202, 700, 96), node('Linen throw', 180, 226, 90, 18), ...steppers] }
    expect(verifyOpenRows([p!], good).satisfied).toBe(true)
    const short = { nodes: [node(undefined, 60, 202, 590, 96), node('Linen throw', 180, 226, 90, 18)] }
    expect(verifyOpenRows([p!], short).reason).toContain('x 60 to 760')
  })
})

import { describe, expect, it } from 'vitest'
import { markOpenRows, openRowItems, openRowsBrief, verifyOpenRows } from '../src/openrows.js'

const box = (x: number, y: number, w: number, h: number) => ({ shape: 'box', box: { x, y, w, h } })
// round 41 e3 to-do as drawn in n150: the field, its + button, three chips, row 1's checkbox
const shapes = [box(320, 171, 640, 54), box(905, 180, 36, 36), box(320, 251, 52, 32), box(382, 251, 74, 32), box(466, 251, 69, 32), box(320, 313, 22, 22)]
const ROWS = 'checkbox rows, dividers: Water the plants (done), Call the landlord, urgent orange right, Buy oat milk, Send invoice #18 (done), Book haircut, Return library books'
const notes = [{ text: 'Done', x: 500, y: 267 }, { text: ROWS, x: 640, y: 480 }, { text: '4 left · Clear done, grey', x: 375, y: 679 }]
const node = (t: string | undefined, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, ...(t ? { text: t, textBox: { x, y, w, h } } : {}) })

describe('n158 rows typed in open space take the field above', () => {
  it('reads six rows, a lower-case look joining the row before it', () => {
    expect(openRowItems(ROWS)).toHaveLength(6)
    expect(openRowItems('Water the plants, Buy oat milk')).toBeNull()
  })
  it('to-do: field width, first row level with the drawn checkbox, ends above the footer', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 640, y: 480 }], shapes, notes)
    expect(p!.openRows).toBeDefined()
    expect(p!.openRows!.field).toEqual({ x: 320, y: 171, w: 640, h: 54 })
    expect(p!.openRows!.firstMid).toBe(324)
    expect(p!.openRows!.pitch).toBeGreaterThanOrEqual(55)
    expect(p!.openRows!.pitch).toBeLessThanOrEqual(60)
    expect(p!.y).toBe(324)
    expect(openRowsBrief([p!])).toContain('x 320 to x 960')
  })
  it('leaves a note inside a drawn card alone', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 640, y: 480 }], [...shapes, box(300, 350, 700, 300)], notes)
    expect(p!.openRows).toBeUndefined()
  })
  it('checks start and width on the page', () => {
    const [p] = markOpenRows([{ text: ROWS, x: 640, y: 480 }], shapes, notes)
    const good = { nodes: [node(undefined, 320, 300, 640, 48), node('Water the plants', 352, 316, 110, 16), ...[0, 1, 2, 3, 4, 5].map((i) => node(undefined, 320, 313 + i * p!.openRows!.pitch, 22, 22))] }
    expect(verifyOpenRows([p!], good).satisfied).toBe(true)
    const narrow = { nodes: [node(undefined, 320, 300, 320, 48), node('Water the plants', 352, 316, 110, 16)] }
    expect(verifyOpenRows([p!], narrow).reason).toContain('x 320 to 960')
    const low = { nodes: [node(undefined, 320, 330, 640, 48), node('Water the plants', 352, 346, 110, 16)] }
    expect(verifyOpenRows([p!], low).satisfied).toBe(false)
  })
})

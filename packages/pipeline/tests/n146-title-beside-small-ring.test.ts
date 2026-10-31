import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { textPlaceBrief, verifyTextPlace } from '../src/textplace.js'
import { hollowBuilt, inkSmallRing } from '../src/inkcolour.js'

const VP = { w: 1280, h: 900 }
const line = (id: string, x0: number, x1: number, y: number, words?: string): ShapeMark =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, ...(words ? { words } : {}) })
const box = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })
const node = (text: string, tb: { x: number; y: number; w: number; h: number }) => ({ id: text, tag: 'h1', text, rect: tb, textBox: tb })

// round 40 e2 recipe, as drawn in n139: photo box at the left, the title line in the column right of it
describe('n146 a title line beside a big box keeps the column\'s left', () => {
  const photo = box('p', 60, 110, 520, 360)
  const title = line('t', 640, 1140, 155, 'Lemon ricotta pancakes, big bold')
  it('tells left-aligned from x 640, not right-aligned on the page', () => {
    const brief = textPlaceBrief([{ shapeMarks: [photo, title] }], VP)
    expect(brief).toMatch(/LEFT-aligned and their first letter starts at x 640/)
    expect(brief).not.toMatch(/RIGHT-aligned/)
  })
  it('checks it: right-aligned letters fail, left ones pass', () => {
    const bad = verifyTextPlace([photo, title], { nodes: [node('Lemon ricotta pancakes, big bold', { x: 800, y: 130, w: 340, h: 48 })] }, VP)
    expect(bad.satisfied).toBe(false)
    const good = verifyTextPlace([photo, title], { nodes: [node('Lemon ricotta pancakes, big bold', { x: 642, y: 130, w: 340, h: 48 })] }, VP)
    expect(good.satisfied).toBe(true)
  })
  it('a box above or below the line (not beside it) changes nothing', () => {
    const above = box('a', 60, 10, 520, 100)
    expect(textPlaceBrief([{ shapeMarks: [above, title] }], VP)).toMatch(/RIGHT-aligned/)
  })
  it('a line still centred in the column after the box stays centred', () => {
    const mid = line('m', 830, 1030, 155, 'Hello there')
    expect(textPlaceBrief([{ shapeMarks: [photo, mid] }], VP)).toMatch(/centred in the box/)
  })
})

describe('n146 a small dark ring with no tap is hollow', () => {
  it('dark neutral pen, 14-40px', () => {
    expect(inkSmallRing('#111827', { w: 24, h: 22 })).toBe(true)
    expect(inkSmallRing('#111827', { w: 60, h: 60 })).toBe(false)
    expect(inkSmallRing('#111827', { w: 8, h: 8 })).toBe(false)
    expect(inkSmallRing('#f59e0b', { w: 24, h: 24 })).toBe(false)
    expect(inkSmallRing(null, { w: 24, h: 24 })).toBe(false)
  })
  it('a note asking for a fill keeps it filled', () => {
    expect(inkSmallRing('#111827', { w: 24, h: 24 }, ['solid dot'])).toBe(false)
    expect(inkSmallRing('#111827', { w: 32, h: 32 }, ['avatar'])).toBe(false)
    expect(inkSmallRing('#111827', { w: 24, h: 24 }, ['pickup'])).toBe(true)
  })
  it('a solid dark disc fails the check, a bordered white one passes', () => {
    const c = { box: { x: 628, y: 615, w: 24, h: 22 }, color: '#111827' }
    const disc = { id: 'd', tag: 'div', rect: { x: 628, y: 615, w: 23, h: 23 }, style: { backgroundColor: 'rgb(17, 24, 39)' } }
    expect(hollowBuilt(c, [disc] as never).ok).toBe(false)
    const ring = { id: 'r', tag: 'div', rect: { x: 628, y: 615, w: 23, h: 23 }, style: { backgroundColor: 'rgb(255, 255, 255)', border: '4px solid rgb(17, 24, 39)' } }
    expect(hollowBuilt(c, [ring] as never).ok).toBe(true)
  })
})

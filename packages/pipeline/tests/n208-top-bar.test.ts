import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { barCause, verifyPageDrift } from '../src/drift.js'

let id = 0
const node = (x: number, y: number, w: number, h: number, text = '', tag = 'div'): DomNode => ({
  id: `n${id++}`, tag, srcLoc: `src/App.tsx:${id}:1`, rect: { x, y, w, h }, text, classes: [`c${id}`],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: 'normal', padding: '0px',
    margin: '0px', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0px',
  },
  parent: null, depth: 1,
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 915, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false })

// round 45 c4 bike repair (n207 try 2): header built 93px, hero drawn from 79, every block 14px low
const drawn = [
  { x: 70, y: 36, w: 169, h: 8 }, { x: 992, y: 36, w: 218, h: 8 },
  { x: 1, y: 79, w: 1277, h: 482 }, { x: 71, y: 324, w: 360, h: 20 },
  { x: 69, y: 420, w: 221, h: 59 },
  { x: 70, y: 619, w: 362, h: 222 }, { x: 459, y: 619, w: 362, h: 222 }, { x: 849, y: 619, w: 361, h: 222 },
]
const placed = drawn.map((region, index) => ({ index, region }))
const built = [
  node(0, 0, 1280, 915, '', 'main'),
  node(0, 0, 1280, 93, 'Spoke & Chain Services Book', 'header'),
  node(70, 23, 199, 34, 'Spoke & Chain'), node(992, 30, 218, 20, 'Services Book'),
  node(1, 93, 1277, 482, '', 'section'), node(71, 334, 360, 24, 'Same-week repairs'),
  node(69, 434, 221, 59, 'Book a repair'),
  node(70, 633, 362, 222), node(459, 633, 362, 222), node(849, 633, 361, 222),
]

describe('n208: a page shifted by a tall top bar names the bar', () => {
  it('names the header, its built height and the drawn one', () => {
    const v = verifyPageDrift(snap([]), snap(built), placed)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/about 14px lower/)
    expect(v.reason).toMatch(/The space is the top bar: the <header> holding "Spoke & Chain/)
    expect(v.reason).toMatch(/built 93px tall, and the drawing has it 79px tall/)
    expect(v.reason).toMatch(/height: 79px/)
  })
  it('says nothing about a bar when the bar ends well above the first shifted block (the gap is elsewhere)', () => {
    expect(barCause([node(0, 0, 1280, 60, '', 'header')], { built: 93, dy: 14, drawn: 79 })).toBeNull()
  })
  it('never takes the whole-page wrapper or a narrow box for the bar', () => {
    expect(barCause([node(0, 0, 1280, 915, '', 'main'), node(0, 0, 400, 93)], { built: 93, dy: 14, drawn: 79 })).toBeNull()
  })
  it('a bar built too short is told to grow', () => {
    expect(barCause([node(0, 0, 1280, 50, '', 'nav')], { built: 50, dy: -12, drawn: 62 })).toMatch(/built 50px tall, and the drawing has it 62px tall.*add vertical padding/)
  })
})

import { describe, expect, it } from 'vitest'
import type { DomNode } from '@s2c/dom'
import { inkColoursBrief, linesOnlyBox, linesOnlyBuilt } from '../src/inkcolour.js'
import { repeatCount, repeatPlans } from '../src/repeatmark.js'
import { rowData } from '../src/rowdata.js'
import type { GroundedAction } from '../src/intent2.js'
import type { Stroke } from '@s2c/ink'

const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]].map(([a, b]) => ({ x: a!, y: b! }))
const st = (id: string, color: string | null, points: Array<{ x: number; y: number }>) => ({ id, color, points }) as unknown as Stroke
// round 46 c4 tennis club: green court, tapped green; white box on it; white net line through it and out both sides
const court = st('court', '#2e8a57', rect(70, 270, 760, 440))
const tap = st('tap', '#2e8a57', [{ x: 150, y: 650 }])
const lines = st('box', '#ffffff', rect(200, 390, 500, 200))
const net = st('net', '#ffffff', [{ x: 452, y: 280 }, { x: 452, y: 702 }])
const fills = [{ target: 'court', color: '#2e8a57', dotId: 'tap' }]
const BOX = { x: 200, y: 390, w: 500, h: 200 }
let id = 0
const node = (tag: string, r: DomNode['rect'], style: Partial<DomNode['style']> = {}, text = ''): DomNode => ({
  id: `n${id++}`, tag, srcLoc: null, rect: r, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', ...style },
} as unknown as DomNode)

describe('n212: a box a same-pen line crosses is lines only', () => {
  it('reads the court lines', () => {
    expect(linesOnlyBox(lines as never, [court, tap, lines, net] as never, fills, [], BOX)).toBe(true)
  })
  it('takes bars inside the box too (a window frame)', () => {
    const bar = st('bar', '#ffffff', [{ x: 210, y: 490 }, { x: 690, y: 490 }])
    expect(linesOnlyBox(lines as never, [court, tap, lines, bar] as never, fills, [], BOX)).toBe(true)
  })
  it('leaves a white card alone: no line, a note, a tap, another pen, or no surface', () => {
    expect(linesOnlyBox(lines as never, [court, tap, lines] as never, fills, [], BOX)).toBe(false)
    expect(linesOnlyBox(lines as never, [court, tap, lines, net] as never, fills, ['Book a court'], BOX)).toBe(false)
    expect(linesOnlyBox(lines as never, [court, tap, lines, net] as never, [...fills, { target: 'box', color: '#ffffff', dotId: 't2' }], [], BOX)).toBe(false)
    const dark = st('net', '#111111', [{ x: 452, y: 280 }, { x: 452, y: 702 }])
    expect(linesOnlyBox(lines as never, [court, tap, lines, dark] as never, fills, [], BOX)).toBe(false)
    expect(linesOnlyBox(lines as never, [lines, net] as never, [], [], BOX)).toBe(false)
  })
  it('leaves a short word line and a small chip alone', () => {
    const word = st('w', '#ffffff', [{ x: 300, y: 450 }, { x: 400, y: 450 }])
    expect(linesOnlyBox(lines as never, [court, tap, lines, word] as never, fills, [], BOX)).toBe(false)
    expect(linesOnlyBox(st('c', '#ffffff', rect(200, 390, 90, 40)) as never, [court, tap, net] as never, fills, [], { x: 200, y: 390, w: 90, h: 40 })).toBe(false)
  })
  it('tells the build empty lines', () => {
    const a = { kind: 'design', targets: [], instruction: 'court', rejected: [], inkColours: [{ strokeId: 'box', mark: 'box', paint: 'border', color: '#ffffff', box: BOX, how: 'pen', frame: true, linesOnly: true, frameOn: '#2e8a57' }] } as unknown as GroundedAction
    const b = inkColoursBrief({ actions: [a] } as never)
    expect(b).toMatch(/LINES ONLY/)
    expect(b).toMatch(/invent none/)
    expect(b).toMatch(/background transparent/)
  })
  it('checks the page: a filled card fails, invented words fail, a bare border passes', () => {
    const c = { box: BOX, color: '#ffffff' }
    expect(linesOnlyBuilt(c, [node('div', BOX, { backgroundColor: 'rgb(255, 255, 255)' })]).ok).toBe(false)
    expect(linesOnlyBuilt(c, [node('div', BOX, { border: '2px solid rgb(255, 255, 255)' }), node('p', { x: 260, y: 460, w: 160, h: 40 }, {}, 'Six clay & hard courts')]).ok).toBe(false)
    expect(linesOnlyBuilt(c, [node('div', BOX, { border: '2px solid rgb(255, 255, 255)' })]).ok).toBe(true)
    expect(linesOnlyBuilt(c, [node('div', BOX, {})]).ok).toBe(false)
  })
})

describe('n212: a direction word after a count', () => {
  const note = 'x3 stacked: 6 clay and hard courts / 14 coaches on staff / $39 a month, all courts'
  it('splits a slashed list, keeps its commas, and reads the way', () => {
    expect(repeatCount(note)).toEqual({ n: 3, noun: null, names: ['6 clay and hard courts', '14 coaches on staff', '$39 a month, all courts'], axis: 'y' })
  })
  it('never makes the direction word part of the first row', () => {
    expect(rowData(note)?.rows[0]?.join(' ')).toBe('6 clay and hard courts')
  })
  it('changes nothing without one', () => {
    expect(repeatCount('6 strips: Drums, Bass, Keys, Guitar, Vocals, FX; knobs at different heights')).toEqual({ n: 6, noun: 'strips', names: ['Drums', 'Bass', 'Keys', 'Guitar', 'Vocals', 'FX'] })
    expect(repeatCount('x2')).toEqual({ n: 2, noun: null, names: [] })
  })
  it('stacks a tile typed with a count at its drawn size', () => {
    const tile = st('t', '#f0f3f8', rect(880, 270, 270, 110))
    const plans = repeatPlans([{ text: note, at: { x: 900, y: 300 } }], [tile], { w: 1280, h: 900 })
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ axis: 'y', n: 3, mark: { x: 880, y: 270, w: 270, h: 110 } })
  })
})

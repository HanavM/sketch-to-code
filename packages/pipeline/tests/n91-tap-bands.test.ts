import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { inkFills, markFill, tapBands } from '@s2c/ink'
import { inkColoursBrief } from '../src/inkcolour.js'

type W = { way: number[][]; color?: string | null; at: number }
const digest = (page: string) => JSON.parse(readFileSync(new URL(`../../../tests/hand/out-n87/round36/${page}/digest.json`, import.meta.url), 'utf8')) as { strokesDrawn: W[]; events: Array<{ op: string; color?: string; at: number }> }
// strokes with the pen colour in force when each was drawn (as the overlay records it)
const strokesOf = (page: string) => {
  const d = digest(page)
  const pens = d.events.filter((e) => e.op === 'pen')
  return d.strokesDrawn.map((s, k) => ({ id: `s${String(k)}`, color: s.color ?? [...pens].reverse().find((p) => p.at <= s.at)?.color ?? null, points: s.way.map(([x, y]) => ({ x: x!, y: y!, t: 0 })) }))
}

describe('n91 taps in ruled bands fill only those bands', () => {
  it('timesheet: header and total bands grey, rows untouched', () => {
    const strokes = strokesOf('e3-timesheet')
    const fills = inkFills(strokes)
    const table = 's7'
    const mine = fills.filter((f) => f.target === table)
    expect(mine.length).toBe(2)
    expect(markFill(fills, table, strokes)?.split).toBeUndefined()
    const tb = tapBands(strokes[7]!, mine, strokes)!
    expect(tb.bands.length).toBe(3)
    expect(tb.bands[0]!.color).toBe('#f5f6f8')
    expect(tb.bands[1]!.color).toBeNull()
    expect(tb.bands[2]!.color).toBe('#f5f6f8')
    const brief = inkColoursBrief({ actions: [{ inkColours: [{ strokeId: table, mark: 'box', paint: 'background', color: '#f5f6f8', box: tb.box, how: 'tap', bands: tb.bands }] }] } as never)
    expect(brief).toContain('ONLY THOSE BANDS')
    expect(brief).toContain('from y 173 to y 461')
  })
  it('a box with no ruled line, or a tap in every band, is not banded', () => {
    const box = { id: 'b', color: null, points: [[0, 0], [400, 0], [400, 300], [0, 300], [0, 0]].map(([x, y]) => ({ x: x!, y: y!, t: 0 })) }
    const line = { id: 'l', color: null, points: [{ x: 2, y: 100, t: 0 }, { x: 398, y: 100, t: 0 }] }
    expect(tapBands(box, [{ color: '#eee', at: { x: 200, y: 50 } }], [box])).toBeNull()
    expect(tapBands(box, [{ color: '#eee', at: { x: 200, y: 50 } }, { color: '#eee', at: { x: 200, y: 200 } }], [box, line])).toBeNull()
    expect(tapBands(box, [{ color: '#eee', at: { x: 200, y: 50 } }], [box, line])?.bands.map((b) => b.color)).toEqual(['#eee', null])
  })
})

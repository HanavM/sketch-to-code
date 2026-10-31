import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { alignListHeadings, markOpenRows } from '../src/openrows.js'
import { placedBrief, verifyPlaced } from '../src/textplace.js'
import { shapeOf } from '../src/shapemark.js'

const HAND = new URL('../../../tests/hand/out-n162/round42/', import.meta.url).pathname
const load = (id: string) => {
  const d = JSON.parse(readFileSync(`${HAND}${id}/digest.json`, 'utf8'))
  const run = d.events.find((e: { op: string }) => e.op === 'run').at
  const shapes = d.strokesDrawn.filter((s: { at: number }) => s.at < run).flatMap((s: { way: number[][] }) => {
    const m = shapeOf(s.way.map(([x, y]) => ({ x: x!, y: y! }))); return m ? [m] : []
  })
  const notes = d.notesTyped.filter((n: { at: number }) => n.at < run).map((n: { text: string; x: number; y: number }) => ({ text: n.text, x: n.x, y: n.y }))
  return { shapes, notes }
}
const node = (text: string, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, text, textBox: { x, y, w, h } })

describe('n168 a heading typed just above a list starts at the list\'s left edge', () => {
  it('podcast: "Latest episodes" moves to the ring\'s left, told and checked', () => {
    const { shapes, notes } = load('e1-podcast-app')
    const placed = markOpenRows(notes.filter((n: { text: string }) => n.text === 'Latest episodes' || n.text.startsWith('rows:')), shapes, notes, 1280)
    const out = alignListHeadings(placed)
    const h = out.find((n) => n.text === 'Latest episodes')!
    const list = out.find((n) => n.openRows)!
    expect(h.leftAt).toBe(list.openRows!.field.x)
    expect(h.leftAt).toBeLessThan(330)
    expect(h.y).toBe(291)
    const brief = placedBrief(out, { w: 1280, h: 900 })
    expect(brief).toContain(`START at x ${h.leftAt}`)
    // built 60px right of the rows: a fault; built on the edge: fine
    const bad = verifyPlaced(out, { nodes: [node('Latest episodes', h.leftAt! + 58, 280, 130, 22)] } as never)
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('move them left')
    const good = verifyPlaced(out, { nodes: [node('Latest episodes', h.leftAt! + 4, 280, 130, 22)] } as never)
    expect(good.satisfied).toBe(true)
  })

  it('leaves alone a note far above, far right, long, or itself a list', () => {
    const o = { field: { x: 300, y: 330, w: 900, h: 0 }, typedY: 460, firstMid: 345, pitch: 52, rows: 4, first: 'A', by: 'mark' as const }
    const list = { text: 'rows: A, B, C, D', x: 308, y: 345, openRows: o }
    const out = alignListHeadings([
      list,
      { text: 'Far above', x: 360, y: 150 },
      { text: 'On the right', x: 900, y: 300 },
      { text: 'a long note of many words', x: 360, y: 300 },
      { text: 'Recent', x: 340, y: 300 },
    ])
    expect(out[1]!.leftAt).toBeUndefined()
    expect(out[2]!.leftAt).toBeUndefined()
    expect(out[3]!.leftAt).toBeUndefined()
    expect(out[4]!.leftAt).toBe(300)
    // no list: nothing changes
    expect(alignListHeadings([{ text: 'Recent', x: 340, y: 300 }])[0]!.leftAt).toBeUndefined()
  })
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markOpenRows, openRowsBrief, verifyOpenRows } from '../src/openrows.js'
import { cardRows, cardRowsBrief, verifyCardRows } from '../src/cardrows.js'
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
const node = (t: string | undefined, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, ...(t ? { text: t, textBox: { x, y, w, h } } : {}) })

describe('n114 a lone ring at the top left of typed rows is row 1\'s own mark', () => {
  it('podcast: rows start level with the ring, run to the margin, carry the ring', () => {
    const { shapes, notes } = load('e1-podcast-app')
    const rows = notes.find((n: { text: string }) => n.text.startsWith('rows:'))!
    const [p] = markOpenRows([rows], shapes, notes, 1280)
    const o = p!.openRows!
    expect(o).toBeDefined()
    expect(o.by).toBe('mark')
    expect(o.mark).toBeDefined()
    expect(Math.abs(o.firstMid - 343)).toBeLessThan(8)
    expect(o.field.x).toBeLessThan(300)
    expect(o.field.x + o.field.w).toBeGreaterThan(1150)
    expect(o.pitch).toBeGreaterThanOrEqual(56)
    const brief = openRowsBrief([p!])
    expect(brief).toContain("row 1's OWN leading mark")
    // on the page: four rows with rings at their left passes; one ring above the rows fails
    const ok = { nodes: [0, 1, 2, 3].flatMap((i) => [node(undefined, o.field.x - 4, o.firstMid + i * o.pitch - 24, o.field.w, 48),
      node(undefined, o.mark!.x, o.firstMid + i * o.pitch - 14, 30, 30), node(i ? 'x' : 'Why ice is slippery', o.field.x + 50, o.firstMid + i * o.pitch - 8, 140, 16)]) }
    expect(verifyOpenRows([p!], ok).satisfied).toBe(true)
    const lone = { nodes: [node(undefined, o.mark!.x, o.firstMid - 14, 30, 30), ...[0, 1, 2, 3].flatMap((i) => [node(undefined, o.field.x - 4, o.firstMid + i * o.pitch - 24, o.field.w, 48),
      node(i ? 'x' : 'Why ice is slippery', o.field.x + 50, o.firstMid + i * o.pitch - 8, 140, 16)])] }
    expect(verifyOpenRows([p!], lone).reason).toContain('only 1 of the 4 rows')
  })
  it('a ring with something drawn between it and the note is not a list lead', () => {
    const notes = [{ text: 'rows: A one, B two, C three', x: 760, y: 460 }]
    const shapes = [{ shape: 'ellipse', box: { x: 290, y: 325, w: 36, h: 36 } }, { shape: 'box', box: { x: 300, y: 380, w: 200, h: 40 } }]
    const [p] = markOpenRows(notes, shapes, notes, 1280)
    expect(p!.openRows).toBeUndefined()
  })
  it('dashboard: the ring under the card heading is told as every row\'s mark and checked', () => {
    const { shapes, notes } = load('e4-project-dashboard')
    const marks = shapes.filter((s: { shape: string; box: { w: number } }) => s.shape === 'box' && s.box.w > 600).map((s: object) => ({ ...s, strokeId: 's' }))
    const lists = cardRows(marks, shapes, notes, { w: 1280, h: 900 })
    expect(lists).toHaveLength(1)
    const l = lists[0]!
    expect(l.mark).toBeDefined()
    expect(cardRowsBrief(lists)).toContain("row 1's OWN leading mark")
    const mid = l.start + Math.round(l.pitch / 2)
    const page = (ring: boolean) => ({ nodes: [node('Due soon', 480, 328, 70, 16), ...[0, 1, 2, 3, 4].flatMap((i) => [
      ...(ring || i === 0 ? [node(undefined, l.mark!.x, mid + i * l.pitch - 12, 24, 24)] : []),
      node(i ? `r${i}` : 'Write homepage copy', 530, mid + i * l.pitch - 8, 140, 16)])] })
    expect(verifyCardRows(lists, page(true)).reason).toContain('card list')
    expect(verifyCardRows(lists, page(false)).satisfied).toBe(false)
  })
})

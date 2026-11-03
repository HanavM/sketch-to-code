import { describe, expect, it } from 'vitest'
import { isBarInk, proseLineIds, proseNote } from '../src/barlabels.js'
import type { GroundedAction } from '../src/intent2.js'

// round 39 c1 honey co.: the subtitle drawn as two brown level lines, its sentence typed between them
const SUB = 'Raw, unheated and jarred by hand on the hillside where our bees forage.'
const line = (strokeId: string, x0: number, x1: number, y: number) => ({ strokeId, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y } })
const honey = [line('s5', 72, 484, 463), line('s6', 72, 268, 492)]

describe('n136: lines a sentence was typed on are copy, never bars', () => {
  it('a sentence is prose; labels with amounts, lists and bar directions are not', () => {
    expect(proseNote(SUB)).toBe(true)
    expect(proseNote('Rent $1,120 of $1,120; Food $700 of $800; Travel $520 of $400')).toBe(false)
    expect(proseNote('Rent $1,120; Food $700; Travel $520')).toBe(false)
    expect(proseNote('Buy a jar')).toBe(false)
    expect(proseNote('orange progress bar about two thirds full')).toBe(false)
    expect(proseNote('Fun 0 of 300 Savings 460 of 500')).toBe(false)
  })
  it('marks both lines of the honey subtitle (note between them) and the whole stack', () => {
    expect([...proseLineIds(honey, [{ text: SUB, at: { x: 280, y: 478 } }])].sort()).toEqual(['s5', 's6'])
    const three = [...honey, line('s7', 72, 300, 521)]
    expect([...proseLineIds(three, [{ text: SUB, at: { x: 280, y: 470 } }])].sort()).toEqual(['s5', 's6', 's7'])
  })
  it('leaves far notes, short notes and other columns alone', () => {
    expect(proseLineIds(honey, [{ text: SUB, at: { x: 900, y: 478 } }]).size).toBe(0)
    expect(proseLineIds(honey, [{ text: SUB, at: { x: 280, y: 600 } }]).size).toBe(0)
    expect(proseLineIds(honey, [{ text: 'brown words', at: { x: 280, y: 478 } }]).size).toBe(0)
    const other = [...honey, line('s9', 594, 1186, 470)]
    expect(proseLineIds(other, [{ text: SUB, at: { x: 280, y: 478 } }]).has('s9')).toBe(false)
  })
  it('budget bars (list note with amounts on the panel) stay bars', () => {
    const bars = [231, 301, 371].map((y, k) => line(`b${String(k)}`, 594, 1186, y))
    expect(proseLineIds(bars, [{ text: 'Rent $1,120 of $1,120; Food $700 of $800; Travel $520 of $400', at: { x: 890, y: 300 } }]).size).toBe(0)
  })
  it('a copy line is not a bar', () => {
    const a = {
      kind: 'design', targets: [], instruction: 'hero', shapeMarks: honey,
      inkColours: honey.map((m) => ({ strokeId: m.strokeId, mark: 'line', paint: 'text', color: '#7a4a1f', box: m.box, how: 'pen' })),
    } as unknown as GroundedAction
    expect(isBarInk(a.inkColours![0]!, a)).toBe(true)
    const b = { ...a, inkColours: a.inkColours!.map((c) => ({ ...c, copy: true as const })) } as GroundedAction
    expect(isBarInk(b.inkColours![0]!, b)).toBe(false)
    expect(isBarInk(b.inkColours![1]!, b)).toBe(false)
  })
})

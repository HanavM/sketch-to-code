import { describe, expect, it } from 'vitest'
import { partsDrawnOnce, drawnOnceBrief, verifyDrawnOnce, listedRows } from '../src/drawnonce.js'
import { checklistOf, checklistBrief, verifyChecklists } from '../src/checklist.js'
import type { ShapeMark } from '../src/shapemark.js'

const box = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ShapeMark> = {}): ShapeMark =>
  ({ strokeId: id, shape: 'box', box: { x, y, w, h }, ...extra })
const ring = (id: string, x: number, y: number, w: number, h: number, extra: Partial<ShapeMark> = {}): ShapeMark =>
  ({ strokeId: id, shape: 'ellipse', box: { x, y, w, h }, ...extra })

// round 38 e4 job board: 5 cards 144px apart, an avatar square in each, Apply only in card 1
const jobBoard = (): ShapeMark[] => [
  ...[0, 1, 2, 3, 4].map((i) => box(`card${i}`, 341, 132 + i * 144, 890, 128)),
  ...[0, 1, 2, 3, 4].map((i) => box(`av${i}`, 367, 165 + i * 144, 60, 60)),
  box('apply', 1095, 174, 110, 30, { own: 'Apply' }),
  box('panel', 48, 100, 260, 760),
]
const node = (id: string, x: number, y: number, w: number, h: number, text = '') => ({ id, text, rect: { x, y, w, h } })

describe('n112: a part drawn in the first of a set is on every member', () => {
  it('finds Apply drawn only in card 1, not the avatars drawn in every card', () => {
    const f = partsDrawnOnce(jobBoard())
    expect(f).toHaveLength(1)
    expect(f[0]!.part.strokeId).toBe('apply')
    expect(f[0]!.members).toHaveLength(5)
    expect(f[0]!.dx).toBe(754)
    expect(drawnOnceBrief([{ shapeMarks: jobBoard() }])).toMatch(/EVERY one of the 5[\s\S]*"Apply"/)
  })
  it('a part the note calls one of a kind stays on one card', () => {
    const m = jobBoard().map((x) => x.strokeId === 'apply' ? { ...x, own: 'Most popular' } : x)
    expect(partsDrawnOnce(m)).toHaveLength(0)
  })
  it('a part drawn in the middle card only is not repeated', () => {
    const m = jobBoard().map((x) => x.strokeId === 'apply' ? { ...x, box: { ...x.box, y: 174 + 288 } } : x)
    expect(partsDrawnOnce(m)).toHaveLength(0)
  })
  it('checks every card has Apply at the drawn spot', () => {
    const one = { nodes: [node('a0', 1095, 172, 110, 34, 'Apply')] }
    const v1 = verifyDrawnOnce(jobBoard(), one)
    expect(v1.satisfied).toBe(false)
    expect(v1.reason).toMatch(/missing from 4/)
    const all = { nodes: [0, 1, 2, 3, 4].map((i) => node(`a${i}`, 1100, 170 + i * 144, 104, 38, 'Apply')) }
    expect(verifyDrawnOnce(jobBoard(), all).satisfied).toBe(true)
  })
  it('a lone ring at the top left of a typed list is every row\'s avatar', () => {
    const note = 'Amara Okafor Northwind; Ben Hollis Acme Co; Chen Wei Blue Fin; Dana Price Lumen; Elif Kaya Orbit Labs'
    expect(listedRows(note)).toBe(5)
    const marks = [box('list', 261, 101, 450, 760, { typed: [{ text: note, x: 560, y: 500 }] }), ring('av', 303, 117, 40, 40)]
    const f = partsDrawnOnce(marks)
    expect(f).toHaveLength(1)
    expect(f[0]!.kind).toBe('list')
    expect(verifyDrawnOnce(marks, { nodes: [node('r', 303, 117, 40, 40)] }).satisfied).toBe(false)
    expect(verifyDrawnOnce(marks, { nodes: [0, 1, 2, 3, 4].map((i) => node(`r${i}`, 300, 115 + i * 60, 36, 36)) }).satisfied).toBe(true)
  })
  it('rings drawn on every row are not a lone first-row part', () => {
    const note = 'A; B; C; D'
    const marks = [box('list', 261, 101, 450, 400, { typed: [{ text: note, x: 560, y: 300 }] }), ...[0, 1, 2, 3].map((i) => ring(`av${i}`, 303, 117 + i * 90, 40, 40))]
    expect(partsDrawnOnce(marks)).toHaveLength(0)
  })
})

describe('n112: ticked options are a checkbox list', () => {
  const note = 'Job type: Full time ✓, Part time, Remote ✓; Level: Junior, Mid ✓, Senior; Salary: $60k+, $90k+ ✓, $120k+; teal checks'
  it('reads groups, headings and ticks', () => {
    const g = checklistOf(note)!
    expect(g.map((x) => x.heading)).toEqual(['Job type', 'Level', 'Salary'])
    expect(g.flatMap((x) => x.options.filter((o) => o.on).map((o) => o.label))).toEqual(['Full time', 'Remote', 'Mid', '$90k+'])
    expect(checklistBrief([note])).toMatch(/\[x\] Full time/)
    expect(checklistOf('Shop, Visit, Recipes')).toBeNull()
  })
  it('checks each option is its own label', () => {
    const labels = ['Full time', 'Part time', 'Remote', 'Junior', 'Mid', 'Senior', '$60k+', '$90k+', '$120k+']
    expect(verifyChecklists([note], { nodes: labels.map((t, i) => ({ id: `n${i}`, text: t })) }).satisfied).toBe(true)
    expect(verifyChecklists([note], { nodes: [{ id: 'x', text: 'Full time ✓, Part time, Remote ✓' }] }).satisfied).toBe(false)
  })
})

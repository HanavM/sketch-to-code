import { describe, expect, it } from 'vitest'
import { inkColoursBrief, penFrameBox, selectedBuilt, selectedChip } from '../src/inkcolour.js'
import { linkLines } from '../src/linkline.js'
import { verifyTextLinesNotRules } from '../src/textrules.js'

const rect = (id: string, x: number, y: number, w: number, h: number, color: string | null = null) => ({
  id, color, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x: x + 2, y: y + 2 }],
})
const page = { target: null, color: '#effcf3', dotId: 'd0' }
const dn = (id: string, tag: string, x: number, y: number, w: number, h: number, style: Record<string, string> = {}, text = '') =>
  ({ id, tag, rect: { x, y, w, h }, text, parent: null, style: { backgroundColor: 'rgba(0, 0, 0, 0)', ...style } }) as never

describe('n135 a strong pen chip noted selected is a pale chip with a border, not a solid block', () => {
  it('reads the Biscuit pill (mid green pen, "Biscuit selected, avatar") as a selected chip with a dot', () => {
    const s = selectedChip('#16a34a', { w: 150, h: 64 }, ['Biscuit selected, avatar'])
    expect(s).not.toBeNull()
    expect(s!.dot).toBe(true)
    expect([1, 3, 5].map((k) => parseInt(s!.tint.slice(k, k + 2), 16)).every((v) => v >= 210)).toBe(true)
    const bis = rect('bis', 60, 170, 150, 64, '#16a34a')
    expect(penFrameBox(bis, [bis], [page], ['Biscuit selected, avatar'], { w: 150, h: 64 })).toBe(true)
  })
  it('leaves alone: no state word, a fill note, light or dark pens, big panels', () => {
    expect(selectedChip('#16a34a', { w: 150, h: 64 }, ['Biscuit'])).toBeNull()
    expect(selectedChip('#16a34a', { w: 150, h: 64 }, ['selected, solid green'])).toBeNull()
    expect(selectedChip('#bbf7d0', { w: 150, h: 64 }, ['selected'])).toBeNull()
    expect(selectedChip('#111827', { w: 150, h: 64 }, ['selected'])).toBeNull()
    expect(selectedChip('#16a34a', { w: 600, h: 300 }, ['active plan'])).toBeNull()
  })
  it('tells the build a pale tint and a border', () => {
    const c = { strokeId: 'bis', mark: 'box', paint: 'border' as const, color: '#16a34a', box: { x: 60, y: 170, w: 150, h: 64 }, how: 'pen' as const, selected: { tint: '#e5f6eb', dot: true } }
    const b = inkColoursBrief({ actions: [{ inkColours: [c] }] as never, pageFill: undefined } as never)
    expect(b).toContain('SELECTED CHIP')
    expect(b).toContain('NEVER a solid #16a34a block')
    expect(b).toContain('avatar')
  })
  it('checks it: a solid block fails, a pale framed chip with a dot passes', () => {
    const c = { color: '#16a34a', box: { x: 60, y: 170, w: 150, h: 64 }, selected: { tint: '#e5f6eb', dot: true } }
    expect(selectedBuilt(c, [dn('a', 'button', 60, 180, 150, 44, { backgroundColor: 'rgb(22, 163, 74)' })]).ok).toBe(false)
    const pale = dn('a', 'button', 60, 180, 150, 44, { backgroundColor: 'rgb(229, 246, 235)', border: '2px solid rgb(22, 163, 74)' })
    expect(selectedBuilt(c, [pale]).ok).toBe(false)
    expect(selectedBuilt(c, [pale, dn('d', 'span', 70, 190, 24, 24, { backgroundColor: 'rgb(187, 247, 208)' })]).ok).toBe(true)
    expect(selectedBuilt({ ...c, selected: { tint: '#e5f6eb', dot: false } }, [pale]).ok).toBe(true)
  })
})

describe('n135 a heading on a drawn line is never an underlined link', () => {
  const line = (id: string, x0: number, x1: number, y: number, words: string) =>
    ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, words })
  it('"Book a visit" in dark green is not a link; "Visit the shop" in red is', () => {
    const ink = (id: string, color: string) => ({ strokeId: id, paint: 'text', color, how: 'pen' })
    expect(linkLines([{ shapeMarks: [line('h', 60, 228, 127, 'Book a visit')], inkColours: [ink('h', '#16a34a')] }])).toEqual([])
    expect(linkLines([{ shapeMarks: [line('h', 60, 228, 127, 'Visit the shop')], inkColours: [ink('h', '#14532d')] }])).toEqual([])
    expect(linkLines([{ shapeMarks: [line('h', 60, 228, 127, 'Visit the shop')], inkColours: [ink('h', '#ef4444')] }]).length).toBe(1)
    expect(linkLines([{ shapeMarks: [line('h', 60, 228, 127, 'Read more')], inkColours: [ink('h', '#2563eb')] }]).length).toBe(1)
  })
  it('a text-decoration underline on a heading drawn on a line fails the no-rules check', () => {
    const m = [line('h', 60, 228, 127, 'Book a visit')]
    const t = dn('t', 'h1', 60, 100, 150, 26, { textDecoration: 'underline' }, 'Book a visit')
    expect(verifyTextLinesNotRules(m, { nodes: [t] }).satisfied).toBe(false)
    expect(verifyTextLinesNotRules(m, { nodes: [dn('t', 'h1', 60, 100, 150, 26, {}, 'Book a visit')] }).satisfied).toBe(true)
  })
})

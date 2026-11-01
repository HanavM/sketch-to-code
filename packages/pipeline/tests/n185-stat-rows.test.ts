import { describe, expect, it } from 'vitest'
import { statRowBrief, statRowOf, verifyStatRows } from '../src/statrow.js'

const GYM = '£14 day pass, £52 monthly, 6–23 open daily; big bold, label under'
const node = (id: string, text: string, x: number, y: number, w: number, h: number, fontSize: string, fontWeight = '400') =>
  ({ id, text, textBox: { x, y, w, h }, rect: { x, y, w, h }, style: { fontSize, fontWeight } })

describe('n185 stats row typed as one note', () => {
  it('reads the gym note as three stats, big, bold, label under', () => {
    const r = statRowOf(GYM)!
    expect(r.items).toEqual([{ value: '£14', label: 'day pass' }, { value: '£52', label: 'monthly' }, { value: '6–23', label: 'open daily' }])
    expect(r).toMatchObject({ size: 'big', bold: true, labelAbove: false })
    expect(statRowBrief([GYM])).toMatch(/about 30px/)
  })
  it('reads label-first items, huge, and a trailing look part', () => {
    const r = statRowOf('Members 1,200, Courses 48, huge, label above')!
    expect(r.items).toEqual([{ value: '1,200', label: 'Members' }, { value: '48', label: 'Courses' }])
    expect(r).toMatchObject({ size: 'huge', labelAbove: true })
  })
  it('reads earlier stats rows typed the same way (ski lodge, observatory)', () => {
    expect(statRowOf('42 runs open, -6° at the top, 18 cm fresh snow; big numbers, label under')!.items.map((i) => i.value)).toEqual(['42', '-6°', '18 cm'])
    expect(statRowOf('1.2 m mirror, 14 clear nights a month, 40,000 visitors a year, 1962 first light; big bold number, small grey label under')!.items.map((i) => i.label))
      .toEqual(['mirror', 'clear nights a month', 'visitors a year', 'first light'])
    expect(statRowOf('Maple 3.50, Berry 3.80, Cocoa 3.60, bold')).toBeNull()
    expect(statRowOf('Bitcoin bold, 0.21 BTC, $14,120, +2.4% green')).toBeNull()
  })
  it('leaves prose, single stats, lists without a size word and times alone', () => {
    expect(statRowOf('200 routes reset every week. Shoes and chalk included.')).toBeNull()
    expect(statRowOf('£14 day pass, big bold')).toBeNull()
    expect(statRowOf('£14 day pass, £52 monthly')).toBeNull()
    expect(statRowOf('Mon 14, Tue 15, Wed 16, small grey')).toBeNull()
    expect(statRowOf('Classes Prices Open late, bold')).toBeNull()
    expect(statRowBrief(['Crux bold'])).toBe('')
  })
  it('fails body-size values and passes big bold values with labels under', () => {
    const small = { nodes: [node('a', '£14', 64, 727, 26, 19, '15px', '700'), node('b', 'day pass', 64, 750, 50, 14, '12px'),
      node('c', '£52', 180, 727, 26, 19, '15px', '700'), node('d', 'monthly', 180, 750, 50, 14, '12px')] }
    const v = verifyStatRows([GYM], small)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/"£14" is 15px.*about 30px/)
    const good = { nodes: [node('a', '£14', 64, 720, 50, 36, '30px', '700'), node('b', 'day pass', 64, 760, 50, 16, '13px'),
      node('c', '£52', 180, 720, 50, 36, '30px', '700'), node('d', 'monthly', 180, 760, 50, 16, '13px'),
      node('e', '6–23', 300, 720, 60, 36, '30px', '700'), node('f', 'open daily', 300, 760, 60, 16, '13px')] }
    expect(verifyStatRows([GYM], good)).toMatchObject({ satisfied: true })
  })
  it('fails a label above when typed under, and a value sharing its label element', () => {
    const above = { nodes: [node('a', '£14', 64, 740, 50, 36, '30px', '700'), node('b', 'day pass', 64, 715, 50, 16, '13px')] }
    expect(verifyStatRows([GYM], above).reason).toMatch(/sits above/)
    const shared = { nodes: [node('a', '£14 day pass', 64, 740, 120, 20, '16px', '700')] }
    expect(verifyStatRows([GYM], shared).reason).toMatch(/shares one text element/)
  })
  it('is not judged when nothing was typed so', () => {
    expect(verifyStatRows(['Crux bold'], { nodes: [] })).toMatchObject({ unverifiable: true })
  })
})

import { isTableRow, notHeading } from '../src/linespread.js'
describe('n185 a stats row is never a body-size table row', () => {
  it('lets the gym note be big', () => {
    expect(isTableRow(GYM)).toBe(false)
    expect(notHeading(GYM)).toBe(false)
    expect(isTableRow('14:40 Lisbon TP 1351 B12 Boarding')).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { rowData, rowDataBrief, verifyRowData } from '../src/rowdata.js'

const SIDEBAR = '#design / New logo is up, Ravi Patel / sounds good, #support / 3 new tickets, Lena Ortiz / call at 2?'

describe('n105 name / preview pairs split by commas', () => {
  it('reads one row per pair, name then preview', () => {
    const d = rowData(SIDEBAR)!
    expect(d.rows).toEqual([
      ['#design', 'New logo is up'],
      ['Ravi Patel', 'sounds good'],
      ['#support', '3 new tickets'],
      ['Lena Ortiz', 'call at 2?'],
    ])
    expect(d.total).toBeNull()
  })
  it('works for two pairs', () => {
    expect(rowData('Anna / see you soon, Ben / ok')!.rows).toEqual([['Anna', 'see you soon'], ['Ben', 'ok']])
  })
  it('leaves plain slash rows alone', () => {
    expect(rowData('Piranesi · 3 Nov / Educated · 22 Nov / Circe · 1 Dec')!.rows).toEqual([['Piranesi', '3 Nov'], ['Educated', '22 Nov'], ['Circe', '1 Dec']])
    expect(rowData('Home / Work / Travel')!.rows).toEqual([['Home'], ['Work'], ['Travel']])
  })
  it('does not pair when an outer piece has a comma or the tail is long', () => {
    expect(rowData('Milk, eggs / Bread, butter / Jam')!.rows.length).toBe(3)
    expect(rowData('A / one, and then a very long sentence follows here / B')!.rows).toEqual([['A'], ['one, and then a very long sentence follows here'], ['B']])
  })
  it('briefs the pairs as rows of cells and checks them', () => {
    const b = rowDataBrief([SIDEBAR])
    expect(b).toContain('row 2 = "Ravi Patel" | "sounds good"')
    const node = (id: string, y: number, text: string) => ({ id, rect: { x: 40, y, w: 100, h: 14 }, text })
    const good = { nodes: [node('a', 130, '#design'), node('b', 145, 'New logo is up'), node('c', 162, 'Ravi Patel'), node('d', 177, 'sounds good'), node('e', 194, '#support'), node('f', 209, '3 new tickets'), node('g', 226, 'Lena Ortiz'), node('h', 241, 'call at 2?')] }
    expect(verifyRowData([SIDEBAR], good).satisfied).toBe(true)
    const bad = { nodes: [node('a', 130, '#design'), node('b', 162, 'New logo is up, Ravi Patel'), node('c', 194, 'sounds good, #support')] }
    expect(verifyRowData([SIDEBAR], bad).satisfied).toBe(false)
  })
})

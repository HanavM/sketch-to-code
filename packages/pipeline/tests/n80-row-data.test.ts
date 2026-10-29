import { describe, expect, it } from 'vitest'
import { hasSampleRows, rowData, rowDataBrief, verifyRowData } from '../src/rowdata.js'
import { verifyOwnWords } from '../src/ownwords.js'

let k = 0
const leaf = (text: string, x: number, y: number, fontSize = '16px', fontWeight = '400') =>
  ({ id: `n${String(k++)}`, text, rect: { x, y, w: 200, h: 20 }, textBox: { x, y, w: 160, h: 20 }, style: { fontSize, fontWeight } })

describe('a note gives rows the short way (n80)', () => {
  it('splits slash rows and dot cells, look tails off', () => {
    const d = rowData('The Salt Path · 2 Nov · Due soon / Piranesi · 3 Nov · Due soon / Educated · 22 Nov · On time, small')!
    expect(d.rows).toEqual([['The Salt Path', '2 Nov', 'Due soon'], ['Piranesi', '3 Nov', 'Due soon'], ['Educated', '22 Nov', 'On time']])
    expect(d.total).toBeNull()
  })
  it('reads "5 rows:" slash rows typed as one run of words', () => {
    const d = rowData('5 rows: 1 60 kg 10 90 s / 2 70 kg 8 90 s / 3 75 kg 6 120 s')!
    expect(d.rows).toEqual([['1 60 kg 10 90 s'], ['2 70 kg 8 90 s'], ['3 75 kg 6 120 s']])
  })
  it('splits one card note into its parts and drops its look tail', () => {
    const d = rowData('Levothyroxine 75 mcg · 1 tablet before breakfast · 2 days left, teal Refill')
    expect(d?.rows).toEqual([['Levothyroxine 75 mcg', '1 tablet before breakfast', '2 days left']])
  })
  it('reads sample-row counts in every short form', () => {
    expect(rowData('The Salt Path · 2 Nov · Due soon, 6 rows like this')?.total).toBe(6)
    expect(rowData('The Salt Path · 2 Nov · Due soon, 5 more like this')?.total).toBe(6)
    expect(rowData('Maya · +212.40 x5')?.total).toBe(5)
    expect(rowData('Maya · +212.40 ×5')?.rows).toEqual([['Maya', '+212.40']])
    expect(hasSampleRows(['Maya · +212.40, 5 like this'])).toBe(true)
  })
  it('leaves ordinary notes alone', () => {
    expect(rowData('Northgate Library, white bold')).toBeNull()
    expect(rowData('Search the catalogue, grey')).toBeNull()
    expect(rowData('2/3 done')).toBeNull()
    expect(rowData('6 like this')).toBeNull()
    expect(hasSampleRows(['6 rows, title + grey line'])).toBe(false)
  })
  it('tells the build the rows, the parts and the sample count', () => {
    const b = rowDataBrief(['The Salt Path · 2 Nov · Due soon, 6 rows like this'])
    expect(b).toContain('exactly 6 rows')
    expect(b).toContain('SAMPLE values')
    expect(b).toContain('"The Salt Path" | "2 Nov" | "Due soon"')
    expect(rowDataBrief(['Hello'])).toBe('')
  })
})

describe('the page is checked (n80)', () => {
  it('fails cells run together in one line, passes them apart', () => {
    const note = ['Sertraline 50 mg · 1 tablet daily · 4 days left']
    expect(verifyRowData(note, { nodes: [leaf('Sertraline 50 mg · 1 tablet daily · 4 days left', 0, 0)] }).satisfied).toBe(false)
    expect(verifyRowData(note, { nodes: [leaf('Sertraline 50 mg', 0, 0), leaf('1 tablet daily', 0, 20), leaf('4 days left', 400, 10)] }).satisfied).toBe(true)
  })
  it('fails a missing or out-of-order row', () => {
    const note = ['Piranesi · 3 Nov / Educated · 22 Nov / Circe · 1 Dec']
    expect(verifyRowData(note, { nodes: [leaf('Piranesi', 0, 0), leaf('Educated', 0, 40)] }).satisfied).toBe(false)
    expect(verifyRowData(note, { nodes: [leaf('Educated', 0, 0), leaf('Piranesi', 0, 40), leaf('Circe', 0, 80)] }).satisfied).toBe(false)
    expect(verifyRowData(note, { nodes: [leaf('Piranesi', 0, 0), leaf('Educated', 0, 40), leaf('Circe', 0, 80)] }).satisfied).toBe(true)
  })
  it('counts sample rows in the first cell\'s column and look', () => {
    const note = ['The Salt Path · 2 Nov · Due soon, 4 rows like this']
    const rows = (n: number) => ['The Salt Path', 'Circe', 'Piranesi', 'Educated', 'Beloved'].slice(0, n).map((t, i) => leaf(t, 40, 100 + 48 * i, '16px', '600'))
    expect(verifyRowData(note, { nodes: rows(2) }).satisfied).toBe(false)
    expect(verifyRowData(note, { nodes: rows(4) }).satisfied).toBe(true)
    expect(verifyRowData(note, { nodes: [...rows(4), leaf('4 rows like this', 40, 400)] }).satisfied).toBe(false)
    // pharmacy (n80 try 1): the sample rows came without the first row's circle, so their names start further left
    const shifted = [leaf('The Salt Path', 90, 100, '16px', '600'), ...['Circe', 'Piranesi', 'Educated'].map((t, i) => leaf(t, 40, 148 + 48 * i, '16px', '600'))]
    const v = verifyRowData(note, { nodes: shifted })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('every part of the first row')
  })
  it('lets sample words stand off the drawn marks when sample rows were asked for', () => {
    const before = { nodes: [] }
    const after = { nodes: [leaf('Braiding Sweetgrass novel', 600, 600)] }
    const marks = [{ box: { x: 0, y: 0, w: 100, h: 20 }, shape: 'line' }]
    expect(verifyOwnWords(['The Salt Path'], marks, before, after).satisfied).toBe(false)
    expect(verifyOwnWords(['The Salt Path'], marks, before, after, { samples: true }).satisfied).toBe(true)
  })
})

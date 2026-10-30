import { describe, expect, it } from 'vitest'
import { buttonLabel, buttonLabelBrief, verifyButtonLabels } from '../src/buttonlabel.js'
import { statOf } from '../src/statcard.js'
import { commaDotCells, rowData, verifyRowData } from '../src/rowdata.js'

const leaf = (id: string, text: string, y = 0) => ({ id, text, rect: { x: 0, y, w: 100, h: 20 }, textBox: { x: 0, y, w: 100, h: 20 } })

describe('n111: a button label with a number stays the label', () => {
  it('round 38 hotel "Reserve · 4 nights" is a button label, never a stat or a row', () => {
    expect(buttonLabel('Reserve · 4 nights')).toBe('Reserve · 4 nights')
    expect(statOf(['Reserve · 4 nights'])).toBeNull()
    expect(rowData('Reserve · 4 nights')).toBeNull()
    expect(buttonLabelBrief(['Reserve · 4 nights'])).toContain('"Reserve · 4 nights"')
  })
  it('real stats and plain words are untouched', () => {
    expect(buttonLabel('Income 3,800')).toBeNull()
    expect(buttonLabel('Sign in')).toBeNull()
    expect(buttonLabel('3 rooms available')).toBeNull()
    expect(statOf(['6 big, on loan grey'])).not.toBeNull()
    expect(statOf(['Total lifted, grey', '12480 kg, huge bold white'])).not.toBeNull()
  })
  it('the page check wants the label as one piece of text', () => {
    expect(verifyButtonLabels(['Reserve · 4 nights'], { nodes: [leaf('a', 'Reserve · 4 nights')] }).satisfied).toBe(true)
    expect(verifyButtonLabels(['Reserve · 4 nights'], { nodes: [leaf('a', '4'), leaf('b', 'Reserve')] }).satisfied).toBe(false)
  })
})

describe('n111: name, comma, dotted details line', () => {
  it('round 38 job and room rows', () => {
    expect(commaDotCells('Product designer, Fernway · Remote · $95k')).toEqual(['Product designer', 'Fernway · Remote · $95k'])
    expect(commaDotCells('Garden double, Queen bed · courtyard view, $140')).toEqual(['Garden double', 'Queen bed · courtyard view', '$140'])
    expect(rowData('Product designer, Fernway · Remote · $95k; tag New')?.rows).toEqual([['Product designer', 'Fernway · Remote · $95k']])
  })
  it('dotted rows without a leading name are unchanged', () => {
    expect(commaDotCells('Sertraline 50 mg · 1 tablet daily · 4 days left')).toBeNull()
    expect(rowData('Sertraline 50 mg · 1 tablet daily · 4 days left')?.rows).toEqual([['Sertraline 50 mg', '1 tablet daily', '4 days left']])
    expect(rowData('Piranesi · 3 Nov / Educated · 22 Nov')?.rows.length).toBe(2)
  })
  it('the page check wants the details line whole', () => {
    const n = ['Product designer, Fernway · Remote · $95k']
    expect(verifyRowData(n, { nodes: [leaf('a', 'Product designer'), leaf('b', 'Fernway · Remote · $95k', 20)] }).satisfied).toBe(true)
    expect(verifyRowData(n, { nodes: [leaf('a', 'Product designer'), leaf('b', 'Remote', 20), leaf('c', '$95k', 20)] }).satisfied).toBe(false)
  })
})

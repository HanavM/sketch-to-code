import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { directionStrings, noteParts, typedCopyBrief, verifyNoDirections } from '../src/typedcopy.js'
import { drawnOrderBrief, verifyDrawnOrder } from '../src/drawnorder.js'

const mia = 'Mia · 2:14 pm above; Copy is final. Can someone check the pricing page on mobile?'
const img = 'Mia · 2:31 pm above; image in grey bubble'
const snap = (texts: string[]) => ({ nodes: texts.map((text, i) => ({ id: String(i), text })), truncated: false })

describe('n104: position words in a note are never copy; a sentence after a semicolon is copy', () => {
  it('splits a label with a position word from its message', () => {
    const p = noteParts(mia)
    expect(p.copy).toBe('Mia · 2:14 pm')
    expect(p.place).toBe('above')
    expect(p.more).toEqual(['Copy is final. Can someone check the pricing page on mobile?'])
    expect(p.directions).toEqual([])
  })

  it('keeps a direction after a semicolon as a direction', () => {
    const p = noteParts(img)
    expect(p.copy).toBe('Mia · 2:31 pm')
    expect(p.place).toBe('above')
    expect(p.directions).toEqual(['image in grey bubble'])
    expect(noteParts('Read 20 pages, bold; done M T W F').directions).toEqual(['done M T W F'])
  })

  it('takes look words out of a position tail', () => {
    const p = noteParts('Mia · 2:14 pm small grey above; Copy is final today.')
    expect(p.copy).toBe('Mia · 2:14 pm')
    expect(p.place).toBe('above')
    expect(p.look).toBe('small grey')
  })

  it('leaves plain copy that ends in a position word alone', () => {
    expect(noteParts('Rise above').copy).toBe('Rise above')
    expect(noteParts('The sky above').copy).toBe('The sky above')
    expect(noteParts('Shipping at 5 then.').place).toBeUndefined()
  })

  it('tells the build the label, where it goes, and the message as copy', () => {
    const b = typedCopyBrief([mia])
    expect(b).toContain('"Mia · 2:14 pm" and "Copy is final.')
    expect(b).toMatch(/"above" says WHERE the label/)
  })

  it('fails "2:14 pm above" printed, even with the name in its own span; never flags the message', () => {
    const bad = verifyNoDirections([mia], snap(['Mia', '2:14 pm above', 'Copy is final. Can someone check the pricing page on mobile?']))
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('a position word')
    expect(bad.reason).not.toContain('Copy is final. Can someone check the pricing page on mobile?" (a direction')
    const good = verifyNoDirections([mia], snap(['Mia', '2:14 pm', 'Copy is final. Can someone check the pricing page on mobile?']))
    expect(good.satisfied).toBe(true)
    expect(directionStrings([mia]).map((d) => d.why)).toEqual(['a position word'])
  })
})

type R = { x: number; y: number; w: number; h: number }
const box = (id: string, b: R, own: string): ShapeMark => ({ strokeId: id, shape: 'box', box: b, own }) as ShapeMark
const marks = [
  box('m1', { x: 340, y: 130, w: 451, h: 50 }, mia),
  box('m2', { x: 866, y: 220, w: 374, h: 50 }, 'On it. Looks fine on iPhone, checking Android now.'),
  box('m3', { x: 340, y: 330, w: 361, h: 50 }, 'Ravi · 2:20 pm above; Android is good too. One typo in the footer, fixed.'),
]
const node = (id: string, rect: R, text: string) => ({ id, rect, text, style: { fontSize: '14px' } })

describe('n104: a stacked bubble is as wide as its drawn box', () => {
  it('tells the drawn width', () => {
    expect(drawnOrderBrief([{ shapeMarks: marks }])).toContain('x 340-791 (451px wide)')
  })
  it('fails a message wrapped in a bubble much narrower than drawn', () => {
    const v = verifyDrawnOrder(marks, { truncated: false, nodes: [
      node('a', { x: 360, y: 140, w: 220, h: 38 }, 'Copy is final. Can someone check the pricing page on mobile?'),
      node('b', { x: 880, y: 235, w: 340, h: 18 }, 'On it. Looks fine on iPhone, checking Android now.'),
      node('c', { x: 360, y: 345, w: 330, h: 18 }, 'Android is good too. One typo in the footer, fixed.'),
    ] })
    expect(v.satisfied).toBe(false)
    expect(v.narrow?.[0]).toMatch(/451px wide is built 220px wide/)
  })
  it('passes one-line messages near their drawn width', () => {
    const v = verifyDrawnOrder(marks, { truncated: false, nodes: [
      node('a', { x: 360, y: 145, w: 410, h: 18 }, 'Copy is final. Can someone check the pricing page on mobile?'),
      node('b', { x: 880, y: 235, w: 340, h: 18 }, 'On it. Looks fine on iPhone, checking Android now.'),
      node('c', { x: 360, y: 345, w: 330, h: 18 }, 'Android is good too. One typo in the footer, fixed.'),
    ] })
    expect(v.satisfied).toBe(true)
  })
})

import { rowData } from '../src/rowdata.js'
describe('n104: a placed label is no row of data', () => {
  it('reads "Mia · 2:14 pm above; message" as a label, but a dotted row still as a row', () => {
    expect(rowData(mia)).toBeNull()
    expect(rowData('Mia · 2:14 pm · Online')?.rows[0]).toEqual(['Mia', '2:14 pm', 'Online'])
  })
})

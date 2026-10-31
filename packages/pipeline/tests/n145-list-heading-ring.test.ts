import { describe, expect, it } from 'vitest'
import { listItems, listLead } from '../src/rowwords'
import { listUnderHeading } from '../src/textplace'
import { shapeOf } from '../src/shapemark'

const pts = (w: number[][]) => w.map(([x, y]) => ({ x: x!, y: y! }))

describe('n145 a list note starts under its heading', () => {
  const list = { text: 'checkbox list: 200 g ricotta, 2 eggs, 120 g flour, 1 lemon', x: 700, y: 440 }
  const head = { text: 'Ingredients bold', x: 680, y: 322 }
  it('moves to heading + 40 when nothing is between', () => {
    expect(listUnderHeading([list], [head, list], [])[0]!.y).toBe(362)
  })
  it('keeps its spot when a mark is drawn between', () => {
    expect(listUnderHeading([list], [head, list], [{ x: 660, y: 360, w: 300, h: 40 }])[0]!.y).toBe(440)
  })
  it('keeps its spot when another note is between', () => {
    expect(listUnderHeading([list], [head, { text: 'Fresh from the market this week', x: 690, y: 380 }, list], [])[0]!.y).toBe(440)
  })
  it('a big box holding both does not block', () => {
    expect(listUnderHeading([list], [head, list], [{ x: 600, y: 100, w: 600, h: 600 }])[0]!.y).toBe(362)
  })
  it('only list notes move; a far heading does not pull', () => {
    const plain = { text: 'Free delivery over £40', x: 700, y: 440 }
    expect(listUnderHeading([plain], [head, plain], [])[0]!.y).toBe(440)
    expect(listUnderHeading([list], [{ ...head, x: 300 }, list], [])[0]!.y).toBe(440)
  })
})

describe('n145 a list lead is never copy', () => {
  it('slash steps with a semicolon inside one step', () => {
    expect(listItems('steps: Whisk ricotta, eggs, milk and zest until smooth. / Fold in flour and sugar; rest five minutes. / Fry spoonfuls in butter, two minutes a side.'))
      .toEqual(['Whisk ricotta, eggs, milk and zest until smooth.', 'Fold in flour and sugar; rest five minutes.', 'Fry spoonfuls in butter, two minutes a side.'])
  })
  it('semicolon items lose a short lead, label: value rows keep theirs', () => {
    expect(listItems('legend: Rent $1,120; Food $700; Travel $520')).toEqual(['Rent $1,120', 'Food $700', 'Travel $520'])
    expect(listItems('Mon: 9-5; Tue: 10-4')).toEqual(['Mon: 9-5', 'Tue: 10-4'])
    expect(listItems('Rent $1,120; Food $700')).toEqual(['Rent $1,120', 'Food $700'])
  })
  it('a lead is one to three words, no digits', () => {
    expect(listLead('checkbox list: a, b').lead).toBe('checkbox list')
    expect(listLead('Total 2: $40').lead).toBeNull()
    expect(listLead('3 rides, grey thumb, price right: Standard').lead).toBeNull()
  })
})

describe('n145 a small ring stays round', () => {
  it('a 24px octagon ring is a ring', () => {
    expect(shapeOf(pts([[652, 626], [650, 633], [644, 637], [636, 637], [630, 633], [628, 626], [630, 619], [636, 615], [644, 615], [650, 619], [652, 626]]))?.shape).toBe('ellipse')
  })
  it('a 24px square is still a box', () => {
    expect(shapeOf(pts([[600, 600], [624, 600], [624, 624], [600, 624], [600, 600]]))?.shape).toBe('box')
  })
})

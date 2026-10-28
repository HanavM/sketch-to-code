import { describe, expect, it } from 'vitest'
import { verifyOwnWords, wordsOf } from '../src/ownwords.js'

const node = (id: string, text: string, x: number, y: number, w: number, h: number, parent: string | null = 'root') =>
  ({ id, parent, text, rect: { x, y, w, h }, textBox: { x, y, w, h } })
const root = { id: 'root', parent: null, text: '', rect: { x: 0, y: 0, w: 1280, h: 900 } }
const blank = { nodes: [root] }
const typed = ['Small batch, roasted on Thursdays. serif dark brown', 'Single-origin beans, shipped within two days of roasting.', 'Shop beans']
// r32 c2 (n39 try 2) geometry: three heading lines drawn, the third got invented copy on top of "Thursdays."
const marks = [
  { box: { x: 75, y: 320, w: 280, h: 4 } }, { box: { x: 75, y: 395, w: 280, h: 4 } }, { box: { x: 75, y: 465, w: 300, h: 4 } },
  { box: { x: 75, y: 520, w: 480, h: 4 } }, { box: { x: 75, y: 572, w: 160, h: 56 } },
]

describe('n41 own words', () => {
  it('words are compared loosely', () => {
    expect(wordsOf('Small batch, roasted on Thursdays.')).toEqual(['small', 'batch', 'roasted', 'on', 'thursdays'])
  })
  it('catches invented copy built on top of the heading (roastery)', () => {
    const after = { nodes: [root,
      node('h1', 'Small batch, roasted on Thursdays.', 78, 290, 300, 200),
      node('p0', 'Fresh-roasted, thoughtfully sourced', 78, 445, 260, 40),
      node('p1', 'Single-origin beans, shipped within two days of roasting.', 78, 512, 470, 20),
      node('b', 'Shop beans', 90, 590, 120, 20)] }
    const v = verifyOwnWords(typed, marks, blank, after)
    expect(v.satisfied).toBe(false)
    expect(v.invented).toEqual(['Fresh-roasted, thoughtfully sourced'])
    expect(v.reason).toMatch(/nobody typed, built on top of "Small batch/)
  })
  it('passes the clean build', () => {
    const after = { nodes: [root,
      node('h1', 'Small batch, roasted on Thursdays.', 78, 290, 300, 200),
      node('p1', 'Single-origin beans, shipped within two days of roasting.', 78, 512, 470, 20),
      node('b', 'Shop beans', 90, 590, 120, 20)] }
    expect(verifyOwnWords(typed, marks, blank, after).satisfied).toBe(true)
  })
  it('leaves untyped words alone on a drawn line with room of their own', () => {
    const after = { nodes: [root, node('h1', 'Small batch, roasted on Thursdays.', 78, 290, 300, 140), node('p0', 'Fresh beans every week', 78, 455, 260, 22)] }
    expect(verifyOwnWords(typed, marks, blank, after).satisfied).toBe(true)
  })
  it('fails untyped words on no drawn mark', () => {
    const after = { nodes: [root, node('h1', 'Small batch, roasted on Thursdays.', 78, 290, 300, 140), node('x', 'Free shipping over $40', 900, 820, 200, 20)] }
    const v = verifyOwnWords(typed, marks, blank, after)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/on no drawn mark/)
  })
  it('fails typed words run into each other, but not a label inside its parent', () => {
    const after = { nodes: [root,
      node('h1', 'Small batch, roasted on Thursdays.', 78, 290, 300, 200),
      node('p1', 'Single-origin beans, shipped within two days of roasting.', 78, 470, 470, 20),
      node('b', 'Shop beans', 90, 590, 120, 20), node('bi', 'beans', 100, 592, 60, 16, 'b')] }
    const v = verifyOwnWords(typed, marks, blank, after)
    expect(v.satisfied).toBe(false)
    expect(v.overlaps).toHaveLength(1)
    expect(v.reason).toMatch(/runs into/)
  })
  it('an overlap already there before the run is not this run', () => {
    const a = node('a', 'Shop beans', 90, 590, 120, 20), b = node('c', 'Small batch', 95, 592, 100, 20)
    const snap = { nodes: [root, a, b] }
    expect(verifyOwnWords(typed, marks, snap, snap).satisfied).toBe(true)
  })
})

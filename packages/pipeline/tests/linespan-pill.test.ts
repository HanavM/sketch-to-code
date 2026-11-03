import { describe, expect, it } from 'vitest'
import { verifyLineSpan, copyWords } from '../src/linespan.js'
import { shapeOf, cleanPath } from '../src/shapemark.js'

/**
 * n45. Round 32 c5 (bookshop): the heading typed on one 652px line came out ~490px wide three times,
 * unchecked; the button drawn wide with pointed ends was built as a hexagon. Strokes as drawn.
 */
const P = (a: number[][]) => a.map(([x, y]) => ({ x: x!, y: y! }))
const headingLine = { shape: 'line', box: { x: 313, y: 295, w: 652, h: 1 }, from: { x: 313, y: 295 }, to: { x: 965, y: 295 }, words: 'A quiet place to read. big italic serif green' }
const navLine = { shape: 'line', box: { x: 378, y: 47, w: 524, h: 1 }, from: { x: 378, y: 47 }, to: { x: 902, y: 47 }, words: 'Shop Events, Leaf & Spine big bold serif, Clubs Visit' }
const node = (id: string, text: string, tb: { x: number; y: number; w: number; h: number }, fs: number) => ({ id, rect: tb, textBox: tb, text, style: { fontSize: `${fs}px` } })

describe('one-line heading spans its drawn line (n45)', () => {
  it('copy words drop the style words', () => {
    expect(copyWords(headingLine.words)).toEqual(['quiet', 'place', 'to', 'read'])
  })
  it('a heading a quarter short of its line fails and names a bigger size', () => {
    const v = verifyLineSpan([headingLine], { nodes: [node('h1', 'A quiet place to read.', { x: 394, y: 268, w: 492, h: 58 }, 48)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/652px long/)
    expect(v.reason).toMatch(/from 48px to about 64px/)
  })
  it('a heading about as long as its line passes', () => {
    const v = verifyLineSpan([headingLine], { nodes: [node('h1', 'A quiet place to read.', { x: 318, y: 268, w: 640, h: 70 }, 62)] })
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
  })
  it('a heading running past its line fails and names a smaller size', () => {
    const v = verifyLineSpan([headingLine], { nodes: [node('h1', 'A quiet place to read.', { x: 200, y: 268, w: 880, h: 70 }, 70)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/down to about 52px/)
  })
  it('a nav row whose biggest word is one of several pieces is not judged', () => {
    const v = verifyLineSpan([navLine], { nodes: [node('a', 'Leaf & Spine', { x: 565, y: 35, w: 150, h: 26 }, 22), node('b', 'Shop', { x: 380, y: 40, w: 40, h: 16 }, 13)] })
    expect(v.unverifiable).toBe(true)
  })
  it('a line with no big-type note is not judged', () => {
    const v = verifyLineSpan([{ ...headingLine, words: 'An independent bookshop with a garden cafe' }], { nodes: [node('p', 'An independent bookshop with a garden cafe', { x: 400, y: 285, w: 300, h: 20 }, 15)] })
    expect(v.unverifiable).toBe(true)
  })
  it('a heading drawn as one line that wrapped onto two fails and asks for one line', () => {
    const v = verifyLineSpan([headingLine], { nodes: [node('h1', 'A quiet place to read.', { x: 394, y: 250, w: 400, h: 120 }, 48)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/ONE line .* about 2 lines/)
    expect(v.reason).toMatch(/nowrap/)
  })
  it('a line that is part of a drawn multi-line stack is left to the stack check', () => {
    const v = verifyLineSpan([{ ...headingLine, strokeId: 's3' }], { nodes: [node('h1', 'A quiet place to read.', { x: 394, y: 250, w: 400, h: 120 }, 48)] }, new Set(['s3']))
    expect(v.unverifiable).toBe(true)
  })
})

describe('a wide shape with flat sides and bulging ends is a pill (n45)', () => {
  it('the bookshop button, drawn with pointed ends, is a pill box', () => {
    const m = shapeOf(P([[550, 419], [730, 419], [755, 447], [730, 476], [550, 476], [525, 447], [550, 419]]))
    expect(m).toMatchObject({ shape: 'box', pill: true })
    expect(cleanPath(m!, { x: 0, y: 0 })).toMatch(/ A /)
  })
  it('a round-ended stadium is a pill', () => {
    const st: number[][] = []
    for (let i = 0; i <= 20; i++) st.push([350 + i * 10, 250])
    for (let i = 0; i <= 16; i++) { const t = -Math.PI / 2 + i / 16 * Math.PI; st.push([550 + 50 * Math.cos(t), 300 + 50 * Math.sin(t)]) }
    for (let i = 0; i <= 20; i++) st.push([550 - i * 10, 350])
    for (let i = 0; i <= 16; i++) { const t = Math.PI / 2 + i / 16 * Math.PI; st.push([350 + 50 * Math.cos(t), 300 + 50 * Math.sin(t)]) }
    expect(shapeOf(P(st))).toMatchObject({ shape: 'box', pill: true })
  })
  it('a wide ring stays a ring and a square-cornered box stays a plain box', () => {
    const ell: number[][] = []
    for (let i = 0; i <= 64; i++) { const t = i / 64 * 2 * Math.PI; ell.push([400 + 150 * Math.cos(t), 300 + 50 * Math.sin(t)]) }
    expect(shapeOf(P(ell))).toMatchObject({ shape: 'ellipse' })
    const b = shapeOf(P([[100, 100], [400, 100], [400, 160], [100, 160], [100, 100]]))
    expect(b).toMatchObject({ shape: 'box' })
    expect(b!.pill).toBeUndefined()
  })
  it('a tall shape is never a pill', () => {
    expect(shapeOf(P([[120, 100], [180, 100], [200, 200], [180, 300], [120, 300], [100, 200], [120, 100]]))?.pill).toBeUndefined()
  })
})

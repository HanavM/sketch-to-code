import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { labelledBoxes, noteFocus } from '../../ink/src/notefocus.js'
import { boxUnder, copyTokens, textPlaceBrief, verifyTextPlace } from '../src/textplace.js'
import type { ShapeMark } from '../src/shapemark.js'

// round 42 e3 shopping cart as drawn by hand in n162: the real strokes and notes
const d = JSON.parse(readFileSync(new URL('../../../tests/hand/out-n162/round42/e3-shopping-cart/digest.json', import.meta.url), 'utf8'))
const dens = (w: number[][]) => {
  const out: Array<{ x: number; y: number }> = []
  w.forEach((b, i) => {
    if (i === 0) { out.push({ x: b[0]!, y: b[1]! }); return }
    const a = w[i - 1]!; const n = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / 6))
    for (let k = 1; k <= n; k++) out.push({ x: a[0]! + (b[0]! - a[0]!) * k / n, y: a[1]! + (b[1]! - a[1]!) * k / n })
  })
  return out
}
const strokes = d.strokesDrawn.map((s: { way: number[][] }, i: number) => ({ id: 's' + i, points: dens(s.way) }))
const first = d.notesTyped.filter((n: { at: number }) => n.at < 33280)
const notesAt = first.map((n: { x: number; y: number; text: string }) => ({ x: n.x, y: n.y, text: n.text }))
// the summary panel's cluster: panel, its corner dot, the rule, the button, its dot
const panel = ['s9', 's10', 's11', 's12', 's13']
const focusOf = (text: string) => { const n = first.find((x: { text: string }) => x.text === text); return noteFocus(panel, undefined, { x: n.x, y: n.y }, strokes, text, { notesAt }) }

const box = (strokeId: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId, shape: 'box', box: { x, y, w, h } } as ShapeMark)
const P = { ...box('s9', 820, 180, 400, 290), typed: [{ text: 'Total $199 bold', x: 1000, y: 348 }] } as ShapeMark
const B = box('s12', 850, 385, 340, 56)
const tb = (text: string, x: number, y: number, w: number, h: number) => ({ id: text, tag: 'span', rect: { x, y, w, h }, text, textBox: { x, y, w, h } })

describe('n171 a note typed just above a drawn button is its own line', () => {
  it('the button holding its own label keeps it; the note above goes to the panel only', () => {
    expect([...labelledBoxes(panel, { x: 1000, y: 348 }, strokes, { notesAt }, 'Total $199 bold')]).toEqual(['s12'])
    expect(focusOf('Total $199 bold')).toEqual(['s9'])
    expect(focusOf('Checkout')).toEqual(['s12'])
    expect(focusOf('Summary bold')).toEqual(['s9'])
  })
  it('a button with no label of its own still takes a note typed just above it', () => {
    const bare = notesAt.filter((n: { text: string }) => n.text !== 'Checkout')
    const n = { x: 1000, y: 348 }
    expect(labelledBoxes(panel, n, strokes, { notesAt: bare }, 'Total $199 bold').size).toBe(0)
    expect(noteFocus(panel, undefined, n, strokes, 'Total $199 bold', { notesAt: bare })).toContain('s12')
  })
  it('tells the build the words are their own line above the button', () => {
    expect(boxUnder(P.box, { x: 1000, y: 348 }, [P, B])).toEqual(B.box)
    expect(boxUnder(P.box, { x: 1000, y: 221 }, [P, B])).toBeNull()
    expect(copyTokens('Total $199 bold')).toEqual(['total', '$199'])
    const brief = textPlaceBrief([{ shapeMarks: [P, B] }], { w: 1280, h: 800 })
    expect(brief).toContain('OWN line just ABOVE the smaller box drawn at (850,385)')
  })
  it('checks the words are not built inside the button', () => {
    const bad = { nodes: [tb('$199', 870, 392, 60, 22), tb('Total', 870, 418, 40, 12), tb('Checkout', 990, 455, 70, 16)] }
    const v = verifyTextPlace([P, B], bad, { w: 1280, h: 800 })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('inside that box')
    const good = { nodes: [tb('Total', 850, 340, 40, 18), tb('$199', 1150, 340, 40, 18), tb('Checkout', 990, 405, 70, 16)] }
    expect(verifyTextPlace([P, B], good, { w: 1280, h: 800 }).satisfied).toBe(true)
  })
})

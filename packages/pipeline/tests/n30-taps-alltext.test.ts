import { describe, expect, it } from 'vitest'
import { allTextColour, verifyAllText } from '../src/alltext.js'
import { markTappedSolids, solidsBrief, tapSolidsAllowed, verifySolids } from '../src/solids.js'
import type { ShapeMark } from '../src/shapemark.js'

const node = (id: string, text: string, color: string, rect = { x: 0, y: 0, w: 100, h: 20 }, bg = 'rgba(0, 0, 0, 0)', parent: string | null = null) =>
  ({ id, tag: 'div', srcLoc: null, parent, rect, text, classes: [], depth: 1, style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '', padding: '', margin: '', backgroundColor: bg, color, fontSize: '16px', fontWeight: '400', borderRadius: '0px' } })
const snap = (nodes: unknown[]) => ({ nodes, viewport: { w: 1280, h: 900 } }) as never

describe('n30 all text one colour', () => {
  it('reads the note in its common forms', () => {
    expect(allTextColour(['Lisbon', 'all text white'])?.hex).toBe('#ffffff')
    expect(allTextColour(['all the text is white'])?.word).toBe('white')
    expect(allTextColour(['white text everywhere'])?.word).toBe('white')
    expect(allTextColour(['white button "Go"', 'big bold headline'])).toBeNull()
  })
  it('fails when the panel text is dark and passes when it is all white', () => {
    const a = allTextColour(['all text white'])
    const dark = verifyAllText(a, snap([node('a', 'Lisbon', 'rgb(255, 255, 255)'), node('b', 'Saturday', 'rgb(51, 65, 85)'), node('c', 'Sunday', 'rgb(51, 65, 85)')]))
    expect(dark.satisfied).toBe(false)
    expect(dark.reason).toMatch(/Saturday/)
    const ok = verifyAllText(a, snap([node('a', 'Lisbon', 'rgb(255, 255, 255)'), node('b', 'Saturday', 'rgba(255, 255, 255, 0.8)')]))
    expect(ok.satisfied).toBe(true)
  })
})

describe('n30 a tapped ring is a solid disc', () => {
  const ring = (id: string, x: number, y: number, d: number): ShapeMark => ({ strokeId: id, shape: 'ellipse', box: { x, y, w: d, h: d } }) as ShapeMark
  it('flags tapped rings, nests the inner one, and checks the colour exactly', () => {
    const outer = ring('s0', 42, 106, 214), inner = ring('s1', 64, 128, 170)
    const marks = [outer, inner]
    markTappedSolids(marks, [
      { strokeId: 's0', color: '#93b4c4', how: 'tap', paint: 'background' },
      { strokeId: 's1', color: '#ffd23f', how: 'tap', paint: 'background' },
    ])
    expect(outer.solid?.hex).toBe('#93b4c4')
    expect(inner.solid?.tapped).toBe(true)
    const brief = solidsBrief([{ shapeMarks: marks }])
    expect(brief).toMatch(/#ffd23f exactly/)
    expect(brief).toMatch(/sits on top of the bigger disc drawn at \(42,106\)/)
    const grey = verifySolids(marks, snap([node('o', '', '', { x: 42, y: 106, w: 214, h: 214 }, 'rgb(147, 180, 196)'), node('i', '', '', { x: 64, y: 128, w: 170, h: 170 }, 'rgb(120, 130, 140)')]))
    expect(grey.satisfied).toBe(false)
    const good = verifySolids(marks, snap([node('o', '', '', { x: 42, y: 106, w: 214, h: 214 }, 'rgb(147, 180, 196)'), node('i', '', '', { x: 64, y: 128, w: 170, h: 170 }, 'rgb(255, 210, 63)')]))
    expect(good.satisfied).toBe(true)
  })
  it('keeps glows soft: no solid discs when a note asks for a glow or blur', () => {
    expect(tapSolidsAllowed(['all text white', 'Sunny'])).toBe(true)
    expect(tapSolidsAllowed(['blurry pink glow behind the card'])).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { markSolids, solidOf, solidsBrief, verifySolids } from '../src/solids.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const node = (id: string, parent: string | null, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}, tag = 'div') =>
  ({ id, tag, parent, rect, style: { backgroundColor: 'rgba(0, 0, 0, 0)', ...style } })
const ring = (): ShapeMark => ({ strokeId: 'r', shape: 'ellipse', box: { x: 90, y: 560, w: 180, h: 180 } })

describe('solidOf (n15)', () => {
  it('reads a colour and a plain thing', () => {
    expect(solidOf('lime badge FREE COFFEE AFTER, tilted')).toMatchObject({ word: 'lime', noun: 'badge' })
    expect(solidOf('white rows panel: Route, Start, Groups')).toMatchObject({ word: 'white', noun: 'panel' })
    expect(solidOf('a red pill button "Join"')).toMatchObject({ word: 'red', noun: 'pill' })
    expect(solidOf('badge in lime, says NEW')).toMatchObject({ word: 'lime', noun: 'badge' })
  })
  it('no colour, or a colour that is the letters or the page, is not a solid', () => {
    expect(solidOf('badge NEW')).toBeNull()
    expect(solidOf('huge outlined 09, white')).toBeNull()
    expect(solidOf('white text on a pill')).toBeNull()
    expect(solidOf('red page, a panel of rows')).toBeNull()
    expect(solidOf('black outlined card')).toBeNull()
    expect(solidOf('frosted white glass card')).toBeNull()
    expect(solidOf('pink blurred glow disc')).toBeNull()
  })
})

describe('markSolids', () => {
  it('flags the ring its note is on, not an area box', () => {
    const marks: ShapeMark[] = [ring(), { strokeId: 'b', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 }, area: true }]
    markSolids(marks, [{ text: 'lime badge NEW', focus: ['r'] }, { text: 'white panel', focus: ['b'] }])
    expect(marks[0]!.solid?.word).toBe('lime')
    expect(marks[1]!.solid).toBeUndefined()
    expect(solidsBrief([{ shapeMarks: marks }])).toMatch(/plain lime badge.*border-radius 50%.*fully opaque/)
  })
})

describe('verifySolids', () => {
  const m = () => { const r = ring(); r.solid = solidOf('lime badge NEW')!; return r }
  const page = (badge: Record<string, string>) => ({
    viewport: vp,
    nodes: [node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(225, 40, 30)' }),
      node('b', 'p', { x: 95, y: 565, w: 172, h: 172 }, badge)],
  })
  it('passes a solid lime circle', () => {
    expect(verifySolids([m()], page({ backgroundColor: 'rgb(200, 240, 60)' })).satisfied).toBe(true)
  })
  it('fails the faint brown disc of round 12 c4', () => {
    const v = verifySolids([m()], page({ backgroundColor: 'rgb(120, 90, 40)' }))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/not lime/)
  })
  it('fails a lime disc at low opacity', () => {
    const v = verifySolids([m()], page({ backgroundColor: 'rgba(200, 240, 60, 0.35)' }))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/faint/)
  })
  it('fails when nothing is built there', () => {
    expect(verifySolids([m()], { viewport: vp, nodes: [node('p', null, { x: 0, y: 0, w: 1280, h: 900 })] }).satisfied).toBe(false)
  })
  it('no solids: unverifiable', () => {
    expect(verifySolids([ring()], page({})).unverifiable).toBe(true)
  })
})

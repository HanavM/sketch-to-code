import { describe, expect, it } from 'vitest'
import { areasBrief, bandOf, bandPoly, bigWordOf, fillFontPx, markAreasAndEdges, verifyAreaWords, verifyBands } from '../src/areas.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const txt = (id: string, text: string, rect: { x: number; y: number; w: number; h: number }, fontSize: string, textBox = rect) =>
  ({ id, tag: 'span', parent: null, rect, text, textBox, style: { backgroundColor: 'rgba(0, 0, 0, 0)', fontSize } })
const layer = (id: string, clipPath: string) =>
  ({ id, tag: 'div', parent: null, rect: { x: 0, y: 0, w: 1280, h: 900 }, style: { backgroundColor: 'rgb(0, 0, 0)', clipPath } })

const box = (): ShapeMark => ({ strokeId: 's9', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 } })
const edge = (): ShapeMark => ({ strokeId: 's1', shape: 'line', box: { x: 500, y: 0, w: 305, h: 900 }, from: { x: 805, y: 0 }, to: { x: 500, y: 900 } })

describe('bigWordOf / fillFontPx', () => {
  it('pulls the big word or number out of a note', () => {
    expect(bigWordOf('huge outlined 09, white')).toBe('09')
    expect(bigWordOf('giant SALE')).toBe('SALE')
    expect(bigWordOf('big "Hello there" in pink')).toBe('Hello there')
    expect(bigWordOf('big bold headline')).toBeNull()
  })
  it('sizes a word to the smaller of what width and height allow', () => {
    expect(fillFontPx('09', { w: 510, h: 375 })).toBe(425)
    expect(fillFontPx('SALE', { w: 900, h: 100 })).toBe(139)
  })
})

describe('bands', () => {
  it('a plain band is about 2% of the page, thick 2.5x, thin half', () => {
    expect(bandOf('lime left, red gradient right, black diagonal band', vp)).toEqual({ px: 26, colour: 'black' })
    expect(bandOf('thick white stripe', vp)!.px).toBe(65)
    expect(bandOf('thin band', vp)!.px).toBe(13)
    expect(bandOf('lime left, red right', vp)).toBeNull()
  })
  it('flags the band on an edge line and the word on an area box, and tells both', () => {
    const marks = [box(), edge()]
    markAreasAndEdges(marks, [
      { text: 'huge outlined 09, white', focus: ['s9'] },
      { text: 'lime left, red gradient right, black diagonal band', focus: ['s1'] },
    ], vp)
    expect(marks[0]!.word).toBe('09')
    expect(marks[1]!.band).toEqual({ px: 26, colour: 'black' })
    const brief = areasBrief([{ shapeMarks: marks }], vp)
    expect(brief).toMatch(/"09" FILL that box: .*left 400px, top 140px, width 510px, height 375px.*font-size about 425px/)
    expect(brief).toMatch(/EXACTLY 26px wide/)
  })
  it('the band polygon is centred on the drawn line', () => {
    // line x = 805 at top, 500 at 900; half-width across 13px -> ~13.7px horizontally
    expect(bandPoly(edge(), 900, 26)).toBe('polygon(791px 0, 819px 0, 514px 900px, 486px 900px)')
  })
  it('passes a band as told, fails one twice as wide', () => {
    const m = edge(); m.edge = true; m.band = { px: 26, colour: 'black' }
    expect(verifyBands([m], { nodes: [layer('a', bandPoly(m, 900, 26))], viewport: vp }).satisfied).toBe(true)
    const wide = verifyBands([m], { nodes: [layer('a', bandPoly(m, 900, 60))], viewport: vp })
    expect(wide.satisfied).toBe(false)
    expect(wide.reason).toMatch(/about 26px/)
    // the half-page colour layer (one side on the line) is not a band
    expect(verifyBands([m], { nodes: [layer('h', 'polygon(0 0, 805px 0, 500px 900px, 0 900px)')], viewport: vp }).unverifiable).toBe(true)
  })
})

describe('verifyAreaWords', () => {
  const area = () => { const m = box(); m.area = true; m.word = '09'; return m }
  it('passes letters that fill the box', () => {
    const v = verifyAreaWords([area()], { nodes: [txt('t', '09', { x: 0, y: 140, w: 1280, h: 380 }, '420px', { x: 420, y: 150, w: 470, h: 360 })], viewport: vp })
    expect(v.satisfied).toBe(true)
  })
  it('fails letters that drifted right and shrank, and says where to put them', () => {
    const v = verifyAreaWords([area()], { nodes: [txt('t', '09', { x: 590, y: 200, w: 520, h: 300 }, '300px', { x: 640, y: 210, w: 330, h: 260 })], viewport: vp })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/right/)
    expect(v.reason).toMatch(/left 400px, top 140px/)
  })
  it('uses the biggest type when a nav link carries the same word', () => {
    const v = verifyAreaWords([area()], { nodes: [
      txt('n', '09', { x: 20, y: 20, w: 20, h: 14 }, '12px'),
      txt('t', '09', { x: 400, y: 140, w: 510, h: 375 }, '420px', { x: 415, y: 145, w: 480, h: 365 }),
    ], viewport: vp })
    expect(v.satisfied).toBe(true)
  })
  it('a box with no big word typed is not judged', () => {
    const m = box(); m.area = true
    expect(verifyAreaWords([m], { nodes: [], viewport: vp }).unverifiable).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { outlineRingBuilt } from '../src/inkcolour.js'
import { solidOf } from '../src/solids.js'
import { rowData } from '../src/rowdata.js'
import { cardItems, cardList, repeatBrief, repeatPlans, verifyRepeats } from '../src/repeatmark.js'
import { innerRings, verifyInnerRings } from '../src/innerring.js'

const S = (id: string, w: number[][], color: string | null = null) => ({ id, color, points: w.map(([x, y]) => ({ x: x!, y: y!, t: 0, p: 0.5 })) }) as unknown as Stroke
const round = (cx: number, cy: number, r: number) => [[0, -1], [0.71, -0.71], [1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1]].map(([a, b]) => [cx + a! * r, cy + b! * r])
const NOTE = 'x4 in a row, dark frames, captions under: black diamond, Diamond $80; red circle, Red sun $60; black triangle, Peak $90; red bar, Bar $45'
const box = S('b', [[70, 480], [330, 480], [330, 740], [70, 740], [70, 480]], '#171717')
const tap = S('t', [[200, 700]], '#ffffff')
const red = S('r', round(1035, 245, 135), '#d9283c')
const redTap = S('rt', [[1035, 245]], '#d9283c')
const outer = S('o', round(1035, 245, 175), '#f9f3e7')
const vp = { w: 1280, h: 900 }
const plans = () => repeatPlans([{ text: NOTE, at: { x: 100, y: 580 } }], [outer, red, redTap, box, tap], vp)
const n = (id: string, x: number, y: number, w: number, h: number, extra: object = {}) => ({ id, rect: { x, y, w, h }, ...extra })
const card = (x: number, bg = 'rgb(255, 255, 255)', border = '2px solid rgb(23, 23, 23)') => n(`c${x}`, x, 480, 260, 260, { style: { backgroundColor: bg, border } })

describe('n225: a repeated card keeps its tap, frame and captions under', () => {
  it('reads each item as a picture and a caption', () => {
    expect(cardItems(NOTE, 4)?.items[3]).toEqual({ picture: 'red bar', caption: 'Bar $45' })
  })
  it('a plain list of names is not items', () => {
    expect(cardItems('x3: Drums, Bass, Keys', 3)).toBeNull()
  })
  it('the plan holds the tapped fill, the pen as frame, and pictures painted from the pens used', () => {
    const p = plans()[0]!
    expect(p).toMatchObject({ n: 4, fill: '#ffffff', frame: '#171717', captionsUnder: true })
    expect(p.items![1]).toMatchObject({ picture: 'red circle', caption: 'Red sun $60', paint: '#d9283c' })
    expect(p.names).toEqual([])
  })
  it('no frame unless asked', () => {
    const p = repeatPlans([{ text: 'x4 in a row', at: { x: 100, y: 580 } }], [box, tap], vp)[0]!
    expect(p.frame).toBeUndefined()
    expect(p.fill).toBe('#ffffff')
  })
  it('a frame colour in words other than the pen is left to the words', () => {
    const p = repeatPlans([{ text: 'x4 across, white border: green, grey, grey, green', at: { x: 100, y: 580 } }], [box, tap], vp)[0]!
    expect(p.frame).toBeUndefined()
  })
  it('is no table of rows, and its text is only the captions', () => {
    expect(rowData(NOTE)).toBeNull()
    expect(cardList(NOTE)?.map((i) => i.caption)).toEqual(['Diamond $80', 'Red sun $60', 'Peak $90', 'Bar $45'])
    expect(cardList('x4 rows: red dot, Ana; red dot, Ben; red dot, Chi; red dot, Dev')).toBeNull()
  })
  it('a colour named for a card is not a solid fill of the box', () => {
    expect(solidOf(NOTE)).toBeNull()
    expect(solidOf('red circle')).not.toBeNull()
  })
  it('the brief says all of it', () => {
    const b = repeatBrief(plans())
    expect(b).toContain('2px solid #171717')
    expect(b).toContain('BELOW its box')
    expect(b).toContain('"Diamond $80"')
  })
  const xs = [70, 362, 654, 946] as number[]
  const under = (x: number, t: string) => n(t, x + 60, 750, 140, 20, { text: t })
  const words = ['Diamond $80', 'Red sun $60', 'Peak $90', 'Bar $45']
  const planned = () => { const p = plans()[0]!; return { ...p, gap: 32 } }
  const pics = xs.map((x) => n(`p${x}`, x + 65, 545, 130, 130, { tag: 'div', style: { backgroundColor: 'rgb(23, 23, 23)' } }))
  it('passes a right page', () => {
    const v = verifyRepeats([planned()], { nodes: [...xs.map((x) => card(x)), ...pics, ...xs.map((x, k) => under(x, words[k]!))] } as never)
    expect(v.satisfied).toBe(true)
  })
  it('catches empty frames', () => {
    const v = verifyRepeats([planned()], { nodes: [...xs.map((x) => card(x)), ...xs.map((x, k) => under(x, words[k]!))] } as never)
    expect(v.reason).toContain('is empty')
  })
  it('catches a card coloured by its words', () => {
    const v = verifyRepeats([planned()], { nodes: [card(70, 'rgb(217, 40, 60)'), ...xs.slice(1).map((x) => card(x)), ...xs.map((x, k) => under(x, words[k]!))] } as never)
    expect(v.reason).toContain('copy 1')
  })
  it('catches lost frames', () => {
    const v = verifyRepeats([planned()], { nodes: [...xs.map((x) => card(x, 'rgb(255, 255, 255)', '0px none rgb(0, 0, 0)')), ...xs.map((x, k) => under(x, words[k]!))] } as never)
    expect(v.reason).toContain('no border')
  })
  it('catches a caption inside the box, and a missing one', () => {
    const v = verifyRepeats([planned()], { nodes: [...xs.map((x) => card(x)), n('w', 130, 680, 140, 20, { text: 'Diamond $80' })] } as never)
    expect(v.reason).toContain('sits inside its box')
    expect(v.reason).toContain('"Peak $90" is not on the page')
  })
})

describe('n225: an outline ring built as a covered disc', () => {
  const st = (o: object) => ({ border: '', borderRadius: '50%', ...o })
  const c = { box: { x: 860, y: 70, w: 349, h: 349 }, color: '#f9f3e7' }
  it('passes with a dark cover over the middle', () => {
    const v = outlineRingBuilt(c, [{ id: 'a', tag: 'div', rect: c.box, style: st({ backgroundColor: 'rgb(249, 243, 231)' }) }, { id: 'b', tag: 'div', rect: { x: 881, y: 91, w: 307, h: 307 }, style: st({ backgroundColor: 'rgb(23, 23, 23)' }) }] as never)
    expect(v.ok).toBe(true)
  })
  it('a bare disc still fails', () => {
    const v = outlineRingBuilt(c, [{ id: 'a', tag: 'div', rect: c.box, style: st({ backgroundColor: 'rgb(249, 243, 231)' }) }] as never)
    expect(v.ok).toBe(false)
  })
})

describe('n225: a tapped ring in a ring sits on its centre', () => {
  it('finds the disc, not the outer ring', () => {
    const l = innerRings([outer, red, redTap])
    expect(l).toHaveLength(1)
    expect(l[0]).toMatchObject({ cx: 1035, cy: 245, colour: '#d9283c' })
  })
  it('catches a disc 20px off, passes a centred one', () => {
    const disc = (x: number, y: number) => ({ nodes: [n('d', x, y, 270, 270, { style: { backgroundColor: 'rgb(217, 40, 60)' } })] })
    expect(verifyInnerRings([outer, red, redTap], disc(880, 90) as never).satisfied).toBe(false)
    expect(verifyInnerRings([outer, red, redTap], disc(900, 110) as never).satisfied).toBe(true)
  })
  it('a tap recorded as two points still counts', () => {
    expect(innerRings([outer, red, S('rt2', [[1035, 245], [1036, 245]], '#d9283c')])).toHaveLength(1)
  })
  it('a lone tapped ring is nothing here', () => {
    expect(innerRings([red, redTap])).toHaveLength(0)
  })
})

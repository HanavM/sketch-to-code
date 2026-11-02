import { describe, expect, it } from 'vitest'
import { markFill, sliceChart, sliceCss, sliceShares, sliceWedges, type Stroke } from '@s2c/ink'
import { asksFade, conicStops, sliceVerdict, typedAmounts, typedShares, typedSlices } from '../src/slicechart.js'

const S = (id: string, w: number[][], color: string | null = null) => ({ id, color, points: w.map(([x, y]) => ({ x: x!, y: y!, t: 0, p: 0.5 })) }) as unknown as Stroke
const round = (cx: number, cy: number, r: number) => Array.from({ length: 13 }, (_, k) => [cx + r * Math.sin((k / 12) * 2 * Math.PI), cy - r * Math.cos((k / 12) * 2 * Math.PI)])
const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
const ring = S('ring', round(280, 420, 210), '#20302b')
const hole = S('hole', round(280, 420, 105), '#fbfaf6')
// the budget's four taps, in the order drawn
const taps = [['#2a9d8f', 440, 380], ['#e9c46a', 270, 580], ['#e76f51', 125, 420], ['#264653', 215, 265]] as const
const fills = taps.map(([color, x, y], k) => ({ dotId: `t${k}`, color, at: { x, y }, target: 'ring' }))
const chart = () => sliceChart(ring, fills, [ring, hole])!
const node = (x: number, y: number, w: number, h: number, style: Record<string, string> = {}) => ({ id: `${x}`, tag: 'div', rect: { x, y, w, h }, style: { backgroundColor: 'rgba(0, 0, 0, 0)', ...style } }) as never

describe('n226: colours tapped round a ring are its slices', () => {
  it('four taps round a ring: slices clockwise, boundary at 12, hole found', () => {
    const c = chart()
    expect(c.parts.map((x) => x.color)).toEqual(['#2a9d8f', '#e9c46a', '#e76f51', '#264653'])
    expect(c.parts[0]!.startDeg).toBe(0)
    expect(c.parts.reduce((a, x) => a + x.sweepDeg, 0)).toBe(360)
    expect(c.hole).toEqual({ d: 210, color: '#fbfaf6' })
    expect(c.d).toBe(420)
  })
  it('markFill gives slices on a ring, not a fade', () => {
    const f = markFill(fills as never, 'ring', [ring, hole])!
    expect(f.slices).toBeTruthy()
    expect(f.css).toMatch(/^conic-gradient/)
    expect(f.angle).toBeUndefined()
  })
  it('a square never slices, even with taps all round', () => {
    const box = S('ring', rect(70, 210, 420, 420))
    expect(markFill(fills as never, 'ring', [box])!.slices).toBeUndefined()
  })
  it('two colours stay a fade; three taps down one side stay a fade; a tap on the middle stays a fade', () => {
    const two = fills.slice(0, 2).map((f) => f)
    expect(markFill(two as never, 'ring', [ring])!.slices).toBeUndefined()
    const side = [['#111111', 400, 300], ['#222222', 440, 420], ['#333333', 400, 540]].map(([color, x, y], k) => ({ dotId: `s${k}`, color: color as string, at: { x: x as number, y: y as number }, target: 'ring' }))
    expect(markFill(side as never, 'ring', [ring])!.slices).toBeUndefined()
    const line = [['#111111', 280, 280], ['#222222', 280, 420], ['#333333', 280, 560]].map(([color, x, y], k) => ({ dotId: `l${k}`, color: color as string, at: { x: x as number, y: y as number }, target: 'ring' }))
    expect(markFill(line as never, 'ring', [ring])!.slices).toBeUndefined()
  })
  it('a note asking for a fade keeps a fade', () => {
    expect(asksFade(['soft gradient sun'])).toBe(true)
    expect(asksFade(['donut slices'])).toBe(false)
    expect(markFill(fills as never, 'ring', [ring], { noSlices: true })!.slices).toBeUndefined()
  })
  it('reads typed shares only when they fit', () => {
    expect(typedShares('donut slices in tap colours, clockwise from top: 40, 25, 20, 15 percent', 4)).toEqual([40, 25, 20, 15])
    expect(typedShares('40% 25% 20% 15%', 4)).toEqual([40, 25, 20, 15])
    expect(typedShares('40/25/20/15', 4)).toEqual([40, 25, 20, 15])
    expect(typedShares('$600 big, left under', 4)).toBeNull()
    expect(typedShares('20%, 30%', 4)).toBeNull()
    expect(typedAmounts('x4 down, colour square left: Rent, $960; Food, $600; Fun, $480; Transport, $360', 4)).toEqual([960, 600, 480, 360])
  })
  it('percents go clockwise from 12; amounts in rows give the same chart in tap order', () => {
    const a = typedSlices(chart(), ['40, 25, 20, 15 percent'], [])
    expect(a.parts.map((x) => x.sweepDeg)).toEqual([144, 90, 72, 54])
    const b = typedSlices(chart(), [], ['Rent, $960; Food, $600; Fun, $480; Transport, $360'])
    expect(b.parts.map((x) => x.sweepDeg)).toEqual([144, 90, 72, 54])
    expect(typedSlices(chart(), [], ['$2,400 of $3,000 spent']).parts.map((x) => x.sweepDeg)).toEqual(chart().parts.map((x) => x.sweepDeg))
  })
  it('css has hard stops, and the preview wedges match', () => {
    const c = sliceShares(chart(), [40, 25, 20, 15])
    expect(sliceCss(c)).toBe('conic-gradient(#2a9d8f 0deg 144deg, #e9c46a 144deg 234deg, #e76f51 234deg 306deg, #264653 306deg 360deg)')
    expect(sliceWedges(c).map((w) => w.color)).toEqual(c.parts.map((x) => x.color))
  })
  it('the page check', () => {
    const c = sliceShares(chart(), [40, 25, 20, 15])
    const good = 'conic-gradient(rgb(42, 157, 143) 0deg, rgb(42, 157, 143) 144deg, rgb(233, 196, 106) 144deg, rgb(233, 196, 106) 234deg, rgb(231, 111, 81) 234deg, rgb(231, 111, 81) 306deg, rgb(38, 70, 83) 306deg, rgb(38, 70, 83) 360deg)'
    expect(conicStops(good)).toHaveLength(8)
    const disc = node(175, 315, 210, 210, { backgroundColor: 'rgb(251, 250, 246)' })
    expect(sliceVerdict(c, [node(70, 210, 420, 420, { backgroundImage: good }), disc])).toMatchObject({ ok: true })
    expect(sliceVerdict(c, [node(70, 210, 420, 420, { backgroundImage: good })]).why).toMatch(/hole/)
    expect(sliceVerdict(c, [node(70, 210, 420, 420, { backgroundImage: 'linear-gradient(90deg, rgb(42, 157, 143), rgb(38, 70, 83))' }), disc]).why).toMatch(/fade/)
    const blended = 'conic-gradient(rgb(42, 157, 143) 0deg, rgb(233, 196, 106) 144deg, rgb(231, 111, 81) 234deg, rgb(38, 70, 83) 306deg)'
    expect(sliceVerdict(c, [node(70, 210, 420, 420, { backgroundImage: blended }), disc]).ok).toBe(false)
    const wrong = good.replace(/144deg/g, '100deg')
    expect(sliceVerdict(c, [node(70, 210, 420, 420, { backgroundImage: wrong }), disc]).why).toMatch(/degrees/)
    expect(sliceVerdict(c, [disc]).ok).toBe(false)
    const svg = c.parts.map((x, k) => node(70 + k, 210, 400, 400, { svgStroke: x.color }))
    expect(sliceVerdict(c, svg as never).ok).toBe(true)
  })
})

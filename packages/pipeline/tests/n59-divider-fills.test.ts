import { describe, expect, it } from 'vitest'
import { dividerSplit, inkFills, markFill, splitCss } from '@s2c/ink'
import { splitVerdict, stopsOf, inkColoursBrief } from '../src/inkcolour.js'
import { lineCopy, verifyTextLinesNotRules } from '../src/textrules.js'
import { markTextPlaces } from '../src/textplace.js'
import type { ShapeMark } from '../src/shapemark.js'

// round 33 c3 gig ticket, as drawn in n49 (waypoints walked into dense points)
const walk = (way: number[][]) => {
  const out: Array<{ x: number; y: number; t: number }> = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) out.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: 0 })
  }
  const [lx, ly] = way[way.length - 1]!
  out.push({ x: lx!, y: ly!, t: 0 })
  return out
}
const stroke = (id: string, way: number[][], color?: string) => ({ id, points: walk(way), ...(color ? { color } : {}) })
const tap = (id: string, x: number, y: number, color: string) => ({ id, points: [{ x, y, t: 0 }], color })
const ticket = stroke('t', [[235, 260], [1008, 183], [1045, 540], [266, 650], [236, 263]])
const divider = stroke('d', [[793, 206], [829, 560]])
const heading = stroke('h', [[288, 352], [583, 322]])
const white = tap('w', 500, 560, '#ffffff')
const pink = tap('p', 930, 460, '#ec4899')

describe('a divider with a colour tapped on each side is two fills (n59)', () => {
  it('finds the divider and keeps the colours per side, in tapping order', () => {
    const strokes = [ticket, divider, heading, white, pink]
    const fills = inkFills(strokes, { w: 1280, h: 900 })
    expect(fills.filter((f) => f.target === 't')).toHaveLength(2)
    const f = markFill(fills, 't', strokes)!
    expect(f.split).toBeTruthy()
    expect(f.split!.colors).toEqual(['#ffffff', '#ec4899'])
    expect(f.split!.dividerId).toBe('d')
    // the white side is the big body, the pink side the stub on the right
    const cx = (s: Array<{ x: number }>) => s.reduce((t, p) => t + p.x, 0) / s.length
    expect(cx(f.split!.sides[0])).toBeLessThan(700)
    expect(cx(f.split!.sides[1])).toBeGreaterThan(850)
  })
  it('without the strokes (or with taps the same colour) it is still a fade or one colour', () => {
    const strokes = [ticket, divider, white, pink]
    const fills = inkFills(strokes, { w: 1280, h: 900 })
    expect(markFill(fills, 't')!.split).toBeUndefined()
    const same = [ticket, divider, white, tap('w2', 930, 460, '#ffffff')]
    expect(markFill(inkFills(same), 't', same)!.split).toBeUndefined()
  })
  it('a text line that does not cross the mark is no divider', () => {
    const strokes = [ticket, heading, white, pink]
    expect(dividerSplit(ticket, inkFills(strokes).filter((f) => f.target === 't'), strokes)).toBeNull()
  })
  it('the CSS is a hard stop at the divider, in the turned frame', () => {
    const strokes = [ticket, divider, white, pink]
    const f = markFill(inkFills(strokes), 't', strokes)!
    const css = splitCss(f.split!, { cx: 640, cy: 416, w: 790, h: 370, deg: -6.5 })
    const m = /linear-gradient\((\d+)deg, #ffffff 0%, #ffffff (\d+)%, #ec4899 (\d+)%, #ec4899 100%\)/.exec(css)
    expect(m).toBeTruthy()
    // runs about left to right in the ticket's own frame, the stub the last quarter or so
    expect(Math.abs(Number(m![1]) - 90)).toBeLessThan(15)
    expect(Number(m![2])).toBeGreaterThan(65)
    expect(Number(m![2])).toBeLessThan(85)
  })
  it('the check passes a hard stop or two solid parts, fails a fade', () => {
    const strokes = [ticket, divider, white, pink]
    const f = markFill(inkFills(strokes), 't', strokes)!
    const split = { colors: f.split!.colors, css: 'x', sides: f.split!.sides, dividerId: 'd', line: f.split!.line }
    const n = (id: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string>) =>
      ({ id, tag: 'div', srcLoc: null, text: '', classes: [], parent: null, depth: 1, rect,
        style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0,0,0)', fontSize: '16px', fontWeight: '400', borderRadius: '0', ...style } })
    const card = { x: 235, y: 183, w: 810, h: 467 }
    const hard = n('a', card, { backgroundImage: 'linear-gradient(96deg, rgb(255, 255, 255) 0%, rgb(255, 255, 255) 74%, rgb(236, 72, 153) 74%, rgb(236, 72, 153) 100%)' })
    expect(splitVerdict(split, [hard], [hard]).ok).toBe(true)
    const fade = n('b', card, { backgroundImage: 'linear-gradient(96deg, rgb(255, 255, 255), rgb(236, 72, 153))' })
    const v = splitVerdict(split, [fade], [fade])
    expect(v.ok).toBe(false)
    expect(v.why).toMatch(/fade/)
    const body = n('c', { x: 240, y: 200, w: 570, h: 440 }, { backgroundColor: 'rgb(255, 255, 255)' })
    const stub = n('e', { x: 815, y: 190, w: 225, h: 380 }, { backgroundColor: 'rgb(236, 72, 153)' })
    expect(splitVerdict(split, [], [body, stub]).ok).toBe(true)
    expect(stopsOf(hard.style.backgroundImage)).toHaveLength(4)
  })
  it('the brief says two solid fills, never a fade', () => {
    const strokes = [ticket, divider, white, pink]
    const f = markFill(inkFills(strokes), 't', strokes)!
    const brief = inkColoursBrief({ actions: [{ inkColours: [{ strokeId: 't', mark: 'box', paint: 'background', color: '#ffffff', box: { x: 235, y: 183, w: 810, h: 467 }, how: 'tap',
      split: { colors: f.split!.colors, css: splitCss(f.split!, { cx: 640, cy: 416, w: 790, h: 370, deg: -6.5 }), sides: f.split!.sides, dividerId: 'd', line: f.split!.line } }] }] as never, pageFill: null } as never)
    expect(brief).toMatch(/TWO SOLID FILLS/)
    expect(brief).not.toMatch(/fading to/)
  })
})

describe('a line drawn for words is never left as a rule (n59)', () => {
  const line = (id: string, a: [number, number], z: [number, number]): ShapeMark =>
    ({ strokeId: id, shape: 'line', box: { x: Math.min(a[0], z[0]), y: Math.min(a[1], z[1]), w: Math.abs(z[0] - a[0]), h: Math.abs(z[1] - a[1]) }, from: { x: a[0], y: a[1] }, to: { x: z[0], y: z[1] } })
  const node = (id: string, tag: string, text: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}, parent: string | null = null) =>
    ({ id, tag, text, rect, parent, style: { backgroundColor: 'rgba(0, 0, 0, 0)', ...style } })
  it('a slanted line with its own note carries words; "dashed" is a rule', () => {
    const marks = [line('date', [302, 467], [655, 432]), line('d', [793, 206], [829, 560])]
    markTextPlaces(marks as ShapeMark[], [{ text: 'Fri 12 Dec · Doors 8pm, grey', focus: ['date'] }, { text: 'dashed', focus: ['d'] }])
    expect(marks[0]!.carries).toMatch(/Fri 12 Dec/)
    expect(lineCopy(marks[0]!)).toBeTruthy()
    expect(lineCopy(marks[1]!)).toBeNull()
  })
  it('fails a thin bar or an underline along a text line, passes the words alone', () => {
    const m = { ...line('l', [300, 450], [660, 450]), words: 'Fri 12 Dec · Doors 8pm, grey' }
    const words = node('w', 'p', 'Fri 12 Dec · Doors 8pm', { x: 300, y: 440, w: 300, h: 20 })
    expect(verifyTextLinesNotRules([m], { nodes: [words] }).satisfied).toBe(true)
    const bar = node('b', 'div', '', { x: 300, y: 462, w: 360, h: 1 }, { backgroundColor: 'rgb(200, 200, 200)' })
    expect(verifyTextLinesNotRules([m], { nodes: [words, bar] }).satisfied).toBe(false)
    const under = node('u', 'p', 'Fri 12 Dec · Doors 8pm', { x: 300, y: 430, w: 330, h: 22 }, { borderBottom: '1px rgb(0, 0, 0)' })
    expect(verifyTextLinesNotRules([m], { nodes: [under] }).satisfied).toBe(false)
  })
  it('a turned thin bar is still a bar', () => {
    const m = { ...line('l', [300, 470], [660, 432]), carries: 'Fri 12 Dec' }
    const card = node('card', 'div', '', { x: 200, y: 150, w: 850, h: 520 }, { transform: 'matrix(0.9936, -0.1132, 0.1132, 0.9936, 0, 0)' })
    const bar = node('b', 'div', '', { x: 300, y: 430, w: 360, h: 42 }, { backgroundColor: 'rgb(200, 200, 200)' }, 'card')
    expect(verifyTextLinesNotRules([m], { nodes: [card, bar] }).satisfied).toBe(false)
  })
})

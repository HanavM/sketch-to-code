import { describe, expect, it } from 'vitest'
import { flatPage, inkFills, pageFill, saysFlatPage, tapDots } from '@s2c/ink'
import { tapDotsBrief, verifyTapDots } from '../src/tapdots.js'
import { verifyInkColours } from '../src/inkcolour.js'
import { buildEvidence, groundInterpretation } from '../src/intent2.js'

const line = (way: number[][]) => {
  const out: Array<{ x: number; y: number; t: number }> = []
  way.forEach((p, i) => {
    if (i === 0) { out.push({ x: p[0]!, y: p[1]!, t: 0 }); return }
    const z = way[i - 1]!, n = Math.max(1, Math.ceil(Math.hypot(p[0]! - z[0]!, p[1]! - z[1]!) / 6))
    for (let k = 1; k <= n; k++) out.push({ x: z[0]! + (p[0]! - z[0]!) * k / n, y: z[1]! + (p[1]! - z[1]!) * k / n, t: 0 })
  })
  return out
}
const s = (id: string, color: string, way: number[][]) => ({ id, color, points: line(way) })
const tap = (id: string, color: string, x: number, y: number) => ({ id, color, points: [{ x, y, t: 0 }] })
const P = { w: 1280, h: 900 }
const NAVY = '#0b1f47', WHITE = '#ffffff', AMBER = '#ffae1f'
const stars = [[703, 143], [763, 423], [693, 643], [1063, 123], [1123, 183], [1153, 473]].map(([x, y], k) => tap(`w${String(k)}`, WHITE, x!, y!))
const flame = s('flame', AMBER, [[880, 610], [880, 720], [892, 748], [920, 760], [948, 748], [960, 720], [960, 610]])

describe('n269: scattered same-colour taps on the bare page are dots', () => {
  it('rocket: one navy page tap, six white taps: flat navy, six dots where tapped', () => {
    const st = [tap('n', NAVY, 500, 650), ...stars]
    expect(pageFill(inkFills(st, P))).toEqual({ colors: [NAVY], css: NAVY })
    const dots = tapDots(st, P)
    expect(dots).toHaveLength(6)
    expect(dots.every((d) => d.page)).toBe(true)
    expect(dots[0]!.at).toEqual({ x: 703, y: 143 })
  })
  it('two taps in two colours are still a fade, and so is one tap of each of three', () => {
    expect(pageFill(inkFills([tap('a', NAVY, 100, 100), tap('b', WHITE, 900, 800)], P))!.colors).toHaveLength(2)
    expect(pageFill(inkFills([tap('a', NAVY, 100, 100), tap('b', WHITE, 500, 400), tap('c', AMBER, 900, 800)], P))!.colors).toHaveLength(3)
    expect(tapDots([tap('a', NAVY, 100, 100), tap('b', WHITE, 500, 400), tap('c', AMBER, 900, 800)], P)).toEqual([])
  })
  it('a tap ringed by another colour stays a spotlight', () => {
    const st = [tap('c', '#a020f0', 640, 450), tap('1', NAVY, 300, 200), tap('2', NAVY, 980, 200), tap('3', NAVY, 980, 700), tap('4', NAVY, 300, 700)]
    expect(pageFill(inkFills(st, P))!.radial).toBeTruthy()
    expect(tapDots(st, P)).toEqual([])
  })
  it('taps of only one colour colour the page, and taps bunched in one spot are not dots', () => {
    expect(pageFill(inkFills(stars, P))).toEqual({ colors: [WHITE], css: WHITE })
    expect(tapDots(stars, P)).toEqual([])
    const bunch = [tap('n', NAVY, 500, 650), tap('a', WHITE, 100, 100), tap('b', WHITE, 110, 105), tap('c', WHITE, 300, 100)]
    expect(tapDots(bunch, P)).toEqual([])
  })
  it('the brief says dots on the page, never a fade, and the check finds them', () => {
    const dots = tapDots([tap('n', NAVY, 500, 650), ...stars], P)
    const brief = tapDotsBrief(dots)
    expect(brief).toContain('(703,143)')
    expect(brief).toContain('never colour the page')
    expect(brief).not.toContain('every row')
    const dot = (x: number, y: number) => ({ rect: { x: x - 3, y: y - 3, w: 6, h: 6 }, text: '', style: { backgroundColor: WHITE } })
    const nodes = dots.map((d) => dot(d.at.x, d.at.y))
    const panel = { rect: { x: 800, y: 100, w: 300, h: 300 }, text: '', style: { backgroundColor: WHITE } }
    expect(verifyTapDots(dots, { nodes: [...nodes, panel] }).satisfied).toBe(true)
    expect(verifyTapDots(dots, { nodes: nodes.slice(1) }).reason).toContain('(703,143)')
    const page = { rect: { x: 0, y: 0, w: 1280, h: 900 }, text: '', style: { backgroundColor: WHITE } }
    expect(verifyTapDots(dots, { nodes: [...nodes, page] }).satisfied).toBe(false)
  })
})

describe('n269: a tap between the arms of an open mark in its own pen is that mark', () => {
  it('flame U: the amber tap is the flame, not a page colour', () => {
    const f = inkFills([tap('n', NAVY, 500, 650), flame, tap('a', AMBER, 920, 690)], P)
    expect(f.find((x) => x.dotId === 'a')!.target).toBe('flame')
    expect(pageFill(f)).toEqual({ colors: [NAVY], css: NAVY })
  })
  it('in another pen, outside the arms, or by a straight line it stays the page', () => {
    expect(inkFills([s('u', NAVY, [[880, 610], [880, 720], [920, 760], [960, 720], [960, 610]]), tap('a', AMBER, 920, 690)], P)[0]!.target).toBeNull()
    expect(inkFills([flame, tap('a', AMBER, 300, 300)], P)[0]!.target).toBeNull()
    expect(inkFills([s('l', AMBER, [[100, 100], [400, 100]]), tap('a', AMBER, 250, 104)], P)[0]!.target).toBeNull()
  })
})

describe('n269: a flat page said in words', () => {
  it('reads a page look, not any flat thing', () => {
    for (const t of ['page flat navy', 'white dots are stars, page flat navy', 'whole page background flat navy, no fade, no orange', 'flat navy background', 'page no gradient']) expect(saysFlatPage([t])).toBe(true)
    for (const t of ['flat icons', 'flat card with shadow', 'solid button', 'plain text, top of the column']) expect(saysFlatPage([t])).toBe(false)
  })
  it('turns a fade into the first tap, and leaves one colour alone', () => {
    const fade = pageFill(inkFills([tap('a', NAVY, 100, 100), tap('b', WHITE, 900, 800)], P))
    expect(flatPage(fade, ['page flat navy'])).toEqual({ colors: [NAVY], css: NAVY })
    expect(flatPage(fade, ['big headline'])).toBe(fade)
    expect(flatPage(null, ['page flat navy'])).toBeNull()
  })
})

describe('n269: a shape painted as an svg path is painted', () => {
  const node = (id: string, tag: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}) => ({
    id, tag, srcLoc: null, rect, text: '', classes: [], parent: null, depth: 1, style: { backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', ...style },
  })
  const snap = (nodes: unknown[]) => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false }) as never
  const act = { kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours: [{ strokeId: 's', mark: 'outline', paint: 'background', color: AMBER, box: { x: 880, y: 610, w: 81, h: 150 }, how: 'tap' }] } as never
  it('a filled path at the drawn spot satisfies the colour; an unfilled one does not', () => {
    expect(verifyInkColours([act], undefined, snap([node('p', 'path', { x: 880, y: 610, w: 81, h: 150 }, { svgFill: 'rgb(255, 174, 31)' })])).satisfied).toBe(true)
    expect(verifyInkColours([act], undefined, snap([node('p', 'path', { x: 880, y: 610, w: 81, h: 150 })])).satisfied).toBe(false)
  })
})

describe('n269: a look for the whole page never fails its Run', () => {
  const el = (id: string, tag: string, w: number, h: number) => ({
    id, tag, srcLoc: 'src/App.tsx:1:1', rect: { x: 0, y: 0, w, h }, text: '', classes: [], parent: null, depth: 1,
    style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400' },
  })
  const page = { nodes: [{ ...el('e0', 'body', 1280, 900), srcLoc: null }, el('e1', 'div', 1280, 900), el('e2', 'button', 90, 30)], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false } as never
  const raw = (instruction: string) => ({ reading: 'x', actions: [{ kind: 'design' as const, elements: null, destElement: null, position: null, instruction, strokes: null, layer: null, depicts: null, fidelity: null }] })
  it('no ink, no container, a look for the page: built on the page', () => {
    const notes = [{ id: 'n', text: 'whole page background flat navy, no fade, no orange' }] as never
    const g = groundInterpretation(raw('whole page background flat navy, no fade, no orange'), buildEvidence([], page, notes), page, 'design')
    expect(g.rejected).toEqual([])
    expect(g.actions).toHaveLength(1)
    expect(g.actions[0]!.dest?.domId).toBe('e1')
  })
  it('no ink, no container, and nothing about the page is still refused', () => {
    const g = groundInterpretation(raw('add a sidebar'), buildEvidence([], page, []), page, 'design')
    expect(g.actions).toHaveLength(0)
    expect(g.rejected[0]).toContain('neither container nor strokes')
  })
})

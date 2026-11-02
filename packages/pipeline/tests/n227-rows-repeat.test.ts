import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { listedRows, repeatBrief, repeatCount, repeatPlans, verifyRepeats } from '../src/repeatmark.js'

const S = (id: string, w: number[][], color: string | null = null) => ({ id, color, points: w.map(([x, y]) => ({ x: x!, y: y!, t: 0, p: 0.5 })) }) as unknown as Stroke
const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
const round = (cx: number, cy: number, r: number) => [[0, -1], [0.71, -0.71], [1, 0], [0.71, 0.71], [0, 1], [-0.71, 0.71], [-1, 0], [-0.71, -0.71], [0, -1]].map(([a, b]) => [cx + a! * r, cy + b! * r])
const NOTE = 'x4 down, colour square left: Rent, $960; Food, $600; Fun, $480; Transport, $360'
const vp = { w: 1280, h: 900 }
const row = S('row', rect(560, 210, 670, 74), '#e0e0da')
const tap = S('tap', [[900, 247]], '#ffffff')
const band = S('band', rect(50, 680, 1180, 90), '#2a9d8f')
const ring = S('ring', round(280, 420, 210), '#20302b')
const slices = ['#2a9d8f', '#e9c46a', '#e76f51', '#264653'].map((c, k) => S(`s${k}`, [[250 + k * 10, 400]], c))
const plan = (extra: Stroke[] = []) => repeatPlans([{ text: NOTE, at: { x: 800, y: 247 } }], [ring, ...slices, row, tap, band, ...extra], vp)
const leaf = (t: string, x: number, y: number) => ({ id: t, text: t, rect: { x, y, w: 80, h: 20 } })
const cardAt = (y: number) => ({ id: `c${y}`, rect: { x: 560, y, w: 670, h: 74 }, style: { backgroundColor: 'rgb(255, 255, 255)' } })

describe('n227: a count down on one drawn box repeats the box', () => {
  it('reads the direction past a comma, and the rows whole', () => {
    expect(repeatCount(NOTE)).toMatchObject({ n: 4, axis: 'y' })
    expect(listedRows(NOTE)).toEqual({ look: 'colour square left', rows: [['Rent', '$960'], ['Food', '$600'], ['Fun', '$480'], ['Transport', '$360']] })
  })
  it('a wide flat box is the first of four rows, down, above the next drawn thing', () => {
    const p = plan()[0]!
    expect(p).toMatchObject({ n: 4, axis: 'y', fill: '#ffffff', edge: '#e0e0da', look: 'colour square left' })
    expect(p.mark.y + 4 * p.mark.h + 3 * p.gap).toBeLessThanOrEqual(672)
    expect(p.rows![3]).toEqual(['Transport', '$360'])
  })
  it('colour marks take the colours tapped in the ring, in order', () => {
    expect(plan()[0]!.swatches).toEqual(['#2a9d8f', '#e9c46a', '#e76f51', '#264653'])
  })
  it('no colour words, no swatches', () => {
    const t = 'x4 down: Rent, $960; Food, $600; Fun, $480; Transport, $360'
    expect(repeatPlans([{ text: t, at: { x: 800, y: 247 } }], [ring, ...slices, row, tap, band], vp)[0]!.swatches).toBeUndefined()
  })
  it('a tall panel is where rows go, never repeated', () => {
    const panel = S('p', rect(560, 100, 670, 400), '#e0e0da')
    expect(repeatPlans([{ text: NOTE, at: { x: 800, y: 247 } }], [panel], vp)).toEqual([])
  })
  it('a wide box with no rows typed stays a list panel', () => {
    expect(repeatPlans([{ text: 'x4 down', at: { x: 800, y: 247 } }], [row], vp)).toEqual([])
  })
  it('a box with a row drawn inside it stays the row template', () => {
    const inside = S('i', [[580, 247], [800, 247]], '#20302b')
    expect(repeatPlans([{ text: NOTE, at: { x: 800, y: 247 } }], [row, inside], vp)).toEqual([])
  })
  it('boxes already drawn below are the next rows, at their pitch', () => {
    const more = [294, 378, 462].map((y, k) => S(`m${k}`, rect(560, y, 670, 74), '#e0e0da'))
    const p = plan(more)[0]!
    expect(p.gap).toBe(10)
    expect(p.n).toBe(4)
  })
  it('tells one row per box, none invented', () => {
    const b = repeatBrief(plan())
    expect(b).toContain('ONE row only')
    expect(b).toContain('never add a row')
    expect(b).toContain('#e76f51')
  })
  it('checks each row sits in its own box', () => {
    const p = plan()
    const g = p[0]!.mark.h + p[0]!.gap
    const ys = [0, 1, 2, 3].map((k) => 210 + k * g)
    const good = { nodes: [...ys.map(cardAt), ...p[0]!.rows!.flatMap((r, k) => [leaf(r[0]!, 600, ys[k]! + 25), leaf(r[1]!, 1100, ys[k]! + 25)])] }
    expect(verifyRepeats(p, good).satisfied).toBe(true)
    const squeezed = { nodes: [...ys.map(cardAt), ...p[0]!.rows!.flatMap((r, k) => [leaf(r[0]!, 600 + k * 100, 235), leaf(r[1]!, 650 + k * 100, 235)])] }
    const v = verifyRepeats(p, squeezed)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('one row per box')
  })
})

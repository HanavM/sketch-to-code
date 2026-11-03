import { describe, expect, it } from 'vitest'
import { borderShows, boxCharsBrief, boxCharsOf, charMax, charPx, verifyBoxChars } from '../src/repeatmark.js'

const box = (id: string, x: number, y: number, w: number, h: number) => ({
  id, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y: y + 1 }].flatMap((p, i, a) => {
    const n = a[i + 1]; if (!n) return [p]
    return Array.from({ length: 8 }, (_, k) => ({ x: p.x + (n.x - p.x) * k / 8, y: p.y + (n.y - p.y) * k / 8 }))
  }), color: '#111', width: 2,
}) as never

describe('n203: a size word on a character in a small drawn box means as big as fits comfortably; boxes stay visible', () => {
  // round 45 e2 two-factor: six 74x72 boxes, "4, 8, 1 big bold in first three boxes"
  const xs = [640, 726, 812, 898, 984, 1070]
  const strokes = xs.map((x, k) => box('b' + k, x, 390, 74, 72))
  const note = { text: '4, 8, 1 big bold in first three boxes', at: { x: 677, y: 426 } }
  const boxes = (border: string) => xs.map((x, k) => ({ id: 'b' + k, rect: { x, y: 390, w: 74, h: 72 }, style: { backgroundColor: 'rgb(255, 255, 255)', border } }))
  const digits = (fs: number) => [0, 1, 2].map((k) => ({ id: 'd' + k, rect: { x: xs[k]! + 25, y: 400, w: 24, h: 50 }, text: '481'[k], style: { fontSize: `${String(fs)}px` } }))
  it('the brief names a comfortable size and a visible outline', () => {
    const [b] = boxCharsOf([note], strokes)
    expect(charPx(b!)).toBe(32)
    expect(charMax(b!)).toBe(42)
    expect(boxCharsBrief([b!])).toMatch(/about 32px \(never above 42px\)/)
    expect(boxCharsBrief([b!])).toMatch(/visible outline/)
  })
  it('oversized digits fail, comfortable ones pass', () => {
    const [b] = boxCharsOf([note], strokes)
    const big = verifyBoxChars([b!], { nodes: [...boxes('1px rgb(209, 213, 219)'), ...digits(56)] })
    expect(big.satisfied).toBe(false)
    expect(big.reason).toMatch(/56px, too big/)
    expect(verifyBoxChars([b!], { nodes: [...boxes('1px rgb(209, 213, 219)'), ...digits(30)] }).satisfied).toBe(true)
  })
  it('near-white or missing borders fail', () => {
    const [b] = boxCharsOf([note], strokes)
    const faint = verifyBoxChars([b!], { nodes: [...boxes('1px rgb(245, 245, 247)'), ...digits(30)] })
    expect(faint.satisfied).toBe(false)
    expect(faint.reason).toMatch(/no visible outline/)
  })
  it('borderShows', () => {
    expect(borderShows('1px rgb(209, 213, 219)')).toBe(true)
    expect(borderShows('2px rgb(79, 70, 229)')).toBe(true)
    expect(borderShows('1px rgb(250, 250, 250)')).toBe(false)
    expect(borderShows('1px rgba(0, 0, 0, 0)')).toBe(false)
    expect(borderShows(undefined)).toBe(false)
  })
})

import { markAreasAndEdges } from '../src/areas.js'
import { isBoxCharsNote } from '../src/repeatmark.js'
describe('n203: characters for drawn boxes are never a big word area', () => {
  it('isBoxCharsNote', () => {
    expect(isBoxCharsNote('4, 8, 1 big bold in first three boxes')).toBe(true)
    expect(isBoxCharsNote('42 big bold')).toBe(false)
    expect(isBoxCharsNote('We sent it to the boxes')).toBe(false)
  })
  it('a code box with its characters note is not an area', () => {
    const mk = (id: string, x: number) => ({ strokeId: id, shape: 'box', box: { x, y: 390, w: 74, h: 72 } })
    const marks = [mk('b0', 640), mk('b1', 726), mk('b2', 812)] as never[]
    markAreasAndEdges(marks, [{ text: '4, 8, 1 big bold in first three boxes', focus: ['b0'] }] as never, { w: 1280, h: 900 })
    expect((marks as Array<{ area?: boolean }>).some((m) => m.area)).toBe(false)
    const one = [mk('c0', 640)] as never[]
    markAreasAndEdges(one, [{ text: '42 big bold', focus: ['c0'] }] as never, { w: 1280, h: 900 })
    expect((one[0] as { area?: boolean }).area).toBe(true)
  })
})

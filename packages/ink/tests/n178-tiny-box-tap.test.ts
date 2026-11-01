/**
 * n178: a coloured tap inside a tiny closed box (a checkbox) fills that box, never the page.
 * Round 43 e4 (pet adoption): the 18px checkbox drawn at 48,140 and an orange tap at its middle; with the
 * white page tap this made an orange-to-white page fade.
 */
import { describe, expect, it } from 'vitest'
import { inkFills } from '../src/inkfill.js'

type P = { x: number; y: number; t: number }
const walk = (way: number[][], step = 3): P[] => {
  const out: P[] = []
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / step))
    for (let k = 0; k < n; k++) out.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: 0 })
  }
  const z = way[way.length - 1]!
  out.push({ x: z[0]!, y: z[1]!, t: 0 })
  return out
}
const tap = (id: string, x: number, y: number, color: string) => ({ id, color, points: [{ x, y, t: 0 }, { x: x + 1, y, t: 0 }, { x: x + 1, y: y + 1, t: 0 }] })
const page = { w: 1280, h: 900 }

describe('n178 a tap in a tiny box', () => {
  const box = { id: 'cb', points: walk([[48, 140], [66, 140], [66, 158], [48, 158], [48, 142]]) }
  it('fills the 18px checkbox it lands in (the real pet adoption marks)', () => {
    const f = inkFills([tap('w', 640, 880, '#ffffff'), box, tap('o', 57, 149, '#e07a3f')], page)
    expect(f.find((x) => x.dotId === 'o')?.target).toBe('cb')
    expect(f.find((x) => x.dotId === 'w')?.target).toBeNull()
  })
  it('a 12px radio ring holds a tap too', () => {
    const ring = { id: 'r', points: Array.from({ length: 21 }, (_, i) => ({ x: 106 + 6 * Math.cos((i / 20) * 2 * Math.PI), y: 206 + 6 * Math.sin((i / 20) * 2 * Math.PI), t: 0 })) }
    expect(inkFills([ring, tap('o', 106, 206, '#e07a3f')], page)[0]!.target).toBe('r')
  })
  it('a short tick or a small open hook is not a holder', () => {
    const tick = { id: 't', points: walk([[200, 300], [206, 310], [218, 292]]) }
    const hook = { id: 'h', points: walk([[300, 300], [314, 300], [314, 314], [302, 314]]) }
    const f = inkFills([tick, hook, tap('a', 208, 302, '#e07a3f'), tap('b', 308, 307, '#e07a3f')], page)
    expect(f.map((x) => x.target)).toEqual([null, null])
  })
  it('a tap beside the tiny box (not in it) is still a page tap', () => {
    expect(inkFills([box, tap('o', 90, 149, '#e07a3f')], page)[0]!.target).toBeNull()
  })
})

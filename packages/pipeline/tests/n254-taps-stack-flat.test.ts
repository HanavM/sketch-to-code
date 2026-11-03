import { describe, expect, it } from 'vitest'
import { inkFills, markFill, pageFill } from '@s2c/ink'
import { flatLookBrief, stackBrief, stackPairs } from '../src/stackorder.js'

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
const ring = (color: string) => {
  const way: number[][] = []
  for (let k = 0; k <= 24; k++) way.push([1010 + 150 * Math.cos(k * Math.PI / 12), 260 + 150 * Math.sin(k * Math.PI / 12)])
  return s('ring', color, way)
}
const P = { w: 1280, h: 900 }

describe('n239: a tap fills what was there when it was made', () => {
  it('a page tap stays the page when a shape is drawn over the spot later', () => {
    const st = [tap('p', '#1a1024', 460, 640), s('beam', '#4f4040', [[590, 90], [690, 90], [890, 720], [390, 720], [590, 90]]), tap('b', '#4f4040', 520, 600)]
    const f = inkFills(st, P)
    expect(f.find((x) => x.dotId === 'p')!.target).toBeNull()
    expect(pageFill(f)).toEqual({ colors: ['#1a1024'], css: '#1a1024' })
    expect(markFill(f, 'beam')!.colors).toEqual(['#4f4040'])
  })
  it('a tap after the shape still fills it', () => {
    const st = [s('box', '#111111', [[100, 100], [300, 100], [300, 300], [100, 300], [100, 100]]), tap('t', '#ff0000', 200, 200)]
    expect(inkFills(st, P)[0]!.target).toBe('box')
  })
})

describe('n245: a tap on a mark\'s own line is the mark\'s, never the page\'s', () => {
  it('a slip just outside the ring in its pen does not fade the page', () => {
    const st = [tap('p', '#1a1833', 780, 60), ring('#ffb368'), tap('t', '#ffb368', 1010 + 156, 260)]
    const f = inkFills(st, P)
    expect(f.find((x) => x.dotId === 't')!.target).toBe('ring')
    expect(pageFill(f)).toEqual({ colors: ['#1a1833'], css: '#1a1833' })
  })
  it('a different pen off the line stays where it landed', () => {
    const st = [ring('#ffb368'), tap('t', '#00ff00', 1010 + 156, 260)]
    expect(inkFills(st, P)[0]!.target).toBeNull()
  })
  it('a far page tap in the ring\'s pen is still the page', () => {
    const st = [ring('#ffb368'), tap('t', '#ffb368', 400, 800)]
    expect(inkFills(st, P)[0]!.target).toBeNull()
  })
  it('line tap plus a tap inside: the inside colour fills, no fade across the ring', () => {
    const st = [ring('#ffb368'), tap('l', '#ffb368', 1010 + 150, 260), tap('i', '#332c61', 1010, 260)]
    const f = inkFills(st, P)
    expect(f.map((x) => x.dotId)).toEqual(['i'])
    expect(markFill(f, 'ring')!.colors).toEqual(['#332c61'])
  })
  it('two taps well inside a banner are still a fade', () => {
    const st = [s('b', '#222222', [[0, 0], [1000, 0], [1000, 300], [0, 300], [0, 0]]), tap('a', '#ff0000', 100, 150), tap('z', '#0000ff', 900, 150)]
    expect(markFill(inkFills(st, P), 'b')!.colors).toEqual(['#ff0000', '#0000ff'])
  })
  it('two page taps clear of every mark are still a page fade', () => {
    const st = [tap('a', '#ff0000', 100, 100), tap('z', '#0000ff', 1100, 800)]
    expect(pageFill(inkFills(st, P))!.colors).toHaveLength(2)
  })
})

describe('n241: what is drawn later stands in front', () => {
  const mountain = s('m', '#667788', [[420, 700], [920, 150], [1270, 700], [420, 700]])
  const car = s('c', '#cc1133', [[500, 540], [700, 540], [700, 680], [500, 680], [500, 540]])
  it('a car drawn after a mountain is in front of it', () => {
    expect(stackPairs([mountain, car])).toHaveLength(1)
    expect(stackBrief([mountain, car])).toMatch(/IN FRONT/)
  })
  it('a mountain drawn after the car is in front instead', () => {
    expect(stackPairs([car, mountain])[0]!.front.w).toBeGreaterThan(400)
  })
  it('a box wholly in a plain panel says nothing', () => {
    const panel = s('p', '#eeeeee', [[0, 0], [800, 0], [800, 800], [0, 800], [0, 0]])
    expect(stackPairs([panel, car])).toHaveLength(0)
  })
  it('apart marks say nothing', () => {
    const far = s('f', '#000000', [[1000, 10], [1200, 10], [1200, 100], [1000, 100], [1000, 10]])
    expect(stackBrief([car, far])).toBe('')
  })
})

describe('n254: flat unless asked', () => {
  it('says flat when no note asks for a look', () => {
    expect(flatLookBrief(['Buy a ticket white bold', 'Up the mountain huge'])).toMatch(/FLAT UNLESS ASKED/)
  })
  it.each(['soft shadow on the card', 'a blue fade', 'glowing title', 'gradient sky'])('keeps a look asked for: %s', (n) => {
    expect(flatLookBrief([n])).toBe('')
  })
})

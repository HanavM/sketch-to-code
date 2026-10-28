import { describe, expect, it } from 'vitest'
import { giantStacks, isTextLine, stackJoin } from '../src/notefocus.js'
import type { Stroke } from '../src/types.js'

const walk = (id: string, way: number[][]): Stroke => {
  const points: Stroke['points'] = []
  let t = 0
  for (let i = 1; i < way.length; i++) {
    const [ax, ay] = way[i - 1]!, [bx, by] = way[i]!
    const n = Math.max(1, Math.round(Math.hypot(bx! - ax!, by! - ay!) / 6))
    for (let k = 0; k < n; k++) points.push({ x: ax! + ((bx! - ax!) * k) / n, y: ay! + ((by! - ay!) * k) / n, t: t++ })
  }
  points.push({ x: way[way.length - 1]![0]!, y: way[way.length - 1]![1]!, t })
  return { id, points }
}
const box = (s: Stroke) => {
  const xs = s.points.map((p) => p.x), ys = s.points.map((p) => p.y)
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
const gap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) =>
  Math.hypot(Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w), 0), Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h), 0))

// the overlay's note cluster (main.ts clusterFrom), space only, with the n40 stack rule
function cluster(seed: string, strokes: Stroke[], useStacks = true): string[] {
  const stacks = giantStacks(strokes)
  const line = (id: string) => isTextLine(strokes.find((s) => s.id === id)!.points)
  const group = [seed]
  for (;;) {
    const next = strokes.find((st) => !group.includes(st.id) && group.some((g) => {
      const j = useStacks ? stackJoin(g, st.id, stacks, line) : undefined
      if (j !== undefined) return j
      return gap(box(strokes.find((s) => s.id === g)!), box(st)) <= 120
    }))
    if (!next) break
    group.push(next.id)
  }
  return group.sort()
}

// round 32 c1 (aurora), the hand sketch's strokes as drawn
const aurora = [
  walk('logo', [[72, 44], [170, 44]]),
  walk('nav', [[958, 44], [1208, 44]]),
  walk('north', [[78, 355], [715, 355]]),
  walk('lights', [[78, 525], [735, 525]]),
  walk('date', [[78, 615], [400, 615]]),
  walk('button', [[90, 680], [238, 680], [250, 710], [238, 740], [90, 740], [78, 710], [90, 680]]),
  walk('acts1', [[940, 578], [1208, 578]]),
  walk('acts2', [[961, 611], [1208, 611]]),
]

describe('giant heading lines are one drawing (n40)', () => {
  it('finds NORTH and LIGHTS as one giant stack, without the date line', () => {
    const s = giantStacks(aurora)
    expect(s.get('north')?.sort()).toEqual(['lights', 'north'])
    expect(s.get('lights')).toBe(s.get('north'))
    expect(s.has('date')).toBe(false)
  })
  it('before: the heading note took line 1 only and LIGHTS joined the date', () => {
    expect(cluster('north', aurora, false)).toEqual(['north'])
    expect(cluster('date', aurora, false)).toEqual(['button', 'date', 'lights'])
  })
  it('after: a note on either line takes both, and the date note never takes LIGHTS', () => {
    expect(cluster('north', aurora)).toEqual(['lights', 'north'])
    expect(cluster('lights', aurora)).toEqual(['lights', 'north'])
    expect(cluster('date', aurora)).toEqual(['button', 'date'])
  })
  it('a small stack (a title over a section heading, 40px apart) is left to the usual rule', () => {
    const small = [walk('a', [[100, 100], [500, 100]]), walk('b', [[100, 140], [450, 140]])]
    expect(giantStacks(small).size).toBe(0)
    expect(stackJoin('a', 'b', giantStacks(small), () => true)).toBeUndefined()
  })
  it('a box drawn round a giant heading still groups with it (only text lines are kept apart)', () => {
    const framed = [...aurora.slice(2, 4), walk('frame', [[60, 260], [760, 260], [760, 600], [60, 600], [60, 260]])]
    expect(isTextLine(framed[2]!.points)).toBe(false)
    expect(cluster('frame', framed)).toEqual(['frame', 'lights', 'north'])
  })
})

describe('a heading line is drawn low on its letters (n40)', () => {
  it('the aurora heading box starts above the centred line box, so baselines land near the drawn lines', async () => {
    const { textStacks } = await import('../src/textmark.js')
    const st = textStacks(aurora).find((s) => s.lines === 2)!
    expect(st.linePitchPx).toBe(170)
    // centred would be 355 - 85 = 270; lifted 0.16 of the pitch
    expect(st.box.y).toBe(243)
  })
})

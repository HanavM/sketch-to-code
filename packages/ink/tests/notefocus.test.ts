import { describe, expect, it } from 'vitest'
import { noteFocus } from '../src/notefocus.js'
import type { Stroke } from '../src/types.js'

// walk a polyline at ~6px so it looks like captured ink
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
const ring = (id: string, cx: number, cy: number, r: number): Stroke =>
  walk(id, Array.from({ length: 17 }, (_, i) => [cx + r * Math.cos((i / 16) * 2 * Math.PI), cy + r * Math.sin((i / 16) * 2 * Math.PI)]))

// round 12 c4 (n8): a big box, a badge ring beside it, a card box under it, a diagonal line
const S = [
  walk('diag', [[805, 0], [500, 900]]),
  walk('big', [[400, 140], [910, 140], [910, 515], [400, 515], [400, 140]]),
  ring('badge', 1135, 215, 75),
  walk('card', [[900, 520], [1220, 520], [1220, 652], [900, 652], [900, 520]]),
]
const ids = S.map((s) => s.id)

describe('noteFocus (moved to ink so the overlay can show it, n9)', () => {
  it('a note typed inside the ring is about the ring alone', () => {
    expect(noteFocus(ids, undefined, { x: 1135, y: 215 }, S)).toEqual(['badge'])
  })
  it('a note typed on the big box edge is about the big box (what the thread shows)', () => {
    expect(noteFocus(ids, undefined, { x: 900, y: 340 }, S)).toEqual(['big'])
  })
  it('a given focus wins, so the overlay and the build agree', () => {
    expect(noteFocus(ids, ['card'], { x: 1135, y: 215 }, S)).toEqual(['card'])
  })
})

describe('a diagonal covers its ink, not its box (n9)', () => {
  it('a note typed in the big box, away from the band, is about the box alone', () => {
    expect(noteFocus(ids, undefined, { x: 560, y: 420 }, S)).toEqual(['big'])
  })
  it('a note typed on the band itself is still about the band', () => {
    expect(noteFocus(ids, undefined, { x: 520, y: 845 }, S)).toEqual(['diag'])
  })
})

describe('n11: nested boxes and stacked heading lines', () => {
  const card = walk('card', [[300, 200], [900, 200], [900, 600], [300, 600], [300, 200]])
  const btn = walk('btn', [[350, 500], [550, 500], [550, 560], [350, 560], [350, 500]])
  const head = walk('head', [[350, 260], [800, 260]])
  const NB = [card, btn, head]
  it('a note typed inside a button box on a card is about the button alone', () => {
    expect(noteFocus(NB.map((s) => s.id), undefined, { x: 450, y: 530 }, NB)).toEqual(['btn'])
  })
  it('a note typed on the card away from its contents is still about the card', () => {
    expect(noteFocus(NB.map((s) => s.id), undefined, { x: 850, y: 400 }, NB)).toEqual(['card'])
  })
  // round 1 c1: a long line with a short centred line 120px under it is one big heading
  const L = [
    walk('l1', [[215, 305], [1070, 305]]),
    walk('l2', [[540, 425], [745, 425]]),
    walk('sub', [[350, 528], [930, 528]]),
    walk('btn', [[450, 650], [670, 650], [670, 710], [450, 710], [450, 650]]),
  ]
  it('a note typed on the first line of a stacked line heading covers both lines', () => {
    expect(noteFocus(L.map((s) => s.id), undefined, { x: 640, y: 300 }, L)).toEqual(['l1', 'l2'])
  })
})

describe('a heading never takes a paragraph line; a paragraph note covers its wraps (n19)', () => {
  const S = [
    walk('h1', [[215, 305], [1070, 305]]), walk('h2', [[540, 425], [745, 425]]),
    walk('p1', [[350, 528], [930, 528]]), walk('p2', [[585, 554], [695, 554]]),
    walk('btn', [[530, 616], [750, 616], [750, 676], [530, 676], [530, 616]]),
  ]
  const ids = S.map((s) => s.id)
  it('a note on heading line 1 covers line 2 but not the subtitle wrap under it', () => {
    expect(noteFocus(ids, undefined, { x: 640, y: 300 }, S)).toEqual(['h1', 'h2'])
  })
  it('a note on the subtitle covers both of its lines', () => {
    expect(noteFocus(ids, undefined, { x: 640, y: 528 }, S)).toEqual(['p1', 'p2'])
  })
  it('a short title over a longer subtitle stays apart', () => {
    const L = [walk('t', [[470, 205], [556, 205]]), walk('s', [[470, 236], [697, 236]]), walk('b', [[470, 288], [810, 288], [810, 332], [470, 332], [470, 288]])]
    expect(noteFocus(L.map((x) => x.id), undefined, { x: 510, y: 205 }, L)).toEqual(['t'])
  })
})

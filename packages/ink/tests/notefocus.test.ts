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

describe('n31: one note covers a group of marks', () => {
  // round 31 c3: three overlapping turned cards; round 31 c2: three frames in a row
  const cards = [
    walk('navy', [[708, 192], [1045, 150], [1070, 370], [735, 410], [708, 192]]),
    walk('blue', [[790, 300], [1126, 322], [1115, 518], [775, 515], [790, 300]]),
    walk('pink', [[836, 466], [1172, 452], [1184, 672], [845, 688], [836, 466]]),
    walk('btn', [[76, 560], [255, 560], [255, 616], [76, 616], [76, 560]]),
    walk('head', [[72, 240], [500, 240]]),
  ]
  const cid = cards.map((s) => s.id)
  it('"3 tilted stacked cards" typed by the top card is about all three', () => {
    const f = noteFocus(cid, undefined, { x: 1150, y: 120 }, cards, '3 tilted stacked cards, white plastik top left')
    expect(f?.sort()).toEqual(['blue', 'navy', 'pink'])
  })
  it('without a group word it stays on the nearest card', () => {
    expect(noteFocus(cid, undefined, { x: 1150, y: 120 }, cards, 'white plastik top left')).toEqual(['navy'])
  })
  const frames = [
    walk('f1', [[100, 300], [380, 300], [380, 650], [100, 650], [100, 300]]),
    walk('f2', [[440, 300], [800, 300], [800, 650], [440, 650], [440, 300]]),
    walk('f3', [[840, 300], [1120, 300], [1120, 650], [840, 650], [840, 300]]),
    walk('title', [[100, 150], [700, 150]]),
  ]
  const fid = frames.map((s) => s.id)
  it('"gold frames on all 3" covers the row of frames, and "both" or a count past the group does nothing odd', () => {
    expect(noteFocus(fid, undefined, { x: 1080, y: 320 }, frames, 'gold frames on all 3')?.sort()).toEqual(['f1', 'f2', 'f3'])
    expect(noteFocus(fid, undefined, { x: 1080, y: 320 }, frames, 'all frames thin gold')?.sort()).toEqual(['f1', 'f2', 'f3'])
    expect(noteFocus(fid, undefined, { x: 1080, y: 320 }, frames, '5 cards')).toEqual(['f3'])
    expect(noteFocus(fid, undefined, { x: 1080, y: 320 }, frames, 'all text white')).toEqual(['f3'])
  })
})

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isNoteLine, itemList, noteFocus } from '../src/notefocus.js'

// round 44 pages as drawn by hand in n187: the real strokes and notes typed before the first Run
const load = (page: string) => {
  const d = JSON.parse(readFileSync(new URL(`../../../tests/hand/out-n187/round44/${page}/digest.json`, import.meta.url), 'utf8'))
  const dens = (w: number[][]) => {
    const out: Array<{ x: number; y: number; t: number }> = []
    w.forEach((b, i) => {
      if (i === 0) { out.push({ x: b[0]!, y: b[1]!, t: 0 }); return }
      const a = w[i - 1]!; const n = Math.max(1, Math.ceil(Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!) / 6))
      for (let k = 1; k <= n; k++) out.push({ x: a[0]! + (b[0]! - a[0]!) * k / n, y: a[1]! + (b[1]! - a[1]!) * k / n, t: out.length })
    })
    return out
  }
  const strokes = d.strokesDrawn.map((s: { way: number[][] }, i: number) => ({ id: 's' + i, tool: 'pen' as const, startedAt: 0, points: dens(s.way) }))
  const notes = d.notesTyped.filter((n: { whole: boolean }) => !n.whole) as Array<{ x: number; y: number; text: string }>
  const notesAt = notes.map((n) => ({ x: n.x, y: n.y, text: n.text }))
  return (pre: string, ids: number[]) => {
    const n = notes.find((x) => x.text.startsWith(pre))!
    const all = ids.map((i) => 's' + i)
    return noteFocus(all, undefined, { x: n.x, y: n.y }, strokes, n.text, { notesAt }) ?? all
  }
}

describe('n189 a note typed just beside a short line is that line\'s', () => {
  it('a stat typed under its short line in a band is the line\'s, not the band\'s (c2 cider)', () => {
    const f = load('c2-cider-orchard')
    expect(f('12 /', [1, 12, 13, 14])).toEqual(['s12'])
    expect(f('40 /', [1, 12, 13, 14])).toEqual(['s13'])
    expect(f('1921', [1, 12, 13, 14])).toEqual(['s14'])
  })
  it('heading and subtitle typed over their lines in a panel are the lines\', not the panel\'s (c3 cinema)', () => {
    const f = load('c3-retro-cinema')
    expect(f('Tonight', [7, 9, 10, 11, 12, 14])).toEqual(['s9'])
    expect(f('Restored', [7, 9, 10, 11, 12, 14])).toEqual(['s10'])
  })
  it('the nearest line wins over a box a little further off (c1 date, c5 logo)', () => {
    expect(load('c1-lantern-festival')('Sept', [11, 13])).toEqual(['s13'])
    expect(load('c5-pottery-class')('Kiln', [1, 4])).toEqual(['s4'])
  })
  it('a row note leaves the next row\'s line, which has its own note (c5 class rows)', () => {
    const f = load('c5-pottery-class')
    expect(f('Tuesday', [10, 11, 12])).toEqual(['s10'])
    expect(f('Saturday', [10, 11, 12])).toEqual(['s11'])
  })
  it('a short stat line counts as a line; a list of items or a note naming an area does not move to a line', () => {
    expect(isNoteLine([{ x: 198, y: 789 }, { x: 216, y: 790 }, { x: 234, y: 789 }])).toBe(true)
    expect(isNoteLine([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toBe(false)
    expect(itemList('Profile, Account, Notifications bold dark, Billing stacked')).toBe(true)
    expect(itemList('Restored print, 35mm, with a live organ intro.')).toBe(false)
    expect(itemList('Tonight: Casablanca, big serif bold')).toBe(false)
  })
})

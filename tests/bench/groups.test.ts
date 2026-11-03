import { describe, expect, it } from 'vitest'
// @ts-ignore plain JS module
import { matchGroups, matchRegions } from './lib/score.mjs'

const el = (parent: number, x: number, y: number, w: number, h: number) => ({ parent, rect: { x, y, w, h } })

describe('matchGroups: a region built as unwrapped sibling parts', () => {
  const regions = [{ role: 'toolbar', rect: { x: 0, y: 0, w: 1280, h: 60 } }]
  it('credits sibling parts spanning the region when no single element fits', () => {
    const els = [el(-1, 0, 0, 1280, 900), el(0, 20, 14, 200, 30), el(0, 600, 14, 180, 31), el(0, 1100, 14, 160, 32), el(0, 0, 59, 1280, 1)]
    const first = matchRegions(regions, els).matched
    expect(first.size).toBe(0)
    const g = matchGroups(regions, els, first)
    expect(g.get(0).parts).toBe(4)
    expect(g.get(0).iou).toBeGreaterThan(0.7)
  })
  it('does not credit parts from different subtrees (unrelated pages)', () => {
    const els = [el(-1, 0, 0, 640, 900), el(-1, 640, 0, 640, 900), el(0, 20, 14, 200, 30), el(1, 1100, 14, 160, 32)]
    expect(matchGroups(regions, els, matchRegions(regions, els).matched).size).toBe(0)
  })
  it('does not reuse an element the single pass already matched', () => {
    const els = [el(-1, 0, 0, 1280, 900), el(0, 0, 0, 1280, 58), el(1, 20, 14, 200, 30), el(1, 1100, 14, 160, 32)]
    const first = matchRegions(regions, els).matched
    expect(first.size).toBe(1)
    expect(matchGroups(regions, els, first).size).toBe(0)
  })
})

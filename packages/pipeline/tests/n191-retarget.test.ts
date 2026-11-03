import { describe, expect, it } from 'vitest'
import { applyRetargets, nodeForTap } from '../src/retarget.js'
import type { RawInterpretation } from '../src/intent2.js'

const node = (id: string, srcLoc: string | null, x: number, y: number, w: number, h: number, tag = 'div') => ({
  id, tag, srcLoc, rect: { x, y, w, h }, text: '', classes: [],
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0,0,0,0)', color: 'rgb(0,0,0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' },
  parent: null,
})
const snap = {
  nodes: [
    node('e9', 'src/components/DeliveryRoute.tsx:20:5', 0, 160, 620, 600, 'path'),
    node('e30', 'src/App.tsx:40:9', 799, 147, 441, 8),
    node('e31', 'src/App.tsx:41:11', 799, 147, 309, 8),
    node('e40', 'src/App.tsx:60:7', 835, 190, 200, 20),
    node('e41', 'src/App.tsx:60:7', 835, 288, 200, 20),
  ],
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false,
} as never
const raw = (): RawInterpretation => ({
  reading: 'grey track to right edge',
  actions: [
    { kind: 'modify', elements: ['e11', 'e45'], instruction: 'dots filled', strokes: null } as never,
    { kind: 'modify', elements: ['e9'], instruction: 'grey track to right edge', strokes: null } as never,
  ],
})

describe('n191 a tap on the plan picks the part a fix is about', () => {
  it('swaps the old id for the tapped element in that action, and says so', () => {
    const r = applyRetargets(raw(), snap, [{ action: 1, from: 'e9', srcLoc: 'src/App.tsx:40:9', rect: { x: 799, y: 147, w: 441, h: 8 } }])
    expect(r.raw.actions[1]!.elements).toEqual(['e30'])
    expect(r.raw.actions[1]!.instruction).toMatch(/tapped e30 .*not e9: leave e9 exactly as it is/)
    expect(r.applied).toEqual([{ action: 1, from: 'e9', to: 'e30' }])
    expect(r.raw.actions[0]!.elements).toEqual(['e11', 'e45'])
  })
  it('never changes the interpretation it was given', () => {
    const before = raw()
    applyRetargets(before, snap, [{ action: 1, from: 'e9', srcLoc: 'src/App.tsx:40:9', rect: { x: 799, y: 147, w: 441, h: 8 } }])
    expect(before.actions[1]!.elements).toEqual(['e9'])
  })
  it('finds the action holding the old id when the index shifted', () => {
    const r = applyRetargets(raw(), snap, [{ action: 0, from: 'e9', srcLoc: 'src/App.tsx:40:9', rect: { x: 799, y: 147, w: 441, h: 8 } }])
    expect(r.raw.actions[1]!.elements).toEqual(['e30'])
    expect(r.raw.actions[0]!.elements).toEqual(['e11', 'e45'])
  })
  it('one stamp rendered many times: the copy nearest the tapped box', () => {
    expect(nodeForTap(snap, 'src/App.tsx:60:7', { x: 835, y: 290, w: 200, h: 20 })).toBe('e41')
    expect(nodeForTap(snap, 'src/App.tsx:60:7', { x: 835, y: 192, w: 200, h: 20 })).toBe('e40')
  })
  it('a stamp not on the page is refused and the action left alone', () => {
    const r = applyRetargets(raw(), snap, [{ action: 1, from: 'e9', srcLoc: 'src/Gone.tsx:1:1', rect: { x: 0, y: 0, w: 1, h: 1 } }])
    expect(r.raw.actions[1]!.elements).toEqual(['e9'])
    expect(r.refused[0]).toMatch(/not on the page/)
  })
  it('no retargets: the same actions', () => {
    const r = applyRetargets(raw(), snap, undefined)
    expect(r.raw.actions.map((a) => a.elements)).toEqual([['e11', 'e45'], ['e9']])
    expect(r.applied).toEqual([])
  })
})

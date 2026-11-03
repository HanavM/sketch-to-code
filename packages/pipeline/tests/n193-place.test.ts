import { describe, expect, it } from 'vitest'
import { applyRetargets } from '../src/retarget.js'
import type { RawInterpretation } from '../src/intent2.js'
import type { DomSnapshot } from '@s2c/dom'

// round 44 e3 (n192 replay): "sky fades to pale orange" was a DESIGN step with no target; the build put the
// sky into the crop frame. n193: "place it" + a tap on the canvas gives the step its place.
const snap = {
  nodes: [
    { id: 'e20', srcLoc: 'src/App.tsx:40:7', rect: { x: 100, y: 80, w: 780, h: 560 } },
    { id: 'e21', srcLoc: 'src/App.tsx:42:9', rect: { x: 180, y: 140, w: 620, h: 440 } },
  ],
} as unknown as DomSnapshot
const raw = (): RawInterpretation => ({
  reading: 'tool column, sky, thumbnails',
  actions: [
    { kind: 'add', elements: [], destElement: null, instruction: 'add four grey squares under the yellow one', strokes: null } as never,
    { kind: 'design', elements: [], destElement: 'e21', instruction: 'sky fades from peach to pale orange', strokes: null } as never,
    { kind: 'modify', elements: ['e5'], instruction: 'thumbnails back to pen colours', strokes: null } as never,
  ],
})
const canvas = { srcLoc: 'src/App.tsx:40:7', rect: { x: 100, y: 80, w: 780, h: 560 } }

describe('n193 a tap places a step that has no target', () => {
  it('a design step tapped onto the canvas goes there, not into the frame it was read into', () => {
    const r = applyRetargets(raw(), snap, [{ action: 1, from: null, ...canvas }])
    const a = r.raw.actions[1]!
    expect(a.destElement).toBe('e20')
    expect(a.elements).toEqual([])
    expect(a.instruction).toMatch(/tapped e20 as the place this goes/)
    expect(a.instruction).toMatch(/not e21/)
    expect(r.applied).toEqual([{ action: 1, from: null, to: 'e20' }])
  })
  it('finds the action by its words when the plan index has shifted', () => {
    const r = applyRetargets(raw(), snap, [{ action: 0, from: null, ...canvas, instruction: 'sky fades from peach to pale orange' }])
    expect(r.raw.actions[1]!.destElement).toBe('e20')
    expect(r.raw.actions[0]!.destElement).toBeNull()
  })
  it('a modify with no target takes the tapped part as its target', () => {
    const base = raw()
    base.actions[2]!.elements = []
    const r = applyRetargets(base, snap, [{ action: 2, from: null, ...canvas }])
    expect(r.raw.actions[2]!.elements).toEqual(['e20'])
    expect(r.raw.actions[2]!.instruction).toMatch(/do it there and in no other element/)
  })
  it('never changes its input', () => {
    const before = raw()
    applyRetargets(before, snap, [{ action: 1, from: null, ...canvas }])
    expect(before.actions[1]!.destElement).toBe('e21')
  })
})

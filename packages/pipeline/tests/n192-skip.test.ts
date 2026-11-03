import { describe, expect, it } from 'vitest'
import { applySkips, struckBrief } from '../src/retarget.js'
import type { RawInterpretation } from '../src/intent2.js'

// round 44 e3 (n192 replay): "delete texts 4 grey squares and 5 sliders" read as two outright deletions
const raw = (): RawInterpretation => ({
  reading: 'fix the tool column, the sky, the thumbnails; delete the printed note words',
  actions: [
    { kind: 'modify', elements: ['e5', 'e7'], instruction: 'top square solid yellow', strokes: null } as never,
    { kind: 'modify', elements: ['e20'], instruction: 'sky fades to pale orange', strokes: null } as never,
    { kind: 'delete', elements: ['e7', 'e8', 'e9', 'e10'], instruction: 'Delete the 4 grey squares.', strokes: null } as never,
    { kind: 'delete', elements: ['e27', 'e28'], instruction: 'Delete the 5 sliders entirely.', strokes: null } as never,
  ],
})

describe('n192 "skip" strikes a plan action before Go', () => {
  it('drops the struck actions and keeps the rest in order', () => {
    const r = applySkips(raw(), [{ action: 2, ids: ['e7', 'e8', 'e9', 'e10'] }, { action: 3, ids: ['e27', 'e28'] }])
    expect(r.raw.actions.map((a) => a.instruction)).toEqual(['top square solid yellow', 'sky fades to pale orange'])
    expect(r.struck.map((s) => s.kind)).toEqual(['delete', 'delete'])
    expect(r.refused).toEqual([])
  })
  it('finds the action by the ids the row showed when the index has shifted', () => {
    const r = applySkips(raw(), [{ action: 1, ids: ['e27', 'e28'] }])
    expect(r.struck).toEqual([{ action: 3, kind: 'delete', instruction: 'Delete the 5 sliders entirely.' }])
    expect(r.raw.actions).toHaveLength(3)
  })
  it('uses the index when no ids are given, refuses an unknown one, and never changes its input', () => {
    const before = raw()
    const r = applySkips(before, [{ action: 0 }, { action: 9 }])
    expect(r.raw.actions).toHaveLength(3)
    expect(r.refused).toEqual(['skip 9: no such action'])
    expect(before.actions).toHaveLength(4)
  })
  it('no skips: the same actions', () => {
    expect(applySkips(raw(), undefined).raw.actions).toHaveLength(4)
    expect(struckBrief([])).toBe('')
  })
  it('the brief tells the build not to do a struck action, whatever the notes seem to say', () => {
    const b = struckBrief(applySkips(raw(), [{ action: 3, ids: ['e27', 'e28'] }]).struck)
    expect(b).toMatch(/STRUCK FROM THE PLAN/)
    expect(b).toMatch(/DELETE: Delete the 5 sliders entirely\./)
    expect(b).toMatch(/do NOT do them/)
  })
})

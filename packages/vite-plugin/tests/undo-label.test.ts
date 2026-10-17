import { describe, expect, it } from 'vitest'
import { runUndoLabel } from '../src/undo-store.js'

describe('runUndoLabel (s2c-045): what Ctrl+Z says it undid', () => {
  it('reuses the Done sentence of a run that went as drawn', () => {
    expect(runUndoLabel({ problem: false, sentence: 'Done: added "testimonials" where you drew it.' }))
      .toBe('added "testimonials" where you drew it')
    expect(runUndoLabel({ problem: false, sentence: '✓ Done: made the heading with "Get started" green.' }))
      .toBe('made the heading with "Get started" green')
  })
  it('says "your last sketch" when there is no plain sentence to reuse', () => {
    expect(runUndoLabel(undefined)).toBe('your last sketch')
    expect(runUndoLabel(null)).toBe('your last sketch')
    expect(runUndoLabel({ problem: false, sentence: 'Done.' })).toBe('your last sketch')
    // a misread's sentence is a complaint, not a description of what to take back
    expect(runUndoLabel({ problem: true, sentence: "I read your sketch as: x. But I couldn't add it." })).toBe('your last sketch')
  })
  it('a stopped run says so', () => {
    expect(runUndoLabel({ problem: false, sentence: 'Done: x.' }, true)).toBe('your last sketch (stopped part way)')
  })
  it('never the old developer label', () => {
    for (const e of [undefined, { problem: false, sentence: 'Done.' }]) expect(runUndoLabel(e)).not.toMatch(/sketch run/)
  })
})

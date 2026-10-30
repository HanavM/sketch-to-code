import { describe, expect, it } from 'vitest'
import { BUILD_AFTER_WRITE_MS, STALL_MS, stallReason, wroteThisTurn } from '../src/turn-watch.js'

describe('n93: a build that wrote the page and then goes quiet is ended', () => {
  // timesheet (n92 try 3): Write src/App.tsx at 156 s, then 19 minutes with the stream alive and no tool call or word
  const wroteAt = 156_000
  it('stream noise after the Write does not keep it going', () => {
    const now = wroteAt + BUILD_AFTER_WRITE_MS + 4_000
    // lastActivity is fresh (thinking, pings), lastProgress is the Write
    const why = stallReason({ now, lastActivity: now - 500, wrote: true, lastProgress: wroteAt })
    expect(why).toMatch(/wrote the page, then made no progress for 124 s/)
  })
  it('a build still thinking before its first Write is left alone (n21 bento: 150+ s to one big Write)', () => {
    const now = wroteAt - 1_000
    expect(stallReason({ now, lastActivity: now - 500, wrote: false, lastProgress: 0 })).toBeNull()
  })
  it('a build that keeps editing after its Write runs on', () => {
    const now = wroteAt + 400_000
    expect(stallReason({ now, lastActivity: now - 200, wrote: true, lastProgress: now - 20_000 })).toBeNull()
  })
  it('the old silence rule still holds for a build that never wrote', () => {
    expect(stallReason({ now: STALL_MS + 10, lastActivity: 0, wrote: false, lastProgress: 0 })).toMatch(/no progress for 150 s/)
  })
  it('knows a writing turn from its tool log', () => {
    expect(wroteThisTurn(['Glob', 'Read src/App.tsx', 'Write src/App.tsx'])).toBe(true)
    expect(wroteThisTurn(['Edit src/App.tsx'])).toBe(true)
    expect(wroteThisTurn(['Glob', 'Read src/App.tsx', 'Read s2c-hand-app/package.json'])).toBe(false)
    expect(wroteThisTurn([])).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { repairEstimateMs, repairFits } from '../src/repair-time.js'

describe('a repair turn only starts when it can finish before the run cap', () => {
  it('always fits without a deadline', () => {
    expect(repairFits(undefined, 0, [{ kind: 'build', ms: 900_000 }])).toBe(true)
  })
  it('estimates from the build when no repair has run, never under 2 minutes', () => {
    expect(repairEstimateMs([{ kind: 'build', ms: 100_000 }])).toBe(120_000)
    expect(repairEstimateMs([{ kind: 'build', ms: 600_000 }])).toBe(240_000)
  })
  it('uses the longest repair already sent', () => {
    expect(repairEstimateMs([{ kind: 'build', ms: 600_000 }, { kind: 'repair', ms: 150_000 }])).toBe(150_000)
  })
  it('round 7 e4: an 8-minute build in a 12-minute cap leaves no room for a repair', () => {
    const start = 0
    const deadline = start + 12 * 60_000
    const now = start + 9 * 60_000 // reading handed over, build done at ~8 min, verify ~1 min
    expect(repairFits(deadline, now, [{ kind: 'build', ms: 480_000 }])).toBe(false)
  })
  it('a 5-minute build leaves room', () => {
    expect(repairFits(12 * 60_000, 6 * 60_000, [{ kind: 'build', ms: 300_000 }])).toBe(true)
  })
})

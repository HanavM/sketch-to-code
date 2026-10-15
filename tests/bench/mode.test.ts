import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs bench helper, no types
import { MODES, keyFor, launchArgs, modeHolds, parseMode } from './lib/mode.mjs'

describe('bench --mode', () => {
  it('defaults to auto, which is what a user gets', () => {
    expect(parseMode(null)).toBe('auto')
    expect(parseMode(undefined)).toBe('auto')
    // `--mode` with no value: process.argv[i + 1] is undefined -> arg() gives true
    expect(parseMode(true)).toBe('auto')
  })

  it('accepts the four arms, case-insensitively, and rejects typos', () => {
    for (const m of MODES) expect(parseMode(m.toUpperCase())).toBe(m)
    expect(() => parseMode('screenshots')).toThrow(/--mode must be one of/)
    expect(() => parseMode('')).toThrow()
  })

  it('maps each override to the overlay binding that sets it', () => {
    expect(keyFor('gesture')).toBe('Alt+g')
    expect(keyFor('design')).toBe('Alt+e')
    expect(keyFor('screenshot')).toBe('Alt+s')
    expect(keyFor('auto')).toBeNull()
  })

  it('only the screenshot arm changes how chromium launches', () => {
    expect(launchArgs('screenshot')).toContain('--auto-accept-this-tab-capture')
    for (const m of ['auto', 'gesture', 'design']) expect(launchArgs(m)).toEqual([])
  })

  it('checks the override, not the inference', () => {
    expect(modeHolds('auto', { chosen: 'auto', effective: 'design' })).toBe(true)
    expect(modeHolds('auto', { chosen: 'gesture', effective: 'gesture' })).toBe(false)
    expect(modeHolds('screenshot', { chosen: 'screenshot', effective: 'screenshot' })).toBe(true)
    // auto happening to infer gesture is NOT the gesture arm
    expect(modeHolds('gesture', { chosen: 'auto', effective: 'gesture' })).toBe(false)
    expect(modeHolds('design', null)).toBe(false)
  })
})

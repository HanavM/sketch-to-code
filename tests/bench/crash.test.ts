import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs bench helper, no types
import { browserSpoiled, freshBrowserPerPage, retryable, withTimeout } from './lib/crash.mjs'

const gone = 'page.evaluate: Target page, context or browser has been closed'
const hung = 'tab capture hung: no answer in 45s'
const noFrame = 'page.evaluate: Error: screen capture started but never showed a frame — try ▶ Run again'

describe('bench crash handling (s2c-029)', () => {
  it('retries a dead or wedged browser once, before Run only', () => {
    for (const m of [gone, hung, noFrame, 'screen capture timed out (dialog dismissed?)']) {
      expect(retryable(m, { pressedRun: false, alreadyRetried: false })).toBe(true)
      // after Run the reading may be billed: never pay twice
      expect(retryable(m, { pressedRun: true, alreadyRetried: false })).toBe(false)
      expect(retryable(m, { pressedRun: false, alreadyRetried: true })).toBe(false)
    }
  })

  it('does not retry an ordinary page failure', () => {
    for (const m of ['base page layout drifted, marks would miss: hero', 'vite never answered on http://localhost:5301/',
      'tab capture came back empty (0 chars)', 'only 1 of 6 marks registered — the canvas was not drawing']) {
      expect(retryable(m, { pressedRun: false, alreadyRetried: false })).toBe(false)
      expect(browserSpoiled(m)).toBe(false)
    }
  })

  it('throws the browser away after a wedge, not only after a crash', () => {
    expect(browserSpoiled(gone)).toBe(true)
    expect(browserSpoiled(hung)).toBe(true)
    expect(browserSpoiled(noFrame)).toBe(true)
  })

  it('gives only the screenshot arm a fresh browser per page', () => {
    expect(freshBrowserPerPage('screenshot')).toBe(true)
    for (const m of ['auto', 'gesture', 'design']) expect(freshBrowserPerPage(m)).toBe(false)
  })

  it('withTimeout rejects a promise that never settles, and passes a value through', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'tab capture hung')).rejects.toThrow('tab capture hung')
    await expect(withTimeout(Promise.resolve(7), 1000, 'x')).resolves.toBe(7)
    await expect(withTimeout(Promise.reject(new Error('own')), 1000, 'x')).rejects.toThrow('own')
  })
})

import { describe, expect, it } from 'vitest'
import { typedSvg } from '../src/run2.js'

describe('typedSvg (n160)', () => {
  it('sees whole SVG markup the user typed to build verbatim', () => {
    expect(typedSvg(['drawn as exactly this inline SVG: <svg viewBox="0 0 10 10"><clipPath id="b"><path d="M0,0Z"/></clipPath></svg>'])).toBe(true)
  })
  it('ignores words that only mention an svg', () => {
    expect(typedSvg(['an SVG wave at the bottom', 'drawn shapes, no picture'])).toBe(false)
    expect(typedSvg(undefined)).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { cleanReading, interpretationSchema } from '../src/intent2.js'

// n41: traced round-3 readings died at "maximum number of turns" with a good
// answer in hand: every retry was rejected only for a missing null 'unclear',
// and 'reading' carried tool-call markup and the next field's JSON.
describe('reading shape (n41)', () => {
  it("does not require 'unclear'", () => {
    for (const mode of ['design', 'gesture'] as const) {
      const req = (interpretationSchema(mode) as { required: string[] }).required
      expect(req).toEqual(['reading', 'actions'])
    }
  })
  it('cuts tool-call markup off the reading', () => {
    expect(cleanReading('A magazine cover.</reading>\n<parameter name="unclear">null')).toBe('A magazine cover.')
    expect(cleanReading('A poster with a button.</parameter>\n{"kind": "add"}')).toBe('A poster with a button.')
    expect(cleanReading('Arrow <- from a to b, x < y.')).toBe('Arrow <- from a to b, x < y.')
    expect(cleanReading(undefined)).toBe('')
  })
})

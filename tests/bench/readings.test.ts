import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs harness module
import { readingCause, readingSummary } from './lib/readings.mjs'

const ok = (ms: number, plain?: string) => ({ readOnly: true, readingMs: ms, reading: { ok: true, ms, tokens: { input: 2000, cacheRead: 7000, output: 900 }, ...(plain ? { plain } : {}) } })
const bad = (ms: number, error: string) => ({ readOnly: true, readingMs: ms, reading: { ok: false, ms, httpStatus: 400, error } })

describe('read-only reading summary (s2c-056)', () => {
  it('groups failures by cause, ignoring seconds and counts', () => {
    const rows = [
      ok(12_000), ok(30_000, 'scratch-out'),
      bad(41_000, "PerceptionFailure: the model's reading ended in error_max_turns after 4 turns, 41s"),
      bad(9_000, "PerceptionFailure: the model's reading ended in error_max_turns after 4 turns, 9s"),
      bad(2_000, 'Error: interpreter returned malformed output'),
    ]
    const s = readingSummary(rows)
    expect(s).toMatchObject({ total: 5, ok: 2, failed: 3, noModel: 1, medianMs: 12_000, maxMs: 41_000, billed: 5800, cacheRead: 14_000 })
    expect(s.causes).toEqual([
      ["the model's reading ended in error_max_turns after 4 turns", 2],
      ['interpreter returned malformed output', 1],
    ])
  })

  it('falls back to the tooltip, then the row error', () => {
    expect(readingCause({ readOnly: true, reading: { ok: false }, readingError: 'interpret failed: fetch: Failed to fetch' })).toBe('fetch: Failed to fetch')
    expect(readingCause({ readOnly: true, error: 'boom' })).toBe('boom')
  })

  it('ignores rows that were not read-only', () => {
    expect(readingSummary([{ id: 'x', score: {} }]).total).toBe(0)
  })
})

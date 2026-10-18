import { describe, expect, it, vi } from 'vitest'

// s2c-056: 3 of 45 structured readings on the rough bench ended in "I couldn't
// read that sketch just now" and nothing recorded why. An error result from the
// SDK came back as raw {}, which interpretV2 reported as "malformed output".

let results: unknown[] = []
let hang = false
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ options }: { options: { abortController?: AbortController } }) => (async function* () {
    if (hang) {
      // the CLI retrying an unreachable API: nothing until it is aborted
      await new Promise((_, reject) => options.abortController?.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    }
    for (const r of results) yield r
  })(),
}))

const { createClaudeCodeProvider, readingFailure, perceptionTimeoutMs, PerceptionFailure } = await import('../src/claude-code.js')

const usage = { input_tokens: 1200, cache_creation_input_tokens: 300, cache_read_input_tokens: 5000, output_tokens: 90 }
const req = { png: Buffer.from('x'), brief: 'b', prompt: 'p', schema: {} }

describe('readingFailure', () => {
  it('is null for a success with a structured answer', () => {
    expect(readingFailure({ subtype: 'success', structured_output: { reading: 'r', actions: [] } })).toBeNull()
  })

  it('names the error subtype, turns, time and first error', () => {
    const why = readingFailure({
      subtype: 'error_max_structured_output_retries', num_turns: 4, duration_ms: 41_200, errors: ['', 'schema: /actions/0/kind must be one of …'],
    })
    expect(why).toBe("the model's reading ended in error_max_structured_output_retries after 4 turns, 41s: schema: /actions/0/kind must be one of …")
  })

  it('names a success that carried no structured answer', () => {
    expect(readingFailure({ subtype: 'success', num_turns: 1, stop_reason: 'end_turn' }))
      .toBe('the model answered without the structured reading (stop: end_turn after 1 turn)')
  })
})

describe('claude-code provider: a reading that ends in error', () => {
  it('throws the cause instead of returning an empty answer, and keeps what it cost', async () => {
    results = [{ type: 'result', subtype: 'error_max_turns', num_turns: 4, duration_ms: 9000, errors: [], usage }]
    const p = createClaudeCodeProvider()
    const err = await p.interpretIntent(req).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(PerceptionFailure)
    expect((err as Error).message).toBe("the model's reading ended in error_max_turns after 4 turns, 9s")
    expect((err as InstanceType<typeof PerceptionFailure>).usage).toEqual({ input: 1500, cacheRead: 5000, output: 90 })
  })

  it('throws when the session ends with no result at all', async () => {
    results = []
    await expect(createClaudeCodeProvider().interpretIntent(req)).rejects.toThrow('ended without an answer')
  })

  it('returns the structured answer on success, as before', async () => {
    const answer = { reading: 'delete the card', actions: [] }
    results = [{ type: 'result', subtype: 'success', structured_output: answer, usage }]
    await expect(createClaudeCodeProvider().interpretIntent(req)).resolves.toEqual({
      raw: answer, usage: { input: 1500, cacheRead: 5000, output: 90 },
    })
  })
})

describe('claude-code provider: a reading that never answers', () => {
  it('gives up after the time limit with a cause a person can act on', async () => {
    hang = true
    process.env.S2C_READING_TIMEOUT_MS = '50'
    try {
      const t0 = Date.now()
      const err = await createClaudeCodeProvider().interpretIntent(req).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(PerceptionFailure)
      expect((err as Error).message).toMatch(/didn't answer within 0s \(is Claude Code signed in/)
      expect(Date.now() - t0).toBeLessThan(2000)
      // transcribe has the same limit
      await expect(createClaudeCodeProvider().transcribe(Buffer.from('x'), [{ id: 't1' } as never])).rejects.toThrow(/didn't answer/)
    } finally {
      hang = false
      delete process.env.S2C_READING_TIMEOUT_MS
    }
  })

  it('defaults to two minutes; a bad override is ignored', () => {
    expect(perceptionTimeoutMs({})).toBe(120_000)
    expect(perceptionTimeoutMs({ S2C_READING_TIMEOUT_MS: 'soon' })).toBe(120_000)
    expect(perceptionTimeoutMs({ S2C_READING_TIMEOUT_MS: '90000' })).toBe(90_000)
  })
})

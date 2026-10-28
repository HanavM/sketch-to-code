import { describe, expect, it } from 'vitest'
import { REPAIR_EDIT_MS, STALL_MS, TurnStalled, stallReason, watchTurn } from '../src/turn-watch.js'
import { movesTurnOn } from '../src/codegen.js'

describe('stallReason', () => {
  it('lets a turn that is still talking run', () => {
    expect(stallReason({ now: 100_000, lastActivity: 99_000 })).toBeNull()
  })
  it('ends a turn silent for the stall limit (n18 login: 8 minutes of nothing)', () => {
    const why = stallReason({ now: STALL_MS + 1_000, lastActivity: 0 })
    expect(why).toMatch(/no progress for \d+ s/)
  })
  it('ends a repair that would eat the verify time before the cap', () => {
    expect(stallReason({ now: 0, lastActivity: 0, deadline: 50_000, marginMs: 60_000 })).toMatch(/left before the run cap/)
    expect(stallReason({ now: 0, lastActivity: 0, deadline: 500_000, marginMs: 60_000 })).toBeNull()
  })
  it('no deadline: only silence ends a turn', () => {
    expect(stallReason({ now: 10, lastActivity: 0, deadline: undefined, marginMs: 60_000 })).toBeNull()
  })
})

describe('n22: thinking is not progress', () => {
  it('a repair that reads, then thinks with no edit, is ended at the edit limit', () => {
    // n20 try 2 round 3: Read at 180 s, then 484 s of thinking, no edit
    const start = 0
    const readAt = 1_300
    const now = start + REPAIR_EDIT_MS + 5_000
    expect(stallReason({ now, lastActivity: readAt + 100_000, lastEdit: start })).toMatch(/185 s without an edit \(thinking is not progress\)/)
    // an edit resets it; a build turn (no lastEdit) is not held to it
    expect(stallReason({ now, lastActivity: now - 1_000, lastEdit: now - 30_000 })).toBeNull()
    expect(stallReason({ now, lastActivity: now - 1_000 })).toBeNull()
  })
  it('only tool calls, results and words move a turn on', () => {
    expect(movesTurnOn({ type: 'assistant', message: { content: [{ type: 'thinking' }] } })).toBe(false)
    expect(movesTurnOn({ type: 'assistant', message: { content: [{ type: 'redacted_thinking' }, { type: 'text', text: ' ' }] } })).toBe(false)
    expect(movesTurnOn({ type: 'assistant', message: { content: [{ type: 'thinking' }, { type: 'tool_use' }] } })).toBe(true)
    expect(movesTurnOn({ type: 'assistant', message: { content: [{ type: 'text', text: 'Fixed.' }] } })).toBe(true)
    expect(movesTurnOn({ type: 'user' })).toBe(true)
    expect(movesTurnOn({ type: 'result' })).toBe(true)
    expect(movesTurnOn({ type: 'system' })).toBe(false)
  })
})

describe('watchTurn', () => {
  it('resolves with the turn when it finishes', async () => {
    await expect(watchTurn(Promise.resolve('ok'), () => null, 10)).resolves.toBe('ok')
  })
  it('passes the turn error through', async () => {
    await expect(watchTurn(Promise.reject(new Error('boom')), () => null, 10)).rejects.toThrow('boom')
  })
  it('rejects a hung turn with TurnStalled and its reason', async () => {
    const hung = new Promise<string>(() => {})
    let calls = 0
    const err = await watchTurn(hung, () => (++calls >= 2 ? 'the agent made no progress for 150 s' : null), 10).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(TurnStalled)
    expect((err as TurnStalled).why).toMatch(/no progress/)
  })
  it('a turn that rejects after it was stalled is not an unhandled rejection', async () => {
    let fail!: (e: Error) => void
    const late = new Promise<string>((_, r) => { fail = r })
    await expect(watchTurn(late, () => 'stalled', 10)).rejects.toBeInstanceOf(TurnStalled)
    fail(new Error('codegen session ended unexpectedly'))
    await new Promise((r) => setTimeout(r, 20))
  })
})

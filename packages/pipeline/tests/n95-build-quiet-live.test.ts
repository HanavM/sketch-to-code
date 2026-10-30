import { describe, expect, it } from 'vitest'
import { messageKind, movesTurnOn, movesWorkOn } from '../src/codegen.js'
import { BUILD_AFTER_WRITE_EDIT_MS, BUILD_AFTER_WRITE_MS, stallReason } from '../src/turn-watch.js'

describe('n95: the quiet-build guard holds in live runs', () => {
  const text = { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Here is what I built: ' } } }
  const whole = { type: 'assistant', message: { content: [{ type: 'text', text: 'Summary of the page...' }] } }
  it('reply words after the Write are progress for the turn but not work on the page', () => {
    // florist (n94 first attempt): the stream kept saying things after its edit and the n93 rule never fired
    expect(movesTurnOn(text)).toBe(true)
    expect(movesWorkOn(text)).toBe(false)
    expect(movesTurnOn(whole)).toBe(true)
    expect(movesWorkOn(whole)).toBe(false)
  })
  it('tool calls, results, tool input and turn ends are work', () => {
    expect(movesWorkOn({ type: 'assistant', message: { content: [{ type: 'thinking' }, { type: 'tool_use' }] } })).toBe(true)
    expect(movesWorkOn({ type: 'user' })).toBe(true)
    expect(movesWorkOn({ type: 'result' })).toBe(true)
    expect(movesWorkOn({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"' } } })).toBe(true)
    expect(movesWorkOn({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta' } } })).toBe(false)
    expect(movesWorkOn({ type: 'system' })).toBe(false)
  })
  it('a build that wrote the page and then talks for 2 minutes is ended', () => {
    const wroteAt = 100_000
    const now = wroteAt + BUILD_AFTER_WRITE_MS + 5_000
    // lastActivity and lastProgress fresh (words), lastWork is the Write: run2 passes lastWork as lastProgress
    expect(stallReason({ now, lastActivity: now - 200, wrote: true, lastProgress: wroteAt })).toMatch(/wrote the page, then made no progress/)
  })
  it('a build that wrote the page and then only reads for 4 minutes is ended; one that edits again runs on', () => {
    const wroteAt = 100_000
    const now = wroteAt + BUILD_AFTER_WRITE_EDIT_MS + 5_000
    const reading = { now, lastActivity: now - 1_000, wrote: true, lastProgress: now - 3_000, label: 'build' }
    expect(stallReason({ ...reading, lastEdit: wroteAt, editMs: BUILD_AFTER_WRITE_EDIT_MS })).toMatch(/the build went 245 s without an edit/)
    expect(stallReason({ ...reading, lastEdit: now - 30_000, editMs: BUILD_AFTER_WRITE_EDIT_MS })).toBeNull()
  })
  it('names messages for the hang record', () => {
    expect(messageKind({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta' } } })).toBe('stream:thinking_delta')
    expect(messageKind({ type: 'stream_event', event: { type: 'content_block_start', content_block: { type: 'tool_use' } } })).toBe('stream:tool_use')
    expect(messageKind({ type: 'assistant', message: { content: [{ type: 'thinking' }, { type: 'tool_use' }] } })).toBe('assistant:thinking+tool_use')
    expect(messageKind({ type: 'system', subtype: 'init' })).toBe('system:init')
    expect(messageKind({ type: 'user' })).toBe('user')
  })
})

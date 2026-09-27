import { describe, expect, it } from 'vitest'
import { parseJson, SseParser } from '../src/sse.js'

describe('SseParser', () => {
  it('reads an event + data frame', () => {
    const p = new SseParser()
    expect(p.feed('event: reveal\ndata: {"line":3}\n\n')).toEqual([
      { event: 'reveal', data: '{"line":3}' },
    ])
  })

  it('reassembles a frame split across chunks — bytes arrive anywhere', () => {
    const p = new SseParser()
    expect(p.feed('event: rev')).toEqual([])
    expect(p.feed('eal\ndata: {"a"')).toEqual([])
    expect(p.feed(':1}\n')).toEqual([])
    expect(p.feed('\n')).toEqual([{ event: 'reveal', data: '{"a":1}' }])
  })

  it('returns several frames delivered in one chunk', () => {
    const p = new SseParser()
    const out = p.feed('event: hello\ndata: 1\n\nevent: reveal\ndata: 2\n\n')
    expect(out.map((f) => f.event)).toEqual(['hello', 'reveal'])
  })

  it('ignores heartbeat comments but keeps the frames around them', () => {
    const p = new SseParser()
    expect(p.feed(': connected\n\n: ping\n\nevent: reveal\ndata: 1\n\n')).toEqual([
      { event: 'reveal', data: '1' },
    ])
  })

  it('defaults a nameless frame to `message` and joins multi-line data', () => {
    const p = new SseParser()
    expect(p.feed('data: a\ndata: b\n\n')).toEqual([{ event: 'message', data: 'a\nb' }])
  })

  it('accepts \\r\\n line endings', () => {
    const p = new SseParser()
    expect(p.feed('event: reveal\r\ndata: 1\r\n\r\n')).toEqual([{ event: 'reveal', data: '1' }])
  })

  it('drops a half frame on reset (a reconnect must not splice two streams)', () => {
    const p = new SseParser()
    p.feed('event: reveal\ndata: {"a"')
    p.reset()
    expect(p.feed(':1}\n\n')).toEqual([])
  })
})

describe('parseJson', () => {
  it('answers null instead of throwing on a truncated payload', () => {
    expect(parseJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 })
    expect(parseJson('{"a":')).toBeNull()
  })
})

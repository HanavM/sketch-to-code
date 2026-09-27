import { describe, expect, it } from 'vitest'
import {
  EchoGuard,
  IdeBridgeClient,
  toRepoRelative,
  type BridgeTimers,
  type BridgeTransport,
  type StreamHandlers,
  type TimerHandle,
} from '../src/client.js'
import type { BridgeState, RevealEvent } from '../src/protocol.js'

/**
 * The extension's logic, exercised with no vscode API and no sockets: the
 * transport and the clock are both injected, which is the whole reason they are
 * interfaces.
 */

/** Manual clock: timers fire only when the test says so. */
function fakeTimers() {
  let seq = 0
  const queue = new Map<number, { fn: () => void; ms: number }>()
  const timers: BridgeTimers = {
    setTimeout: (fn, ms) => {
      const id = ++seq
      queue.set(id, { fn, ms })
      return id
    },
    clearTimeout: (h: TimerHandle) => {
      queue.delete(h as number)
    },
  }
  return {
    timers,
    get pending() {
      return [...queue.values()].map((t) => t.ms)
    },
    /** Fire every currently-scheduled timer, oldest first. */
    runAll() {
      const entries = [...queue.entries()].sort((a, b) => a[0] - b[0])
      queue.clear()
      for (const [, t] of entries) t.fn()
    },
  }
}

interface OpenedStream {
  url: string
  headers: Record<string, string>
  h: StreamHandlers
  closed: boolean
}

function harness(opts: { postStatus?: number; failOpen?: boolean } = {}) {
  const opened: OpenedStream[] = []
  const posts: Array<{ url: string; headers: Record<string, string>; body: unknown }> = []
  const reveals: RevealEvent[] = []
  const states: Array<{ state: BridgeState; detail?: string }> = []
  const clock = fakeTimers()

  const transport: BridgeTransport = {
    openStream: (url, headers, h) => {
      if (opts.failOpen) throw new Error('ECONNREFUSED')
      const s: OpenedStream = { url, headers, h, closed: false }
      opened.push(s)
      return { close: () => { s.closed = true } }
    },
    postJson: (url, headers, body) => {
      posts.push({ url, headers, body })
      return Promise.resolve({ status: opts.postStatus ?? 200, body: '{"ok":true}' })
    },
  }

  const client = new IdeBridgeClient({
    url: 'http://localhost:5230/',
    editorName: 'VS Code',
    transport,
    timers: clock.timers,
    cursorDebounceMs: 150,
    onReveal: (ev) => reveals.push(ev),
    onState: (state, detail) => states.push({ state, detail }),
  })

  const hello = (root = '/repo/app'): void => {
    const s = opened.at(-1)!
    s.h.onOpen(200)
    s.h.onChunk(`: connected\n\nevent: hello\ndata: ${JSON.stringify({ protocol: 1, root, editorId: 'e1', serverId: 's1' })}\n\n`)
  }

  return { client, opened, posts, reveals, states, clock, hello }
}

describe('connecting', () => {
  it('subscribes to /@s2c/ide/events with the editor name and the editor header', () => {
    const h = harness()
    h.client.start()
    expect(h.opened).toHaveLength(1)
    expect(h.opened[0]!.url).toBe('http://localhost:5230/@s2c/ide/events?editor=VS%20Code')
    expect(h.opened[0]!.headers).toEqual({ accept: 'text/event-stream', 'x-s2c-ide': '1' })
    // trailing slash on the configured URL must not double up
    expect(h.opened[0]!.url).not.toContain('//@s2c')
  })

  it('reports connected on 200 and learns the dev server root from hello', () => {
    const h = harness()
    h.client.start()
    h.hello('/repo/app')
    expect(h.client.state).toBe('connected')
    expect(h.client.serverRoot).toBe('/repo/app')
    expect(h.states.map((s) => s.state)).toEqual(['connecting', 'connected', 'connected'])
  })

  it('start() twice does not open a second stream', () => {
    const h = harness()
    h.client.start()
    h.client.start()
    expect(h.opened).toHaveLength(1)
  })
})

describe('revealing', () => {
  it('hands the reveal payload straight through', () => {
    const h = harness()
    h.client.start()
    h.hello()
    const ev = { id: 'r1', file: 'src/components/Card.tsx', line: 42, col: 7, root: '/repo/app', at: 1 }
    h.opened[0]!.h.onChunk(`event: reveal\ndata: ${JSON.stringify(ev)}\n\n`)
    expect(h.reveals).toEqual([ev])
  })

  it('ignores a malformed reveal instead of dying on it', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.opened[0]!.h.onChunk('event: reveal\ndata: {"file":"a.tsx"}\n\n')
    h.opened[0]!.h.onChunk('event: reveal\ndata: {not json\n\n')
    expect(h.reveals).toEqual([])
    expect(h.client.state).toBe('connected')
  })

  it('ignores events it does not know', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.opened[0]!.h.onChunk('event: tomorrow\ndata: {}\n\n')
    expect(h.reveals).toEqual([])
  })
})

describe('cursor reporting', () => {
  it('debounces: five moves in a row cost one POST, of the last position', () => {
    const h = harness()
    h.client.start()
    h.hello()
    for (const line of [1, 2, 3, 4, 5]) h.client.reportCursor({ file: 'src/App.tsx', line })
    expect(h.posts).toHaveLength(0) // nothing yet — the cursor is still moving
    h.clock.runAll()
    expect(h.posts).toHaveLength(1)
    expect(h.posts[0]!.body).toEqual({ file: 'src/App.tsx', line: 5, col: undefined })
    expect(h.posts[0]!.url).toBe('http://localhost:5230/@s2c/ide/cursor')
    expect(h.posts[0]!.headers).toEqual({ 'content-type': 'application/json', 'x-s2c-ide': '1' })
  })

  it('does not repeat a position it already sent', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.client.reportCursor({ file: 'src/App.tsx', line: 5, col: 2 })
    h.clock.runAll()
    h.client.reportCursor({ file: 'src/App.tsx', line: 5, col: 9 })
    h.clock.runAll()
    expect(h.posts).toHaveLength(1)
    h.client.reportCursor({ file: 'src/App.tsx', line: 6 })
    h.clock.runAll()
    expect(h.posts).toHaveLength(2)
  })

  it('says nothing while offline — the server would only refuse it', () => {
    const h = harness()
    h.client.reportCursor({ file: 'src/App.tsx', line: 1 }) // before start()
    h.client.start()
    h.client.reportCursor({ file: 'src/App.tsx', line: 2 }) // connecting, not connected
    h.clock.runAll()
    expect(h.posts).toEqual([])
  })

  it('a non-200 answer is logged, not thrown, and does not drop the connection', async () => {
    const h = harness({ postStatus: 403 })
    h.client.start()
    h.hello()
    h.client.reportCursor({ file: 'src/App.tsx', line: 1 })
    h.clock.runAll()
    await Promise.resolve()
    expect(h.client.state).toBe('connected')
  })

  it('lets the first position through again after a reconnect (new server boot)', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.client.reportCursor({ file: 'src/App.tsx', line: 5 })
    h.clock.runAll()
    h.opened[0]!.h.onClose(new Error('socket hang up'))
    h.clock.runAll() // the backoff retry
    h.hello()
    h.client.reportCursor({ file: 'src/App.tsx', line: 5 })
    h.clock.runAll()
    expect(h.posts).toHaveLength(2)
  })
})

describe('degrading and reconnecting', () => {
  it('goes offline when the dev server is not running, and retries with backoff', () => {
    const h = harness({ failOpen: true })
    h.client.start()
    expect(h.client.state).toBe('offline')
    expect(h.states.at(-1)).toEqual({ state: 'offline', detail: 'ECONNREFUSED' })
    expect(h.clock.pending).toEqual([500])
    h.clock.runAll()
    expect(h.clock.pending).toEqual([1000])
    h.clock.runAll()
    expect(h.clock.pending).toEqual([2000])
  })

  it('treats a rejected stream (403) as offline and keeps trying', () => {
    const h = harness()
    h.client.start()
    h.opened[0]!.h.onOpen(403)
    expect(h.states.at(-1)).toEqual({ state: 'offline', detail: 'server answered 403' })
    expect(h.clock.pending).toEqual([500])
  })

  it('reconnects after a drop and resets the backoff once it is back', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.opened[0]!.h.onClose() // heartbeat write failed server-side, socket ended
    expect(h.client.state).toBe('offline')
    h.clock.runAll()
    expect(h.opened).toHaveLength(2)
    h.hello()
    expect(h.client.state).toBe('connected')
    h.opened[1]!.h.onClose()
    expect(h.clock.pending).toEqual([500]) // back to the shortest delay
  })

  it('reports onClose only once per stream', () => {
    const h = harness()
    h.client.start()
    h.opened[0]!.h.onClose(new Error('a'))
    h.opened[0]!.h.onClose(new Error('b'))
    expect(h.states.filter((s) => s.state === 'offline')).toHaveLength(1)
    expect(h.clock.pending).toEqual([500])
  })

  it('stop() closes the socket, cancels the retry and forgets the root', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.client.stop()
    expect(h.opened[0]!.closed).toBe(true)
    expect(h.client.state).toBe('disabled')
    expect(h.client.serverRoot).toBeNull()
    expect(h.clock.pending).toEqual([])
  })

  it('a stream that closes after stop() does not schedule a retry', () => {
    const h = harness()
    h.client.start()
    h.client.stop()
    h.opened[0]!.h.onClose(new Error('destroyed'))
    expect(h.clock.pending).toEqual([])
    expect(h.client.state).toBe('disabled')
  })

  it('restart() reconnects from scratch', () => {
    const h = harness()
    h.client.start()
    h.hello()
    h.client.restart()
    expect(h.opened).toHaveLength(2)
    expect(h.opened[0]!.closed).toBe(true)
  })
})

describe('toRepoRelative', () => {
  it('relativizes a file inside the root', () => {
    expect(toRepoRelative('/repo/app', '/repo/app/src/App.tsx')).toBe('src/App.tsx')
    expect(toRepoRelative('/repo/app/', '/repo/app/src/App.tsx')).toBe('src/App.tsx')
    expect(toRepoRelative('C:\\repo\\app', 'C:\\repo\\app\\src\\App.tsx')).toBe('src/App.tsx')
  })

  it('answers null for anything outside it — nothing on the page to highlight', () => {
    expect(toRepoRelative('/repo/app', '/repo/other/src/App.tsx')).toBeNull()
    expect(toRepoRelative('/repo/app', '/repo/app-other/src/App.tsx')).toBeNull()
    expect(toRepoRelative('/repo/app', '/repo/app')).toBeNull()
    expect(toRepoRelative('', '/repo/app/src/App.tsx')).toBeNull()
  })
})

describe('EchoGuard', () => {
  it('swallows the selection change our own reveal caused, then stops', () => {
    let t = 1000
    const guard = new EchoGuard(400, () => t)
    expect(guard.suppressed()).toBe(false)
    guard.arm()
    expect(guard.suppressed()).toBe(true)
    t += 399
    expect(guard.suppressed()).toBe(true)
    t += 2
    expect(guard.suppressed()).toBe(false)
  })
})

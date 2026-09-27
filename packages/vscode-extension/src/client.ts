import {
  IDE_CLIENT_HEADER,
  type BridgeState,
  type CursorPayload,
  type HelloEvent,
  type RevealEvent,
} from './protocol.js'
import { parseJson, SseParser } from './sse.js'

/**
 * All of the bridge's editor-side BEHAVIOUR — connect, greet, reveal, debounce,
 * reconnect — with none of its I/O and no `vscode` import. The VS Code API and
 * node's http both enter through the two interfaces below, which is what makes
 * this file unit-testable in the repo's plain-node vitest run (see
 * tests/client.test.ts). extension.ts is the thin adapter that supplies them.
 */

export interface StreamHandle {
  close: () => void
}

export interface StreamHandlers {
  /** HTTP status of the stream response; 200 means we are attached. */
  onOpen: (status: number) => void
  /** A decoded chunk of the event stream; frame boundaries are our problem. */
  onChunk: (text: string) => void
  /** Socket finished or failed. Always exactly once per stream. */
  onClose: (err?: Error) => void
}

export interface BridgeTransport {
  openStream: (url: string, headers: Record<string, string>, h: StreamHandlers) => StreamHandle
  postJson: (
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ) => Promise<{ status: number; body: string }>
}

export type TimerHandle = unknown

export interface BridgeTimers {
  setTimeout: (fn: () => void, ms: number) => TimerHandle
  clearTimeout: (h: TimerHandle) => void
}

const realTimers: BridgeTimers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

export interface BridgeClientOptions {
  /** Dev server base URL, e.g. http://localhost:5199 (trailing / tolerated). */
  url: string
  editorName: string
  transport: BridgeTransport
  timers?: BridgeTimers
  /** How long the cursor must sit still before we report it. */
  cursorDebounceMs?: number
  onReveal: (ev: RevealEvent) => void
  onState: (state: BridgeState, detail?: string) => void
  log?: (msg: string) => void
}

/** Reconnect delays, ms. Fast enough to feel instant when `npm run dev` boots,
 *  slow enough that an editor left open overnight isn't a polling loop. */
const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000]

export class IdeBridgeClient {
  private readonly base: string
  private readonly timers: BridgeTimers
  private readonly debounceMs: number
  private stream: StreamHandle | null = null
  private parser = new SseParser()
  private stopped = true
  private attempt = 0
  private retryTimer: TimerHandle = null
  private cursorTimer: TimerHandle = null
  private pending: CursorPayload | null = null
  private lastSent = ''
  private _state: BridgeState = 'disabled'
  private _root: string | null = null

  constructor(private readonly opts: BridgeClientOptions) {
    this.base = opts.url.replace(/\/+$/, '')
    this.timers = opts.timers ?? realTimers
    this.debounceMs = Math.max(0, opts.cursorDebounceMs ?? 150)
  }

  get state(): BridgeState {
    return this._state
  }

  /** The dev server's root, learned from `hello`. Null until greeted. */
  get serverRoot(): string | null {
    return this._root
  }

  get serverUrl(): string {
    return this.base
  }

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    this.attempt = 0
    this.open()
  }

  stop(): void {
    this.stopped = true
    this.clearRetry()
    if (this.cursorTimer !== null) {
      this.timers.clearTimeout(this.cursorTimer)
      this.cursorTimer = null
    }
    this.pending = null
    this.closeStream()
    this._root = null
    this.setState('disabled')
  }

  /** Drop the current connection and reconnect immediately (a command). */
  restart(): void {
    this.stop()
    this.start()
  }

  /**
   * Report the cursor, debounced. Called from a selection-change handler that
   * fires on every arrow key, so the debounce is not a nicety: without it the
   * server takes a POST per keystroke.
   */
  reportCursor(loc: CursorPayload): void {
    if (this.stopped || this._state !== 'connected') return
    this.pending = loc
    if (this.cursorTimer !== null) this.timers.clearTimeout(this.cursorTimer)
    this.cursorTimer = this.timers.setTimeout(() => {
      this.cursorTimer = null
      this.flushCursor()
    }, this.debounceMs)
  }

  /** Send the pending cursor now, if it says anything new. */
  flushCursor(): void {
    const loc = this.pending
    this.pending = null
    if (!loc || this.stopped || this._state !== 'connected') return
    const key = `${loc.file}:${loc.line}`
    if (key === this.lastSent) return
    this.lastSent = key
    void this.opts.transport
      .postJson(
        `${this.base}/@s2c/ide/cursor`,
        { 'content-type': 'application/json', [IDE_CLIENT_HEADER]: '1' },
        loc,
      )
      .then((res) => {
        if (res.status !== 200) this.log(`cursor rejected (${res.status}): ${res.body.slice(0, 200)}`)
      })
      // A failed POST is not worth surfacing: the stream notices the same
      // outage a heartbeat later and drives the status bar.
      .catch((err: unknown) => this.log(`cursor post failed: ${String(err)}`))
  }

  private open(): void {
    if (this.stopped) return
    this.parser.reset()
    this.setState('connecting')
    const url = `${this.base}/@s2c/ide/events?editor=${encodeURIComponent(this.opts.editorName)}`
    let settled = false
    const finish = (detail: string): void => {
      if (settled) return
      settled = true
      this.stream = null
      if (this.stopped) return
      this.setState('offline', detail)
      this.scheduleRetry()
    }
    try {
      this.stream = this.opts.transport.openStream(
        url,
        { accept: 'text/event-stream', [IDE_CLIENT_HEADER]: '1' },
        {
          onOpen: (status) => {
            if (status === 200) {
              this.attempt = 0
              this.setState('connected')
              // a reconnect means the server may be a different boot: let the
              // next cursor report through even if it repeats the last one
              this.lastSent = ''
            } else {
              // 403/415 here is a configuration problem (wrong URL, a proxy
              // adding Origin), not a transient outage — say so, still retry.
              finish(`server answered ${status}`)
            }
          },
          onChunk: (text) => this.onChunk(text),
          onClose: (err) => finish(err ? err.message : 'stream closed'),
        },
      )
    } catch (err) {
      finish(err instanceof Error ? err.message : String(err))
    }
  }

  private onChunk(text: string): void {
    for (const f of this.parser.feed(text)) {
      if (f.event === 'hello') {
        const hello = parseJson<HelloEvent>(f.data)
        if (hello) {
          this._root = hello.root
          this.setState('connected', hello.root)
          this.log(`attached to ${this.base} (root ${hello.root}, protocol ${hello.protocol})`)
        }
      } else if (f.event === 'reveal') {
        const ev = parseJson<RevealEvent>(f.data)
        // A malformed payload is dropped rather than thrown: one bad frame must
        // not take down a stream that is otherwise fine.
        if (ev && typeof ev.file === 'string' && typeof ev.line === 'number') {
          this.opts.onReveal(ev)
        } else {
          this.log(`ignored malformed reveal: ${f.data.slice(0, 120)}`)
        }
      }
    }
  }

  private scheduleRetry(): void {
    this.clearRetry()
    const idx = Math.min(this.attempt, BACKOFF_MS.length - 1)
    const delay = BACKOFF_MS[idx] ?? 15000
    this.attempt++
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = null
      this.open()
    }, delay)
  }

  private clearRetry(): void {
    if (this.retryTimer !== null) {
      this.timers.clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private closeStream(): void {
    const s = this.stream
    this.stream = null
    try {
      s?.close()
    } catch { /* the socket was already gone; nothing left to do */ }
  }

  private setState(state: BridgeState, detail?: string): void {
    this._state = state
    this.opts.onState(state, detail)
  }

  private log(msg: string): void {
    this.opts.log?.(msg)
  }
}

/**
 * Suppresses the cursor report caused by our OWN reveal. Revealing a location
 * moves the editor's selection, which fires the same selection-change event a
 * human keystroke does — so without this the bridge answers every click on the
 * page with a cursor event describing the line it was just told to open.
 * Injectable clock so the window is testable without waiting.
 */
export class EchoGuard {
  private until = 0
  constructor(private readonly windowMs = 400, private readonly now: () => number = Date.now) {}

  /** Call right before programmatically moving the cursor. */
  arm(): void {
    this.until = this.now() + this.windowMs
  }

  /** True while a selection change should be treated as our own echo. */
  suppressed(): boolean {
    return this.now() < this.until
  }
}

/**
 * Turn an absolute file path into the repo-relative POSIX path the protocol
 * speaks. Returns null when the file is outside the root — the server would
 * refuse it anyway, and there is no point telling the browser about a file the
 * page cannot possibly contain.
 */
export function toRepoRelative(root: string, absPath: string): string | null {
  const norm = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const r = norm(root)
  const f = norm(absPath)
  if (r === '' || f === r) return null
  if (!f.startsWith(`${r}/`)) return null
  return f.slice(r.length + 1)
}

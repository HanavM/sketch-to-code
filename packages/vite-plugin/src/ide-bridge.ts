import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  BROWSER_EVENT_CURSOR,
  BROWSER_EVENT_STATUS,
  IDE_CLIENT_HEADER,
  IDE_EVENT_HELLO,
  IDE_EVENT_REVEAL,
  IDE_PROTOCOL_VERSION,
  parseSourceLoc,
  sanitizeEditorName,
  type CursorEvent,
  type ErrorResponse,
  type HelloEvent,
  type IdeStatus,
  type RevealEvent,
  type RevealResponse,
} from './ide-protocol.js'
import { sendJson } from './middleware.js'

/**
 * Server half of the editor bridge. The protocol — including the security
 * reasoning per endpoint — is specified in ./ide-protocol.ts; this file is the
 * registry plus the HTTP glue.
 *
 * Everything here is reachable only through the plugin's configureServer, which
 * is apply:'serve', so the bridge cannot exist in a production build.
 */

/** One attached editor's write side. Abstracted so tests need no sockets. */
export interface EditorSink {
  /** Return false when the socket is gone/backpressured; we then drop it. */
  write: (frame: string) => boolean
  close: () => void
}

interface EditorConn {
  id: string
  editor: string
  since: number
  sink: EditorSink
}

export interface IdeBridgeDeps {
  /** Dev server root — the anchor every `file` is validated against. */
  root: string
  /** The EXISTING /@s2c/events hub: how cursor + status reach the browser. */
  broadcast: (event: string, data: unknown) => void
  /** Injectable for tests. */
  now?: () => number
  uuid?: () => string
}

export interface HttpResult {
  status: number
  body: RevealResponse | ErrorResponse | IdeStatus | { ok: true; forwarded: boolean }
}

export interface IdeBridge {
  /** Register an editor. Returns its id and the detach it must call. */
  connect: (editorName: unknown, sink: EditorSink) => { id: string; detach: () => void }
  /** POST /@s2c/ide/reveal, transport-free. */
  reveal: (body: unknown) => HttpResult
  /** POST /@s2c/ide/cursor, transport-free. */
  cursor: (body: unknown, editorId?: string) => HttpResult
  status: () => IdeStatus
  /** GET /@s2c/ide/events — the SSE glue, built on connect(). */
  handleEvents: (req: IncomingMessage, res: ServerResponse) => void
  /** Drop every editor (dev server shutdown). */
  dispose: () => void
}

/** Heartbeat interval: matches the browser hub so both sides behave alike. */
const HEARTBEAT_MS = 25_000

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function createIdeBridge(deps: IdeBridgeDeps): IdeBridge {
  const now = deps.now ?? (() => Date.now())
  const uuid = deps.uuid ?? randomUUID
  const editors = new Map<string, EditorConn>()
  const serverId = uuid()
  // Identical consecutive cursor reports are dropped: an editor's selection
  // event fires on arrow keys within one line too, and the browser only ever
  // matches on file+line.
  let lastCursor = ''
  const heartbeats = new Map<string, ReturnType<typeof setInterval>>()

  const status = (): IdeStatus => {
    const list = [...editors.values()].sort((a, b) => a.since - b.since)
    const newest = list[list.length - 1]
    return {
      connected: list.length > 0,
      ...(newest ? { editor: newest.editor } : {}),
      count: list.length,
      editors: list.map((e) => ({ id: e.id, editor: e.editor, since: e.since })),
    }
  }

  const announce = (): void => deps.broadcast(BROWSER_EVENT_STATUS, status())

  /** Write to one editor, dropping it if the socket refuses. */
  const push = (conn: EditorConn, event: string, data: unknown): boolean => {
    let ok = false
    try {
      ok = conn.sink.write(frame(event, data))
    } catch {
      ok = false
    }
    if (!ok) drop(conn.id)
    return ok
  }

  function drop(id: string): void {
    const conn = editors.get(id)
    if (!conn) return
    editors.delete(id)
    const hb = heartbeats.get(id)
    if (hb) {
      clearInterval(hb)
      heartbeats.delete(id)
    }
    try {
      conn.sink.close()
    } catch { /* already gone: the only thing that mattered was the unregister */ }
    announce()
  }

  // named rather than a method, so handleEvents doesn't depend on `this`
  const connect: IdeBridge['connect'] = (editorName, sink) => {
    const id = uuid()
    const conn: EditorConn = { id, editor: sanitizeEditorName(editorName), since: now(), sink }
    editors.set(id, conn)
    const hello: HelloEvent = {
      protocol: IDE_PROTOCOL_VERSION,
      root: deps.root,
      editorId: id,
      serverId,
    }
    // hello first, before anything can be announced: an editor that cannot
    // even receive the greeting is not attached, and must not show up as one.
    if (push(conn, IDE_EVENT_HELLO, hello)) announce()
    return { id, detach: () => drop(id) }
  }

  return {
    connect,

    reveal(body) {
      const parsed = parseSourceLoc(deps.root, body)
      if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } }
      const ev: RevealEvent = {
        id: uuid(),
        file: parsed.value.file,
        line: parsed.value.line,
        col: parsed.value.col,
        root: deps.root,
        at: now(),
      }
      let delivered = 0
      // snapshot: push() can drop a connection mid-iteration
      for (const conn of [...editors.values()]) {
        if (push(conn, IDE_EVENT_REVEAL, ev)) delivered++
      }
      // 200 even at zero. No editor attached is an ordinary state, and the
      // overlay asks this from a click handler — it must not have to treat a
      // missing editor as a failure, and must never wait on one.
      return {
        status: 200,
        body: delivered > 0
          ? { ok: true, delivered }
          : { ok: true, delivered: 0, reason: 'no editor connected' },
      }
    },

    cursor(body, editorId) {
      const parsed = parseSourceLoc(deps.root, body)
      if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } }
      const key = `${parsed.value.file}:${parsed.value.line}`
      if (key === lastCursor) return { status: 200, body: { ok: true, forwarded: false } }
      lastCursor = key
      const ev: CursorEvent = {
        file: parsed.value.file,
        line: parsed.value.line,
        col: parsed.value.col,
        editor: (editorId ? editors.get(editorId)?.editor : undefined) ?? status().editor ?? 'editor',
        at: now(),
      }
      deps.broadcast(BROWSER_EVENT_CURSOR, ev)
      return { status: 200, body: { ok: true, forwarded: true } }
    },

    status,

    handleEvents(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        // proxies in front of a dev server love to buffer event streams
        'x-accel-buffering': 'no',
      })
      res.write(': connected\n\n')
      const name = new URL(req.url ?? '/', 'http://localhost').searchParams.get('editor')
      const { id, detach } = connect(name ?? 'editor', {
        write: (f) => res.write(f),
        close: () => res.end(),
      })
      const hb = setInterval(() => {
        try {
          if (!res.write(': ping\n\n')) detach()
        } catch {
          detach()
        }
      }, HEARTBEAT_MS)
      heartbeats.set(id, hb)
      res.on('error', detach)
      req.on('close', detach)
    },

    dispose() {
      for (const id of [...editors.keys()]) drop(id)
    },
  }
}

/**
 * Gate for the two EDITOR-facing routes (/@s2c/ide/events, /@s2c/ide/cursor).
 *
 * The per-boot token cannot be used here, and not only because an EventSource
 * can't set headers: the token is minted per dev-server boot and handed out
 * inside the overlay bundle, which the editor never fetches. There is no
 * channel that would tell an out-of-process editor the secret without
 * inventing one. So this gate proves "not a browser" instead of "knows the
 * secret", the same trade /@s2c/runs made when it settled for a local-Host
 * check:
 *  - Host must be local, because plugin middlewares run BEFORE Vite's own
 *    allowedHosts check, so a DNS-rebound host would otherwise get in.
 *  - The request must carry NO browser fetch markers. A page's EventSource,
 *    fetch and XHR always send `Origin` and/or `Sec-Fetch-*`; node's
 *    http.request sends neither. This is what keeps a malicious page the
 *    developer visits from registering a phantom editor (which would silently
 *    swallow every reveal) — cross-origin CORS would stop it from READING the
 *    stream, but not from opening it.
 *  - A custom `x-s2c-ide` header is required. For a browser this forces a CORS
 *    preflight that we never answer; for the extension it is one line. Free
 *    defence in depth on top of the marker check.
 * POSTs additionally require application/json, which is not a CORS-simple
 * content type, so a no-preflight cross-origin POST cannot reach the handler.
 */
export function rejectNonEditor(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { json?: boolean } = {},
): boolean {
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
    return true
  }
  const browserish = ['origin', 'sec-fetch-mode', 'sec-fetch-site', 'sec-fetch-dest']
  if (browserish.some((h) => req.headers[h] !== undefined)) {
    sendJson(res, 403, { ok: false, error: 'browser-originated request rejected' })
    return true
  }
  if (req.headers[IDE_CLIENT_HEADER] === undefined) {
    sendJson(res, 403, { ok: false, error: `missing ${IDE_CLIENT_HEADER} header` })
    return true
  }
  if (opts.json) {
    const ct = String(req.headers['content-type'] ?? '')
    if (!ct.toLowerCase().startsWith('application/json')) {
      sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
      return true
    }
  }
  return false
}

/**
 * Gate for GET /@s2c/ide/status. Read-only and secret-free (a boolean and an
 * editor label), so it gets the same treatment as the /@s2c/runs GETs: local
 * Host only. It deliberately does NOT require the token — the overlay has one,
 * but the editor and a curl-based sanity check do not, and there is nothing
 * here worth protecting beyond keeping a rebound host out. Cross-origin reads
 * are blocked by the same-origin policy: we send no CORS headers.
 */
export function rejectNonLocal(req: IncomingMessage, res: ServerResponse): boolean {
  const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
    return true
  }
  return false
}

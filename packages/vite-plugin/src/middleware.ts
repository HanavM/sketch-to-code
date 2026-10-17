import type { IncomingMessage, ServerResponse } from 'node:http'

export interface SseHub {
  send: (event: string, data: unknown) => void
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/**
 * How long an event addressed to a tab with no open stream waits for it.
 *
 * A run that writes a module the page never imported makes vite full-reload
 * the page MID-RUN. The page that comes back opens a new stream a second or
 * so later, and everything sent to its tab in that gap — the request for the
 * snapshot that verifies the edit, a behaviour probe, the final `done` — used
 * to go nowhere. The run then waited 15 s for a snapshot no page was asked
 * for, failed with "browser snapshot timed out", and the user saw the idle
 * hint instead of a receipt (s2c-037). The bigger the edit, the surer the
 * reload, so the more it did the less you were told.
 */
const ORPHAN_TTL_MS = 30_000
/** Bound per tab, so a tab that never comes back can't grow this. */
const ORPHAN_MAX = 50

/** The tab a stream belongs to: `/@s2c/events?client=<id>`. */
function clientOf(url: string | undefined): string | null {
  const m = /[?&]client=([^&]+)/.exec(url ?? '')
  return m ? decodeURIComponent(m[1]!) : null
}

/**
 * Minimal SSE broadcast hub for /@s2c/events.
 *
 * Events carrying a `clientId` are still broadcast (each tab filters its
 * own), but if no stream for that tab is open at the moment they're sent,
 * they're held for ORPHAN_TTL_MS and delivered, once, in order, when a
 * stream for that tab opens. Held, not replayed: an event already written to
 * an open stream is never sent again, so a probe (which submits a form) can't
 * run twice.
 */
export function createSseHub(
  now: () => number = Date.now,
  /**
   * Frames for a stream that just opened, written to it alone after anything
   * held for its tab (s2c-038). The reloaded page comes back with no idea a
   * run is still going; this is where the server tells it.
   */
  onConnect?: (tab: string | null) => { event: string; data: unknown }[],
): SseHub {
  const clients = new Set<ServerResponse>()
  const tabOf = new Map<ServerResponse, string | null>()
  const orphans = new Map<string, { at: number; frame: string }[]>()
  const fresh = <T extends { at: number }>(q: T[]): T[] => q.filter((o) => now() - o.at <= ORPHAN_TTL_MS)
  return {
    send(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      const to = (data as { clientId?: unknown } | null)?.clientId
      if (typeof to === 'string' && to !== '' && ![...tabOf.values()].includes(to)) {
        const q = fresh(orphans.get(to) ?? [])
        q.push({ at: now(), frame })
        orphans.set(to, q.slice(-ORPHAN_MAX))
      }
      for (const res of clients) {
        try {
          if (!res.write(frame)) {
            // backpressure from a dead-ish socket: drop the client
            clients.delete(res)
            tabOf.delete(res)
            res.destroy()
          }
        } catch {
          clients.delete(res)
          tabOf.delete(res)
        }
      }
    },
    handler(req, res) {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      res.write(': connected\n\n')
      const tab = clientOf(req.url)
      clients.add(res)
      tabOf.set(res, tab)
      if (tab) {
        const held = fresh(orphans.get(tab) ?? [])
        orphans.delete(tab)
        for (const o of held) res.write(o.frame)
      }
      for (const f of onConnect?.(tab) ?? []) res.write(`event: ${f.event}\ndata: ${JSON.stringify(f.data)}\n\n`)
      // forget the stream everywhere, so the next event to its tab is held
      const drop = () => {
        clients.delete(res)
        tabOf.delete(res)
      }
      res.on('error', drop)
      const heartbeat = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          drop()
        }
      }, 25_000)
      req.on('close', () => {
        clearInterval(heartbeat)
        drop()
      })
    },
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

function hostIsLocal(host: string): boolean {
  const bare = host.replace(/:\d+$/, '')
  return LOCAL_HOSTS.has(bare)
}

/**
 * Guard for state-changing endpoints. Threat model: a malicious page the
 * developer happens to visit drives source edits on their machine.
 * - "Simple" (non-preflighted) cross-origin POSTs: text/plain bodies are
 *   rejected by the content-type check; custom-header requirement forces a
 *   CORS preflight, which fails because we never send CORS headers.
 * - DNS rebinding (attacker.com → 127.0.0.1, making Origin match Host):
 *   defeated by the per-boot token — only a page that could read our overlay
 *   bundle (served same-origin) knows it. Host must also be local, since
 *   plugin middlewares run BEFORE Vite's own allowedHosts check.
 */
export function rejectUnauthorized(
  req: IncomingMessage,
  res: ServerResponse,
  token: string,
): boolean {
  if (!hostIsLocal(String(req.headers.host ?? ''))) {
    sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
    return true
  }
  const ct = String(req.headers['content-type'] ?? '')
  if (!ct.toLowerCase().startsWith('application/json')) {
    sendJson(res, 415, { ok: false, error: 'content-type must be application/json' })
    return true
  }
  if (req.headers['x-s2c-token'] !== token) {
    sendJson(res, 403, { ok: false, error: 'missing or invalid s2c token' })
    return true
  }
  const origin = req.headers.origin
  if (origin) {
    let originHost: string
    try {
      originHost = new URL(String(origin)).host
    } catch {
      sendJson(res, 403, { ok: false, error: 'bad origin' })
      return true
    }
    if (originHost !== String(req.headers.host ?? '')) {
      sendJson(res, 403, { ok: false, error: 'cross-origin request rejected' })
      return true
    }
  }
  return false
}

export function readJsonBody<T>(req: IncomingMessage, maxBytes = 32 * 1024 * 1024): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as T)
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
    req.on('error', reject)
  })
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

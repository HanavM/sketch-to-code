import type { IncomingMessage, ServerResponse } from 'node:http'

export interface SseHub {
  send: (event: string, data: unknown) => void
  handler: (req: IncomingMessage, res: ServerResponse) => void
}

/** Minimal SSE broadcast hub for /@s2c/events. */
export function createSseHub(): SseHub {
  const clients = new Set<ServerResponse>()
  return {
    send(event, data) {
      const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      for (const res of clients) {
        try {
          if (!res.write(frame)) {
            // backpressure from a dead-ish socket: drop the client
            clients.delete(res)
            res.destroy()
          }
        } catch {
          clients.delete(res)
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
      clients.add(res)
      res.on('error', () => clients.delete(res))
      const heartbeat = setInterval(() => {
        try {
          res.write(': ping\n\n')
        } catch {
          clients.delete(res)
        }
      }, 25_000)
      req.on('close', () => {
        clearInterval(heartbeat)
        clients.delete(res)
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

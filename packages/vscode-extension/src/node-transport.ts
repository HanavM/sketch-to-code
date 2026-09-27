import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { BridgeTransport, StreamHandle, StreamHandlers } from './client.js'

/**
 * The only I/O in the extension, kept apart from both the logic (client.ts) and
 * the editor API (extension.ts). node's http is used directly rather than
 * `fetch`, for two reasons that both matter here:
 *  - a streaming response body is easier to consume incrementally, and
 *  - node's http sends no `Origin`/`Sec-Fetch-*` headers, which is exactly the
 *    "not a browser" property the server's editor gate checks for.
 *
 * Reused verbatim by tests/e2e/live-ide-bridge.mjs, so the integration test
 * exercises the extension's real transport rather than a stand-in.
 */
export function createNodeTransport(): BridgeTransport {
  return {
    openStream(url: string, headers: Record<string, string>, h: StreamHandlers): StreamHandle {
      const target = new URL(url)
      const req = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
        target,
        { method: 'GET', headers },
        (res) => {
          h.onOpen(res.statusCode ?? 0)
          if (res.statusCode !== 200) {
            res.resume() // drain, or the socket lingers
            return
          }
          res.setEncoding('utf8')
          res.on('data', (chunk: string) => h.onChunk(chunk))
          res.on('end', () => h.onClose())
          res.on('error', (err) => h.onClose(err))
        },
      )
      req.on('error', (err) => h.onClose(err))
      // The stream is meant to stay open indefinitely; the server's 25s
      // heartbeat is what proves liveness, so node's own idle timeout must not
      // reap it.
      req.setTimeout(0)
      req.end()
      return { close: () => req.destroy() }
    },

    postJson(url: string, headers: Record<string, string>, body: unknown) {
      return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body), 'utf8')
        const target = new URL(url)
        const req = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
          target,
          { method: 'POST', headers: { ...headers, 'content-length': String(payload.byteLength) } },
          (res) => {
            let text = ''
            res.setEncoding('utf8')
            res.on('data', (c: string) => {
              text += c
            })
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
          },
        )
        req.on('error', reject)
        req.setTimeout(5000, () => req.destroy(new Error('cursor post timed out')))
        req.end(payload)
      })
    },
  }
}

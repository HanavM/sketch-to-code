import { mkdtempSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * s2c-002, through the plugin's own middleware: a real HTTP server, a fake
 * pipeline whose reading takes 150 ms. The page asks, then dies (the request
 * is aborted, as a vite full-reload does to it), and the page after the reload
 * collects the answer by id. Zero tokens.
 */
vi.mock('../src/overlay-bundle.js', () => ({ bundleOverlayClient: async () => '' }))
const calls = { interpret: 0 }
/** The reading, faked at the plugin's own seam: no pipeline import, no model. */
const fakeReading = async () => {
  calls.interpret++
  await new Promise((r) => setTimeout(r, 150))
  return {
    status: 200,
    body: { ok: true, v2: { interpretation: { reading: 'a card under the heading', actions: [{ op: 'add' }], rejected: [] }, raw: { r: 1 }, tokens: 42 } },
  }
}

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
interface Booted { port: number; token: string; server: Server }
let open: Server[] = []
afterEach(() => { for (const s of open) { s.closeAllConnections(); s.close() } open = [] })

async function boot(): Promise<Booted> {
  vi.resetModules()
  const mod = await import('../src/index.js')
  mod.setReadingHandler(fakeReading)
  const root = mkdtempSync(join(tmpdir(), 's2c-read-'))
  const plugin = mod.default({ allowDirty: true }) as any
  plugin.configResolved({ root })
  const mounts: Array<[string, (req: IncomingMessage, res: ServerResponse, next: () => void) => void]> = []
  plugin.configureServer({
    middlewares: { use: (p: string, fn: any) => mounts.push([p, fn]) },
    watcher: { on: () => undefined },
    config: { logger: { info: () => undefined, warn: () => undefined } },
  })
  // connect's matching: first mount whose path is a prefix (at a / boundary)
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    const path = url.split('?')[0]!
    let i = 0
    const next = () => {
      while (i < mounts.length) {
        const [p, fn] = mounts[i++]!
        if (path === p || path.startsWith(`${p}/`)) {
          req.url = url.slice(p.length) || '/'
          return fn(req, res, next)
        }
      }
      res.statusCode = 404
      res.end()
    }
    next()
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  open.push(server)
  const port = (server.address() as AddressInfo).port
  const js = await (await fetch(`http://localhost:${port}/@s2c/overlay.js`)).text()
  const token = JSON.parse(js.match(/__S2C_TOKEN__=(".*?");/)![1]!) as string
  return { port, token, server }
}

const post = (b: Booted, path: string, body: unknown, signal?: AbortSignal) =>
  fetch(`http://localhost:${b.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-s2c-token': b.token },
    body: JSON.stringify(body),
    signal,
  })
const SKETCH = { strokes: [{ id: 's0', points: [{ x: 1, y: 1, t: 0 }] }], snapshot: { nodes: [], viewport: { w: 800, h: 600, scrollX: 0, scrollY: 0 } } }
const ID = 'rtest0000000000000001'

describe('a reading survives the reload that kills its page (s2c-002)', () => {
  it('the page dies mid-reading; the next page collects the same answer, and the model is asked once', { timeout: 30_000 }, async () => {
    const b = await boot()
    calls.interpret = 0
    const ac = new AbortController()
    const dying = post(b, '/@s2c/interpret', { ...SKETCH, readingId: ID }, ac.signal)
    await tick(30)
    ac.abort() // the full reload
    await expect(dying).rejects.toThrow()
    // the new page asks right away: still running, so it waits for it
    // as the overlay does: long-poll until it is no longer pending (the first
    // import of the pipeline alone can outlast one short wait)
    let got: any = { state: 'pending' }
    let polls = 0
    while (got.state === 'pending' && polls++ < 20) {
      const res = await post(b, '/@s2c/interpret/result', { readingId: ID, waitMs: 1000 })
      expect(res.status).toBe(200)
      got = await res.json()
    }
    expect(got.state).toBe('done')
    expect(got.status).toBe(200)
    expect(got.reply.ok).toBe(true)
    expect(got.reply.v2.interpretation.reading).toBe('a card under the heading')
    expect(got.reply.v2.raw).toEqual({ r: 1 })
    expect(calls.interpret).toBe(1)
  })

  it('a short wait on a reading still running says pending', async () => {
    const b = await boot()
    void post(b, '/@s2c/interpret', { ...SKETCH, readingId: 'rtest0000000000000002' }).catch(() => undefined)
    await tick(20)
    const got = (await (await post(b, '/@s2c/interpret/result', { readingId: 'rtest0000000000000002', waitMs: 10 })).json()) as any
    expect(got).toEqual({ state: 'pending' })
  })

  it('the live page still gets its answer the usual way, with or without an id', async () => {
    const b = await boot()
    for (const extra of [{}, { readingId: 'rtest0000000000000003' }]) {
      const res = await post(b, '/@s2c/interpret', { ...SKETCH, ...extra })
      const body = (await res.json()) as any
      expect(res.status).toBe(200)
      expect(body.ok).toBe(true)
      expect(body.v2.tokens).toBe(42)
    }
  })

  it('an unknown id is unknown (a restarted dev server), a bad id is refused, and the guard applies', async () => {
    const b = await boot()
    expect(await (await post(b, '/@s2c/interpret/result', { readingId: 'rneverasked000000', waitMs: 0 })).json()).toEqual({ state: 'unknown' })
    expect((await post(b, '/@s2c/interpret/result', { readingId: '../x', waitMs: 0 })).status).toBe(400)
    const noToken = await fetch(`http://localhost:${b.port}/@s2c/interpret/result`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ readingId: ID }),
    })
    expect(noToken.status).toBe(403)
    // the result route is not swallowed by the interpret route's prefix
    expect(calls.interpret).toBeGreaterThan(0)
    const before = calls.interpret
    await post(b, '/@s2c/interpret/result', { readingId: ID, waitMs: 0 })
    expect(calls.interpret).toBe(before)
  })
})

import { createServer, get, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createSseHub, type SseHub } from '../src/middleware.js'

/**
 * s2c-037: a run that writes a new module full-reloads the page mid-run. The
 * page that comes back opens a new stream a moment later, and whatever was
 * sent to its tab in between (the snapshot request that verifies the edit,
 * a probe, `done`) must reach it, once. Real HTTP, zero tokens.
 */
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
let server: Server | null = null
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())))

async function serve(hub: SseHub): Promise<number> {
  server = createServer((req, res) => hub.handler(req, res))
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  return (server.address() as AddressInfo).port
}

/** Open a stream; collect event names in arrival order. */
function open(port: number, query: string) {
  const events: string[] = []
  let req: ReturnType<typeof get> | null = null
  const ready = new Promise<void>((resolve) => {
    req = get(`http://127.0.0.1:${String(port)}/${query}`, (res: IncomingMessage) => {
      res.setEncoding('utf8')
      res.on('data', (chunk: string) => {
        for (const m of chunk.matchAll(/^event: (\S+)$/gm)) events.push(m[1]!)
        if (chunk.includes(': connected')) resolve()
      })
      res.on('error', () => {})
    })
    req.on('error', () => {})
  })
  return { events, ready, close: async () => { req?.destroy(); await tick(30) } }
}

describe('SSE hub across a mid-run reload (s2c-037)', () => {
  it("delivers what was sent while the tab had no stream, once, in order, when it reconnects", async () => {
    const hub = createSseHub()
    const port = await serve(hub)
    const before = open(port, '?client=tab-A')
    await before.ready
    hub.send('stage', { stage: 'writing', clientId: 'tab-A' })
    await tick(30)
    expect(before.events).toEqual(['stage'])

    await before.close() // the full reload tears the page down
    hub.send('resnapshot', { runId: 'r1', clientId: 'tab-A' })
    hub.send('done', { summary: 'ok', clientId: 'tab-A' })

    const after = open(port, '?client=tab-A')
    await after.ready
    await tick(30)
    // red before s2c-037: [] — the run waited 15 s for a snapshot nobody was asked for
    expect(after.events).toEqual(['resnapshot', 'done'])

    // delivered once: a third stream for the same tab gets nothing old
    await after.close()
    const third = open(port, '?client=tab-A')
    await third.ready
    await tick(30)
    expect(third.events).toEqual([])
    await third.close()
  })

  it('never resends what already reached an open stream (a probe submits a form)', async () => {
    const hub = createSseHub()
    const port = await serve(hub)
    const a = open(port, '?client=tab-A')
    await a.ready
    hub.send('probe', { probeId: 'p1', clientId: 'tab-A' })
    await tick(30)
    await a.close()
    const again = open(port, '?client=tab-A')
    await again.ready
    await tick(30)
    expect(a.events).toEqual(['probe'])
    expect(again.events).toEqual([])
    await again.close()
  })

  it("doesn't hand one tab's events to another, and drops them after 30 s", async () => {
    let t = 1_000
    const hub = createSseHub(() => t)
    const port = await serve(hub)
    hub.send('done', { clientId: 'tab-A' })
    const b = open(port, '?client=tab-B')
    await b.ready
    await tick(30)
    expect(b.events).toEqual([])
    await b.close()

    t += 30_001
    const late = open(port, '?client=tab-A')
    await late.ready
    await tick(30)
    expect(late.events).toEqual([]) // an old tab restored later must not be told something just finished
    await late.close()
  })

  it('still broadcasts to streams that name no tab (CLI, IDE bridge)', async () => {
    const hub = createSseHub()
    const port = await serve(hub)
    const anon = open(port, '')
    await anon.ready
    hub.send('done', { clientId: 'tab-A' })
    hub.send('ide-status', { connected: true })
    await tick(30)
    expect(anon.events).toEqual(['done', 'ide-status'])
    await anon.close()
  })
})

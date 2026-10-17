import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * s2c-022, end to end through the plugin's own middleware: a real HTTP server,
 * a real git repo, a fake pipeline. Zero tokens.
 *
 * The fake pipeline is the leak, made deterministic: it edits App.tsx, keeps
 * appending to it every 5ms, and only notices the stop signal LATE (60ms after
 * it fires — an Edit already in flight). Before this node the plugin raced it
 * against the deadline, reported the stop at once, and the edits kept coming.
 */
vi.mock('../src/overlay-bundle.js', () => ({ bundleOverlayClient: async () => '' }))

const git = (cwd: string, ...a: string[]) =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ORIGINAL = 'export default function App() { return <h1>hi</h1> }\n'

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 's2c-run-'))
  git(dir, 'init', '-q')
  git(dir, 'config', 'user.email', 't@t')
  git(dir, 'config', 'user.name', 't')
  mkdirSync(join(dir, 'src'))
  writeFileSync(join(dir, 'src/App.tsx'), ORIGINAL)
  writeFileSync(join(dir, '.gitignore'), '.sketch2code/\n')
  git(dir, 'add', '.')
  git(dir, 'commit', '-qm', 'init')
  return dir
}

type Mod = typeof import('../src/index.js')
interface Booted { port: number; token: string; server: Server; events: Array<{ event: string; data: any; at: string }>; close: () => void }

/** One dev server: a fresh plugin instance on a minimal connect-like router. */
async function boot(mod: Mod, root: string, opts: Record<string, unknown>): Promise<Booted> {
  const plugin = mod.default({ allowDirty: true, ...opts }) as any
  plugin.configResolved({ root })
  const mounts: Array<[string, (req: IncomingMessage, res: ServerResponse, next: () => void) => void]> = []
  plugin.configureServer({
    middlewares: { use: (p: string, fn: any) => mounts.push([p, fn]) },
    watcher: { on: () => undefined },
    config: { logger: { info: () => undefined, warn: () => undefined } },
  })
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
  const port = (server.address() as AddressInfo).port
  const js = await (await fetch(`http://localhost:${port}/@s2c/overlay.js`)).text()
  const token = JSON.parse(js.match(/__S2C_TOKEN__=(".*?");/)![1]!) as string
  const events: Booted['events'] = []
  const sse = request({ host: '127.0.0.1', port, path: '/@s2c/events', headers: { host: `localhost:${port}` } }, (res) => {
    let buf = ''
    res.on('data', (c: Buffer) => {
      buf += c.toString()
      let k
      while ((k = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, k)
        buf = buf.slice(k + 2)
        const ev = frame.match(/^event: (.*)$/m)?.[1]
        const data = frame.match(/^data: (.*)$/m)?.[1]
        if (ev && data) events.push({ event: ev, data: JSON.parse(data), at: readFileSync(join(root, 'src/App.tsx'), 'utf8') })
      }
    })
  })
  sse.end()
  await tick(30)
  return { port, token, server, events, close: () => { sse.destroy(); server.closeAllConnections(); server.close() } }
}

const post = async (b: Booted, path: string, body: unknown = {}) => {
  const res = await fetch(`http://localhost:${b.port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-s2c-token': b.token },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as any }
}
const until = async (pred: () => boolean, ms = 3_000) => {
  const t0 = Date.now()
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting; events: ${JSON.stringify(open.flatMap((b) => b.events.map((e) => e.event + ":" + JSON.stringify(e.data).slice(0, 200))))}`)
    await tick(5)
  }
}
const RUN = { strokes: [], snapshot: { nodes: [], viewport: { w: 800, h: 600, scrollX: 0, scrollY: 0 } } }

/** Edits App.tsx, keeps editing, and honours the stop only `lagMs` late. */
function leakyHandler(root: string, lagMs: number) {
  return async (_req: unknown, ctx: { signal: AbortSignal }) => {
    const file = join(root, 'src/App.tsx')
    writeFileSync(file, 'export default function App() { return <h1>edited</h1> }\n')
    const timer = setInterval(() => appendFileSync(file, '// still editing\n'), 5)
    await new Promise<void>((r) => {
      if (ctx.signal.aborted) r()
      else ctx.signal.addEventListener('abort', () => r(), { once: true })
    })
    await tick(lagMs) // an Edit already in flight lands after the stop
    clearInterval(timer)
    throw ctx.signal.reason
  }
}

let open: Booted[] = []
afterEach(() => {
  for (const b of open) b.close()
  open = []
})

describe('the run cap and Esc stop the run before anyone is told (s2c-022)', () => {
  it('deadline: no write lands after error-event, the slot stays held until the run exits, and Undo restores', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const root = makeRepo()
    const b = await boot(mod, root, { runTimeoutMs: 80 })
    open.push(b)
    mod.setRunHandler(leakyHandler(root, 60) as any)

    expect((await post(b, '/@s2c/run', RUN)).status).toBe(200)
    await until(() => b.events.some((e) => e.event === 'stage' && e.data.stage === 'stopping'))
    // stopping, not stopped: a second run is still refused
    expect((await post(b, '/@s2c/run', RUN)).status).toBe(409)
    await until(() => b.events.some((e) => e.event === 'error-event'))
    const err = b.events.find((e) => e.event === 'error-event')!
    expect(err.data.message).toMatch(/exceeded .*cap/)
    await tick(80)
    // the file as it stood when the user was told is the file as it stands now
    expect(readFileSync(join(root, 'src/App.tsx'), 'utf8')).toBe(err.at)

    const undo = await post(b, '/@s2c/undo')
    expect(undo.body.undid).toBe('your last sketch (stopped part way)')
    await tick(40)
    expect(readFileSync(join(root, 'src/App.tsx'), 'utf8')).toBe(ORIGINAL)
  })

  it('Esc: /@s2c/run/abort stops the run, says "stopped by you", and is a no-op with no run', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const root = makeRepo()
    const b = await boot(mod, root, { runTimeoutMs: 60_000 })
    open.push(b)
    mod.setRunHandler(leakyHandler(root, 40) as any)

    expect((await post(b, '/@s2c/run/abort')).body).toEqual({ ok: true, stopping: false })
    await post(b, '/@s2c/run', RUN)
    await tick(30)
    expect((await post(b, '/@s2c/run/abort')).body).toEqual({ ok: true, stopping: true })
    expect((await post(b, '/@s2c/run/abort')).body.stopping).toBe(false) // already stopping
    await until(() => b.events.some((e) => e.event === 'error-event'))
    const err = b.events.find((e) => e.event === 'error-event')!
    expect(err.data.message).toBe('stopped by you')
    expect(err.data.explanation.sentence).toMatch(/^Stopped, as you asked\. Undo/)
    await tick(60)
    expect(readFileSync(join(root, 'src/App.tsx'), 'utf8')).toBe(err.at)
    // the slot is free again
    mod.setRunHandler((async () => ({ summary: 'ok' })) as any)
    expect((await post(b, '/@s2c/run', RUN)).status).toBe(200)
  })

  it('a run that ignores the signal entirely still holds the slot until it returns', async () => {
    vi.resetModules()
    const mod = await import('../src/index.js')
    const root = makeRepo()
    const b = await boot(mod, root, { runTimeoutMs: 30 })
    open.push(b)
    mod.setRunHandler((async () => { await tick(150); return { summary: 'finished anyway' } }) as any)
    await post(b, '/@s2c/run', RUN)
    await tick(80)
    expect(b.events.some((e) => e.event === 'error-event' || e.event === 'done')).toBe(false)
    expect((await post(b, '/@s2c/run', RUN)).status).toBe(409)
    await until(() => b.events.some((e) => e.event === 'error-event'))
    // it finished, but after a stop: reported as the stop, never as success
    expect(b.events.some((e) => e.event === 'done')).toBe(false)
  })
})

describe('undo survives a dev-server restart (s2c-022)', () => {
  it('an edit made before the restart is undone after it', async () => {
    vi.resetModules()
    let mod = await import('../src/index.js')
    const root = makeRepo()
    const b1 = await boot(mod, root, {})
    open.push(b1)
    mod.setRunHandler((async () => {
      writeFileSync(join(root, 'src/App.tsx'), 'export default function App() { return <h1>run</h1> }\n')
      return { summary: 'ok' }
    }) as any)
    await post(b1, '/@s2c/run', RUN)
    await until(() => b1.events.some((e) => e.event === 'done'))
    expect(existsSync(join(root, '.sketch2code/undo.json'))).toBe(true)
    b1.close()

    // a new process: fresh module state, so the in-memory stack is gone
    vi.resetModules()
    mod = await import('../src/index.js')
    const b2 = await boot(mod, root, {})
    open.push(b2)
    git(root, 'gc', '-q', '--prune=now') // and git tidied up in between
    const undo = await post(b2, '/@s2c/undo')
    expect(undo.body).toMatchObject({ ok: true, undid: 'your last sketch' })
    expect(readFileSync(join(root, 'src/App.tsx'), 'utf8')).toBe(ORIGINAL)
    expect((await post(b2, '/@s2c/undo')).body.undid).toBe(null) // popped, and saved popped
  })

  it('a tampered undo.json is not trusted', async () => {
    const { loadUndo, saveUndo } = await import('../src/undo-store.js')
    const root = mkdtempSync(join(tmpdir(), 's2c-undo-'))
    mkdirSync(join(root, '.sketch2code'))
    writeFileSync(join(root, '.sketch2code/undo.json'), JSON.stringify({ entries: [
      { sha: '--source=evil', label: 'x', untracked: [], after: null },
      { sha: 'a'.repeat(40), label: 'ok', untracked: [], after: null },
      { sha: 'b'.repeat(40), label: 'bad lists', untracked: 'nope', after: null },
    ] }))
    expect(loadUndo(root).map((e) => e.label)).toEqual(['ok'])
    writeFileSync(join(root, '.sketch2code/undo.json'), '{ not json')
    expect(loadUndo(root)).toEqual([])
    saveUndo(root, Array.from({ length: 60 }, (_, i) => ({ sha: 'c'.repeat(40), label: `e${i}`, untracked: [], after: null })))
    const back = loadUndo(root)
    expect(back).toHaveLength(50)
    expect(back.at(-1)!.label).toBe('e59')
  })
})

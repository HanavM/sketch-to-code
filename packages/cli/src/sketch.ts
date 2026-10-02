/**
 * One sketch, right now, without installing anything.
 *
 * `init` is the other shape of this tool: it edits your vite config, adds a
 * dependency, and from then on the overlay is part of your dev server. That is
 * the right trade when you are going to draw all week. It is the wrong trade
 * when you want ONE component and you want it in the next two minutes — nobody
 * adopts a build-tool plugin to save themselves a div.
 *
 * So this is the other door. It starts a second dev server on a spare port,
 * using YOUR vite and YOUR config so your aliases, your Tailwind and your
 * plugins all behave, and adds the overlay to that server in memory. Your
 * config file is not touched, your package.json is not touched, and nothing is
 * left in node_modules: the plugin arrives with the CLI, which npx throws away
 * afterwards. Your source IS edited, because that is the entire point.
 *
 * It waits for one run to land, prints what changed, and exits. One call, one
 * result — which is what makes it usable from a script, a Makefile, or an agent
 * that wants to hand the drawing part to a human and pick the code up after.
 */
import { createRequire } from 'node:module'
import { createServer as netServer } from 'node:net'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { detectProject, type Blocker } from './detect.js'

export interface SketchOptions {
  /** The project to draw on. Must be a Vite + React app. */
  dir: string
  /**
   * Port for the throwaway server. Omit to take a free one — deliberately NOT
   * your dev port, so this can run beside the server you already have open.
   */
  port?: number
  /** Open a browser at the url. Default true. */
  open?: boolean
  /** Stop after the first applied edit (default), or stay up until killed. */
  until?: 'first-edit' | 'quit'
  /** Give up waiting. Default 15 minutes — a person is drawing, not a machine. */
  timeoutMs?: number
  /** Allow running with uncommitted changes. Default true here: see below. */
  allowDirty?: boolean
  /** Progress, so a caller can show its own spinner. */
  onEvent?: (e: { kind: string; message: string }) => void
}

export interface SketchResult {
  ok: boolean
  /** Why it stopped. */
  reason: 'edit' | 'quit' | 'timeout' | 'refused' | 'error'
  /** The run's own summary line, when a run landed. */
  summary?: string
  /** Why it would not start, in the same words `init` uses. */
  blockers?: Blocker[]
  error?: string
  url?: string
}

/** A port nothing is listening on, chosen by the OS rather than guessed. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = netServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => (port ? resolve(port) : reject(new Error('no free port'))))
    })
  })
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
  try {
    spawn(cmd, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
  } catch { /* a url printed to the terminal is a fine fallback */ }
}

/**
 * Wait for the overlay to report that a run finished.
 *
 * Over the plugin's own SSE stream, which is the same thing the overlay in the
 * browser listens to — so this learns about the edit at the moment the person
 * drawing does, not by polling the filesystem and guessing which write was the
 * interesting one. The stream is read-only and needs no token.
 */
async function waitForRun(
  url: string,
  signal: AbortSignal,
  onEvent?: SketchOptions['onEvent'],
): Promise<{ kind: 'done' | 'error'; message: string }> {
  const res = await fetch(`${url}/@s2c/events`, { signal, headers: { accept: 'text/event-stream' } })
  if (!res.ok || !res.body) throw new Error(`event stream not available (${String(res.status)})`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) throw new Error('event stream closed')
    buffer += decoder.decode(value, { stream: true })
    // SSE frames are separated by a blank line; a frame may arrive in pieces
    let split = buffer.indexOf('\n\n')
    while (split !== -1) {
      const frame = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      split = buffer.indexOf('\n\n')
      let event = 'message'
      let data = ''
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data += line.slice(5).trim()
      }
      let parsed: Record<string, unknown> = {}
      try {
        parsed = data ? (JSON.parse(data) as Record<string, unknown>) : {}
      } catch { /* a frame we don't understand is not a reason to stop */ }
      const text = typeof parsed.summary === 'string'
        ? parsed.summary
        : typeof parsed.message === 'string' ? parsed.message : ''
      if (event === 'done') return { kind: 'done', message: text || 'done' }
      if (event === 'error-event') return { kind: 'error', message: text || 'the run failed' }
      if (text) onEvent?.({ kind: event, message: text })
    }
  }
}

/**
 * Draw once on `dir`, apply it, and come back.
 *
 * Refuses for the same reasons `init` refuses, and in the same words: a Next.js
 * app cannot be stamped whichever door you came in through, and finding that
 * out from a different message here would be its own small bug.
 */
export async function sketchOnce(opts: SketchOptions): Promise<SketchResult> {
  const say = (kind: string, message: string) => opts.onEvent?.({ kind, message })
  const project = detectProject(opts.dir)
  if (project.verdict !== 'supported') {
    return { ok: false, reason: 'refused', blockers: project.blockers }
  }

  // Their vite, resolved from their project — not whatever version shipped
  // alongside this CLI. A config written for their vite has to be loaded by it,
  // and two copies of vite in one process is its own kind of broken.
  let vite: typeof import('vite')
  try {
    const req = createRequire(join(project.dir, 'package.json'))
    vite = (await import(pathToFileURL(req.resolve('vite')).href)) as typeof import('vite')
  } catch (err) {
    return {
      ok: false,
      reason: 'error',
      error:
        `could not load vite from ${project.dir} — is this project installed? ` +
        `(${err instanceof Error ? err.message : String(err)})`,
    }
  }

  /**
   * If their config already registers the plugin, do NOT add a second one.
   *
   * Two instances in one server is not a near-miss, it is two overlays, two
   * per-boot tokens and two stamp passes over the same JSX. A project that ran
   * `init` is already set up; the only thing this command still usefully does
   * for it is start a server on a spare port and wait, which is exactly what
   * happens when nothing is injected.
   */
  const alreadyWired = project.hasPluginDep && project.viteConfigPath !== null
  const { default: sketch2code } = await import('@s2c/vite-plugin')
  const port = opts.port ?? (await freePort())
  let server: Awaited<ReturnType<typeof vite.createServer>> | null = null
  const abort = new AbortController()

  try {
    server = await vite.createServer({
      root: project.dir,
      // their config file, so aliases/Tailwind/plugins behave as they expect
      ...(project.viteConfigPath ? { configFile: project.viteConfigPath } : {}),
      // Inline plugins merge with the ones their config declares, and the
      // plugin's own enforce:'pre' puts the stamp pass ahead of react's
      // transform — which is where it has to be for anything to be stamped.
      plugins: alreadyWired
        ? []
        : [
          sketch2code({
            // ON by default here, unlike init's default. A quick sketch is
            // something you do mid-change, on a dirty tree, and refusing to run
            // until the work in progress is committed would defeat the point.
            // The checkpoint is still taken, so Ctrl+Z still works.
            allowDirty: opts.allowDirty ?? true,
          }),
        ],
      server: { port, strictPort: true, open: false },
      // a second server must not fight the first over the same cache
      cacheDir: join(project.dir, 'node_modules', '.vite-s2c-sketch'),
      logLevel: 'warn',
    })
    await server.listen()
    const url = `http://localhost:${String(port)}`
    if (alreadyWired) say('installed', 'this project already has the plugin — using its own config, nothing injected')
    say('ready', url)
    if (opts.open !== false) openBrowser(url)

    if (opts.until === 'quit') {
      // stay up until the caller kills us; the edits land as they are drawn
      await new Promise<void>((resolve) => {
        const stop = () => resolve()
        process.once('SIGINT', stop)
        process.once('SIGTERM', stop)
      })
      return { ok: true, reason: 'quit', url }
    }

    const timeout = new Promise<SketchResult>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, reason: 'timeout', url }),
        opts.timeoutMs ?? 15 * 60_000,
      ).unref(),
    )
    const landed = waitForRun(url, abort.signal, opts.onEvent).then<SketchResult>((r) =>
      r.kind === 'done'
        ? { ok: true, reason: 'edit', summary: r.message, url }
        : { ok: false, reason: 'error', error: r.message, url },
    )
    return await Promise.race([landed, timeout])
  } catch (err) {
    return { ok: false, reason: 'error', error: err instanceof Error ? err.message : String(err) }
  } finally {
    abort.abort()
    await server?.close().catch(() => undefined)
  }
}

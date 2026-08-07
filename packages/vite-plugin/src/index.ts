import { randomUUID } from 'node:crypto'
import { relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { DomSnapshot } from '@s2c/dom'
import { stampJsxSource } from './jsx-source.js'
import { createSseHub, readJsonBody, rejectUnauthorized, sendJson, type SseHub } from './middleware.js'
import { bundleOverlayClient } from './overlay-bundle.js'

export interface Sketch2CodeOptions {
  /** Allow running with uncommitted changes in the target repo. Default false. */
  allowDirty?: boolean
  /** Extra file extensions to stamp. */
  extensions?: string[]
  /** Hard wall-clock cap per run (ms). Default 12 minutes. */
  runTimeoutMs?: number
}

interface RawStroke {
  id: string
  points: Array<{ x: number; y: number; t: number }>
}

export interface RunRequest {
  strokes: RawStroke[]
  snapshot: DomSnapshot
  clientId?: string
}

/** Pipeline entry, attached by @s2c/pipeline. */
export type RunHandler = (
  req: RunRequest,
  ctx: {
    root: string
    allowDirty: boolean
    emit: (event: string, data: unknown) => void
    /** Ask the originating browser tab for a fresh snapshot. */
    requestSnapshot: (runId: string) => Promise<DomSnapshot>
  },
) => Promise<{ summary: string }>

let runHandler: RunHandler | null = null
export function setRunHandler(h: RunHandler): void {
  runHandler = h
}

// Module scope on purpose: a vite config-reload re-instantiates the plugin,
// and a closure-scoped flag would let a fresh instance accept a second run
// while an orphaned pipeline is still editing files.
let activeRun = false

const DEFAULT_EXTS = ['.jsx', '.tsx']

/**
 * vite-plugin-sketch2code: dev-only.
 * - stamps JSX host elements with data-s2c="file:line:col"
 * - injects + serves the overlay client
 * - mounts /@s2c/* middleware (run intake, SSE progress, verify snapshots)
 * apply:'serve' keeps every part of this out of production builds.
 */
export default function sketch2code(options: Sketch2CodeOptions = {}): Plugin {
  const exts = options.extensions ?? DEFAULT_EXTS
  const allowDirty = options.allowDirty ?? false
  const runTimeoutMs = options.runTimeoutMs ?? 12 * 60_000
  let root = process.cwd()

  const sse: SseHub = createSseHub()
  const pendingSnapshots = new Map<string, (snap: DomSnapshot) => void>()
  // per-boot token embedded in the overlay bundle; required on state-changing POSTs
  const token = randomUUID()

  return {
    name: 'sketch2code',
    apply: 'serve',
    enforce: 'pre',

    configResolved(config) {
      root = config.root
    },

    transform(code, id) {
      const clean = id.split('?')[0]!
      if (!exts.some((e) => clean.endsWith(e))) return null
      if (clean.includes('/node_modules/')) return null
      const rel = relative(root, clean)
      if (rel.startsWith('..')) return null
      const res = stampJsxSource(code, rel)
      if (!res) return null
      return { code: res.code, map: res.map }
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@s2c/overlay.js' },
          injectTo: 'body',
        },
      ]
    },

    configureServer(server: ViteDevServer) {
      // attach the pipeline when it's installed; the plugin works without it
      import('@s2c/pipeline')
        .then((m) => {
          if (!runHandler) {
            runHandler = (req, ctx) => m.runPipeline(req, ctx)
            server.config.logger.info('[s2c] pipeline attached')
          }
        })
        .catch(() => {
          server.config.logger.warn('[s2c] @s2c/pipeline not installed — overlay runs in capture-only mode')
        })

      server.middlewares.use('/@s2c/ping', (_req, res) => {
        sendJson(res, 200, { ok: true, root, allowDirty, hasPipeline: runHandler !== null })
      })

      server.middlewares.use('/@s2c/overlay.js', (_req, res) => {
        bundleOverlayClient()
          .then((src) => {
            res.setHeader('content-type', 'text/javascript')
            // token line BEFORE the IIFE so it's set when the client boots
            res.end(`globalThis.__S2C_TOKEN__=${JSON.stringify(token)};\n${src}`)
          })
          .catch((err: unknown) => {
            res.setHeader('content-type', 'text/javascript')
            res.end(`console.error("[s2c] overlay bundle failed:", ${JSON.stringify(String(err))})`)
          })
      })

      server.middlewares.use('/@s2c/events', (req, res) => sse.handler(req, res))

      server.middlewares.use('/@s2c/verify-snapshot', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ runId: string; snapshot: DomSnapshot }>(req)
          .then((body) => {
            pendingSnapshots.get(body.runId)?.(body.snapshot)
            pendingSnapshots.delete(body.runId)
            sendJson(res, 200, { ok: true })
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/run', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        if (rejectUnauthorized(req, res, token)) return
        if (!runHandler) return sendJson(res, 501, { ok: false, error: 'pipeline not attached (is @s2c/pipeline built?)' })
        if (activeRun) return sendJson(res, 409, { ok: false, error: 'a run is already in progress' })
        // claim the slot synchronously — no TOCTOU window while the body streams
        activeRun = true

        readJsonBody<RunRequest>(req)
          .then((body) => {
            sendJson(res, 200, { ok: true })
            const clientId = body.clientId ?? null
            const ctx = {
              root,
              allowDirty,
              emit: (event: string, data: unknown) =>
                sse.send(event, { ...(data as object), clientId }),
              requestSnapshot: (runId: string) =>
                new Promise<DomSnapshot>((resolve, reject) => {
                  const timer = setTimeout(() => {
                    pendingSnapshots.delete(runId)
                    reject(new Error('browser snapshot timed out'))
                  }, 15_000)
                  pendingSnapshots.set(runId, (snap) => {
                    clearTimeout(timer)
                    resolve(snap)
                  })
                  sse.send('resnapshot', { runId, clientId })
                }),
            }
            const deadline = new Promise<never>((_, rej) =>
              setTimeout(() => rej(new Error(`run exceeded ${runTimeoutMs / 1000}s cap`)), runTimeoutMs),
            )
            // Promise.resolve().then() so a synchronously-throwing handler
            // still flows into .catch/.finally
            Promise.race([Promise.resolve().then(() => runHandler!(body, ctx)), deadline])
              .then((result) => sse.send('done', { summary: result.summary, clientId }))
              .catch((err: unknown) =>
                sse.send('error-event', {
                  message: err instanceof Error ? err.message : String(err),
                  clientId,
                }),
              )
              .finally(() => {
                activeRun = false
              })
          })
          .catch((err: unknown) => {
            activeRun = false
            sendJson(res, 400, { ok: false, error: String(err) })
          })
      })
    },
  }
}

export { stampJsxSource } from './jsx-source.js'
export { createSseHub, readJsonBody, rejectUnauthorized, sendJson } from './middleware.js'

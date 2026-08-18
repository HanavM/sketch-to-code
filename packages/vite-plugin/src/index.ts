import { randomUUID } from 'node:crypto'
import { relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { DomSnapshot } from '@s2c/dom'
import { stampJsxSource } from './jsx-source.js'
import { createSseHub, readJsonBody, rejectUnauthorized, sendJson, type SseHub } from './middleware.js'
import { bundleOverlayClient } from './overlay-bundle.js'
import { runsViewer } from './runs-viewer.js'

export interface Sketch2CodeOptions {
  /** Allow running with uncommitted changes in the target repo. Default false. */
  allowDirty?: boolean
  /** Extra file extensions to stamp. */
  extensions?: string[]
  /** Hard wall-clock cap per run (ms). Default 12 minutes. */
  runTimeoutMs?: number
  /** Intent engine: 'model' (multimodal interpretation, default) or 'rules'
   *  (legacy deterministic classifier). */
  engine?: 'model' | 'rules'
}

interface RawStroke {
  id: string
  points: Array<{ x: number; y: number; t: number }>
}

export interface RunRequest {
  strokes: RawStroke[]
  snapshot: DomSnapshot
  clientId?: string
  /** 'gesture' (default) | 'design' | 'screenshot'. */
  mode?: 'gesture' | 'design' | 'screenshot'
  /** base64 PNG of the whole browser screen (screenshot mode). */
  screenshot?: string
  /** Per-ink-node kind corrections from the interpretation preview (rules engine). */
  overrides?: Record<string, string>
  /** Confirmed raw interpretation (model engine) — re-grounded server-side. */
  rawInterpretation?: unknown
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
// undo stack: checkpoint SHAs of committed edits, most recent last
const undoStack: Array<{ sha: string; label: string }> = []

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
  const engine = options.engine ?? 'model'
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
        sendJson(res, 200, { ok: true, root, allowDirty, engine, hasPipeline: runHandler !== null })
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

      // read-only debug viewer: exactly what the agent saw, per run.
      // Host-gated (rebound hosts fail); cross-origin reads blocked by SOP.
      server.middlewares.use('/@s2c/runs', (req, res) => {
        const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
          return sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
        }
        runsViewer(root)(req, res)
      })

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

      // Direct manipulation commit: deterministic Tailwind class edit at the
      // element's CURRENT stamp. Zero model calls; checkpointed like any edit.
      server.middlewares.use('/@s2c/manipulate', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{
          srcLoc: string; prop: string; px?: number; from?: number; to?: number
          dx?: number; dy?: number; inFlow?: boolean; w?: number; h?: number
        }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const cp = m.checkpoint(root, allowDirty)
            const result = m.applyManipulation(root, {
              srcLoc: body.srcLoc,
              prop: body.prop as Parameters<typeof m.applyManipulation>[1]['prop'],
              px: body.px,
              from: body.from,
              to: body.to,
              dx: body.dx,
              dy: body.dy,
              inFlow: body.inFlow,
              w: body.w,
              h: body.h,
            })
            if (result.ok && !(result.change ?? '').startsWith('no change')) {
              undoStack.push({ sha: cp.sha, label: result.change ?? 'edit' })
            }
            sendJson(res, result.ok ? 200 : 422, { ...result, checkpoint: cp.sha })
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/undo', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            while (undoStack.length) {
              const entry = undoStack.pop()!
              const cp = { sha: entry.sha, toplevel: root, dirtyBefore: true }
              const files = m.changedFiles(root, cp)
              if (files.length === 0) continue // that edit was already reverted
              m.revertToCheckpoint(root, cp, files)
              return sendJson(res, 200, { ok: true, undid: entry.label, files })
            }
            sendJson(res, 200, { ok: true, undid: null })
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String(err) })
          }
        })()
      })

      server.middlewares.use('/@s2c/interpret', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<RunRequest>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            if (engine === 'model' && body.mode !== 'screenshot') {
              const v2 = await m.interpretV2(
                body.strokes as Parameters<typeof m.interpretV2>[0],
                body.snapshot,
                undefined,
                body.mode === 'design' ? 'design' : 'gesture',
              )
              sendJson(res, 200, {
                ok: true,
                v2: { interpretation: v2.interpretation, raw: v2.raw, tokens: v2.tokens },
              })
              return
            }
            const result = m.interpretStrokes(
              body.strokes as Parameters<typeof m.interpretStrokes>[0],
              body.snapshot,
              body.mode ?? 'gesture',
              body.overrides,
            )
            sendJson(res, 200, { ok: true, result })
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
            let runCp: { sha: string } | null = null
            const exec = async () => {
              try {
                const m0 = await import('@s2c/pipeline')
                runCp = m0.checkpoint(root, allowDirty)
              } catch { /* pipeline missing */ }
              if (engine === 'model' && body.rawInterpretation && body.mode !== 'screenshot') {
                const m = await import('@s2c/pipeline')
                return m.runV2(
                  {
                    strokes: body.strokes as Parameters<typeof m.interpretV2>[0],
                    snapshot: body.snapshot,
                    rawInterpretation: body.rawInterpretation as Parameters<typeof m.runV2>[0]['rawInterpretation'],
                    mode: body.mode === 'design' ? 'design' : 'gesture',
                  },
                  ctx,
                )
              }
              return runHandler!(body, ctx)
            }
            // Promise.resolve().then() so a synchronously-throwing handler
            // still flows into .catch/.finally
            Promise.race([Promise.resolve().then(exec), deadline])
              .then((result) => {
                if (runCp) undoStack.push({ sha: runCp.sha, label: 'sketch run' })
                sse.send('done', { summary: result.summary, clientId })
              })
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

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { DomSnapshot } from '@s2c/dom'
import { createIdeBridge, rejectNonEditor, rejectNonLocal } from './ide-bridge.js'
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
  /** Resemblance slider + per-aspect locks; validated in the pipeline. */
  fidelity?: unknown
  /** Notes typed while sketching, each anchored to an element/strokes/the run. */
  notes?: unknown
  /** Independent attempts to generate and score; the best one is kept. */
  candidates?: number
  /** Component the instant render already mounted, for codegen to refine. */
  instant?: string | null
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

      /**
       * The editor bridge: click an element → the line opens in the editor;
       * move the editor's cursor → the matching element highlights. Both
       * directions are exact lookups, not guesses, because every JSX host
       * element carries its own data-s2c="file:line:col".
       *
       * Protocol and the per-endpoint security reasoning: ./ide-protocol.ts.
       * Cursor + status reach the browser over the EXISTING hub (`ide-cursor`,
       * `ide-status`), so the overlay needs no second EventSource.
       */
      const ide = createIdeBridge({ root, broadcast: (event, data) => sse.send(event, data) })
      server.httpServer?.on('close', () => ide.dispose())

      // Editor-facing stream. No token: it is minted per boot and handed out in
      // the overlay bundle, which an editor never fetches — see rejectNonEditor.
      server.middlewares.use('/@s2c/ide/events', (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'GET only' })
        if (rejectNonEditor(req, res)) return
        ide.handleEvents(req, res)
      })

      // Editor → browser. Same gate as the stream, plus JSON content-type.
      server.middlewares.use('/@s2c/ide/cursor', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        if (rejectNonEditor(req, res, { json: true })) return
        readJsonBody<unknown>(req, 4 * 1024)
          .then((body) => {
            const r = ide.cursor(body)
            sendJson(res, r.status, r.body)
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      // Browser → editor. The overlay has the token, so this gets the full gate
      // every other overlay POST gets: a reveal opens files on the developer's
      // machine, which is not something a page they merely visited may trigger.
      server.middlewares.use('/@s2c/ide/reveal', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<unknown>(req, 4 * 1024)
          .then((body) => {
            const r = ide.reveal(body)
            sendJson(res, r.status, r.body)
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      // Read-only, secret-free: local Host only, like the /@s2c/runs GETs.
      server.middlewares.use('/@s2c/ide/status', (req, res) => {
        if (rejectNonLocal(req, res)) return
        sendJson(res, 200, ide.status())
      })

      // Read-only run history: the page, the raw bundle files, and the two
      // JSON endpoints (/@s2c/runs.json, /@s2c/runs/<id>/settings.json).
      // Same gate as before for every one of them — these are GET routes a
      // browser reaches by navigation/img/fetch, so rejectUnauthorized's
      // token+content-type check (which a navigation can't satisfy) would make
      // the page unreachable. The guarantee that matters here is the same one
      // the old viewer had: local Host only, so a rebound host fails, and
      // cross-origin reads are blocked by the same-origin policy.
      const gateRuns = (req: IncomingMessage, res: ServerResponse): void => {
        const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
          return sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
        }
        runsViewer(root)(req, res)
      }
      // registered first: connect would otherwise route '/@s2c/runs.json' into
      // the '/@s2c/runs' mount with req.url stripped to '.json'
      server.middlewares.use('/@s2c/runs.json', gateRuns)
      server.middlewares.use('/@s2c/runs', gateRuns)

      /**
       * The instant render: strokes in, a real mounted component out, with no
       * model involved. Checkpointed and pushed onto the undo stack like any
       * other edit, because it writes source — the speed is the point, not a
       * reason to skip the safety the slow path gets.
       */
      server.middlewares.use('/@s2c/instant', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ strokes: unknown; snapshot: DomSnapshot; fidelity?: unknown }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const verdict = m.planInstant(
              body.strokes as Parameters<typeof m.planInstant>[0],
              body.snapshot,
              m.normalizeFidelity(body.fidelity),
            )
            if (!verdict.ok) return sendJson(res, 200, { ok: false, reason: verdict.reason })
            const cp = m.checkpoint(root, allowDirty)
            const result = m.applyInstant(root, verdict.plan)
            undoStack.push({ sha: cp.sha, label: `instant ${result.name}` })
            sendJson(res, 200, { ok: true, ...result, checkpoint: cp.sha })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, reason: String(err) }))
      })

      /**
       * Paint one shape. Canva mode moves and resizes elements; this reaches
       * inside generated artwork, where the only previous route to a colour
       * change was another model run. Deterministic, so it is checkpointed
       * and undoable like every other direct manipulation.
       */
      server.middlewares.use('/@s2c/paint', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc: string; prop: 'fill' | 'stroke'; value: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const cp = m.checkpoint(root, allowDirty)
            const result = m.paintShape(root, body)
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              undoStack.push({ sha: cp.sha, label: result.change })
            }
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Extract a component. The overlay circles a few elements; this moves
       * that contiguous run of siblings into its own file and leaves a call
       * site behind. Same treatment as every other write: token-gated,
       * checkpointed, pushed onto the undo stack.
       *
       * The refusals are the interesting half, and they travel VERBATIM — the
       * pipeline's messages ("those elements have others between them — select
       * a contiguous run") name the fix, so wrapping them in a generic
       * "extract failed" would throw away the only thing worth saying.
       */
      server.middlewares.use('/@s2c/extract', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLocs: string[]; name?: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const cp = m.checkpoint(root, allowDirty)
            const result = m.extractComponent(root, { srcLocs: body.srcLocs, name: body.name })
            if (result.ok) undoStack.push({ sha: cp.sha, label: `extract ${result.name ?? 'component'}` })
            sendJson(res, 200, { ...result, checkpoint: cp.sha })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Copy a value from the element that shows it to one that should.
       *
       * Deterministic, so it is checkpointed and undoable like every other
       * direct manipulation. The refusals matter more than the successes here
       * — they are the difference between "that name only exists inside this
       * list" and a plausible wrong value rendered silently — so they travel
       * to the overlay verbatim.
       */
      server.middlewares.use('/@s2c/data', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ from: string; to: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const cp = m.checkpoint(root, allowDirty)
            const result = m.moveData(root, { from: body.from, to: body.to })
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              undoStack.push({ sha: cp.sha, label: result.change })
            }
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Drawn rules. A sketch says "do this" and then disappears; a rule says
       * "this stays true" and keeps watching. Four steps, all deterministic
       * and all free: propose readings from a drawn line, save the one the
       * user meant, check them against the live page, forget one.
       *
       * Rules are not source edits — they live in .sketch2code/constraints.json
       * — so they are not checkpointed. Removing one is the undo.
       */
      server.middlewares.use('/@s2c/rules/propose', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ line: unknown; snapshot: DomSnapshot; under?: string[] }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const out = m.proposeConstraints(
              body.line as Parameters<typeof m.proposeConstraints>[0],
              body.snapshot,
              body.under,
            )
            sendJson(res, 200, { ok: out.proposals.length > 0, ...out })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/rules/add', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{
          kind: string; subjects: string[]; value?: number; tolerance?: number; note?: string
        }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const out = m.addConstraint(root, {
              kind: body.kind as Parameters<typeof m.addConstraint>[1]['kind'],
              subjects: body.subjects,
              value: body.value,
              tolerance: body.tolerance ?? 0,
              note: body.note,
            })
            sendJson(res, 200, out)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/rules/delete', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ id: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, m.removeConstraint(root, body.id))
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/rules/check', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ snapshot: DomSnapshot }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, { ok: true, rules: m.checkConstraints(root, body.snapshot) })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
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
          exactX?: boolean; exactY?: boolean; exactW?: boolean; exactH?: boolean
          anchorX?: 'left' | 'right'; anchorY?: 'top' | 'bottom'; startW?: number; startH?: number
          instanceIndex?: number; instanceCount?: number; choice?: 'all' | 'just-this-one'
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
              exactX: body.exactX,
              exactY: body.exactY,
              exactW: body.exactW,
              exactH: body.exactH,
              anchorX: body.anchorX,
              anchorY: body.anchorY,
              startW: body.startW,
              startH: body.startH,
              instanceIndex: body.instanceIndex,
              instanceCount: body.instanceCount,
              choice: body.choice,
            })
            if (result.ok && !(result.change ?? '').startsWith('no change')) {
              undoStack.push({ sha: cp.sha, label: result.change ?? 'edit' })
            }
            // shared templates answer 409 (choose a scope), other refusals 422
            sendJson(res, result.ok ? 200 : result.shared ? 409 : 422, { ...result, checkpoint: cp.sha })
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
              // revertTouched, not changedFiles+restore: an edit that CREATED
              // a file (an extract, the instant render) leaves that file
              // untracked, so a diff never sees it and undo used to put the
              // call site back while orphaning the component it referenced
              const files = m.revertTouched(root, cp)
              if (files.length === 0) continue // that edit was already reverted
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
                body.notes as Parameters<typeof m.interpretV2>[4],
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
                    // passed through unvalidated on purpose — the pipeline
                    // normalizes it, so the client can't widen its own licence
                    fidelity: body.fidelity,
                    notes: body.notes as Parameters<typeof m.runV2>[0]['notes'],
                    candidates: body.candidates,
                    instant: body.instant,
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
export { createIdeBridge, rejectNonEditor, rejectNonLocal } from './ide-bridge.js'
export type { IdeBridge, EditorSink } from './ide-bridge.js'
export * from './ide-protocol.js'

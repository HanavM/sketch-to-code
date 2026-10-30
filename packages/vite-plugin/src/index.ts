import { markInterruptedRuns } from './interrupted-runs.js'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import type { DomSnapshot } from '@s2c/dom'
import type { ProbeObservation, ProbeSpec, ProbeVerdict } from '@s2c/pipeline'
import { createIdeBridge, rejectNonEditor, rejectNonLocal } from './ide-bridge.js'
import { stampJsxSource } from './jsx-source.js'
import { createSseHub, readJsonBody, rejectUnauthorized, sendJson, type SseHub } from './middleware.js'
import { bundleOverlayClient, overlayFailedScript } from './overlay-bundle.js'
import { findRootRoute, isReactRouterFramework, OVERLAY_LOADER } from './framework-entry.js'
import { runsViewer } from './runs-viewer.js'
import { superviseRun } from './run-supervisor.js'
import { editLabel, loadUndo, MAX_UNDO, runUndoLabel, saveUndo, type UndoEntry } from './undo-store.js'
import { createReadingStore, isReadingId, type ReadingReply } from './readings.js'

/** A file under the app's `server/data/`, where generated routes keep records. */
export function isDataStoreFile(root: string, file: string): boolean {
  const rel = relative(root, file).replace(/\\/g, '/')
  return rel.startsWith('server/data/')
}

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
  /**
   * Answer a sketch that is only delete scribbles, each confined to one
   * element, without asking the model (s2c-049): the reading prompt's own rule
   * already decides it. Default true. Turn it off to measure the model on
   * those pages.
   */
  plainReadings?: boolean
  /**
   * The instant render — scaffolding a drawn shape into a real mounted
   * component the moment Run is pressed, before the reading comes back.
   * Default true.
   *
   * Turn it off when a speculative source write at Run would be in the way.
   * One case is measurement: it writes and mounts a component, which makes vite
   * full-reload, and a reload takes the in-flight reading down with the page it
   * was requested from. A benchmark trying to time the reading cannot do it with
   * this on. The race is real for users too, and this option is a workaround for
   * it rather than a fix — see docs/findings.md.
   */
  instant?: boolean
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
    /**
     * Aborted by the run cap or Esc. Reject soon after, and write nothing once
     * it fires: the undo entry is taken and the slot freed only after the
     * returned promise settles (run-supervisor.ts).
     */
    signal: AbortSignal
  },
) => Promise<{ summary: string; explanation?: unknown }>

let runHandler: RunHandler | null = null
export function setRunHandler(h: RunHandler): void {
  runHandler = h
}

/**
 * Test seam for /@s2c/interpret (s2c-002), like setRunHandler: replaces the
 * reading itself (dirt check + model call) so tests never reach a model.
 */
export type ReadingHandler = (req: RunRequest) => Promise<ReadingReply>
let readingHandler: ReadingHandler | null = null
export function setReadingHandler(h: ReadingHandler | null): void {
  readingHandler = h
}

// Module scope on purpose: a vite config-reload re-instantiates the plugin,
// and a closure-scoped flag would let a fresh instance accept a second run
// while an orphaned pipeline is still editing files.
let activeRun = false
/** Stops the active run (run-supervisor.ts); null when none is running. */
let stopActiveRun: ((reason: string) => boolean) | null = null
/** The tab that started the active run, and the last stage it was told. */
let activeRunTab: string | null = null
let activeRunStage: { stage: string; detail?: string } | null = null
// undo stack: checkpoint SHAs of committed edits, most recent last. Mirrored
// to .sketch2code/undo.json so a dev-server restart doesn't empty it.
const undoStack: UndoEntry[] = []
/** The root undoStack was loaded from; saves go back to the same place. */
let undoRoot: string | null = null
const persistUndo = (): void => {
  if (undoRoot) saveUndo(undoRoot, undoStack)
}
/**
 * The last edit THIS server wrote, and when.
 *
 * The visual history's file watcher sees our own writes and the user's editor
 * saves as the same event, and the labels have to differ ("+ ml-4" versus
 * "edited by hand · Navbar.tsx"). Every write already pushes an undo entry, so
 * that is the one place that knows — which is why pushes go through pushEdit
 * rather than touching this. Doing it per-handler missed most of them.
 */
let lastWrite = { label: '', at: 0 }
/**
 * `untracked` is what git was not tracking when the checkpoint was taken.
 *
 * Undo needs it to know which files are ITS to delete: a checkpoint records
 * tracked state only, so a component an EARLIER edit created looks exactly like
 * one this edit created, and undoing a later edit would delete it. Extract a
 * component, do anything else, press undo once — gone. beginEdit captures it at
 * the only moment it is true.
 *
 * `after` is the same list one moment LATER, and it draws the other boundary:
 * anything untracked that shows up after this returns was not written by this
 * edit, so undo must leave it alone. That is not a hypothetical — a form made
 * real starts saving submissions into server/data/, and undoing the code change
 * was deleting the records people had typed in since. An undo reverses an edit;
 * it does not get to throw away data that arrived afterwards.
 */
const pushEdit = (sha: string, label: string, untracked: string[] = []): void => {
  // taken here rather than passed in by each endpoint: pushEdit is called at
  // exactly the moment "the edit has finished" is true, and an invariant that
  // every future endpoint has to remember to pass along is one that will be
  // forgotten by the next one
  undoStack.push({ sha, label, untracked, after: snapshotUntracked(), touched: snapshotTouched(sha, untracked) })
  if (undoStack.length > MAX_UNDO) undoStack.splice(0, undoStack.length - MAX_UNDO)
  persistUndo()
  lastWrite = { label, at: Date.now() }
  // the whole tree is now as sketch2code left it, so the NEXT edit may start
  // on it without a commit (safety.ts dirtReason). Without this every second
  // change in an init'd project was refused.
  recordOwned()
}
/** Assigned once the server knows its root; see safety.ts recordOwnedState. */
let recordOwned: () => void = () => {}
/**
 * Assigned once the server knows its root; see pushEdit's `after`.
 *
 * Returns null for "could not tell", which undo reads as a reason to spare
 * nothing extra rather than as an empty set — an empty set would mean "every
 * untracked file appeared after this edit", which would spare all of them and
 * quietly turn undo into a no-op.
 */
let snapshotUntracked: () => string[] | null = () => null
/**
 * Assigned once the server knows its root; see UndoEntry.touched. The files
 * that differ from the checkpoint right now, minus what was already lying there
 * untracked. Null for "could not tell", which undo reads as "revert as before".
 */
let snapshotTouched: (sha: string, untracked: string[]) => string[] | null = () => null
/**
 * The pipeline module, cached by beginEdit.
 *
 * pushEdit is synchronous — every caller uses it as a statement — and the only
 * thing it needs from the pipeline is one git read. Every edit calls beginEdit
 * first, so by the time anything is pushed this is set.
 */
let pipelineForSnapshot: typeof import('@s2c/pipeline') | null = null

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
  const instant = options.instant ?? true
  const plainReadings = options.plainReadings ?? true
  let root = process.cwd()
  // s2c-043: React Router framework mode has no index.html; the overlay loads
  // from this module instead (framework-entry.ts)
  let frameworkRoot: string | null = null

  // s2c-038: a page that reloads mid-run (the run wrote a new module) comes
  // back in its resting state, saying "drag to draw" while the run is still
  // writing. Its stream tells it the run is still going, and how far it got.
  //
  // s2c-040: and any snapshot the run is still waiting for is asked again.
  // A request sent a moment before the reload reached the page that was
  // about to die, so nobody answered it and the run failed 15 s later with
  // "browser snapshot timed out" (a navigate writes main.tsx, so its reload
  // races a fast codegen write). If the old page did answer, the request is
  // gone from the map and nothing is re-sent; a late double answer is dropped.
  const sse: SseHub = createSseHub(Date.now, (tab) =>
    activeRun && tab != null && tab === activeRunTab
      ? [
          { event: 'running', data: { ...(activeRunStage ?? {}), clientId: tab } },
          ...[...pendingSnapshots.keys()].map((runId) => ({ event: 'resnapshot', data: { runId, clientId: tab } })),
        ]
      : [],
  )
  const pendingSnapshots = new Map<string, (snap: DomSnapshot) => void>()
  const pendingProbes = new Map<string, (obs: ProbeObservation) => void>()

  /**
   * Run behaviour probes in the originating tab, one at a time, with the data
   * store guarded: whatever a test submit writes under server/data/ is put
   * back byte for byte before the verdict is returned. A trigger whose
   * component reaches off the dev server is never clicked (probe.ts).
   */
  const runProbes = async (specs: ProbeSpec[], clientId: string | null): Promise<ProbeVerdict[]> => {
    const m = await import('@s2c/pipeline')
    const verdicts: ProbeVerdict[] = []
    for (const spec of specs) {
      let src = ''
      try { src = readFileSync(join(root, spec.trigger.srcLoc.replace(/:\d+:\d+$/, '')), 'utf8') } catch { /* unreadable: judged by the page */ }
      const unsafe = m.unsafeReason(src)
      if (unsafe) {
        verdicts.push({ actionIndex: spec.actionIndex, status: 'unverified', reason: `couldn't test it: ${unsafe}` })
        continue
      }
      const { value: obs, data } = await m.guardData(root, () => new Promise<ProbeObservation>((resolve) => {
        const probeId = randomUUID()
        const timer = setTimeout(() => {
          pendingProbes.delete(probeId)
          resolve({ ran: false, error: 'the page did not answer the test (is the tab still open?)', requests: [], before: '', after: '', ms: 15_000 })
        }, 15_000)
        pendingProbes.set(probeId, (o) => { clearTimeout(timer); resolve(o) })
        sse.send('probe', { probeId, spec, clientId })
      }))
      verdicts.push(m.judgeProbe(spec, obs, data))
    }
    return verdicts
  }
  // per-boot token embedded in the overlay bundle; required on state-changing POSTs
  const token = randomUUID()

  return {
    name: 'sketch2code',
    apply: 'serve',
    enforce: 'pre',
    // s2c-047: doctor and init build the overlay through this, so a drawing
    // layer that can't be built is caught before anyone opens the page
    api: { bundleOverlay: () => bundleOverlayClient().then((src) => src.length) },

    configResolved(config) {
      root = config.root
      frameworkRoot = isReactRouterFramework((config.plugins ?? []).map((p) => p.name)) ? findRootRoute(root) : null
      if (undoRoot !== root) {
        // a restarted server picks up where the last one left off; undo
        // skips entries with nothing left to revert, so stale ones are harmless
        undoStack.splice(0, undoStack.length, ...loadUndo(root))
        undoRoot = root
      }
      recordOwned = () => {
        try { pipelineForSnapshot?.recordOwnedState(root) } catch { /* best-effort */ }
      }
      snapshotUntracked = () => {
        try {
          // a dynamic import would make this async and pushEdit is not; the
          // module is already loaded by the time any edit has been made
          return pipelineForSnapshot?.untrackedFiles(root) ?? null
        } catch { return null /* not a git repo */ }
      }
      snapshotTouched = (sha, untracked) => {
        try {
          const all = pipelineForSnapshot?.touchedFiles(root, { sha, toplevel: root, dirtyBefore: true })
          return all ? all.filter((rel) => !untracked.includes(rel)) : null
        } catch { return null }
      }
    },

    transform(code, id, opts) {
      const clean = id.split('?')[0]!
      // the root route's own client module (not a ?route-chunk split of it)
      const loadOverlay = frameworkRoot !== null && id === frameworkRoot && opts?.ssr !== true
      if (!exts.some((e) => clean.endsWith(e))) return loadOverlay ? { code: code + OVERLAY_LOADER, map: null } : null
      if (clean.includes('/node_modules/')) return null
      const rel = relative(root, clean)
      if (rel.startsWith('..')) return null
      const res = stampJsxSource(code, rel)
      if (!res) return loadOverlay ? { code: code + OVERLAY_LOADER, map: null } : null
      // appended after the stamped code, so the map's lines are unchanged
      return { code: loadOverlay ? res.code + OVERLAY_LOADER : res.code, map: res.map }
    },

    /**
     * The data store is data, not source: never hot-reload the page for it.
     *
     * Found by the first behaviour probe (s2c-021). Tailwind v4 scans every
     * project file for class names, so `server/data/*.json` joins the client
     * module graph, and each write to it full-reloaded the page: every submit
     * of a form made real here reloaded the app, wiping the "Saved" line the
     * user was meant to read and whatever else they had on screen. The route
     * reads the file fresh on each request, so nothing needs to reload.
     */
    handleHotUpdate(ctx) {
      if (isDataStoreFile(root, ctx.file)) return []
      return undefined
    },
    // Vite 6+: the per-environment hook, which (unlike handleHotUpdate) also
    // sees a file being created or deleted — and restoring the store after a
    // probe deletes one
    hotUpdate(opts) {
      if (isDataStoreFile(root, opts.file)) return []
      return undefined
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
      // s2c-002: readings in flight or just finished, by the overlay's id
      const readings = createReadingStore()
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

      // n115: runs cut short by a dev server that stopped mid-run get their record now
      const interruptedRuns = markInterruptedRuns(root)
      if (interruptedRuns.length) {
        server.config.logger.warn(`[s2c] ${String(interruptedRuns.length)} run(s) were cut short when the dev server stopped; the page on disk was kept as they left it`)
      }

      server.middlewares.use('/@s2c/ping', (_req, res) => {
        sendJson(res, 200, { ok: true, root, allowDirty, engine, hasPipeline: runHandler !== null, interruptedRuns })
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
            res.end(overlayFailedScript(String(err)))
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
        // declining is a first-class answer here: the client treats it exactly
        // like the server judging the sketch too ambiguous to scaffold, and the
        // interpreted path runs either way
        if (!instant) return sendJson(res, 200, { ok: false, reason: 'the instant render is turned off' })
        readJsonBody<{ strokes: unknown; snapshot: DomSnapshot; fidelity?: unknown }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const verdict = m.planInstant(
              body.strokes as Parameters<typeof m.planInstant>[0],
              body.snapshot,
              m.normalizeFidelity(body.fidelity),
            )
            if (!verdict.ok) return sendJson(res, 200, { ok: false, reason: verdict.reason })
            const { cp, untracked } = beginEdit(m)
            const result = m.applyInstant(root, verdict.plan)
            pushEdit(cp.sha, editLabel('instant', { name: result.name }), untracked)
            // a shape drawn onto the page is a component now, so it is filed
            // the same way an extract is; the overlay adds the picture, which
            // it can do here because this edit hot-reloads rather than navigates
            if (result.file) {
              captureInto(m, {
                file: result.file, kind: 'drawn', name: result.name, strokes: body.strokes,
              })
            }
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
            const { cp, untracked } = beginEdit(m)
            const result = m.paintShape(root, body)
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              pushEdit(cp.sha, editLabel('paint'), untracked)
            }
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Put a dropped or pasted picture into a placeholder box. Deterministic
       * and zero-token, so it is checkpointed and undoable like every other
       * direct manipulation. The copied file is new and untracked, so the
       * ordinary undo deletes it; a reused (identical) file was already there
       * and is left alone. Refusals travel verbatim: they say what to do.
       */
      server.middlewares.use('/@s2c/place-image', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc: string; name?: string; data: string }>(req, 8 * 1024 * 1024)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.placeImage(root, body)
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              pushEdit(cp.sha, editLabel('image'), untracked)
            }
            sendJson(res, result.ok ? 200 : 422, result)
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
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
            const { cp, untracked } = beginEdit(m)
            const result = m.extractComponent(root, { srcLocs: body.srcLocs, name: body.name })
            if (result.ok) pushEdit(cp.sha, editLabel('extract', { name: result.name }), untracked)
            // Filed here rather than by the overlay: a successful extract
            // reloads the page, and a capture started in the browser loses its
            // JS context mid-flight. The picture comes later, from the panel's
            // backfill — the row existing is what matters now.
            if (result.ok && result.file) {
              captureInto(m, { file: result.file, name: result.name, kind: 'extracted' })
            }
            sendJson(res, 200, { ...result, checkpoint: cp.sha })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * One way in, for both the overlay's captures and the run's own.
       *
       * The props a component declares are read off its types rather than sent
       * by the client: the panel should say what an entry needs even when the
       * thing that filed it never looked.
       */
      type Pipeline = typeof import('@s2c/pipeline')
      /**
       * Start an edit: the checkpoint, plus the untracked files that were
       * already here. Both are only true BEFORE the edit runs, which is why
       * they are taken together rather than separately at each call site.
       */
      const beginEdit = (m: Pipeline): {
        cp: ReturnType<Pipeline['checkpoint']>
        untracked: string[]
      } => {
        pipelineForSnapshot = m
        const cp = m.checkpoint(root, allowDirty)
        let untracked: string[] = []
        try {
          untracked = m.untrackedFiles(root)
        } catch { /* not a git repo: there is nothing to spare */ }
        return { cp, untracked }
      }
      const captureInto = (
        m: Pipeline,
        req: {
          file: string; exportName?: string; name?: string
          kind?: 'drawn' | 'extracted' | 'scanned'
          thumbnail?: string; signature?: number[]; aspect?: number
          defaults?: Record<string, string>
          /** Strokes that produced it — a drawn entry's truest shape. */
          strokes?: unknown
          /** Outlines of the rendered boxes, for one that was never drawn. */
          outlines?: { x: number; y: number }[][]
        },
      ): ReturnType<Pipeline['captureEntry']> => {
        /**
         * The shape the library will be searched by.
         *
         * Ink first and by a distance: the strokes are what the user meant,
         * where the generated source is only what came out. Outlines from the
         * page come second, and they are the only option for something never
         * drawn — an extracted card has no ink, and a component of plain divs
         * has no SVG geometry for the source reader to find either, so without
         * them it could never be found by drawing at all.
         */
        let shape: { signature?: number[]; aspect?: number } = {
          signature: req.signature, aspect: req.aspect,
        }
        if (!shape.signature) {
          try {
            const sig = req.strokes
              ? m.shapeFromStrokes(req.strokes as Parameters<Pipeline['shapeFromStrokes']>[0])
              : req.outlines?.length
                ? m.shapeSignature(req.outlines)
                : null
            if (sig) shape = { signature: sig.grid, aspect: sig.aspect }
          } catch { /* a shapeless entry is still an entry */ }
        }
        // a stamp of something the file actually renders: line 1 is an import,
        // and readComponentProps is addressed by element, not by file
        const stamp = m.firstJsxStamp(root, req.file)
        const read = stamp
          ? m.readComponentProps(root, stamp)
          : { ok: false as const }
        const site = read.ok ? (read.callSites ?? [])[0] : undefined
        return m.captureEntry(root, {
          file: req.file,
          exportName: req.exportName,
          name: req.name ?? read.component,
          kind: req.kind ?? 'drawn',
          thumbnail: req.thumbnail,
          signature: shape.signature,
          aspect: shape.aspect,
          // the values it was actually used with beat anything invented later
          defaults: req.defaults ?? site?.values,
          props: read.ok
            ? (read.props ?? []).map((p) => ({
                name: p.name,
                kind: p.kind,
                options: p.options,
                required: p.required,
              }))
            : undefined,
        })
      }

      /**
       * Make the data behind a rendered list real.
       *
       * An ordinary source edit, so it is checkpointed and undoable like every
       * other one — which matters more here than usual: this writes three files
       * and rewrites a component, and the only acceptable version of that is
       * one Ctrl+Z can take back.
       */
      /**
       * Create the endpoint the page asked for and nothing answered.
       *
       * The overlay knows the URL and that the reply was HTML, which is all this
       * needs — see stub.ts for why that combination, rather than a 404, is the
       * thing worth recognising.
       */
      server.middlewares.use('/@s2c/api/stub', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ path: string; kind?: 'list' | 'object' }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.stubRoute(root, { path: body.path, kind: body.kind })
            if (result.ok) pushEdit(cp.sha, editLabel('endpoint'), untracked)
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * The other half: a form that looks finished and throws everything away
       * becomes one that keeps what people type. Mechanical for the same reason
       * promote is — the form's own fields are the record's shape — so it is an
       * AST edit and costs nothing.
       */
      server.middlewares.use('/@s2c/api/form', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc: string; name?: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.makeFormReal(root, { srcLoc: body.srcLoc, name: body.name })
            if (result.ok) pushEdit(cp.sha, editLabel('form'), untracked)
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/api/promote', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc: string; name?: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.promoteToApi(root, { srcLoc: body.srcLoc, name: body.name })
            if (result.ok) pushEdit(cp.sha, editLabel('data-real'), untracked)
            sendJson(res, 200, result)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Serve the project's own `server/api/*` during development.
       *
       * This is the cheap half of making backend work reachable from the page,
       * and it is cheap because of an accident worth naming: this tool already
       * IS a dev server. A route generated from the page can therefore answer a
       * request immediately — no framework to install, no config, no second
       * process — which is the difference between "here is a file, go wire it
       * up" and a page that simply starts fetching its own data.
       *
       * The file is a plain module, not a framework's route: it exports a GET
       * handler and its data, so the same file can later be mounted in Express,
       * a Next route, or anything else. Loaded through Vite's own module
       * pipeline so it can be TypeScript and can import from the project.
       *
       * The boundary, stated because it would otherwise be a trap: this serves
       * in DEV ONLY. Nothing here deploys anything, and a production server is
       * still the project's own business.
       */
      server.middlewares.use('/api', (req, res, next) => {
        const path = (req.url ?? '/').split('?')[0] ?? '/'
        const name = path.replace(/^\//, '').replace(/\/$/, '')
        // one flat segment, and a conservative charset: this becomes a file path
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return next()
        const file = join(root, 'server', 'api', `${name}.ts`)
        if (!existsSync(file)) return next() // the app's own handler, or a 404
        void (async () => {
          try {
            const mod = await server.ssrLoadModule(file) as Record<string, unknown>
            const method = (req.method ?? 'GET').toUpperCase()
            const handler = mod[method] ?? mod.default
            if (typeof handler !== 'function' && mod.data === undefined) {
              // A server/api directory that belongs to some OTHER framework:
              // its files will not export our shape, and answering anyway would
              // shadow routes the project already has. Let it through instead.
              return next()
            }
            // A write handler wants the record, not a stream to drain — so the
            // body is parsed here and passed as the second argument. It stays a
            // second argument rather than replacing `req` so the same file can
            // be mounted anywhere: in Express this is `POST(req, req.body)`.
            // GET and HEAD have no body to wait for, and waiting on 'end' for
            // one that is never coming would hang the request.
            const sent = await (async () => {
              if (method === 'GET' || method === 'HEAD') return undefined
              try {
                return await readJsonBody<unknown>(req, 1024 * 1024)
              } catch {
                // no body, or not JSON: the handler decides whether it needed one
                return undefined
              }
            })()
            const body = typeof handler === 'function'
              ? await (handler as (r: IncomingMessage, b: unknown) => unknown)(req, sent)
              : mod.data
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify(body))
          } catch (err) {
            // the route's own error, not ours — say which file threw
            sendJson(res, 500, {
              ok: false,
              error: `server/api/${name}.ts threw: ${err instanceof Error ? err.message : String(err)}`,
            })
          }
        })()
      })

      /**
       * The element library.
       *
       * An entry is a pointer to a component that already compiles here, so
       * placing one is an import and a JSX insert — checkpointed and undoable
       * like every other edit — rather than a paste. Listing and thumbnails
       * are read-only and free.
       */
      server.middlewares.use('/@s2c/library/list', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, { ok: true, entries: m.listEntries(root) })
          } catch (err) {
            sendJson(res, 200, { ok: false, error: String(err) })
          }
        })()
      })

      server.middlewares.use('/@s2c/library/capture', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{
          file: string; exportName?: string; name?: string
          kind?: 'drawn' | 'extracted' | 'scanned'
          thumbnail?: string; signature?: number[]; aspect?: number
          defaults?: Record<string, string>
          outlines?: { x: number; y: number }[][]
        }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, captureInto(m, body))
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * Place an entry where the user dropped it. `at` is an ordinary stamp, so
       * the overlay does not have to know whether the entry's file is already
       * in this project — placeEntry materialises a portable one first.
       */
      /**
       * Search the library by drawing at it.
       *
       * The strokes go over the wire rather than a signature computed in the
       * page: the measurement that decides what matches is the same one that
       * scores a generated depiction against the ink that asked for it, and
       * having two implementations of it would mean two answers.
       */
      server.middlewares.use('/@s2c/library/search', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ strokes: unknown }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const sig = m.shapeFromStrokes(
              body.strokes as Parameters<typeof m.shapeFromStrokes>[0],
            )
            if (!sig) {
              return sendJson(res, 200, {
                ok: false,
                error: 'that sketch has no shape to match — draw a rough outline of the thing you want.',
              })
            }
            const hits = m.searchLibrary(root, { signature: sig.grid })
            sendJson(res, 200, {
              ok: true,
              matches: hits.map((h) => ({ ...h.entry, score: h.score })),
            })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/library/place', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ id: string; at: string; where?: 'inside' | 'after' }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const entry = m.findEntry(root, body.id)
            if (!entry) {
              return sendJson(res, 200, {
                ok: false,
                error: 'that entry is not in the library any more — open the panel again.',
              })
            }
            const { cp, untracked } = beginEdit(m)
            const out = m.placeEntry(root, { entry, at: body.at, where: body.where })
            if (out.ok) {
              m.bumpUsed(root, body.id)
              pushEdit(cp.sha, editLabel('place', { name: out.name ?? entry.name }), untracked)
            }
            sendJson(res, 200, out)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/library/forget', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ id: string; home?: 'project' | 'global' }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, m.removeEntry(root, body.id, { home: body.home }))
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * An entry's picture. A GET under the same gate as the timeline's
       * thumbnails and the runs viewer's images: an <img src> can send neither
       * a token header nor a JSON content-type.
       */
      server.middlewares.use('/@s2c/library/thumb', (req, res) => {
        const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
          return sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
        }
        const q = new URL(req.url ?? '/', 'http://x').searchParams
        const id = q.get('id') ?? ''
        const global = q.get('home') === 'global'
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
          return sendJson(res, 400, { ok: false, error: 'bad entry id' })
        }
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            const { readFile } = await import('node:fs/promises')
            const dir = global ? m.globalLibraryDir() : m.libraryDir(root)
            const png = await readFile(m.entryThumbPath(dir, id))
            res.writeHead(200, {
              'content-type': 'image/png',
              'cache-control': 'no-cache',
              'content-length': String(png.byteLength),
            })
            res.end(png)
          } catch {
            sendJson(res, 404, { ok: false, error: 'no picture for that entry' })
          }
        })()
      })

      /**
       * Visual history.
       *
       * The trigger is the file watcher rather than the gesture handlers,
       * because it is the one place that sees BOTH kinds of change: an edit
       * this overlay wrote, and an edit the user made by hand in their editor.
       * The second is the whole reason this feature exists — git only notices
       * it when somebody remembers to commit — and no gesture handler will
       * ever fire for it.
       *
       * The server cannot make the thumbnail (it has no page), so it asks:
       * the watcher pushes an event, the browser draws its own picture and
       * posts it back. recordVersion drops the duplicate when nothing actually
       * changed, which is what makes a chatty watcher safe.
       */
      let historyTimer: ReturnType<typeof setTimeout> | null = null
      const labelFor = (file: string): string => {
        // a change landing right after one of our own writes is that write;
        // anything else is someone typing in their editor, which deserves to
        // be labelled as what it is rather than as "a change"
        if (lastWrite.label && Date.now() - lastWrite.at < 2500) return lastWrite.label
        return `edited by hand · ${file}`
      }
      server.watcher.on('change', (file: string) => {
        const rel = relative(root, file)
        // its own history directory must never trigger a recording of itself
        if (rel.startsWith('..') || rel.includes('.sketch2code')) return
        if (!/\.(tsx?|jsx?|css)$/.test(rel)) return
        if (historyTimer) clearTimeout(historyTimer)
        const label = labelFor(rel)
        historyTimer = setTimeout(() => {
          historyTimer = null
          // the browser answers this by posting a thumbnail to /history/record
          sse.send('history-due', { label })
        }, 450)
      })

      server.middlewares.use('/@s2c/history/record', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ label: string; thumbnail?: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, m.recordVersion(root, body))
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * One thumbnail, as an image.
       *
       * A GET, and gated the way the runs viewer's images are: an <img src>
       * cannot send a token header or a JSON content-type, so demanding them
       * would make every picture on the timeline a broken icon. Local Host
       * only, and the id is validated rather than pasted into a path — the
       * whole request is a filename the page hands back to us.
       */
      server.middlewares.use('/@s2c/history/thumb', (req, res) => {
        const host = String(req.headers.host ?? '').replace(/:\d+$/, '')
        if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
          return sendJson(res, 403, { ok: false, error: 'non-local host rejected' })
        }
        const id = new URL(req.url ?? '/', 'http://x').searchParams.get('id') ?? ''
        if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
          return sendJson(res, 400, { ok: false, error: 'bad thumbnail id' })
        }
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            const { readFile } = await import('node:fs/promises')
            const png = await readFile(join(m.historyDir(root), `${id}.png`))
            res.writeHead(200, {
              'content-type': 'image/png',
              // the file for an id never changes, but an id can be pruned and
              // a stale cached image would outlive the moment it pictures
              'cache-control': 'no-cache',
              'content-length': String(png.byteLength),
            })
            res.end(png)
          } catch {
            sendJson(res, 404, { ok: false, error: 'no thumbnail for that moment' })
          }
        })()
      })

      server.middlewares.use('/@s2c/history/list', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, { ok: true, versions: m.listVersions(root) })
          } catch (err) {
            sendJson(res, 200, { ok: false, error: String(err) })
          }
        })()
      })

      /**
       * Scrub back to a version. The engine records the current state first,
       * so this is undoable by the same mechanism that got you here — and it
       * is pushed onto the undo stack too, so Ctrl+Z reaches it like any edit.
       */
      server.middlewares.use('/@s2c/history/restore', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ id: string; thumbnail?: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const out = m.restoreVersion(root, body.id, { thumbnail: body.thumbnail })
            if (out.ok) pushEdit(cp.sha, editLabel('restore'), untracked)
            sendJson(res, 200, out)
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      /**
       * The project's breakpoints, so the overlay can name the band a window
       * width falls in — and name where the numbers came from. Someone
       * demonstrating into a breakpoint deserves to know whether those are
       * their own screens or Tailwind's defaults.
       */
      // POST with no body, like every other gated endpoint here: the token
      // gate requires a JSON content-type, and a GET that fakes one to get
      // past its own guard is worse than a verb that reads slightly oddly.
      server.middlewares.use('/@s2c/screens', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        void (async () => {
          try {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, { ok: true, ...m.screensFor(root) })
          } catch (err) {
            sendJson(res, 200, { ok: false, error: String(err) })
          }
        })()
      })

      /**
       * The props panel's two halves: read a component's props out of its own
       * TypeScript types, and write one value at a chosen call site.
       *
       * Reading is free and side-effect-free, so it is not checkpointed;
       * writing is an ordinary source edit and is treated like every other one.
       */
      server.middlewares.use('/@s2c/props/read', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc: string }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            sendJson(res, 200, m.readComponentProps(root, body.srcLoc))
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/props/set', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ callSite: string; name: string; value: string | number | boolean }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.setPropValue(root, body)
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              pushEdit(cp.sha, editLabel('setting'), untracked)
            }
            sendJson(res, 200, result)
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
            const { cp, untracked } = beginEdit(m)
            const result = m.moveData(root, { from: body.from, to: body.to })
            if (result.ok && result.change && !result.change.startsWith('no change')) {
              pushEdit(cp.sha, editLabel('data-move'), untracked)
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

      /**
       * Test a behaviour now: `{ srcLoc }` of anything inside a form submits
       * it (the "does this form actually save?" question), or explicit specs.
       * Answers with plain-language verdicts; the data store is left exactly
       * as it was.
       */
      server.middlewares.use('/@s2c/probe', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ srcLoc?: string; specs?: ProbeSpec[]; clientId?: string }>(req)
          .then(async (body) => {
            const specs: ProbeSpec[] = body.specs ?? (body.srcLoc
              ? [{
                  actionIndex: -1, kind: 'submit', trigger: { srcLoc: body.srcLoc, label: 'the form' },
                  claim: 'submitting the form stores what was typed, and the page says so',
                }]
              : [])
            if (!specs.length) return sendJson(res, 400, { ok: false, error: 'nothing to test' })
            sendJson(res, 200, { ok: true, verdicts: await runProbes(specs, body.clientId ?? null) })
          })
          .catch((err: unknown) => sendJson(res, 200, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/probe-result', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ probeId: string; observation: ProbeObservation }>(req)
          .then((body) => {
            pendingProbes.get(body.probeId)?.(body.observation)
            pendingProbes.delete(body.probeId)
            sendJson(res, 200, { ok: true })
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
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
          /** Viewport width, present only while demonstrating responsively. */
          width?: number
        }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
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
            /**
             * Responsive by demonstration.
             *
             * The manipulation itself decides WHICH utility the gesture means
             * — px snapped to the Tailwind scale, anchored resizes that write
             * two classes — and only it can. So rather than reimplement that,
             * this lets the ordinary edit happen, reads back the utilities it
             * added, undoes it, and writes them again at the demonstrated
             * band. Two writes for one gesture, and both through code that is
             * already tested, which is the trade being made here.
             *
             * All-or-nothing: if any utility cannot be banded, the whole
             * gesture goes back to the checkpoint and the refusal is returned.
             * Half a demonstration is worse than none — the user would be
             * looking at a layout that is right at this width and wrong at
             * every other, with nothing saying so.
             */
            if (result.ok && typeof body.width === 'number' && result.className) {
              const was = new Set(result.className.before.split(/\s+/).filter(Boolean))
              const added = result.className.after.split(/\s+/).filter((c) => c && !was.has(c))
              m.revertTouched(root, cp)
              const changes: string[] = []
              let band = ''
              for (const utility of added) {
                const r = m.applyResponsive(root, { srcLoc: body.srcLoc, utility, width: body.width })
                if (!r.ok) {
                  m.revertTouched(root, cp)
                  return sendJson(res, 422, { ok: false, error: r.error, responsive: true })
                }
                if (r.change) changes.push(r.change)
                band = r.band ?? band
              }
              if (changes.length === 0) {
                // nothing to band (a manipulation that only removed classes):
                // put the plain edit back rather than silently dropping it
                m.applyManipulation(root, {
                  srcLoc: body.srcLoc,
                  prop: body.prop as Parameters<typeof m.applyManipulation>[1]['prop'],
                  px: body.px, from: body.from, to: body.to, dx: body.dx, dy: body.dy,
                  inFlow: body.inFlow, w: body.w, h: body.h,
                  exactX: body.exactX, exactY: body.exactY, exactW: body.exactW, exactH: body.exactH,
                  anchorX: body.anchorX, anchorY: body.anchorY,
                  startW: body.startW, startH: body.startH,
                  instanceIndex: body.instanceIndex, instanceCount: body.instanceCount,
                  choice: body.choice,
                })
              }
              const change = changes.join(' · ')
              pushEdit(cp.sha, editLabel(change ? 'responsive' : 'manipulate', { prop: body.prop }), untracked)
              return sendJson(res, 200, {
                ...result, change: change || result.change, band, responsive: true, checkpoint: cp.sha,
              })
            }
            if (result.ok && !(result.change ?? '').startsWith('no change')) {
              pushEdit(cp.sha, editLabel('manipulate', { prop: body.prop }), untracked)
            }
            // shared templates answer 409 (choose a scope), other refusals 422
            sendJson(res, result.ok ? 200 : result.shared ? 409 : 422, { ...result, checkpoint: cp.sha })
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      // goal n10: a plain erase or recolour the page already showed at pen
      // lift, written by the deterministic engines with no model reading.
      // A refusal (422) writes nothing; the overlay then runs the model.
      server.middlewares.use('/@s2c/direct', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{
          kind: 'delete' | 'recolor' | 'insert'; srcLoc: string; instanceIndex?: number; snapshot: DomSnapshot
          color?: string; prop?: 'color' | 'backgroundColor'
          after?: string | null; before?: string | null; text?: string
        }>(req)
          .then(async (body) => {
            const m = await import('@s2c/pipeline')
            const { cp, untracked } = beginEdit(m)
            const result = m.applyDirectEdit(root, {
              kind: body.kind, srcLoc: body.srcLoc, instanceIndex: body.instanceIndex ?? 0,
              snapshot: body.snapshot, color: body.color, prop: body.prop,
              after: body.after, before: body.before, text: body.text,
            })
            if (result.ok && !(result.change ?? '').startsWith('no change')) {
              pushEdit(cp.sha, editLabel(body.kind === 'delete' ? 'erase' : body.kind === 'insert' ? 'instant' : 'paint'), untracked)
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
              // revertTouched, not changedFiles+restore: an edit that CREATED
              // a file (an extract, the instant render) leaves that file
              // untracked, so a diff never sees it and undo used to put the
              // call site back while orphaning the component it referenced.
              // entry.untracked is what was already lying there at the time,
              // which this revert must not touch — see pushEdit. Spared too:
              // anything untracked that has appeared SINCE the edit, which by
              // definition the edit did not write (the records a form made real
              // has been collecting, a cache, a log).
              let appeared: string[] = []
              try {
                const after = entry.after
                if (after) appeared = m.untrackedFiles(root).filter((rel) => !after.includes(rel))
              } catch { /* not a git repo: nothing to spare */ }
              let keep = [...entry.untracked, ...appeared]
              // only what THIS edit wrote: a file that differs from the
              // checkpoint for any other reason was changed by someone else
              // after it, and is not undo's to restore (s2c-026)
              const touched = entry.touched
              if (touched) keep = [...keep, ...m.wouldRevert(root, cp, keep).filter((rel) => !touched.includes(rel))]
              const pending = m.wouldRevert(root, cp, keep)
              if (pending.length === 0) continue // that edit was already reverted
              // a hand edit made AFTER the tool's edit, to a file this undo
              // restores, is in no checkpoint: the restore would silently
              // throw it away. Refuse in words and leave everything as it is,
              // entry included, so Ctrl+Z works once the user has saved it.
              const refusal = m.undoReason(root, pending)
              if (refusal) {
                undoStack.push(entry)
                persistUndo()
                return sendJson(res, 200, { ok: false, refused: true, error: refusal })
              }
              // only a tree that was the tool's before the undo is the tool's
              // after it: recording one that still carries a hand edit to an
              // UNtouched file would launder that edit, and the next sketch
              // would no longer be refused over it (safety.ts dirtReason)
              const wasOwned = m.handChanges(root).owned
              const files = m.revertTouched(root, cp, keep)
              if (files.length === 0) continue
              persistUndo()
              pipelineForSnapshot = m
              if (wasOwned) recordOwned() // an undone tree is the tool's doing too
              return sendJson(res, 200, { ok: true, undid: entry.label, files, sha: entry.sha })
            }
            persistUndo()
            sendJson(res, 200, { ok: true, undid: null })
          } catch (err) {
            sendJson(res, 500, { ok: false, error: String(err) })
          }
        })()
      })

      // s2c-002. Registered BEFORE '/@s2c/interpret' (connect matches by path
      // prefix, so the reading route would swallow this one). The page that
      // comes back after an instant-render reload collects the reading here,
      // by the id it parked before asking. POST + JSON for the same guard as
      // every other route: a reading names elements of the user's app.
      server.middlewares.use('/@s2c/interpret/result', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<{ readingId?: unknown; waitMs?: unknown }>(req)
          .then(async (body) => {
            if (!isReadingId(body.readingId)) return sendJson(res, 400, { ok: false, error: 'bad readingId' })
            const waitMs = typeof body.waitMs === 'number' ? Math.min(Math.max(body.waitMs, 0), 30_000) : 0
            const found = await readings.wait(body.readingId, waitMs)
            if (found.state === 'done') {
              const r = found.reply
              return sendJson(res, 200, { state: 'done', status: r.status, reply: r.body })
            }
            sendJson(res, 200, { state: found.state })
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      server.middlewares.use('/@s2c/interpret', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false })
        if (rejectUnauthorized(req, res, token)) return
        readJsonBody<RunRequest & { readingId?: unknown }>(req)
          .then(async (body) => {
            // s2c-056: a failed reading reached only the page's tooltip; the
            // terminal running the dev server now says why, too
            const work = readStrokes(body).catch((err: unknown) => {
              server.config.logger.warn(`[s2c] reading failed: ${err instanceof Error ? err.message : String(err)}`, { timestamp: true })
              throw err
            })
            // with an id, the reply is kept for the page that survives a reload
            // (s2c-002); the live request still gets it the usual way
            const reply = await (isReadingId(body.readingId) ? readings.begin(body.readingId, work) : work)
            // the requesting page may be gone by now: that is what readings is
            // for, and writing to a closed socket is harmless
            sendJson(res, reply.status, reply.body)
          })
          .catch((err: unknown) => sendJson(res, 400, { ok: false, error: String(err) }))
      })

      /** One reading of one sketch, as the HTTP reply it becomes. */
      async function readStrokes(body: RunRequest): Promise<ReadingReply> {
        if (readingHandler) return readingHandler(body)
        const m = await import('@s2c/pipeline')
        if (engine === 'model' && body.mode !== 'screenshot') {
          // Ask BEFORE paying for the read: an edit that checkpoint() will
          // refuse anyway must not cost a model call first.
          let refusal: string | null = null
          try { refusal = m.dirtReason(root, allowDirty) } catch { /* not a repo: the run says so */ }
          if (refusal) return { status: 200, body: { ok: false, refused: true, error: refusal } }
          const mode = body.mode === 'design' ? 'design' : 'gesture'
          if (plainReadings) {
            // s2c-049: a sketch the prompt's own rule decides costs no call
            let plain: ReturnType<typeof m.plainReading> | null = null
            try {
              plain = m.plainReading(
                body.strokes as Parameters<typeof m.plainReading>[0],
                body.snapshot,
                mode,
                (body.notes ?? []) as Parameters<typeof m.plainReading>[3],
              )
            } catch { /* odd input: the model reads it, as before */ }
            if (plain?.ok) {
              return {
                status: 200,
                body: { ok: true, v2: { interpretation: plain.interpretation, raw: plain.raw, tokens: plain.tokens, plain: plain.rule } },
              }
            }
          }
          const v2 = await m.interpretV2(
            body.strokes as Parameters<typeof m.interpretV2>[0],
            body.snapshot,
            undefined,
            body.mode === 'design' ? 'design' : 'gesture',
            body.notes as Parameters<typeof m.interpretV2>[4],
          )
          return { status: 200, body: { ok: true, v2: { interpretation: v2.interpretation, raw: v2.raw, tokens: v2.tokens } } }
        }
        const result = m.interpretStrokes(
          body.strokes as Parameters<typeof m.interpretStrokes>[0],
          body.snapshot,
          body.mode ?? 'gesture',
          body.overrides,
        )
        return { status: 200, body: { ok: true, result } }
      }

      // Registered BEFORE '/@s2c/run': connect matches mounts by path prefix,
      // so '/@s2c/run' would swallow this one.
      server.middlewares.use('/@s2c/run/abort', (req, res) => {
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' })
        if (rejectUnauthorized(req, res, token)) return
        // stopping: true means a run is now stopping and will end with the
        // usual error-event once the agent has exited; false, nothing to stop
        const stopping = stopActiveRun?.('stopped by you') ?? false
        sendJson(res, 200, { ok: true, stopping })
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
            activeRunTab = clientId
            activeRunStage = null
            const ctx = {
              root,
              allowDirty,
              emit: (event: string, data: unknown) => {
                if (event === 'stage') activeRunStage = data as { stage: string; detail?: string }
                sse.send(event, { ...(data as object), clientId })
              },
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
              requestProbes: (specs: ProbeSpec[]) => runProbes(specs, clientId),
            }
            let runCp: { sha: string; toplevel: string; dirtyBefore: boolean } | null = null
            /**
             * The untracked files that were already here.
             *
             * Needed to tell a file the run CREATED from one that was simply
             * lying around untracked: a checkpoint is a `git stash create`,
             * which records tracked state only, so both are absent from its
             * tree. Without this, filing what a run made would also file
             * somebody's scratch component.
             */
            let untrackedBefore: string[] = []
            const exec = async (signal: AbortSignal) => {
              try {
                const m0 = await import('@s2c/pipeline')
                runCp = m0.checkpoint(root, allowDirty)
                pipelineForSnapshot = m0
                untrackedBefore = m0.untrackedFiles(root)
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
                  { ...ctx, signal, deadline },
                )
              }
              return runHandler!(body, { ...ctx, signal })
            }
            const deadline = Date.now() + runTimeoutMs
            const run = superviseRun(exec, {
              timeoutMs: runTimeoutMs,
              // the overlay is still in its running state; say why it's waiting
              onStopping: (reason) => {
                activeRunStage = { stage: 'stopping', detail: `${reason}; waiting for the agent to exit` }
                sse.send('stage', { ...activeRunStage, clientId })
              },
            })
            stopActiveRun = run.stop
            // Everything below runs only after exec has RETURNED — never on the
            // deadline itself — so no write from this run can land after the
            // undo entry is taken, the user is told, or the slot is freed.
            run.settled
              .then((outcome) => {
                if (!outcome.ok) throw outcome.error
                return outcome.value
              })
              .then(async (result) => {
                if (runCp) pushEdit(runCp.sha, runUndoLabel((result as { explanation?: { problem?: boolean; sentence?: string } }).explanation), untrackedBefore)
                // A sketch that produced a new component files itself: that is
                // the library's whole premise, and the run is the main way a
                // drawing becomes code. Only CREATED files — a run that
                // recoloured Navbar must not file Navbar — and without a
                // picture, which only the page can draw; the panel backfills it.
                if (runCp) {
                  try {
                    const m = await import('@s2c/pipeline')
                    for (const rel of m.createdFiles(root, runCp, untrackedBefore)) {
                      if (!/\.(tsx|jsx)$/.test(rel)) continue
                      // the ink that asked for it, so it can be found later by
                      // drawing roughly the same thing again
                      captureInto(m, { file: rel, kind: 'drawn', strokes: body.strokes })
                    }
                  } catch { /* the edit landed; filing it is a bonus */ }
                }
                sse.send('done', { summary: result.summary, explanation: result.explanation, clientId })
              })
              .catch(async (err: unknown) => {
                const message = err instanceof Error ? err.message : String(err)
                // A run that dies part way can leave edits on disk. Until now it
                // pushed nothing, so Ctrl+Z skipped it and reverted the edit
                // BEFORE it instead, leaving the broken one in place. Push it
                // like a finished run; undo skips an entry with nothing to revert.
                let changed = false
                if (runCp) {
                  pushEdit(runCp.sha, runUndoLabel(null, true), untrackedBefore)
                  try {
                    const m = await import('@s2c/pipeline')
                    const before = new Set(untrackedBefore)
                    changed = m.touchedFiles(root, runCp).some((rel) => !before.has(rel) && !rel.startsWith('.sketch2code/'))
                  } catch { /* could not tell: say nothing changed is wrong, so offer undo */ changed = true }
                }
                let explanation: unknown = null
                try {
                  const m = await import('@s2c/pipeline')
                  explanation = m.explainError(message, changed)
                } catch { /* pipeline missing: the raw message is all there is */ }
                sse.send('error-event', { message, explanation, clientId })
              })
              .finally(() => {
                stopActiveRun = null
                activeRunTab = null
                activeRunStage = null
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

import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { sendJson } from './middleware.js'

/**
 * The run-history surface: /@s2c/runs (page) + two JSON endpoints.
 *
 * A run bundle is a directory of small files written by the pipeline. Nothing
 * here writes to a bundle — this module only reads, summarises and serves.
 *
 * Everything below tolerates partial bundles on purpose: a run that died
 * mid-write, a v1 bundle from before half these files existed, or a JSON file
 * truncated by a crash must degrade to nulls, never to a 500.
 *
 * ── GET /@s2c/runs.json ──────────────────────────────────────────────────
 * Newest-first array of RunSummary (see the interface). Reads only the small
 * JSON files in each bundle; never a PNG, never a transcript.
 *
 * ── GET /@s2c/runs/<id>/settings.json ────────────────────────────────────
 * The settings a past run used, in the shape the overlay needs to restore
 * them. STABLE CONTRACT — the overlay's "reuse settings" path consumes
 * exactly this:
 *
 *   {
 *     "fidelity": {                       // null when the bundle predates
 *       "resemblance": 0.5,               //   fidelity controls entirely
 *       "keep": { "asymmetry": true, "rhythm": true,
 *                 "proportions": true, "placement": true },
 *       "fill": "outline" | "filled" | "realized",
 *       "palette": "app" | "sketch"
 *     },
 *     "notes": ["a side profile of a face, looking right"],  // texts only;
 *                                          //   anchors are not restorable
 *                                          //   into a fresh sketch
 *     "mode": "gesture" | "design" | "screenshot"
 *   }
 *
 * `fidelity` is always normalized to the CURRENT shape: missing or malformed
 * fields fall back to the same defaults the pipeline uses, so a client can
 * assign it straight onto its controls without feature-detecting. The object
 * is null only when the run recorded no fidelity at all.
 *
 * Unknown run id → 404 {ok:false}. The same object is embedded in each card's
 * `Reuse settings` button as `data-payload`, so the page can hand it over
 * without a round trip.
 *
 * Dev-only, GET-only, local-Host-gated by the caller (see index.ts), and
 * serves nothing outside <root>/.sketch2code/runs.
 */

const SAFE_NAME = /^[\w.-]+$/
/** '.' and '..' match SAFE_NAME but name directories outside a bundle. */
const isSafeName = (s: string): boolean => SAFE_NAME.test(s) && s !== '.' && s !== '..'
/** Bundle JSON we will read inline. Anything larger is a transcript, not data. */
const MAX_JSON_BYTES = 512 * 1024
const MOUNT = '/@s2c/runs'

// ─────────────────────────────── shapes ────────────────────────────────

export interface RunTokens {
  input: number
  cacheRead: number
  output: number
}

/** Mirror of the pipeline's FidelityControls, normalized to today's shape. */
export interface RunFidelity {
  resemblance: number
  keep: { asymmetry: boolean; rhythm: boolean; proportions: boolean; placement: boolean }
  fill: 'outline' | 'filled' | 'realized'
  palette: 'app' | 'sketch'
}

/** One scored codegen attempt, when the run generated more than one. */
export interface RunCandidate {
  index: number
  score: number | null
  tokens: RunTokens | null
  files: string[]
  chosen: boolean
}

/**
 * How well the run landed, from the newest verify-*.json in the bundle.
 * kind 'verified' → satisfied/total actions; kind 'composition' → a measured
 * likeness score, which is what some runs measure INSTEAD of pass/fail.
 */
export interface RunScore {
  kind: 'verified' | 'composition'
  score: number
  satisfied: number | null
  total: number | null
  /** Which verify file it came from ('1', '2-3', 'final', …). */
  round: string
}

export type RunMode = 'gesture' | 'design' | 'screenshot'

export interface RunSummary {
  id: string
  /** ms epoch parsed out of the run id; bundle mtime when the id has none. */
  at: number
  mode: RunMode
  reading: string | null
  summaryScore: RunScore | null
  tokens: RunTokens
  changedFiles: string[]
  fidelity: RunFidelity | null
  /** Typed notes, texts only. */
  notes: string[]
  codemod: { handled: number; refused: number }
  candidates: RunCandidate[] | null
  // ── extras beyond the documented core, used by the page ──
  engine: string | null
  checkpoint: string | null
  /** Filename of the ink image in this bundle, or null if it has none. */
  ink: string | null
  /** Every file in the bundle, for the raw-files disclosure. */
  files: string[]
  /** True when some file in the bundle was unreadable or unparseable. */
  partial: boolean
}

export interface RunSettings {
  fidelity: RunFidelity | null
  notes: string[]
  mode: RunMode
}

const DEFAULT_FIDELITY: RunFidelity = {
  resemblance: 0.5,
  keep: { asymmetry: true, rhythm: true, proportions: true, placement: true },
  fill: 'filled',
  palette: 'app',
}

// ──────────────────────────── bundle reading ────────────────────────────

const isRec = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, dflt = 0): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : dflt

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * Same contract as the pipeline's normalizeFidelity: anything unrecognized
 * falls back to the default rather than silently changing the meaning of a
 * control. Duplicated rather than imported so this endpoint stays free of the
 * pipeline (which may not even be installed).
 */
export function normalizeFidelity(raw: unknown): RunFidelity {
  if (!isRec(raw)) return { ...DEFAULT_FIDELITY, keep: { ...DEFAULT_FIDELITY.keep } }
  const keep = isRec(raw.keep) ? raw.keep : {}
  const bool = (v: unknown, dflt: boolean) => (typeof v === 'boolean' ? v : dflt)
  return {
    resemblance:
      typeof raw.resemblance === 'number' && Number.isFinite(raw.resemblance)
        ? clamp01(raw.resemblance)
        : DEFAULT_FIDELITY.resemblance,
    keep: {
      asymmetry: bool(keep.asymmetry, true),
      rhythm: bool(keep.rhythm, true),
      proportions: bool(keep.proportions, true),
      placement: bool(keep.placement, true),
    },
    fill: raw.fill === 'outline' || raw.fill === 'realized' ? raw.fill : 'filled',
    palette: raw.palette === 'sketch' ? 'sketch' : 'app',
  }
}

/** A bundle reader that remembers which files were unreadable. */
class Bundle {
  readonly files: string[]
  partial = false
  private readonly cache = new Map<string, unknown>()

  constructor(readonly dir: string, files: string[]) {
    this.files = files
  }

  has(name: string): boolean {
    return this.files.includes(name)
  }

  /** Parsed JSON, or undefined (marking the bundle partial on a bad parse). */
  json(name: string): unknown {
    if (this.cache.has(name)) return this.cache.get(name)
    let value: unknown
    if (this.has(name)) {
      try {
        const p = join(this.dir, name)
        if (statSync(p).size <= MAX_JSON_BYTES) value = JSON.parse(readFileSync(p, 'utf8'))
        // oversized: not corrupt, just not something this endpoint reads
      } catch {
        this.partial = true
      }
    }
    this.cache.set(name, value)
    return value
  }

  obj(name: string): Record<string, unknown> | undefined {
    const v = this.json(name)
    return isRec(v) ? v : undefined
  }

  text(name: string): string | null {
    if (!this.has(name)) return null
    try {
      const p = join(this.dir, name)
      if (statSync(p).size > MAX_JSON_BYTES) return null
      return readFileSync(p, 'utf8')
    } catch {
      this.partial = true
      return null
    }
  }
}

/** Numeric rank of a verify-*.json suffix; 'final' always sorts last. */
function verifyRank(round: string): number[] {
  if (round === 'final') return [Number.MAX_SAFE_INTEGER]
  const parts = round.split(/[^0-9]+/).filter(Boolean).map(Number)
  return parts.length ? parts : [-1]
}

function cmpRank(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? -1) - (b[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

/** The last verification the run performed, by file mtime then round order. */
function newestVerify(b: Bundle): { round: string; detail: unknown } | null {
  const rounds = b.files
    .map((f) => /^verify-(.+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ file: m[0], round: m[1]! }))
  if (rounds.length === 0) return null
  const scored = rounds.map((r) => {
    let mtime = 0
    try {
      mtime = statSync(join(b.dir, r.file)).mtimeMs
    } catch {
      /* vanished between readdir and stat */
    }
    return { ...r, mtime, rank: verifyRank(r.round) }
  })
  scored.sort((x, y) => x.mtime - y.mtime || cmpRank(x.rank, y.rank))
  const newest = scored[scored.length - 1]!
  return { round: newest.round, detail: b.json(newest.file) }
}

/**
 * Fold a verify detail into one score. The detail has had three shapes over
 * the project's life: a verifyOps result object, a list of per-action
 * verdicts, and a list that mixes in composition measurements. Count whatever
 * is countable; fall back to the composition score when likeness is all that
 * was measured.
 */
export function scoreVerification(detail: unknown, round: string): RunScore | null {
  let satisfied = 0
  let total = 0
  let composition: number | null = null

  const take = (entry: unknown): void => {
    if (!isRec(entry)) return
    if (entry.kind === 'composition') {
      if (typeof entry.score === 'number' && Number.isFinite(entry.score)) {
        composition = composition === null ? entry.score : Math.max(composition, entry.score)
      }
      return
    }
    if (Array.isArray(entry.verdicts)) {
      for (const v of entry.verdicts) {
        if (!isRec(v)) continue
        total++
        if (v.satisfied === true) satisfied++
      }
      return
    }
    if (isRec(entry.verdict)) {
      total++
      if (entry.verdict.satisfied === true) satisfied++
      return
    }
    if (typeof entry.satisfied === 'boolean') {
      total++
      if (entry.satisfied) satisfied++
    }
  }

  if (Array.isArray(detail)) for (const e of detail) take(e)
  else take(detail)

  if (total > 0) return { kind: 'verified', score: satisfied / total, satisfied, total, round }
  if (composition !== null) {
    return { kind: 'composition', score: clamp01(composition), satisfied: null, total: null, round }
  }
  return null
}

function readCandidates(b: Bundle, result: Record<string, unknown> | undefined): RunCandidate[] | null {
  const raw = result?.candidates ?? b.json('candidates.json')
  if (!Array.isArray(raw)) return null
  const out: RunCandidate[] = []
  for (const [i, c] of raw.entries()) {
    if (!isRec(c)) continue
    out.push({
      index: typeof c.index === 'number' ? c.index : i,
      score: typeof c.score === 'number' && Number.isFinite(c.score) ? c.score : null,
      tokens: isRec(c.tokens) ? readTokens(c.tokens) : null,
      files: Array.isArray(c.files) ? c.files.filter((f): f is string => typeof f === 'string') : [],
      chosen: c.chosen === true,
    })
  }
  return out.length ? out : null
}

function readTokens(raw: unknown): RunTokens {
  const t = isRec(raw) ? raw : {}
  return { input: num(t.input), cacheRead: num(t.cacheRead), output: num(t.output) }
}

function readNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const n of raw) {
    if (typeof n === 'string' && n.trim()) out.push(n.trim())
    else if (isRec(n) && typeof n.text === 'string' && n.text.trim()) out.push(n.text.trim())
  }
  return out
}

function countList(raw: unknown): number {
  if (Array.isArray(raw)) return raw.length
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return 0
}

function openBundle(runsRoot: string, id: string): Bundle | null {
  if (!isSafeName(id)) return null
  const dir = resolve(runsRoot, id)
  if (dir !== runsRoot && !dir.startsWith(runsRoot + '/')) return null
  let files: string[]
  try {
    files = readdirSync(dir).sort()
  } catch {
    return null
  }
  return new Bundle(dir, files)
}

/** Mode isn't always recorded; infer it from what the bundle does contain. */
function readMode(b: Bundle, result: Record<string, unknown> | undefined): RunMode {
  const fromResult = result?.mode
  if (fromResult === 'gesture' || fromResult === 'design' || fromResult === 'screenshot') return fromResult
  const req = b.obj('request.json')
  const fromReq = req?.mode
  if (fromReq === 'gesture' || fromReq === 'design' || fromReq === 'screenshot') return fromReq
  if (req?.hasScreenshot === true) return 'screenshot'
  const interp = b.obj('interpretation.json')
  if (Array.isArray(interp?.actions) && interp.actions.some((a) => isRec(a) && a.kind === 'design')) {
    return 'design'
  }
  return 'gesture'
}

/** Everything the list view needs about one run. Small JSON files only. */
export function readRunSummary(runsRoot: string, id: string): RunSummary | null {
  const b = openBundle(runsRoot, id)
  if (!b) return null

  const result = b.obj('result.json')
  const interp = b.obj('interpretation.json')

  const reading =
    typeof result?.reading === 'string' && result.reading.trim()
      ? result.reading
      : typeof interp?.reading === 'string' && interp.reading.trim()
        ? interp.reading
        : null

  const fidelityRaw = b.json('fidelity.json') ?? result?.fidelity
  const codemod = b.obj('codemod.json')
  const codemodResult = isRec(result?.codemod) ? result.codemod : undefined
  const verify = newestVerify(b)

  const idTime = /^run-(\d{10,})/.exec(id)
  let at = idTime ? Number(idTime[1]) : NaN
  if (!Number.isFinite(at)) {
    try {
      at = statSync(b.dir).mtimeMs
    } catch {
      at = 0
    }
  }

  let checkpoint: string | null =
    typeof result?.checkpoint === 'string' ? result.checkpoint : null
  if (!checkpoint) checkpoint = b.text('checkpoint.txt')?.trim() || null

  return {
    id,
    at,
    mode: readMode(b, result),
    reading,
    summaryScore: verify ? scoreVerification(verify.detail, verify.round) : null,
    tokens: readTokens(result?.tokens),
    changedFiles: Array.isArray(result?.changedFiles)
      ? result.changedFiles.filter((f): f is string => typeof f === 'string')
      : [],
    fidelity: fidelityRaw === undefined ? null : normalizeFidelity(fidelityRaw),
    notes: readNotes(b.json('notes.json')),
    codemod: {
      handled: countList(codemod?.handled ?? codemodResult?.handled),
      refused: countList(codemod?.refused ?? codemodResult?.refused),
    },
    candidates: readCandidates(b, result),
    engine: typeof result?.engine === 'string' ? result.engine : null,
    checkpoint,
    ink: b.has('evidence.png') ? 'evidence.png' : b.has('ink.png') ? 'ink.png' : null,
    files: b.files,
    partial: b.partial,
  }
}

/** Newest-first summaries. A bundle that fails to read is skipped, not fatal. */
export function listRuns(runsRoot: string, limit = 200): RunSummary[] {
  let ids: string[]
  try {
    ids = readdirSync(runsRoot).filter(isSafeName)
  } catch {
    return []
  }
  const out: RunSummary[] = []
  for (const id of ids) {
    try {
      const s = readRunSummary(runsRoot, id)
      if (s) out.push(s)
    } catch {
      /* one unreadable bundle must not sink the endpoint */
    }
  }
  out.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1))
  return out.slice(0, limit)
}

/** The restorable settings of one past run. See the contract at the top. */
export function readRunSettings(runsRoot: string, id: string): RunSettings | null {
  const b = openBundle(runsRoot, id)
  if (!b) return null
  const result = b.obj('result.json')
  const fidelityRaw = b.json('fidelity.json') ?? result?.fidelity
  return {
    fidelity: fidelityRaw === undefined ? null : normalizeFidelity(fidelityRaw),
    notes: readNotes(b.json('notes.json')),
    mode: readMode(b, result),
  }
}

/** Settings payload for a summary we already read — same shape, no re-read. */
function settingsOf(s: RunSummary): RunSettings {
  return { fidelity: s.fidelity, notes: s.notes, mode: s.mode }
}

// ──────────────────────────────── server ────────────────────────────────

type Route =
  | { kind: 'index'; limit: number }
  | { kind: 'list' }
  | { kind: 'settings'; id: string }
  | { kind: 'detail'; id: string }
  | { kind: 'file'; id: string; file: string }
  | { kind: 'unknown' }

/**
 * Route from the ORIGINAL url when connect gives us one — a middleware
 * mounted at /@s2c/runs sees req.url stripped down to '.json' or
 * '/<id>/settings.json', and both spellings have to land in the same place.
 */
export function routeOf(rawUrl: string): Route {
  const url = new URL(rawUrl, 'http://x')
  let path = decodeURIComponent(url.pathname)
  if (path.startsWith(MOUNT)) path = path.slice(MOUNT.length)
  // '.json' relative to the mount normalizes to '/.json'
  if (path === '.json' || path === '/.json') return { kind: 'list' }

  const settings = /^\/([^/]+)\/settings\.json$/.exec(path)
  if (settings) return { kind: 'settings', id: settings[1]! }

  if (path === '' || path === '/') {
    const id = url.searchParams.get('id')
    const file = url.searchParams.get('file')
    if (id && file) return { kind: 'file', id, file }
    if (id) return { kind: 'detail', id }
    const limit = Number(url.searchParams.get('limit'))
    return { kind: 'index', limit: Number.isFinite(limit) && limit > 0 ? limit : 200 }
  }
  return { kind: 'unknown' }
}

export function runsViewer(root: string) {
  const runsRoot = resolve(root, '.sketch2code', 'runs')

  return (req: IncomingMessage, res: ServerResponse): void => {
    const method = req.method ?? 'GET'
    if (method !== 'GET' && method !== 'HEAD') return sendJson(res, 405, { ok: false, error: 'GET only' })

    const raw = (req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/'
    const route = routeOf(raw)

    try {
      switch (route.kind) {
        case 'list':
          return sendJson(res, 200, listRuns(runsRoot))

        case 'settings': {
          const s = readRunSettings(runsRoot, route.id)
          if (!s) return sendJson(res, 404, { ok: false, error: 'unknown run' })
          return sendJson(res, 200, s)
        }

        case 'file': {
          const { id, file } = route
          if (!isSafeName(id) || !isSafeName(file)) return sendJson(res, 400, { ok: false })
          const p = resolve(runsRoot, id, file)
          if (!p.startsWith(runsRoot + '/')) return sendJson(res, 400, { ok: false })
          const buf = readFileSync(p)
          res.writeHead(200, {
            'content-type': file.endsWith('.png')
              ? 'image/png'
              : file.endsWith('.json')
                ? 'application/json'
                : 'text/plain; charset=utf-8',
          })
          res.end(buf)
          return
        }

        case 'detail':
          return detailPage(res, runsRoot, route.id)

        case 'index':
          return indexPage(res, listRuns(runsRoot, route.limit))

        default:
          return sendJson(res, 404, { ok: false, error: 'no such runs route' })
      }
    } catch (err) {
      sendJson(res, 404, { ok: false, error: String(err) })
    }
  }
}

// ───────────────────────────────── html ─────────────────────────────────

/**
 * Bundles are full of model-written text (`reading`, notes, file paths), so
 * everything interpolated goes through here — attribute values included,
 * which is why quotes are escaped too.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const pct = (v: number) => `${Math.round(v * 100)}%`

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

function fmtWhen(ms: number): string {
  if (!ms) return 'unknown date'
  const d = new Date(ms)
  const diff = Date.now() - ms
  const rel =
    diff < 60_000 ? 'just now'
      : diff < 3_600_000 ? `${Math.round(diff / 60_000)}m ago`
        : diff < 86_400_000 ? `${Math.round(diff / 3_600_000)}h ago`
          : `${Math.round(diff / 86_400_000)}d ago`
  return `${d.toLocaleString()} · ${rel}`
}

const CSS = `
:root{
  --bg:#f6f5f2; --card:#fff; --ink:#16161a; --dim:#6b6b76; --line:#e2e0da;
  --accent:#3d5afe; --good:#1a7f5a; --warn:#b26a00; --bad:#b3261e;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:28px 20px 72px}
header.top{display:flex;flex-wrap:wrap;align-items:baseline;gap:12px 18px;margin-bottom:6px}
h1{font-size:22px;letter-spacing:-.01em;margin:0;font-weight:650}
.sub{color:var(--dim);font-size:13px;margin:0 0 18px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 20px;padding:0;list-style:none}
.stats li{background:var(--card);border:1px solid var(--line);border-radius:8px;
  padding:8px 12px;font-size:12px;color:var(--dim)}
.stats b{display:block;font:600 17px/1.2 var(--mono);color:var(--ink);letter-spacing:-.02em}
#q{width:100%;max-width:340px;padding:8px 11px;border:1px solid var(--line);border-radius:8px;
  background:var(--card);font:inherit;font-size:13px;margin-bottom:18px}
#q:focus{outline:2px solid var(--accent);outline-offset:-1px}

.run{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:14px;
  display:grid;grid-template-columns:190px minmax(0,1fr) 214px;gap:0;overflow:hidden}
.run.hidden{display:none}
.ink{border-right:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:8px;
  background:#fbfbf9}
.ink img{width:100%;height:140px;object-fit:contain;display:block;background:#fff;
  border:1px solid var(--line);border-radius:6px;padding:3px}
.ink .noink{height:140px;display:grid;place-items:center;color:var(--dim);font-size:12px;
  border:1px dashed var(--line);border-radius:6px;text-align:center;padding:6px;
  background:repeating-conic-gradient(#fbfbf9 0% 25%,#f3f2ee 0% 50%) 50%/12px 12px}
.runid{font:11px/1.3 var(--mono);color:var(--dim);overflow-wrap:anywhere}
.runid a{color:var(--dim);text-decoration:none;border-bottom:1px dotted var(--line)}
.runid a:hover{color:var(--accent)}

.body{padding:14px 16px;min-width:0;display:flex;flex-direction:column}
/* anchors the raw-files disclosure to the bottom of the card, so short runs
   don't leave a ragged gap under it */
.body details.raw{margin-top:auto}
.badges{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.badge{font:11px/1 var(--mono);text-transform:uppercase;letter-spacing:.04em;
  border:1px solid var(--line);border-radius:999px;padding:4px 8px;color:var(--dim);white-space:nowrap}
.badge.mode-design{border-color:#c3b5f0;color:#5b3fbf;background:#f4f1ff}
.badge.mode-screenshot{border-color:#b7d8c9;color:#1a7f5a;background:#eff9f4}
.badge.partial{border-color:#f0d9a8;color:var(--warn);background:#fdf6e7}
.when{font-size:11px;color:var(--dim);margin-left:auto;white-space:nowrap}
.reading{margin:0 0 10px;font-size:14px}
.reading.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.more{background:none;border:0;padding:0;color:var(--accent);font:inherit;font-size:12px;cursor:pointer;
  align-self:flex-start;margin:-4px 0 8px}
.more:hover{text-decoration:underline}
.none{color:var(--dim);font-style:italic}
.notes{margin:0 0 10px;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.notes li{border-left:2px solid var(--accent);padding:1px 0 1px 8px;font-size:13px;color:#3a3a44}
.files{margin:0 0 8px;font:12px/1.7 var(--mono);color:#3a3a44;word-break:break-all}
.files .k{font-family:inherit;color:var(--dim);text-transform:uppercase;font-size:10px;letter-spacing:.05em;
  display:block;margin-bottom:2px}
.cmd{display:flex;gap:6px;align-items:stretch;margin-bottom:8px}
.cmd code{flex:1;min-width:0;background:#1c1c21;color:#e8e6e0;border-radius:6px;padding:7px 9px;
  font:11.5px/1.5 var(--mono);overflow-x:auto;white-space:pre}
button{font:inherit;font-size:12px;cursor:pointer;border:1px solid var(--line);background:#fafaf8;
  color:var(--ink);border-radius:6px;padding:6px 10px}
button:hover{border-color:var(--accent);color:var(--accent)}
button:active{transform:translateY(1px)}
details.raw{border-top:1px solid var(--line);padding-top:8px;margin-top:4px}
details.raw summary{cursor:pointer;font-size:12px;color:var(--dim)}
details.raw ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
details.raw a{font:11.5px/1 var(--mono);text-decoration:none;border:1px solid var(--line);
  border-radius:5px;padding:5px 7px;background:#fafaf8}

.meta{border-left:1px solid var(--line);padding:14px;display:flex;flex-direction:column;gap:12px;
  background:#fcfcfa}
.score{font:600 26px/1 var(--mono);letter-spacing:-.03em}
.score.s-good{color:var(--good)} .score.s-mid{color:var(--warn)} .score.s-bad{color:var(--bad)}
.score.s-none{color:var(--dim);font-size:15px}
.bar{height:5px;border-radius:3px;background:var(--line);overflow:hidden;margin:6px 0 3px}
.bar i{display:block;height:100%;background:currentColor}
.k{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
.tok{font:12px/1.6 var(--mono)}
.tok span{color:var(--dim)}
.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{font:11px/1 var(--mono);border:1px solid var(--line);border-radius:5px;padding:4px 6px;background:#fff}
.chip.off{color:var(--dim);text-decoration:line-through}
.cands{display:flex;flex-direction:column;gap:3px;font:11px/1.4 var(--mono)}
.cands .c{display:flex;justify-content:space-between;gap:6px;border:1px solid var(--line);
  border-radius:5px;padding:4px 6px;background:#fff;color:var(--dim)}
.cands .c.win{border-color:var(--good);color:var(--good);background:#f2fbf7}
.reuse{width:100%;background:var(--ink);color:#fff;border-color:var(--ink);font-weight:600;padding:8px}
.reuse:hover{background:var(--accent);border-color:var(--accent);color:#fff}
.status{font-size:11px;color:var(--good);min-height:14px;display:block}
.small{font-size:11px;color:var(--dim)}
.small a{color:var(--dim)}
.empty{background:var(--card);border:1px dashed var(--line);border-radius:12px;padding:40px;
  text-align:center;color:var(--dim)}
pre{background:#1c1c21;color:#e8e6e0;padding:12px;overflow:auto;border-radius:8px;
  font:12px/1.6 var(--mono);white-space:pre-wrap;word-break:break-word}
@media (max-width:900px){
  .run{grid-template-columns:150px minmax(0,1fr)}
  .meta{grid-column:1/-1;border-left:0;border-top:1px solid var(--line);
    display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:start}
  .reuse-block{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
  .reuse{width:auto;flex:1 1 180px}
}
@media (max-width:600px){
  .wrap{padding:18px 12px 48px}
  .run{grid-template-columns:1fr}
  .ink{border-right:0;border-bottom:1px solid var(--line)}
  .ink .noink{height:72px}
  .when{margin-left:0;width:100%}
}
`

/** Static: never interpolates bundle data, so nothing can be injected here. */
const SCRIPT = `
document.addEventListener('click', function (e) {
  var t = e.target;
  if (!(t instanceof HTMLElement)) return;
  var btn = t.closest('button');
  if (!btn) return;
  if (btn.classList.contains('more')) {
    var p = btn.previousElementSibling;
    if (p) { p.classList.toggle('clamp'); btn.textContent = p.classList.contains('clamp') ? 'more' : 'less'; }
    return;
  }
  var payload = btn.getAttribute('data-copy');
  if (payload === null) return;
  var card = btn.closest('.run');
  var status = card ? card.querySelector('.status') : null;
  var say = function (m) { if (status) { status.textContent = m; setTimeout(function () { status.textContent = ''; }, 4000); } };
  var done = btn.getAttribute('data-done') || 'copied';
  try {
    navigator.clipboard.writeText(payload).then(function () { say(done); }, function () { fallback(payload, say, done); });
  } catch (err) { fallback(payload, say, done); }
});
function fallback(text, say, done) {
  var ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); say(done); } catch (e) { say('copy failed — use the link'); }
  document.body.removeChild(ta);
}
var q = document.getElementById('q');
if (q) q.addEventListener('input', function () {
  var needle = q.value.toLowerCase().trim();
  var shown = 0;
  document.querySelectorAll('.run').forEach(function (el) {
    var hit = !needle || (el.getAttribute('data-search') || '').indexOf(needle) !== -1;
    el.classList.toggle('hidden', !hit);
    if (hit) shown++;
  });
  var c = document.getElementById('shown');
  if (c) c.textContent = String(shown);
});
`

function page(res: ServerResponse, title: string, body: string, script = ''): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<title>${escapeHtml(title)}</title><style>${CSS}</style></head>` +
      `<body><div class="wrap">${body}</div>${script ? `<script>${script}</script>` : ''}</body></html>`,
  )
}

function scoreBlock(s: RunScore | null): string {
  if (!s) {
    return `<div><div class="k">fidelity of result</div><div class="score s-none">not measured</div></div>`
  }
  const cls = s.score >= 0.999 ? 's-good' : s.score >= 0.6 ? 's-mid' : 's-bad'
  const label =
    s.kind === 'verified'
      ? `${s.satisfied}/${s.total} actions verified`
      : 'composition vs. the ink'
  return (
    `<div><div class="k">fidelity of result</div>` +
    `<div class="score ${cls}">${escapeHtml(pct(s.score))}` +
    `<div class="bar"><i style="width:${escapeHtml(pct(s.score))}"></i></div></div>` +
    `<div class="small">${escapeHtml(label)} · round ${escapeHtml(s.round)}</div></div>`
  )
}

function fidelityBlock(f: RunFidelity | null): string {
  if (!f) return `<div><div class="k">settings</div><div class="small">no fidelity recorded</div></div>`
  const rung =
    f.resemblance >= 0.85 ? 'trace' : f.resemblance >= 0.6 ? 'rebuild' : f.resemblance >= 0.35 ? 'normalize' : 'reinterpret'
  const keep = Object.entries(f.keep)
    .map(([k, on]) => `<span class="chip ${on ? '' : 'off'}" title="${on ? 'kept' : 'not enforced'}">${escapeHtml(k)}</span>`)
    .join('')
  return (
    `<div><div class="k">settings used</div><div class="chips">` +
    `<span class="chip">${escapeHtml(rung)} ${escapeHtml(f.resemblance.toFixed(2))}</span>` +
    `<span class="chip">${escapeHtml(f.fill)}</span>` +
    `<span class="chip">${escapeHtml(f.palette)}</span>` +
    keep +
    `</div></div>`
  )
}

function candidatesBlock(c: RunCandidate[] | null): string {
  if (!c || c.length === 0) return ''
  const rows = c
    .map((x) => {
      const bits = [
        x.score === null ? '—' : pct(x.score),
        `${x.files.length} file${x.files.length === 1 ? '' : 's'}`,
      ]
      if (x.tokens) bits.push(`${fmtCount(x.tokens.input + x.tokens.output)} tok`)
      return (
        `<div class="c ${x.chosen ? 'win' : ''}">` +
        `<span>#${escapeHtml(String(x.index + 1))}${x.chosen ? ' ✓' : ''}</span>` +
        `<span>${escapeHtml(bits.join(' · '))}</span></div>`
      )
    })
    .join('')
  return `<div><div class="k">candidates (best of ${escapeHtml(String(c.length))})</div><div class="cands">${rows}</div></div>`
}

function runCard(s: RunSummary): string {
  const q = (v: string) => escapeHtml(encodeURIComponent(v))
  const href = `?id=${q(s.id)}`
  const inkUrl = s.ink ? `?id=${q(s.id)}&amp;file=${q(s.ink)}` : null

  const ink = inkUrl
    ? `<a href="${inkUrl}" title="open the ink full size"><img loading="lazy" src="${inkUrl}" alt="ink drawn in run ${escapeHtml(s.id)}"></a>`
    : `<div class="noink">no ink captured</div>`

  const badges =
    `<span class="badge mode-${escapeHtml(s.mode)}">${escapeHtml(s.mode)}</span>` +
    (s.engine ? `<span class="badge">${escapeHtml(s.engine)}</span>` : '') +
    (s.codemod.handled || s.codemod.refused
      ? `<span class="badge">codemod ${escapeHtml(String(s.codemod.handled))}✓ ${escapeHtml(String(s.codemod.refused))}✗</span>`
      : '') +
    (s.partial ? `<span class="badge partial">partial bundle</span>` : '') +
    `<span class="when">${escapeHtml(fmtWhen(s.at))}</span>`

  const reading = s.reading
    ? `<p class="reading clamp">${escapeHtml(s.reading)}</p><button class="more">more</button>`
    : `<p class="reading none">no reading recorded</p>`

  const notes = s.notes.length
    ? `<ul class="notes">${s.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`
    : ''

  const files = s.changedFiles.length
    ? `<div class="files"><span class="k">changed files</span>${s.changedFiles.map((f) => escapeHtml(f)).join('<br>')}</div>`
    : `<div class="files"><span class="k">changed files</span><span class="none">none</span></div>`

  const restore =
    s.checkpoint && s.changedFiles.length
      ? (() => {
          const cmd = `git restore --source=${s.checkpoint!.slice(0, 10)} -- ${s.changedFiles.join(' ')}`
          return (
            `<div class="cmd"><code>${escapeHtml(cmd)}</code>` +
            `<button data-copy="${escapeHtml(cmd)}" data-done="restore command copied">Copy</button></div>`
          )
        })()
      : ''

  const rawFiles = s.files.length
    ? `<details class="raw"><summary>raw bundle — ${escapeHtml(String(s.files.length))} file${s.files.length === 1 ? '' : 's'}</summary><ul>` +
      s.files.map((f) => `<li><a href="?id=${q(s.id)}&amp;file=${q(f)}">${escapeHtml(f)}</a></li>`).join('') +
      `</ul><p class="small"><a href="${href}">open the full transcript view →</a></p></details>`
    : `<details class="raw"><summary>raw bundle — empty</summary><p class="small">this bundle has no files</p></details>`

  const tok = s.tokens
  const tokens =
    tok.input || tok.cacheRead || tok.output
      ? `<div class="tok">${escapeHtml(fmtCount(tok.input))} <span>in</span> · ` +
        `${escapeHtml(fmtCount(tok.cacheRead))} <span>cached</span> · ` +
        `${escapeHtml(fmtCount(tok.output))} <span>out</span></div>`
      : `<div class="small">not recorded</div>`

  // data-payload is byte-identical to GET /@s2c/runs/<id>/settings.json, so a
  // consumer can take either route.
  const payload = JSON.stringify(settingsOf(s))
  const settingsUrl = `${MOUNT}/${q(s.id)}/settings.json`

  const search = escapeHtml(
    [s.id, s.mode, s.reading ?? '', s.notes.join(' '), s.changedFiles.join(' ')].join(' ').toLowerCase(),
  )

  return (
    `<article class="run" data-run="${escapeHtml(s.id)}" data-search="${search}">` +
    `<div class="ink">${ink}<div class="runid"><a href="${href}">${escapeHtml(s.id)}</a></div></div>` +
    `<div class="body"><div class="badges">${badges}</div>${reading}${notes}${files}${restore}${rawFiles}</div>` +
    `<aside class="meta">${scoreBlock(s.summaryScore)}` +
    `<div><div class="k">tokens</div>${tokens}</div>` +
    fidelityBlock(s.fidelity) +
    candidatesBlock(s.candidates) +
    `<div class="reuse-block"><button class="reuse" data-copy="${escapeHtml(payload)}" data-done="settings copied — paste into the overlay"` +
    ` data-settings-url="${escapeHtml(settingsUrl)}" data-payload="${escapeHtml(payload)}">Reuse settings</button>` +
    `<span class="status" role="status"></span>` +
    `<div class="small"><a href="${escapeHtml(settingsUrl)}">settings.json</a></div></div>` +
    `</aside></article>`
  )
}

function indexPage(res: ServerResponse, runs: RunSummary[]): void {
  const totalTokens = runs.reduce((n, r) => n + r.tokens.input + r.tokens.cacheRead + r.tokens.output, 0)
  const touched = new Set(runs.flatMap((r) => r.changedFiles)).size
  const scored = runs.filter((r) => r.summaryScore).map((r) => r.summaryScore!.score)
  const mean = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null

  const stats =
    `<ul class="stats">` +
    `<li><b><span id="shown">${escapeHtml(String(runs.length))}</span></b>runs listed</li>` +
    `<li><b>${escapeHtml(mean === null ? '—' : pct(mean))}</b>mean measured fidelity</li>` +
    `<li><b>${escapeHtml(fmtCount(totalTokens))}</b>tokens spent</li>` +
    `<li><b>${escapeHtml(String(touched))}</b>distinct files touched</li>` +
    `</ul>`

  const body = runs.length
    ? runs.map(runCard).join('')
    : `<div class="empty">No runs yet. Sketch something and the bundle lands in <code>.sketch2code/runs</code>.</div>`

  page(
    res,
    'sketch2code runs',
    `<header class="top"><h1>sketch2code runs</h1>` +
      `<span class="small"><a href="${MOUNT}.json">runs.json</a></span></header>` +
      `<p class="sub">Every generation with the exact settings it used, what it cost, and what it changed. ` +
      `<b>Reuse settings</b> copies a run's settings payload for the overlay.</p>` +
      stats +
      `<input id="q" type="search" placeholder="filter by id, reading, note or file…" autocomplete="off">` +
      body,
    SCRIPT,
  )
}

/** Unchanged in spirit: the raw debugging surface for one run. */
function detailPage(res: ServerResponse, runsRoot: string, id: string): void {
  if (!isSafeName(id)) return sendJson(res, 400, { ok: false })
  const dir = join(runsRoot, id)
  const files = readdirSync(dir).sort()
  const q = (v: string) => escapeHtml(encodeURIComponent(v))
  const blocks = files
    .map((f) => {
      if (f.endsWith('.png')) {
        return `<details open><summary>${escapeHtml(f)}</summary><img src="?id=${q(id)}&amp;file=${q(f)}" alt="${escapeHtml(f)}" style="max-width:100%;background:#fff;border:1px solid var(--line);border-radius:8px"></details>`
      }
      let text: string
      try {
        text = readFileSync(join(dir, f), 'utf8')
      } catch (err) {
        text = `(unreadable: ${String(err)})`
      }
      const open = f === 'result.json' || f === 'prompt.txt' ? ' open' : ''
      return `<details${open}><summary>${escapeHtml(f)}</summary><pre>${escapeHtml(text)}</pre></details>`
    })
    .join('\n')

  const summary = readRunSummary(runsRoot, id)
  const card = summary ? runCard(summary) : ''
  page(
    res,
    `${id} · s2c run`,
    `<header class="top"><h1>${escapeHtml(id)}</h1>` +
      `<span class="small"><a href="${MOUNT}">← all runs</a></span></header>` +
      card +
      `<h2 style="font-size:15px;margin:22px 0 10px">Raw bundle</h2>${blocks}`,
    SCRIPT,
  )
}

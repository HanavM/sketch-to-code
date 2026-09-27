import { isAbsolute, relative, resolve, sep } from 'node:path'

/**
 * THE EDITOR BRIDGE PROTOCOL — canonical spec. One place, on purpose: the
 * types the three parties exchange live next to the validators that enforce
 * them, so a drifted field is a type error rather than a silent no-op.
 *
 * Three parties, two hops, one transport family (HTTP + SSE — the repo already
 * has an SSE hub and the Host/token gates, so the bridge adds no dependency):
 *
 *   browser overlay ──POST /@s2c/ide/reveal──► dev server ──SSE `reveal`──► editor
 *   editor ──POST /@s2c/ide/cursor──► dev server ──SSE `ide-cursor`──► browser overlay
 *
 * The browser hop reuses the EXISTING /@s2c/events hub; the editor gets its own
 * stream at /@s2c/ide/events. Nothing here is bidirectional on one socket: each
 * party POSTs what it knows and listens on the stream it owns.
 *
 * ── Endpoints ──────────────────────────────────────────────────────────────
 *
 * POST /@s2c/ide/reveal   {file, line, col?}  → 200 {ok, delivered, reason?}
 *   The overlay asks the editor to reveal a source location. Caller: browser.
 *   Gate: the full `rejectUnauthorized` (per-boot token + JSON content-type +
 *   local Host + same-origin), identical to /@s2c/manipulate — the overlay
 *   bundle is served the token, so it can satisfy it.
 *
 * GET  /@s2c/ide/events   → text/event-stream
 *   The editor subscribes. Events:
 *     `hello`  {protocol, root, editorId, serverId}  — first frame, always.
 *     `reveal` {id, file, line, col, root, at}       — a reveal request.
 *     `:` comment heartbeats every 25s (dead-socket detection, see below).
 *   Gate: editor gate (below) — an EventSource cannot send headers, so the
 *   per-boot token is impossible here.
 *
 * POST /@s2c/ide/cursor   {file, line, col?}  → 200 {ok, forwarded}
 *   The editor reports where its cursor is. The server re-broadcasts it to
 *   every browser client on the existing hub as `ide-cursor`.
 *   Gate: editor gate (below).
 *
 * GET  /@s2c/ide/status   → 200 {connected, editor?, count, editors[]}
 *   So the overlay can show an indicator ONLY when an editor is really
 *   attached. Gate: local Host only (read-only, no secrets).
 *
 * ── How `file` is expressed ────────────────────────────────────────────────
 *
 * Repo-relative, POSIX separators, exactly the first field of the `data-s2c`
 * stamp: `src/components/Card.tsx`. The overlay therefore never has to
 * transform a stamp before sending it — `loc.split(':')` is the whole client
 * side. `line` and `col` are 1-based, also exactly as stamped (the Babel pass
 * emits `loc.start.line` and `loc.start.column + 1`). VS Code's Position is
 * 0-based, so the -1 conversion happens in the editor adapter, once.
 *
 * Absolute paths ARE accepted on input (an editor naturally knows absolute
 * paths) but only when they resolve INSIDE the dev server root; they are
 * normalized to repo-relative before they travel any further, so every
 * consumer sees one shape. A `file` that escapes the root — `../`, an absolute
 * path elsewhere, a NUL byte, a Windows drive on posix — is refused 400 and
 * never reaches the editor. The check is lexical (no realpath): a symlink
 * inside the project that points out of it is out of scope, the same
 * assumption the rest of the repo's path handling makes.
 *
 * The `root` the editor needs to turn a repo-relative path back into a file it
 * can open is handed to it in `hello` (and repeated on every `reveal`, so the
 * adapter can stay stateless). This is deliberate: the editor's workspace
 * folder is NOT assumed to equal the dev server's root — in a monorepo it
 * usually isn't.
 *
 * ── When no editor is connected ────────────────────────────────────────────
 *
 * A reveal with nobody listening answers 200 `{ok: true, delivered: 0,
 * reason: 'no editor connected'}` — immediately. It must not hang and must not
 * look like a failure: the overlay's click handler is on the UI path, and an
 * absent editor is a normal state, not an error. Reveals are NOT buffered for
 * a future editor either — a location the developer clicked ten minutes ago is
 * noise by the time an editor attaches.
 *
 * ── How a disconnect is detected ───────────────────────────────────────────
 *
 * Three ways, because each misses a different failure:
 *  1. `close` on the request — the editor deactivating, or a clean quit.
 *  2. A 25s server heartbeat comment — a socket killed without FIN (laptop
 *     asleep, VPN drop) only reveals itself on the next write.
 *  3. A failed/backpressured write while delivering a reveal — the connection
 *     is dropped there and then, and the reveal reports the real `delivered`.
 * Every add and remove broadcasts `ide-status` to the browser hub, so the
 * overlay's indicator is push-updated and /@s2c/ide/status is only needed once
 * at boot. The editor side re-attaches on its own with backoff, so a dropped
 * connection heals without anyone clicking anything.
 */

/** Bumped when a field's meaning changes, not when one is added. */
export const IDE_PROTOCOL_VERSION = 1

/** SSE event names the EDITOR receives on /@s2c/ide/events. */
export const IDE_EVENT_HELLO = 'hello'
export const IDE_EVENT_REVEAL = 'reveal'

/** SSE event names the BROWSER receives on the existing /@s2c/events hub. */
export const BROWSER_EVENT_CURSOR = 'ide-cursor'
export const BROWSER_EVENT_STATUS = 'ide-status'

/** Header an editor client must send; see `rejectNonEditor` for why. */
export const IDE_CLIENT_HEADER = 'x-s2c-ide'

/** A source location, always repo-relative with 1-based line/col. */
export interface SourceLoc {
  file: string
  line: number
  col?: number
}

/** POST /@s2c/ide/reveal body. */
export type RevealRequest = SourceLoc

/** POST /@s2c/ide/reveal response. `delivered` is the editor count reached. */
export interface RevealResponse {
  ok: true
  delivered: number
  reason?: string
}

/** POST /@s2c/ide/cursor body. */
export type CursorRequest = SourceLoc

/** The `reveal` SSE payload. `root` repeated so the adapter stays stateless. */
export interface RevealEvent extends SourceLoc {
  id: string
  col: number
  root: string
  at: number
}

/** The `hello` SSE payload — the first frame on every editor stream. */
export interface HelloEvent {
  protocol: number
  root: string
  editorId: string
  serverId: string
}

/** The `ide-cursor` payload the browser receives. */
export interface CursorEvent extends SourceLoc {
  editor: string
  at: number
}

/** GET /@s2c/ide/status response, and the `ide-status` payload. */
export interface IdeStatus {
  connected: boolean
  /** Name of the most recently attached editor, when any. */
  editor?: string
  count: number
  editors: Array<{ id: string; editor: string; since: number }>
}

export interface ErrorResponse {
  ok: false
  error: string
}

/** Longest `file` we will look at. Anything longer is not a real source path. */
const MAX_FILE_LEN = 1024
/** Editor labels reach a status bar and the run viewer; keep them boring. */
const MAX_EDITOR_LEN = 40

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * Normalize a caller-supplied path to the repo-relative POSIX form the rest of
 * the bridge speaks, refusing anything that leaves `root`. Refusal (not
 * clamping) is the point: a reveal is a "open this file in my editor" command,
 * so a path the project doesn't own must never be forwarded.
 */
export function normalizeProjectPath(root: string, file: unknown): Parsed<string> {
  if (typeof file !== 'string') return { ok: false, error: 'file must be a string' }
  if (file.length === 0) return { ok: false, error: 'file is empty' }
  if (file.length > MAX_FILE_LEN) return { ok: false, error: 'file too long' }
  if (file.includes('\0')) return { ok: false, error: 'file contains a NUL byte' }
  // A backslash is a separator on Windows and a legal filename char on posix.
  // Treating it as a separator everywhere costs nothing and closes
  // "src\\..\\..\\etc" on a posix dev server.
  const unified = file.replace(/\\/g, '/')
  const abs = isAbsolute(unified) ? resolve(unified) : resolve(root, unified)
  const rel = relative(resolve(root), abs)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    return { ok: false, error: 'file is outside the project root' }
  }
  return { ok: true, value: rel.split(sep).join('/') }
}

function parseLine(v: unknown, what: string): Parsed<number> {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    return { ok: false, error: `${what} must be an integer` }
  }
  if (v < 1 || v > 10_000_000) return { ok: false, error: `${what} out of range` }
  return { ok: true, value: v }
}

/** Shared shape of both POST bodies: {file, line, col?}. */
export function parseSourceLoc(root: string, body: unknown): Parsed<Required<SourceLoc>> {
  if (body === null || typeof body !== 'object') return { ok: false, error: 'body must be an object' }
  const b = body as Record<string, unknown>
  const file = normalizeProjectPath(root, b.file)
  if (!file.ok) return file
  const line = parseLine(b.line, 'line')
  if (!line.ok) return line
  // col is optional: a click knows the exact stamp, a cursor report often
  // doesn't care. Default 1 so consumers never branch on undefined.
  let col = 1
  if (b.col !== undefined && b.col !== null) {
    const parsedCol = parseLine(b.col, 'col')
    if (!parsedCol.ok) return parsedCol
    col = parsedCol.value
  }
  return { ok: true, value: { file: file.value, line: line.value, col } }
}

/** Editor labels are shown in UI; strip control chars and cap the length. */
export function sanitizeEditorName(name: unknown): string {
  if (typeof name !== 'string') return 'editor'
  // eslint-disable-next-line no-control-regex -- control chars would corrupt the SSE frame
  const clean = name.replace(/[ -]/g, ' ').trim()
  if (clean === '') return 'editor'
  return clean.slice(0, MAX_EDITOR_LEN)
}

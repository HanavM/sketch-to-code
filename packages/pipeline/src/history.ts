/**
 * Visual history: a timeline of the page's own past that you can scrub back
 * through.
 *
 * This is not git with a nicer face, and the difference is the whole point.
 * Git records what someone chose to write a message about; this records what
 * the page LOOKED like, at the moments a person actually cares about — a
 * gesture that wrote code, a run that landed, and crucially an edit made by
 * hand in the user's editor, which git only notices when someone remembers to
 * commit. The question being answered is "which one did I like", and that is
 * answered by a thumbnail, not by a commit subject.
 *
 * So each entry is a picture plus enough git to rebuild the code behind it,
 * and the storage is split accordingly: the PNG the browser hands over becomes
 * a real file on disk, and the index stays a small readable list of ids and
 * object names. Inlining the base64 would make the index unreadable and grow
 * it by megabytes per scrub.
 *
 * Two things about the git side are load-bearing and easy to get wrong.
 *
 * First, `git stash create` — the capture this repo already uses everywhere —
 * does NOT see untracked files. A freshly drawn component is untracked, so a
 * version keyed only on that commit's tree would claim "nothing changed" at
 * the exact moment the most visible thing happened. Every entry therefore also
 * fingerprints the untracked files, by writing each one into git's object
 * store and remembering its blob name. That single record does double duty: it
 * is what makes the "has anything changed?" test honest, and it is what lets a
 * restore put a created file BACK rather than only delete it.
 *
 * Second, going back has to delete files that did not exist then — the bug
 * candidates.ts documents at length — so restoring reuses captureWork/
 * revertWork rather than reaching for `git restore`, which has nothing to
 * restore an untracked file to and would leave it behind as an orphan.
 *
 * The one thing hidden from that machinery is `.sketch2code/` itself. In a
 * project that has not gitignored it, the history index is an untracked file,
 * which means a naive revert would delete the timeline in the middle of
 * scrubbing through it.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { captureWork, revertWork } from './candidates.js'
import { changedFiles, checkpoint, type Checkpoint } from './safety.js'

export interface Version {
  /** Time-ordered and filename-safe: it also names the thumbnail on disk. */
  id: string
  at: number
  label: string
  /** Checkpoint commit (`git stash create`, or HEAD) holding the tracked tree. */
  sha: string
  /** That commit's tree — the cheap, exact "did anything change" comparison. */
  tree: string
  /**
   * Untracked files at this moment, path → blob name written into git.
   * Without this the tree above is blind to created files (see the header).
   */
  untracked: Record<string, string>
  /** What changed relative to the next-older entry, created files included. */
  files: string[]
  /** PNG path relative to root, present only while the file is really there. */
  thumb?: string
}

export interface RecordRequest {
  /** What this moment was, in the user's terms — shown on the timeline. */
  label: string
  /** PNG of the page: a `data:image/png;base64,…` URL, or bare base64. */
  thumbnail?: string
}

export interface RecordResult {
  ok: boolean
  entry?: Version | null
  /** True when the page was already at this state, so nothing was recorded. */
  unchanged?: boolean
  error?: string
}

export interface RestoreResult {
  ok: boolean
  files?: string[]
  /** The state that was replaced, recorded first so scrubbing back is undoable. */
  recorded?: Version | null
  error?: string
}

export interface FileDelta {
  file: string
  added: number
  removed: number
}

export interface DiffResult {
  ok: boolean
  files?: FileDelta[]
  error?: string
}

/** Where the timeline lives, next to the run bundles and the drawn rules. */
const HISTORY_REL = '.sketch2code/history'
const STATE_DIR = '.sketch2code'

/**
 * How much timeline is kept. Fifty scrubs back is far more than anyone reads,
 * and the cost of the fifty-first is a PNG in someone's project forever.
 */
const MAX_ENTRIES = 50

/**
 * Above this many untracked files the fingerprint stops being a fingerprint
 * and starts being a build. It means the project is missing a .gitignore, and
 * saying so is more useful than hashing a node_modules.
 */
const MAX_UNTRACKED = 500

/** Blobs are source files and the odd asset, not tarballs. */
const MAX_GIT_OUT = 64 * 1024 * 1024

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/
const OBJ_OK = /^[0-9a-f]{7,64}$/

/** A refusal raised from deep inside, carrying text meant for the user. */
class Refusal extends Error {}

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: MAX_GIT_OUT }).trim()

const gitLines = (cwd: string, ...args: string[]): string[] =>
  git(cwd, ...args).split('\n').filter(Boolean)

export const historyDir = (root: string): string => join(root, HISTORY_REL)
export const historyIndexPath = (root: string): string => join(historyDir(root), 'index.json')

/** Forward slashes, because this string is written into a portable index. */
const thumbRel = (id: string): string => `${HISTORY_REL}/${id}.png`
const thumbPath = (root: string, id: string): string => join(root, HISTORY_REL, `${id}.png`)

/** Is this path our own bookkeeping? Never revert it, never fingerprint it. */
const isStatePath = (rel: string): boolean =>
  rel === STATE_DIR || rel.startsWith(`${STATE_DIR}/`)

/**
 * A path we are willing to write to. The index is a file in the user's project
 * and can be hand-edited, so a path out of it must not be able to reach above
 * the app root.
 */
const safeRel = (p: string): boolean =>
  p.length > 0 && !p.startsWith('/') && !/(^|\/)\.\.(\/|$)/.test(p) && !/^[A-Za-z]:/.test(p)

const hasObject = (root: string, spec: string): boolean => {
  try {
    execFileSync('git', ['cat-file', '-e', spec], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/**
 * checkpoint() already explains itself in sentences that name the fix; only
 * its lead-in belongs to the edit path, and this is the history path.
 */
const reasonFrom = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(/^refusing to edit: /, '')

// ── the index ───────────────────────────────────────────────────────────────

/**
 * Validate rather than trust, the way loadConstraints does. This file sits in
 * a user's project, gets hand-edited, and gets half-written when a process
 * dies mid-save; none of that is allowed to take a timeline panel down. It is
 * also the source of paths we delete and write, which is why ids, object names
 * and relative paths are all checked in here rather than at the point of use.
 */
function coerce(root: string, raw: unknown): Version | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = o.id
  const sha = o.sha
  if (typeof id !== 'string' || !ID_OK.test(id)) return null
  if (typeof sha !== 'string' || !OBJ_OK.test(sha)) return null

  const untracked: Record<string, string> = {}
  const u = o.untracked
  if (u !== null && typeof u === 'object' && !Array.isArray(u)) {
    for (const [rel, blob] of Object.entries(u as Record<string, unknown>)) {
      if (typeof blob !== 'string' || !OBJ_OK.test(blob)) continue
      if (!safeRel(rel) || isStatePath(rel)) continue
      untracked[rel] = blob
    }
  }

  // A thumb is only ever OUR canonical path, and only while the PNG exists:
  // the UI must never be handed a dead image, and pruning must never be
  // pointed at a file outside the history directory.
  const thumb = o.thumb === thumbRel(id) && existsSync(thumbPath(root, id)) ? thumbRel(id) : undefined

  return {
    id,
    at: typeof o.at === 'number' && Number.isFinite(o.at) ? o.at : 0,
    label: typeof o.label === 'string' && o.label.trim().length > 0 ? o.label : '(unlabelled)',
    sha,
    tree: typeof o.tree === 'string' && OBJ_OK.test(o.tree) ? o.tree : '',
    untracked,
    files: Array.isArray(o.files) ? o.files.filter((f): f is string => typeof f === 'string') : [],
    thumb,
  }
}

/**
 * The timeline, newest first.
 *
 * Stored newest-first too, so pruning is a slice and the file reads the way
 * the panel does. Re-sorted on the way out anyway: a hand-edited file that has
 * lost its order should still scrub in the right direction.
 */
export function listVersions(root: string): Version[] {
  try {
    const file = historyIndexPath(root)
    if (!existsSync(file)) return []
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: Version[] = []
    for (const item of raw) {
      const v = coerce(root, item)
      if (!v || seen.has(v.id)) continue
      seen.add(v.id)
      out.push(v)
    }
    return out.sort((a, b) => b.at - a.at)
  } catch {
    return []
  }
}

function writeIndex(root: string, entries: Version[]): void {
  const file = historyIndexPath(root)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(entries, null, 2)}\n`)
}

// ── what the page is made of, right now ─────────────────────────────────────

/**
 * Every untracked file under root, path → blob name, with each one written
 * into git's object store so a restore can bring it back.
 *
 * Writing is what makes this more than a hash: `git stash create` will never
 * carry these files, so without a blob of their own a created component is
 * unrecoverable the moment it is deleted.
 */
function fingerprintUntracked(root: string): Record<string, string> {
  const paths = gitLines(root, 'ls-files', '--others', '--exclude-standard')
    .filter((p) => !isStatePath(p) && safeRel(p))
  if (paths.length === 0) return {}
  if (paths.length > MAX_UNTRACKED) {
    throw new Refusal(
      `this project has ${String(paths.length)} untracked files, more than a version will ` +
      `fingerprint (${String(MAX_UNTRACKED)}). Add a .gitignore for build output so a version ` +
      `only has to remember your own files.`,
    )
  }
  const shas = gitLines(root, 'hash-object', '-w', '--', ...paths)
  if (shas.length !== paths.length) {
    throw new Refusal('git could not hash this project\'s untracked files, so nothing was recorded.')
  }
  const out: Record<string, string> = {}
  paths.forEach((p, i) => {
    out[p] = shas[i]!
  })
  return out
}

const sameUntracked = (a: Record<string, string>, b: Record<string, string>): boolean => {
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every((k) => a[k] === b[k])
}

/**
 * The PNG the browser hands over, as bytes.
 *
 * Refuses anything that is not actually a PNG rather than storing it: a
 * timeline whose pictures do not load is worse than one that told you why.
 */
function decodeThumbnail(thumbnail: string): Buffer {
  let b64 = thumbnail.trim()
  const url = /^data:([^;,]*)(;base64)?,/.exec(b64)
  if (url) {
    const media = (url[1] ?? '').toLowerCase()
    if (media && media !== 'image/png') {
      throw new Refusal(
        `that thumbnail is ${media}, and the timeline stores PNGs — hand over ` +
        `canvas.toDataURL('image/png').`,
      )
    }
    if (!url[2]) {
      throw new Refusal(
        'that thumbnail is a data URL but not a base64 one — hand over ' +
        "canvas.toDataURL('image/png').",
      )
    }
    b64 = b64.slice(url[0].length)
  }
  const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64')
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Refusal(
      "that thumbnail isn't a PNG — hand over canvas.toDataURL('image/png'), as a data URL " +
      'or as bare base64.',
    )
  }
  return bytes
}

/** Ids sort chronologically as strings, and are safe as filenames. */
function nextId(entries: Version[]): string {
  const taken = new Set(entries.map((e) => e.id))
  const stem = `v${Date.now().toString(36)}`
  let id = stem
  for (let n = 1; taken.has(id); n++) id = `${stem}-${String(n)}`
  return id
}

/**
 * What changed between the previous entry and now.
 *
 * Tracked changes come from the same diff the rest of the pipeline uses;
 * created files come from comparing untracked fingerprints, because a diff
 * cannot see them — and because listing every untracked file as "changed"
 * (which is what touchedFiles does, correctly, for its own purpose) would
 * report a file that has been sitting there untouched for an hour.
 */
function changedSince(root: string, prev: Version | undefined, untracked: Record<string, string>): string[] {
  if (!prev) return []
  const cp: Checkpoint = { sha: prev.sha, toplevel: root, dirtyBefore: true }
  const out = new Set<string>()
  if (hasObject(root, `${prev.sha}^{tree}`)) {
    for (const f of changedFiles(root, cp)) if (!isStatePath(f)) out.add(f)
  }
  for (const [rel, blob] of Object.entries(untracked)) {
    if (prev.untracked[rel] !== blob) out.add(rel)
  }
  for (const rel of Object.keys(prev.untracked)) {
    if (!(rel in untracked)) out.add(rel)
  }
  return [...out].sort()
}

// ── recording ───────────────────────────────────────────────────────────────

/**
 * Pin the page's current look and code to the timeline.
 *
 * Returns `unchanged` and records nothing when the state matches the newest
 * entry. That is not an optimisation: this gets called from a file watcher and
 * after every gesture, which fire far more often than the page actually
 * changes, and fifty identical thumbnails is a timeline you cannot scrub.
 */
export function recordVersion(root: string, req: RecordRequest): RecordResult {
  const label = req.label.trim()
  if (label.length === 0) {
    return {
      ok: false,
      error: 'a version needs a label saying what this moment was — for example ' +
        '"dragged the card wider" or "edited by hand".',
    }
  }
  try {
    // Decode before touching git: a bad thumbnail should cost nothing.
    const png = req.thumbnail === undefined ? null : decodeThumbnail(req.thumbnail)

    let cp: Checkpoint
    try {
      // allowDirty, always: the uncommitted state IS what the timeline is for.
      cp = checkpoint(root, true)
    } catch (e) {
      return { ok: false, error: `can't record this version: ${reasonFrom(e)}` }
    }
    const tree = git(root, 'rev-parse', `${cp.sha}^{tree}`)
    const untracked = fingerprintUntracked(root)

    const entries = listVersions(root)
    const prev = entries[0]
    if (prev && prev.tree === tree && sameUntracked(prev.untracked, untracked)) {
      return { ok: true, entry: null, unchanged: true }
    }

    const id = nextId(entries)
    let thumb: string | undefined
    if (png) {
      mkdirSync(historyDir(root), { recursive: true })
      writeFileSync(thumbPath(root, id), png)
      thumb = thumbRel(id)
    }
    const entry: Version = {
      id,
      at: Date.now(),
      label,
      sha: cp.sha,
      tree,
      untracked,
      files: changedSince(root, prev, untracked),
      thumb,
    }

    const kept = [entry, ...entries].slice(0, MAX_ENTRIES)
    // A pruned entry's picture goes with it, or the directory grows forever
    // inside someone's project. The path is rebuilt from the validated id,
    // never read out of the index, so this can only ever delete our own PNG.
    for (const dropped of [entry, ...entries].slice(MAX_ENTRIES)) {
      rmSync(thumbPath(root, dropped.id), { force: true })
    }
    writeIndex(root, kept)
    return { ok: true, entry }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message }
    return { ok: false, error: `can't record this version: ${reasonFrom(e)}` }
  }
}

// ── going back ──────────────────────────────────────────────────────────────

/** Which of a version's git objects are gone, in words a user can act on. */
function missingObjects(root: string, v: Version): string[] {
  const gone: string[] = []
  if (!hasObject(root, `${v.sha}^{tree}`)) gone.push(`its code snapshot (${v.sha.slice(0, 10)})`)
  for (const rel of Object.keys(v.untracked)) {
    if (!hasObject(root, v.untracked[rel]!)) gone.push(rel)
  }
  return gone
}

const notInTimeline = (id: string): string =>
  `there is no version "${id}" on this project's timeline — it may have been pruned. ` +
  `Pick one from the history panel.`

const prunedObjects = (v: Version, gone: string[]): string =>
  `version "${v.label}" can't be rebuilt: git has garbage-collected ${gone.join(', ')}. ` +
  `Its picture is still on the timeline, but its code is gone — pick a later version.`

/**
 * Put the worktree back to a point on the timeline.
 *
 * Deliberately records the current state FIRST, and refuses to go back at all
 * if it cannot: scrubbing is something people do repeatedly and speculatively,
 * and a step back that cannot be stepped out of is a trap rather than a
 * timeline.
 */
export function restoreVersion(
  root: string,
  id: string,
  req: { thumbnail?: string } = {},
): RestoreResult {
  const entries = listVersions(root)
  const target = entries.find((e) => e.id === id)
  if (!target) return { ok: false, error: notInTimeline(id) }

  try {
    const gone = missingObjects(root, target)
    if (gone.length > 0) return { ok: false, error: prunedObjects(target, gone) }

    const before = recordVersion(root, {
      label: `before scrubbing back to "${target.label}"`,
      thumbnail: req.thumbnail,
    })
    if (!before.ok) {
      return {
        ok: false,
        error: `nothing was changed, because the current state couldn't be saved first: ${before.error ?? 'unknown reason'}`,
      }
    }

    const cp: Checkpoint = { sha: target.sha, toplevel: root, dirtyBefore: true }
    const work = captureWork(root, cp)
    // Our own index and thumbnails are untracked files too, and revertWork
    // deletes anything absent from the checkpoint. Left in, the first scrub
    // back would delete the timeline it was being driven from.
    for (const rel of [...work.keys()]) if (isStatePath(rel)) work.delete(rel)
    revertWork(root, cp, work)

    // revertWork has just deleted the files this version had but never
    // committed — they are absent from its tree by construction. Put them back
    // from the blobs the entry remembers.
    writeBlobs(root, target.untracked)

    const files = new Set<string>([...work.keys(), ...Object.keys(target.untracked)])
    return { ok: true, files: [...files].sort(), recorded: before.entry ?? null }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message }
    return { ok: false, error: `couldn't scrub back to "${target.label}": ${reasonFrom(e)}` }
  }
}

/**
 * Written as bytes rather than through applyWork, which reads and writes utf8:
 * an untracked file in a real app is sometimes a dropped PNG, SVG or font, and
 * a utf8 round-trip would quietly corrupt it.
 */
function writeBlobs(root: string, files: Record<string, string>): void {
  for (const [rel, sha] of Object.entries(files)) {
    const abs = join(root, rel)
    const bytes = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, maxBuffer: MAX_GIT_OUT })
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, bytes)
  }
}

// ── comparing two points ────────────────────────────────────────────────────

/** `--no-renames` so a path in the result is a path, not an `old => new` pair. */
function numstat(root: string, ...spec: string[]): FileDelta[] {
  return gitLines(root, 'diff', '--numstat', '--no-renames', ...spec).map((line) => {
    const cols = line.split('\t')
    return {
      // binary files come back as `-` on both counts; 0 is the honest answer
      added: Number(cols[0]) || 0,
      removed: Number(cols[1]) || 0,
      file: cols.slice(2).join('\t'),
    }
  })
}

/** Lines in a blob, counting a final line that has no newline after it. */
function blobLines(root: string, sha: string): number {
  const bytes = execFileSync('git', ['cat-file', 'blob', sha], { cwd: root, maxBuffer: MAX_GIT_OUT })
  if (bytes.length === 0) return 0
  let n = 0
  for (const byte of bytes) if (byte === 0x0a) n++
  if (bytes[bytes.length - 1] !== 0x0a) n++
  return n
}

/**
 * What actually changed between two points on the timeline, so the UI can say
 * it in words instead of making someone compare two thumbnails.
 *
 * Untracked files are diffed blob-to-blob, because they are in no tree: git
 * will happily numstat two object names, and the real path is substituted back
 * in afterwards.
 */
export function diffVersions(root: string, a: string, b: string): DiffResult {
  const entries = listVersions(root)
  const va = entries.find((e) => e.id === a)
  const vb = entries.find((e) => e.id === b)
  if (!va && !vb) {
    return {
      ok: false,
      error: `neither "${a}" nor "${b}" is on this project's timeline — pick two versions from ` +
        `the history panel.`,
    }
  }
  if (!va) return { ok: false, error: notInTimeline(a) }
  if (!vb) return { ok: false, error: notInTimeline(b) }

  try {
    for (const v of [va, vb]) {
      const gone = missingObjects(root, v)
      if (gone.length > 0) return { ok: false, error: prunedObjects(v, gone) }
    }

    const out = new Map<string, FileDelta>()
    for (const d of numstat(root, '--relative', va.sha, vb.sha, '--', '.')) {
      if (!isStatePath(d.file)) out.set(d.file, d)
    }
    for (const rel of new Set([...Object.keys(va.untracked), ...Object.keys(vb.untracked)])) {
      const from = va.untracked[rel]
      const to = vb.untracked[rel]
      if (from === to) continue
      if (from && to) {
        const [d] = numstat(root, from, to)
        out.set(rel, { file: rel, added: d?.added ?? 0, removed: d?.removed ?? 0 })
      } else if (to) {
        out.set(rel, { file: rel, added: blobLines(root, to), removed: 0 })
      } else if (from) {
        out.set(rel, { file: rel, added: 0, removed: blobLines(root, from) })
      }
    }
    return { ok: true, files: [...out.values()].sort((x, y) => x.file.localeCompare(y.file)) }
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message }
    return { ok: false, error: `couldn't compare those two versions: ${reasonFrom(e)}` }
  }
}

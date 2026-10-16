import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export interface Checkpoint {
  /** Commit SHA capturing the working tree (git stash create), or HEAD. */
  sha: string
  toplevel: string
  dirtyBefore: boolean
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

/**
 * Safety gates before any model is allowed to edit source:
 * - the app root must live inside a git repo
 * - that repo's toplevel must NOT be the user's home directory (a stray
 *   ~/.git makes `git add -A` stage the entire home dir — seen in the wild)
 * - a dirty tree is refused unless allowDirty, or unless every bit of the dirt
 *   is sketch2code's own (the tree is exactly as its last edit or undo left
 *   it; see recordOwnedState). Without that exception every SECOND change in
 *   a project set up by `init` was refused, because nothing commits after a
 *   run (walkthrough-noncoder.md step 6).
 * - a checkpoint commit object is created via `git stash create`, which
 *   captures the working tree WITHOUT touching HEAD, the index, or history.
 *   Revert = `git restore --source=<sha> -- <paths>`.
 */
export function checkpoint(root: string, allowDirty: boolean): Checkpoint {
  let toplevel: string
  try {
    toplevel = git(root, 'rev-parse', '--show-toplevel')
  } catch {
    throw new Error(`refusing to edit: ${root} is not inside a git repository`)
  }
  if (resolve(toplevel) === resolve(homedir())) {
    throw new Error(
      `refusing to edit: the enclosing git repo is your HOME directory (${toplevel}). ` +
      `Run \`git init\` in the project first.`,
    )
  }
  const status = git(root, 'status', '--porcelain', '--', '.')
  const dirtyBefore = status.length > 0
  if (dirtyBefore && !allowDirty) {
    const why = dirtReason(root)
    if (why) throw new Error(why)
  }
  // stash create returns '' on a clean tree — fall back to HEAD
  let sha = ''
  try {
    sha = git(root, 'stash', 'create', 'sketch2code checkpoint')
  } catch {
    /* ignore */
  }
  if (!sha) {
    try {
      sha = git(root, 'rev-parse', 'HEAD')
    } catch {
      throw new Error(
        'refusing to edit: the repository has no commits yet — make an initial commit first.',
      )
    }
  }
  pinCheckpoint(root, sha)
  return { sha, toplevel, dirtyBefore }
}

/** Where checkpoint objects are pinned so `git gc` can't collect them. */
export const PIN_PREFIX = 'refs/s2c/cp/'
/**
 * How many pins to keep. History caps at 50 entries and the undo stack at 50,
 * so 200 leaves room for runs that took a checkpoint and never got filed.
 */
export const MAX_PINS = 200

/**
 * Pin a checkpoint under refs/s2c/cp/ so it stays reachable.
 *
 * `git stash create` writes a commit that nothing points at. It looks fine
 * until the user's next `git gc` (or git's own auto-gc after enough commits),
 * which deletes it — and then Undo and the history strip quietly lose the
 * ability to restore that entry. A ref under refs/s2c/ is outside branches,
 * tags and the stash list, so it never shows up in `git branch`, `git log` or
 * a push of the usual refspecs. Best-effort: a checkpoint that could not be
 * pinned is still a checkpoint, so a failure here never blocks an edit.
 */
export function pinCheckpoint(root: string, sha: string): void {
  try {
    git(root, 'update-ref', `${PIN_PREFIX}${sha}`, sha)
    const pins = git(root, 'for-each-ref', '--sort=-committerdate', '--format=%(refname)', PIN_PREFIX)
      .split('\n').filter(Boolean)
    for (const ref of pins.slice(MAX_PINS)) git(root, 'update-ref', '-d', ref)
  } catch { /* not pinned: same as before this existed */ }
}

/** Files changed since the checkpoint, scoped to root (not the whole repo). */
export function changedFiles(root: string, cp: Checkpoint): string[] {
  const out = execFileSync('git', ['diff', '--name-only', '--relative', cp.sha, '--', '.'], {
    cwd: root,
    encoding: 'utf8',
  })
  return out.split('\n').filter(Boolean)
}

/** Restore the given paths to their checkpoint state. */
export function revertToCheckpoint(root: string, cp: Checkpoint, paths: string[]): void {
  if (paths.length === 0) return
  execFileSync('git', ['restore', '--source', cp.sha, '--', ...paths], { cwd: root })
}

/**
 * Paths that never count as dirt: the tool's own folder (undo stack, history,
 * library) and the data store a form made real writes into. The records people
 * type into their own app are not a hand edit to the source, and refusing the
 * next sketch because someone submitted a form would be absurd. node_modules:
 * a repo that tracks it gets Vite's cache (node_modules/.vite) rewritten on
 * every dev-server start, which no one would call an edit.
 */
export const OWNED_EXCLUDES = ['.sketch2code', 'server/data', 'node_modules']

/** Where the tree ids of states sketch2code itself left behind are kept. */
export const ownedFile = (root: string): string => join(root, '.sketch2code', 'owned.json')
/** States remembered. An undo walks back at most MAX_UNDO (50) edits. */
export const MAX_OWNED = 200

const TREE = /^[0-9a-f]{40}([0-9a-f]{24})?$/

/**
 * One id for the whole working tree under root, untracked files included
 * (gitignored ones not), as a git tree hash.
 *
 * Built in a throwaway index so the user's real index is never touched: copy
 * it (so unchanged files are not re-hashed), `git add -A` into the copy,
 * `write-tree`. Null when git can't say, which callers treat as "unknown".
 */
export function worktreeId(root: string): string | null {
  const tmp = join(tmpdir(), `s2c-index-${randomUUID()}`)
  try {
    const real = resolve(root, git(root, 'rev-parse', '--git-path', 'index'))
    if (existsSync(real)) copyFileSync(real, tmp)
    const env = { ...process.env, GIT_INDEX_FILE: tmp }
    const quiet = { cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'] as ['ignore', 'ignore', 'ignore'] }
    execFileSync('git', ['add', '-A', '--', '.'], quiet)
    // dropped AFTER the add, not excluded by pathspec: an exclude that names a
    // gitignored folder makes `git add` exit 1 ("paths are ignored"), which
    // silently turned every id into null in a real init'd project
    execFileSync('git', ['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', ...OWNED_EXCLUDES], quiet)
    const id = execFileSync('git', ['write-tree'], { cwd: root, env, encoding: 'utf8' }).trim()
    return TREE.test(id) ? id : null
  } catch {
    return null
  } finally {
    rmSync(tmp, { force: true })
  }
}

function loadOwned(root: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(ownedFile(root), 'utf8')) as { states?: unknown }
    return Array.isArray(raw.states) ? raw.states.filter((x): x is string => typeof x === 'string' && TREE.test(x)) : []
  } catch {
    return []
  }
}

/**
 * Remember the tree as it is right now as one sketch2code made.
 *
 * Called when an edit has finished (the plugin's pushEdit) and after an undo:
 * the two moments the tool knows the whole tree is its doing. Best-effort; a
 * state that wasn't recorded just means the next edit asks for a commit.
 */
export function recordOwnedState(root: string): string | null {
  const id = worktreeId(root)
  if (!id) return null
  try {
    const states = loadOwned(root).filter((s) => s !== id)
    states.push(id)
    const file = ownedFile(root)
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify({ states: states.slice(-MAX_OWNED) }) + '\n')
    renameSync(tmp, file)
  } catch { /* not remembered: the next edit asks for a commit, as before */ }
  return id
}

function dirtyPaths(root: string): string[] {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', '.', ...OWNED_EXCLUDES.map((p) => `:(exclude)${p}`)], {
      cwd: root, encoding: 'utf8',
    }).split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^.* -> /, ''))
  } catch {
    return []
  }
}

const listOf = (paths: string[]): string =>
  paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} and ${String(paths.length - 3)} more`

/**
 * Whether an edit may start on this tree, as a plain-words refusal or null.
 *
 * Allowed: a clean tree; allowDirty; a tree that is dirty only in the tool's
 * own folder or the data store; a tree identical to one sketch2code itself
 * left behind. Refused: anything else, naming the files, BEFORE any model is
 * paid to read the sketch (the plugin's /@s2c/interpret asks this first).
 */
export function dirtReason(root: string, allowDirty = false): string | null {
  if (allowDirty) return null
  const paths = dirtyPaths(root)
  if (paths.length === 0) return null
  const owned = loadOwned(root)
  const now = worktreeId(root)
  if (now && owned.includes(now)) return null
  const fix = 'Save them in git first (git add -A && git commit -m "my edits"), ' +
    'or set sketch2code({ allowDirty: true }) to let it edit on top of them.'
  if (owned.length === 0) {
    return `refusing to edit: ${listOf(paths)} ${paths.length === 1 ? 'has' : 'have'} uncommitted changes that ` +
      `sketch2code didn't make, and Undo could mix them up with its own. ${fix}`
  }
  // name what changed since the tool's last state, when git can still tell
  let changed: string[] = []
  try {
    const last = owned[owned.length - 1]!
    if (now) {
      const prefix = git(root, 'rev-parse', '--show-prefix')
      changed = git(root, 'diff-tree', '-r', '--name-only', last, now).split('\n').filter(Boolean)
        .map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p))
    }
  } catch { /* the remembered tree was gc'd: fall back to every dirty path */ }
  if (changed.length === 0) changed = paths
  return `refusing to edit: ${listOf(changed)} changed outside sketch2code since its last edit ` +
    `(uncommitted changes it didn't make), and Undo could mix them up with its own. ${fix}`
}

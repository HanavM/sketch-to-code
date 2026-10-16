import { execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

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
 * - a dirty tree is refused unless allowDirty
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
  const status = git(root, 'status', '--porcelain')
  const dirtyBefore = status.length > 0
  if (dirtyBefore && !allowDirty) {
    throw new Error(
      'refusing to edit: working tree has uncommitted changes. Commit/stash them, ' +
      'or set sketch2code({ allowDirty: true }).',
    )
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

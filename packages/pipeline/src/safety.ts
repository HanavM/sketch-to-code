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
  return { sha, toplevel, dirtyBefore }
}

/** Files changed since the checkpoint (relative to toplevel). */
export function changedFiles(root: string, cp: Checkpoint): string[] {
  const out = execFileSync('git', ['diff', '--name-only', cp.sha], { cwd: root, encoding: 'utf8' })
  return out.split('\n').filter(Boolean)
}

/** Restore the given paths to their checkpoint state. */
export function revertToCheckpoint(root: string, cp: Checkpoint, paths: string[]): void {
  if (paths.length === 0) return
  execFileSync('git', ['restore', '--source', cp.sha, '--', ...paths], { cwd: root })
}

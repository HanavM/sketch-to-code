/**
 * Measured multi-shot: generate several independent attempts, score each
 * against the drawing, keep the best, discard the rest.
 *
 * Image tools do this the other way round — generate four, show them to a
 * human, let the human pick. That is the only option available when nothing
 * measures the result. This pipeline already measures: verification asserts
 * every action against the live DOM, and a depiction's composition is scored
 * against the ink's own signature. So the choosing can be done by the thing
 * that can actually tell, and the user is handed a result rather than a
 * multiple-choice question.
 *
 * The cost is honest and linear — N attempts cost N codegen rounds — which is
 * why it is opt-in and capped.
 *
 * Everything here is git-shaped: an attempt's work is captured off the
 * worktree, reverted so the next attempt starts from the same state the user
 * confirmed, and the winner is written back at the end.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import type { Checkpoint } from './safety.js'

/** A file the attempt touched: its content, or null when it deleted it. */
export type Work = Map<string, string | null>

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

/**
 * Everything an attempt touched under `root` — including files it CREATED.
 *
 * `git diff` alone misses those: a new component is untracked, so it never
 * appears in a diff against the checkpoint and would survive a revert to
 * contaminate the next attempt (and, before this, quietly went unreported in
 * the run summary too).
 */
export function touchedFiles(root: string, cp: Checkpoint): string[] {
  const tracked = execFileSync('git', ['diff', '--name-only', '--relative', cp.sha, '--', '.'], {
    cwd: root, encoding: 'utf8',
  }).split('\n').filter(Boolean)
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8',
  }).split('\n').filter(Boolean)
  return [...new Set([...tracked, ...untracked])].sort()
}

/** Read an attempt's work out of the worktree so it can be put back later. */
export function captureWork(root: string, cp: Checkpoint): Work {
  const work: Work = new Map()
  for (const rel of touchedFiles(root, cp)) {
    const abs = join(root, rel)
    work.set(rel, existsSync(abs) ? readFileSync(abs, 'utf8') : null)
  }
  return work
}

/**
 * Put the worktree back the way the user confirmed it.
 *
 * Tracked files are restored from the checkpoint commit; files that did not
 * exist there are deleted outright, because `git restore` has nothing to
 * restore them to and would leave them in place.
 */
export function revertWork(root: string, cp: Checkpoint, work: Work, keep?: string[]): void {
  const prefix = git(root, 'rev-parse', '--show-prefix')
  const spare = new Set(keep ?? [])
  for (const rel of work.keys()) {
    // A file that was ALREADY here untracked when the checkpoint was taken is
    // not this edit's to delete. A checkpoint is a `git stash create`, which
    // records tracked state only, so such a file is missing from its tree for
    // the same reason a brand-new one is — and without this list, undoing one
    // edit deletes the component an EARLIER edit created. Extract something,
    // do anything else, press undo once, and it would be gone.
    if (spare.has(rel)) continue
    if (inCheckpoint(root, cp, rel, prefix)) {
      execFileSync('git', ['restore', '--source', cp.sha, '--', rel], { cwd: root })
    } else {
      rmSync(join(root, rel), { force: true })
      pruneEmptyDirs(root, dirname(join(root, rel)))
    }
  }
}

/**
 * Remove `dir` and its parents while they are empty, never `root` itself.
 *
 * An edit that created `src/screens/Reports.tsx` also created `src/screens/`.
 * Deleting the file alone left an empty folder in the user's project after
 * every undo of a new screen, route or hook (s2c-039's e2e caught it). Git
 * tracks no directories, so it can't say whether an empty one was there
 * before; a folder that is empty now and held one of this edit's files is
 * taken to be the edit's.
 */
function pruneEmptyDirs(root: string, dir: string): void {
  const top = resolve(root)
  for (let d = resolve(dir); d.startsWith(top + sep); d = dirname(d)) {
    try {
      if (readdirSync(d).length > 0) return
      rmdirSync(d)
    } catch { return }
  }
}

/** Write a captured attempt back onto the worktree. */
export function applyWork(root: string, work: Work): void {
  for (const [rel, content] of work) {
    const abs = join(root, rel)
    if (content === null) {
      rmSync(abs, { force: true })
      continue
    }
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content)
  }
}

/** Was this path in the checkpoint's tree at all? */
function inCheckpoint(root: string, cp: Checkpoint, rel: string, prefix: string): boolean {
  try {
    execFileSync('git', ['cat-file', '-e', `${cp.sha}:${prefix}${rel}`], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** Everything git is not tracking, so a caller can record it before an edit. */
export function untrackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: root, encoding: 'utf8',
  }).split('\n').filter(Boolean)
}

/**
 * Only the files an edit CREATED, not the ones it changed.
 *
 * The element library needs this distinction and nothing else here does: a
 * sketch that recolours Navbar.tsx should not file Navbar in the library, while
 * a sketch that produced a new component is exactly what the library is for.
 *
 * `before` is the project's untracked files as they were BEFORE the edit, and
 * leaving it out is a real limitation rather than a default: a checkpoint is a
 * `git stash create`, which captures tracked state only, so a file that was
 * already sitting there untracked is absent from the checkpoint's tree for the
 * same reason a brand-new one is. Without the list they are indistinguishable,
 * and this would call someone's scratch component "created" every time.
 */
export function createdFiles(root: string, cp: Checkpoint, before?: string[]): string[] {
  const prefix = git(root, 'rev-parse', '--show-prefix')
  const existed = new Set(before ?? [])
  return touchedFiles(root, cp).filter(
    (rel) => existsSync(join(root, rel)) &&
      !existed.has(rel) &&
      !inCheckpoint(root, cp, rel, prefix),
  )
}

/**
 * Undo an edit completely, including files it CREATED.
 *
 * `git restore` alone cannot: a new component is untracked, so it appears in
 * no diff and survives the revert as an orphan — which is how undoing an
 * extract used to leave the new file behind after putting the call site back.
 */
/** The files revertTouched(root, cp, keep) would restore or delete, without touching them. */
export function wouldRevert(root: string, cp: Checkpoint, keep?: string[]): string[] {
  const spare = new Set(keep ?? [])
  return touchedFiles(root, cp).filter((rel) => !spare.has(rel))
}

export function revertTouched(root: string, cp: Checkpoint, keep?: string[]): string[] {
  const work = captureWork(root, cp)
  const spare = new Set(keep ?? [])
  const mine = [...work.keys()].filter((rel) => !spare.has(rel))
  if (mine.length === 0) return []
  revertWork(root, cp, work, keep)
  return mine
}

/**
 * How each attempt is told to build the thing.
 *
 * Deliberately NOT variations of what the user asked for — the reading, the
 * fidelity settings and the notes are identical across attempts. What varies
 * is the construction strategy, because that is what separates a good render
 * of a drawing from a poor one, and because a strategy that fails is exactly
 * what the measurement is able to detect. Attempt 1 carries no hint at all so
 * a single-attempt run is byte-for-byte the run it always was.
 */
export const APPROACHES: string[] = [
  '',
  'APPROACH FOR THIS ATTEMPT: build the form from as few closed shapes as you can — ' +
  'prefer one silhouette carrying the whole outline over many separate strokes.',
  'APPROACH FOR THIS ATTEMPT: build it in layers — the silhouette first, then interior ' +
  'detail placed on top of it, each part its own shape.',
]

export interface Attempt {
  index: number
  score: number
  /** Per-action verification detail, as verifyActions returns it. */
  detail: unknown
  failures: string[]
  files: string[]
  work: Work
  tokens: { input: number; cacheRead: number; output: number }
}

/**
 * Best attempt by score; ties go to the earliest, which is the one that got
 * there without a construction hint.
 */
export function pickBest(attempts: Attempt[]): Attempt | null {
  let best: Attempt | null = null
  for (const a of attempts) {
    if (!best || a.score > best.score) best = a
  }
  return best
}

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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
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
export function revertWork(root: string, cp: Checkpoint, work: Work): void {
  const prefix = git(root, 'rev-parse', '--show-prefix')
  for (const rel of work.keys()) {
    const inCheckpoint = (() => {
      try {
        execFileSync('git', ['cat-file', '-e', `${cp.sha}:${prefix}${rel}`], { cwd: root, stdio: 'ignore' })
        return true
      } catch {
        return false
      }
    })()
    if (inCheckpoint) {
      execFileSync('git', ['restore', '--source', cp.sha, '--', rel], { cwd: root })
    } else {
      rmSync(join(root, rel), { force: true })
    }
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

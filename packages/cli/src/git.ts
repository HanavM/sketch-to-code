import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface GitState {
  inRepo: boolean
  toplevel: string | null
  /** The repo toplevel IS the user's home directory — the plugin refuses this. */
  isHome: boolean
  hasCommits: boolean
  dirty: boolean
  dirtyFiles: string[]
  branch: string | null
  remotes: Array<{ name: string; url: string }>
}

export interface Gate {
  id: 'no-repo' | 'home-repo' | 'no-commits' | 'dirty'
  /** blocking: the plugin will refuse to run until this is resolved. */
  blocking: boolean
  message: string
  fix: string
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function tryGit(cwd: string, args: string[]): string | null {
  try {
    return git(cwd, args)
  } catch {
    return null
  }
}

export function gitState(dir: string): GitState {
  const toplevel = tryGit(dir, ['rev-parse', '--show-toplevel'])
  if (toplevel === null) {
    return {
      inRepo: false, toplevel: null, isHome: false, hasCommits: false,
      dirty: false, dirtyFiles: [], branch: null, remotes: [],
    }
  }
  const status = tryGit(dir, ['status', '--porcelain']) ?? ''
  const remotesRaw = tryGit(dir, ['remote', '-v']) ?? ''
  const remotes = [
    ...new Map(
      remotesRaw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const [name, rest] = line.split('\t')
          return [name!, { name: name!, url: (rest ?? '').split(' ')[0] ?? '' }] as const
        }),
    ).values(),
  ]
  return {
    inRepo: true,
    toplevel,
    isHome: resolve(toplevel) === resolve(homedir()),
    hasCommits: tryGit(dir, ['rev-parse', 'HEAD']) !== null,
    dirty: status.length > 0,
    dirtyFiles: status.split('\n').filter(Boolean).map((l) => l.slice(3)),
    branch: tryGit(dir, ['rev-parse', '--abbrev-ref', 'HEAD']),
    remotes,
  }
}

/**
 * The gates @s2c/pipeline's checkpoint() enforces, evaluated BEFORE we write
 * anything. Discovering "refusing to edit: … not inside a git repository" on
 * your first sketch is the failure this exists to prevent: the checkpoint is
 * the only revert path, so no repo means no undo.
 */
export function evaluateGates(state: GitState, allowDirty: boolean): Gate[] {
  const gates: Gate[] = []
  if (!state.inRepo) {
    gates.push({
      id: 'no-repo',
      blocking: true,
      message: 'not inside a git repository — every sketch run checkpoints with `git stash create`, ' +
        'so without a repo there is nothing to revert to.',
      fix: 'git init + an initial commit (init offers this)',
    })
    return gates
  }
  if (state.isHome) {
    gates.push({
      id: 'home-repo',
      blocking: true,
      message: `the enclosing git repo is your HOME directory (${state.toplevel}) — the plugin refuses ` +
        'this outright, because a stray ~/.git turns any staging operation into "the whole home dir".',
      fix: 'run `git init` inside the project directory so it has its own repo',
    })
  }
  if (!state.hasCommits) {
    gates.push({
      id: 'no-commits',
      blocking: true,
      message: 'the repository has no commits yet — a clean tree checkpoints to HEAD, and there is no HEAD.',
      fix: 'make an initial commit (init offers this)',
    })
  }
  if (state.dirty && !allowDirty) {
    gates.push({
      id: 'dirty',
      blocking: true,
      message: `working tree has uncommitted changes (${state.dirtyFiles.length} path(s)) — refused so a ` +
        'revert can never take your own unsaved work with it.',
      fix: 'commit them, or accept allowDirty: true in the plugin options (--allow-dirty)',
    })
  }
  return gates
}

export function gitInit(dir: string): void {
  git(dir, ['init'])
}

/** Stage everything under `dir` and commit. Returns the new SHA. */
export function commitAll(dir: string, message: string): string {
  git(dir, ['add', '-A'])
  // -c so we never depend on (or mutate) the user's global identity
  git(dir, [
    '-c', 'user.name=sketch2code setup',
    '-c', 'user.email=setup@sketch2code.local',
    'commit', '--no-verify', '-m', message,
  ])
  return git(dir, ['rev-parse', 'HEAD'])
}

/**
 * Run bundles land in .sketch2code/runs/ — hundreds of files per session. Left
 * untracked they make the tree permanently dirty, which trips the dirty gate on
 * every subsequent run. Ignoring them keeps the safety gate usable.
 */
export function ensureGitignore(dir: string): { changed: boolean; path: string } {
  const path = join(dir, '.gitignore')
  const entry = '.sketch2code/'
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const lines = existing.split('\n').map((l) => l.trim())
  const has = (name: string): boolean => lines.some((l) => l.replace(/^\//, '').replace(/\/$/, '') === name)
  let add = ''
  if (!has('.sketch2code')) add += `\n# sketch-to-code run bundles (strokes, prompts, transcripts)\n${entry}\n`
  // s2c-024: a project with no .gitignore at all got node_modules into the
  // initial commit init makes, and Vite's own cache (node_modules/.vite) then
  // dirtied the tree before the first sketch, so the first edit was refused.
  if (!has('node_modules')) add += '\n# dependencies (added by sketch-to-code: the tree must stay clean)\nnode_modules/\n'
  if (!add) return { changed: false, path }
  const prefix = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  writeFileSync(path, `${existing}${prefix}${add}`)
  return { changed: true, path }
}

import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'
import type { GitState } from './git.js'

export interface GhState {
  installed: boolean
  version: string | null
  authenticated: boolean
  notes: string[]
}

export function ghState(): GhState {
  const v = spawnSync('gh', ['--version'], { encoding: 'utf8', timeout: 20_000 })
  if (v.status !== 0) {
    return {
      installed: false,
      version: null,
      authenticated: false,
      notes: ['`gh` not found — GitHub is optional; sketch-to-code works fully on a local-only repo'],
    }
  }
  const version = (v.stdout ?? '').trim().split('\n')[0] ?? null
  const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8', timeout: 30_000 })
  const authenticated = auth.status === 0
  return {
    installed: true,
    version,
    authenticated,
    notes: authenticated ? [] : ['`gh` is installed but not authenticated (`gh auth login`)'],
  }
}

export interface RemoteResult {
  ok: boolean
  action: 'none' | 'connected' | 'created' | 'refused' | 'failed'
  detail: string
}

/**
 * Attach an existing remote. Idempotent: the same URL on an existing `origin`
 * is a no-op, a DIFFERENT URL is refused rather than silently repointed — the
 * one thing you must never guess about is where someone's code gets pushed.
 */
export function connectRemote(dir: string, url: string, state: GitState): RemoteResult {
  const origin = state.remotes.find((r) => r.name === 'origin')
  if (origin && origin.url === url) return { ok: true, action: 'none', detail: `origin already points at ${url}` }
  if (origin) {
    return {
      ok: false,
      action: 'refused',
      detail: `origin already points at ${origin.url} — not repointing it to ${url}; ` +
        'run `git remote set-url origin <url>` yourself if that is what you want',
    }
  }
  const res = spawnSync('git', ['remote', 'add', 'origin', url], { cwd: dir, encoding: 'utf8', timeout: 30_000 })
  return res.status === 0
    ? { ok: true, action: 'connected', detail: `added origin ${url}` }
    : { ok: false, action: 'failed', detail: (res.stderr ?? '').trim() }
}

export interface CreateRepoOptions {
  name?: string
  private?: boolean
  /** A push happens ONLY when this is true — never as a side effect of creating. */
  push: boolean
}

/** `gh repo create`. Callers must have an explicit confirmation in hand. */
export function createRemote(dir: string, opts: CreateRepoOptions): RemoteResult {
  const name = opts.name ?? basename(dir)
  const args = ['repo', 'create', name, '--source=.', opts.private === false ? '--public' : '--private']
  if (opts.push) args.push('--push')
  const res = spawnSync('gh', args, { cwd: dir, encoding: 'utf8', timeout: 120_000 })
  const out = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
  return res.status === 0
    ? { ok: true, action: 'created', detail: `gh ${args.join(' ')}\n${out}` }
    : { ok: false, action: 'failed', detail: out }
}

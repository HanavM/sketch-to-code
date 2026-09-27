import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { resolveChain } from './deps.js'

export interface ClaudeCheck {
  /** @anthropic-ai/claude-agent-sdk resolvable from the project (via the plugin). */
  sdk: boolean
  sdkPath: string | null
  /** The `claude` executable the SDK will spawn. */
  cli: boolean
  cliPath: string | null
  cliVersion: string | null
  /** A credentials file exists — weak evidence, and reported as such. */
  signedInHint: boolean
  ok: boolean
  notes: string[]
}

const CANDIDATE_PATHS = [
  join(homedir(), '.claude', 'local', 'claude'),
  join(homedir(), '.local', 'bin', 'claude'),
  '/opt/homebrew/bin/claude',
  '/usr/local/bin/claude',
]

function findCli(): string | null {
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], {
    encoding: 'utf8',
    timeout: 10_000,
  })
  const hit = (which.stdout ?? '').split('\n').map((l) => l.trim()).find(Boolean)
  if (hit) return hit
  return CANDIDATE_PATHS.find((p) => existsSync(p)) ?? null
}

/**
 * Codegen shells out to the user's own Claude Code through
 * @anthropic-ai/claude-agent-sdk (subscription auth, no API key). This checks
 * that it is *reachable* — resolvable SDK, a launchable `claude` binary — and
 * deliberately makes NO model call: onboarding should cost zero tokens.
 */
export function checkClaudeCode(projectDir: string): ClaudeCheck {
  const notes: string[] = []
  // via the chain: the SDK arrives with @s2c/pipeline, which the plugin loads
  // from its own install — not from the app's node_modules.
  const sdkPath = resolveChain(projectDir).sdk
  const cliPath = findCli()
  let cliVersion: string | null = null
  if (cliPath) {
    const v = spawnSync(cliPath, ['--version'], { encoding: 'utf8', timeout: 20_000 })
    cliVersion = v.status === 0 ? (v.stdout ?? '').trim().split('\n')[0]! : null
    if (cliVersion === null) notes.push(`\`${cliPath} --version\` did not succeed — the binary may be broken`)
  } else {
    notes.push('no `claude` on PATH — install Claude Code (https://claude.com/claude-code) and run it once to sign in')
  }
  if (!sdkPath) {
    notes.push('@anthropic-ai/claude-agent-sdk not resolvable from the plugin — it arrives with @s2c/pipeline; ' +
      'run `npm install` (in a linked checkout, `npm run build` there too)')
  }
  const signedInHint = existsSync(join(homedir(), '.claude.json')) || existsSync(join(homedir(), '.claude'))
  if (!signedInHint) notes.push('no ~/.claude state found — run `claude` once and sign in before your first sketch run')

  return {
    sdk: sdkPath !== null,
    sdkPath,
    cli: cliPath !== null && cliVersion !== null,
    cliPath,
    cliVersion,
    signedInHint,
    ok: sdkPath !== null && cliPath !== null && cliVersion !== null,
    notes,
  }
}

import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { checkClaudeCode, type ClaudeCheck } from './claude.js'
import { PLUGIN_PKG } from './config.js'
import { resolveChain } from './deps.js'
import { detectProject, type ProjectInfo } from './detect.js'
import { evaluateGates, gitState, type Gate, type GitState } from './git.js'
import { ghState, type GhState } from './github.js'
import { devServerPort, probeViteConfig, type Probe } from './probe.js'

export interface Finding {
  id: string
  level: 'ok' | 'warn' | 'error'
  message: string
}

export interface DoctorReport {
  dir: string
  healthy: boolean
  exitCode: number
  findings: Finding[]
  project: ProjectInfo
  git: GitState
  gates: Gate[]
  probe: Probe | null
  claude: ClaudeCheck
  gh: GhState
  port: number | null
  nextSteps: string[]
}

export interface DoctorOptions {
  dir: string
  /** Skip loading the config through vite (fast, less informative). */
  probe?: boolean
  /** Off only for tests: `claude --version` and `gh auth status` cost seconds. */
  externalChecks?: boolean
  /** The allowDirty the project's config declares is detected, but can be overridden. */
  allowDirty?: boolean
}

/** Read allowDirty straight out of the config text — good enough to explain a refusal. */
function declaredAllowDirty(configPath: string | null): boolean {
  if (!configPath) return false
  try {
    return /sketch2code\s*\(\s*\{[^}]*allowDirty\s*:\s*true/s.test(readFileSync(configPath, 'utf8'))
  } catch {
    return false
  }
}

/**
 * Diagnose an existing install: is the plugin wired and loading, is git in a
 * state the plugin will accept, is Claude Code reachable, which port will the
 * dev server use, and what should the user type next.
 */
export function runDoctor(options: DoctorOptions): DoctorReport {
  const dir = resolve(options.dir)
  const findings: Finding[] = []
  const add = (id: string, level: Finding['level'], message: string): void => {
    findings.push({ id, level, message })
  }

  const project = detectProject(dir)
  if (project.verdict === 'no-project') {
    add('project', 'error', `no package.json in ${dir}`)
  } else if (project.verdict === 'unsupported') {
    for (const b of project.blockers) add('project', 'error', b.message)
  } else {
    add('project', 'ok', `Vite + React (${project.pkg?.name ?? 'unnamed'}), ${project.jsxFiles} JSX/TSX file(s)`)
  }

  // dependency + config wiring
  if (project.hasPluginDep) add('dependency', 'ok', `${PLUGIN_PKG} in package.json`)
  else add('dependency', 'error', `${PLUGIN_PKG} is not a dependency — run \`sketch-to-code init\``)

  const chain = resolveChain(dir)
  const resolved = chain.plugin
  if (resolved) add('resolve', 'ok', `${PLUGIN_PKG} resolves to ${resolved}`)
  else add('resolve', 'error', `${PLUGIN_PKG} cannot be resolved from this project — run \`npm install\``)

  if (chain.pipeline) add('pipeline', 'ok', `@s2c/pipeline resolves (${chain.pipeline}) — codegen, codemods and checkpoints available`)
  else add('pipeline', 'warn', '@s2c/pipeline not resolvable: the overlay will load in capture-only mode (no edits)')

  if (!project.viteConfigPath) {
    add('config', 'error', 'no vite config found — run `sketch-to-code init`')
  } else {
    const text = readFileSync(project.viteConfigPath, 'utf8')
    const rel = relative(dir, project.viteConfigPath)
    if (/sketch2code\s*\(/.test(text)) add('config', 'ok', `${rel} calls sketch2code()`)
    else add('config', 'error', `${rel} does not call sketch2code() — run \`sketch-to-code init\``)
  }

  let probe: Probe | null = null
  if (options.probe === false) {
    add('load', 'warn', 'config load check skipped')
  } else if (project.viteConfigPath && resolved) {
    probe = probeViteConfig(dir, project.viteConfigPath)
    if (probe.ok && probe.hasSketch2code) add('load', 'ok', `vite resolves plugins: ${probe.plugins.join(', ')}`)
    else if (probe.ok) add('load', 'error', `config loads but sketch2code is missing from the plugin list (${probe.plugins.join(', ')})`)
    else add('load', 'error', `vite could not load ${relative(dir, project.viteConfigPath)} (${probe.reason}): ${probe.detail}`)
  } else {
    add('load', 'warn', 'skipped the config load check — the plugin is not installed yet')
  }

  // git: the same gates the plugin enforces at run time
  const allowDirty = options.allowDirty ?? declaredAllowDirty(project.viteConfigPath)
  const git = gitState(dir)
  const gates = evaluateGates(git, allowDirty)
  if (gates.length === 0) {
    add('git', 'ok', `${git.toplevel}${git.branch ? ` on ${git.branch}` : ''}${git.dirty ? ' (dirty, allowDirty: true)' : ', clean'}`)
  } else {
    for (const g of gates) add(`git:${g.id}`, 'error', `${g.message} → ${g.fix}`)
  }

  const external = options.externalChecks !== false
  const claude = external
    ? checkClaudeCode(dir)
    : { sdk: false, sdkPath: null, cli: false, cliPath: null, cliVersion: null, signedInHint: false, ok: false, notes: ['skipped'] }
  if (!external) add('claude-code', 'warn', 'Claude Code check skipped')
  else if (claude.ok) add('claude-code', 'ok', `Claude Code ${claude.cliVersion} at ${claude.cliPath}; agent SDK resolved`)
  else for (const n of claude.notes) add('claude-code', 'error', n)
  if (external && claude.ok && !claude.signedInHint) {
    add('claude-code', 'warn', 'no ~/.claude state — sign in once with `claude`')
  }

  const gh = external
    ? ghState()
    : { installed: false, version: null, authenticated: false, notes: ['skipped'] }
  add('github', 'ok', gh.installed
    ? `${gh.version ?? 'gh'}${gh.authenticated ? ', authenticated' : ', not authenticated'}; ` +
      (git.remotes.length ? `remote: ${git.remotes.map((r) => `${r.name} → ${r.url}`).join(', ')}` : 'no remote (optional)')
    : `gh not installed (optional); ${git.remotes.length ? `remote: ${git.remotes.map((r) => r.url).join(', ')}` : 'no remote'}`)

  const port = probe ? devServerPort(probe) : null
  const url = `http://localhost:${port ?? 5173}`
  const errors = findings.filter((f) => f.level === 'error')
  const devScript = project.pkg?.scripts?.dev ? 'npm run dev' : 'npx vite'

  const nextSteps = errors.length
    ? [
        `fix the ${errors.length} error(s) above — \`sketch-to-code init\` handles the wiring ones`,
        ...gates.map((g) => g.fix),
      ]
    : [
        `${devScript} — then open ${url}`,
        'Alt+D toggles draw mode; ▶ Run sends the sketch',
        `run history: ${url}/@s2c/runs (and .sketch2code/runs/<id>/ on disk)`,
      ]

  return {
    dir,
    healthy: errors.length === 0,
    exitCode: errors.length === 0 ? 0 : 1,
    findings,
    project,
    git,
    gates,
    probe,
    claude,
    gh,
    port: port ?? (probe ? devServerPort(probe) : null),
    nextSteps,
  }
}

export function formatDoctor(report: DoctorReport): string {
  const icon = { ok: '✓', warn: '!', error: '✗' } as const
  const lines = [`sketch-to-code doctor — ${report.dir}`, '']
  for (const f of report.findings) lines.push(`${icon[f.level]} ${f.id.padEnd(12)} ${f.message}`)
  lines.push('', report.healthy ? 'Healthy. Next:' : 'Not ready. Next:')
  for (const n of report.nextSteps) lines.push(`  → ${n}`)
  return lines.join('\n')
}

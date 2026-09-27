import { realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { relative, resolve } from 'node:path'
import { checkClaudeCode, type ClaudeCheck } from './claude.js'
import { planViteConfig, type ConfigPlan } from './config.js'
import { addDevDependency, resolveDepSpec, resolveFromProject, runInstall, type DepSpec } from './deps.js'
import { detectProject, type ProjectInfo } from './detect.js'
import { commitAll, ensureGitignore, evaluateGates, gitInit, gitState, type Gate, type GitState } from './git.js'
import { connectRemote, createRemote, ghState, type GhState } from './github.js'
import { devServerPort, probeViteConfig, type Probe } from './probe.js'

export interface Question {
  id: string
  message: string
  /** Extra context (a diff, a command) shown above the prompt. */
  detail?: string
}

export type Confirm = (q: Question) => Promise<boolean>

export interface InitOptions {
  dir: string
  /** Pre-approve every write this tool would ask about. Never approves a push. */
  yes?: boolean
  dryRun?: boolean
  allowDirty?: boolean
  install?: boolean
  gitInit?: boolean
  commit?: boolean
  gitignore?: boolean
  probe?: boolean
  /** Off only for tests: `claude --version` costs a second or two. */
  claudeCheck?: boolean
  port?: number
  dep?: string
  github?: 'none' | 'create' | 'connect'
  remote?: string
  repoName?: string
  push?: boolean
  confirm?: Confirm
  log?: (line: string) => void
}

export type StepStatus = 'ok' | 'skipped' | 'planned' | 'failed'

export interface Step {
  id: string
  status: StepStatus
  detail: string
}

export interface InitResult {
  ok: boolean
  exitCode: number
  steps: Step[]
  project: ProjectInfo
  gates: Gate[]
  git: GitState
  dep: DepSpec | null
  config: ConfigPlan | null
  probe: Probe | null
  claude: ClaudeCheck | null
  gh: GhState | null
  port: number | null
  nextSteps: string[]
  /** True when nothing was written. */
  dryRun: boolean
}

// Non-interactive by default: a tool that writes to someone's repo should need
// a yes, and "no TTY" is not a yes.
const DENY: Confirm = async () => false

const realpath = (p: string): string => {
  try {
    return realpathSync(p)
  } catch {
    return p
  }
}

export async function runInit(options: InitOptions): Promise<InitResult> {
  // realpath, because git reports its toplevel realpathed: on macOS /tmp is a
  // symlink to /private/tmp, and comparing the two spellings would make us
  // "helpfully" git-init a nested repo inside an existing one.
  const dir = realpath(resolve(options.dir))
  const log = options.log ?? (() => {})
  const dryRun = options.dryRun === true
  const confirm: Confirm = options.yes
    ? async () => true
    : (options.confirm ?? DENY)
  const steps: Step[] = []
  const push = (id: string, status: StepStatus, detail: string): void => {
    steps.push({ id, status, detail })
    log(`${status === 'ok' ? '✓' : status === 'failed' ? '✗' : status === 'planned' ? '·' : '—'} ${id}: ${detail}`)
  }

  const project = detectProject(dir)
  const bail = (partial: Partial<InitResult>): InitResult => ({
    ok: false,
    exitCode: 1,
    steps,
    project,
    gates: [],
    git: gitState(dir),
    dep: null,
    config: null,
    probe: null,
    claude: null,
    gh: null,
    port: null,
    nextSteps: ['fix the problem above, then re-run `sketch2code init` (`sketch2code help` lists the flags)'],
    dryRun,
    ...partial,
  })

  // ── 1. is this even a project we can drive? ────────────────────────────────
  if (project.verdict === 'no-project') {
    push('detect', 'failed', `no package.json in ${dir} — point init at your app's root (\`sketch2code init ./my-app\`)`)
    return bail({})
  }
  if (project.verdict === 'unsupported') {
    for (const b of project.blockers) push('detect', 'failed', b.message)
    push('detect', 'failed', 'nothing was written — sketch-to-code supports Vite + React/JSX only')
    return bail({})
  }
  push(
    'detect',
    'ok',
    `Vite + React project ${project.pkg?.name ?? '(unnamed)'} — ${project.jsxFiles} JSX/TSX file(s), ` +
      `config: ${project.viteConfigPath ? relative(dir, project.viteConfigPath) : 'none yet'}`,
  )
  if (project.viteConfigPaths.length > 1) {
    push('detect', 'skipped', `multiple vite configs found (${project.viteConfigPaths.map((p) => relative(dir, p)).join(', ')}); ` +
      `editing ${relative(dir, project.viteConfigPath!)} — Vite itself picks the first of these`)
  }

  // ── 2. the safety gates, UP FRONT ─────────────────────────────────────────
  let git = gitState(dir)
  let gates = evaluateGates(git, options.allowDirty === true)

  // set when the ignore entry has to be written early, so it lands in the
  // initial commit instead of dirtying a freshly created repo
  let ignoreAdded = false
  const noRepo = gates.find((g) => g.id === 'no-repo')
  const homeRepo = gates.find((g) => g.id === 'home-repo')

  if (homeRepo && resolve(dir) === resolve(homedir())) {
    push('git', 'failed', `${homeRepo.message} This directory IS your home directory — move the project into its own folder first.`)
    return bail({ gates, git })
  }

  if (noRepo || homeRepo) {
    const why = noRepo ? noRepo.message : homeRepo!.message
    if (dryRun) {
      push('git', 'planned', `would run \`git init\` in ${dir} and make an initial commit (${why})`)
    } else {
      const ok = options.gitInit === true || (await confirm({
        id: 'git-init',
        message: `Run \`git init\` in ${dir} and make an initial commit?`,
        detail: why,
      }))
      if (!ok) {
        push('git', 'failed', 'declined — nothing written. sketch-to-code needs a git repo for its revert ' +
          'checkpoint; re-run with --git-init (or run `git init && git commit` yourself) when ready.')
        return bail({ gates, git })
      }
      try {
        if (noRepo || resolve(git.toplevel ?? '') !== resolve(dir)) gitInit(dir)
        if (options.gitignore !== false) ignoreAdded = ensureGitignore(dir).changed || ignoreAdded
        const sha = commitAll(dir, 'initial commit')
        push('git', 'ok', `git init + initial commit ${sha.slice(0, 8)} in ${dir}`)
      } catch (err) {
        push('git', 'failed', `git setup failed: ${String(err)}`)
        return bail({ gates, git })
      }
      git = gitState(dir)
      gates = evaluateGates(git, options.allowDirty === true)
    }
  }

  const noCommits = gates.find((g) => g.id === 'no-commits')
  if (noCommits) {
    if (dryRun) {
      push('git', 'planned', 'would make an initial commit (repo has no commits, so there is no checkpoint to revert to)')
    } else {
      const ok = options.gitInit === true || options.commit === true || (await confirm({
        id: 'initial-commit',
        message: `Make an initial commit in ${git.toplevel}?`,
        detail: noCommits.message,
      }))
      if (!ok) {
        push('git', 'failed', 'declined — nothing written. Without a commit there is no checkpoint to revert to; ' +
          'commit your tree, then re-run init.')
        return bail({ gates, git })
      }
      try {
        if (options.gitignore !== false) ignoreAdded = ensureGitignore(dir).changed || ignoreAdded
        const sha = commitAll(dir, 'initial commit')
        push('git', 'ok', `initial commit ${sha.slice(0, 8)}`)
      } catch (err) {
        push('git', 'failed', `commit failed: ${String(err)}`)
        return bail({ gates, git })
      }
      git = gitState(dir)
      gates = evaluateGates(git, options.allowDirty === true)
    }
  }

  const dirty = gates.find((g) => g.id === 'dirty')
  if (dirty) {
    push('git', 'skipped', `${dirty.message} Setup continues; you will be asked to commit at the end ` +
      '(or pass --allow-dirty to write allowDirty: true into the plugin options).')
  } else if (!noRepo && !homeRepo && !noCommits) {
    push('git', 'ok', `git repo ${git.toplevel}${git.branch ? ` on ${git.branch}` : ''}, clean tree, ` +
      `checkpoints available${options.allowDirty ? ' (allowDirty: true will be written)' : ''}`)
  }

  // ── 3. .gitignore for run bundles ─────────────────────────────────────────
  if (options.gitignore === false) {
    push('gitignore', 'skipped', '--no-gitignore: .sketch2code/ will show up as untracked noise')
  } else if (dryRun) {
    push('gitignore', 'planned', 'would add .sketch2code/ to .gitignore')
  } else {
    const gi = ensureGitignore(dir)
    const added = gi.changed || ignoreAdded
    push('gitignore', added ? 'ok' : 'skipped', added
      ? `added .sketch2code/ to .gitignore${ignoreAdded ? ' (in time for the initial commit)' : ''}`
      : '.sketch2code/ already ignored')
  }

  // ── 4. the dependency ─────────────────────────────────────────────────────
  const dep = resolveDepSpec(dir, options.dep)
  if (dryRun) {
    push('dependency', 'planned', `would add "${dep.name}": "${dep.spec}" to devDependencies${dep.note ? ` — ${dep.note}` : ''}`)
  } else {
    const write = addDevDependency(project.pkgPath!, dep.name, dep.spec)
    push(
      'dependency',
      'ok',
      write.changed
        ? `added "${dep.name}": "${dep.spec}" to devDependencies${dep.note ? ` — ${dep.note}` : ''}`
        : `"${dep.name}": "${write.existing}" already in ${write.where} — left alone`,
    )
  }

  if (options.install === false) {
    push('install', 'skipped', '--no-install: run `npm install` yourself before starting the dev server')
  } else if (dryRun) {
    push('install', 'planned', 'would run `npm install`')
  } else {
    const res = runInstall(dir)
    push('install', res.ok ? 'ok' : 'failed', res.ok ? 'npm install' : `npm install failed:\n${res.output.split('\n').slice(-8).join('\n')}`)
  }

  // ── 5. the vite config ────────────────────────────────────────────────────
  const plan = planViteConfig(project, {
    allowDirty: options.allowDirty,
    port: options.port,
    importSpec: dep.name,
  })
  let configWritten = false
  if (plan.action === 'none') {
    push('config', 'skipped', `${relative(dir, plan.path)} already wires sketch2code() — left untouched`)
  } else if (plan.action === 'manual') {
    push('config', 'failed', `${plan.notes.join(' ')}\nAdd this yourself:\n${plan.snippet ?? ''}`)
  } else if (dryRun) {
    push('config', 'planned', `would ${plan.action} ${relative(dir, plan.path)}:\n${plan.diff}`)
  } else {
    const ok = await confirm({
      id: 'write-config',
      message: plan.action === 'create'
        ? `Create ${relative(dir, plan.path)}?`
        : `Apply this change to ${relative(dir, plan.path)}?`,
      detail: plan.diff,
    })
    if (!ok) {
      push('config', 'failed', `declined — ${relative(dir, plan.path)} unchanged. Add it by hand:\n` +
        `import sketch2code from '${dep.name}'  →  plugins: [sketch2code(), …]`)
    } else {
      writeFileSync(plan.path, plan.after)
      configWritten = true
      push('config', 'ok', `${plan.action === 'create' ? 'created' : 'updated'} ${relative(dir, plan.path)}` +
        `${plan.notes.length ? ` (${plan.notes.join('; ')})` : ''}`)
    }
  }

  // ── 6. does it actually load? ─────────────────────────────────────────────
  let probe: Probe | null = null
  if (options.probe === false || dryRun) {
    push('verify', 'skipped', dryRun ? 'dry run: config not loaded' : 'verification skipped')
  } else if (plan.action === 'manual' || (plan.action !== 'none' && !configWritten)) {
    push('verify', 'skipped', 'config not wired, so there is nothing to load')
  } else {
    const resolved = resolveFromProject(dir, dep.name)
    if (!resolved) {
      push('verify', 'failed', `${dep.name} is not resolvable from ${dir} — the config will throw on ` +
        `\`npm run dev\`. Run \`npm install\`${dep.source === 'local-checkout' ? ' and `npm run build` in the checkout' : ''} and re-run \`sketch2code doctor\`.`)
    } else {
      probe = probeViteConfig(dir, plan.action === 'none' ? project.viteConfigPath : plan.path)
      if (probe.ok && probe.hasSketch2code) {
        push('verify', 'ok', `vite loaded the config; plugins: ${probe.plugins.join(', ')}`)
      } else if (probe.ok) {
        push('verify', 'failed', `config loads but sketch2code is NOT in the resolved plugin list ` +
          `(${probe.plugins.join(', ')}) — check whether the plugins array we edited is the one Vite uses`)
      } else {
        push('verify', 'failed', `vite could not load the config (${probe.reason}):\n${probe.detail}`)
      }
    }
  }

  // ── 7. Claude Code reachability (no model call) ────────────────────────────
  const claude = dryRun || options.claudeCheck === false ? null : checkClaudeCode(dir)
  if (claude) {
    push(
      'claude-code',
      claude.ok ? 'ok' : 'failed',
      claude.ok
        ? `Claude Code reachable (${claude.cliVersion} at ${claude.cliPath}); agent SDK resolved`
        : claude.notes.join('; '),
    )
  }

  // ── 8. GitHub, only if asked ──────────────────────────────────────────────
  let gh: GhState | null = null
  const wantsGithub = options.github !== undefined && options.github !== 'none'
  if (wantsGithub) {
    gh = ghState()
    push('github', gh.installed ? 'ok' : 'skipped', gh.installed
      ? `${gh.version}${gh.authenticated ? ', authenticated' : ', NOT authenticated'}`
      : gh.notes.join('; '))
  }
  if (options.remote || options.github === 'connect') {
    const url = options.remote
    if (!url) {
      push('remote', 'failed', '--github connect needs --remote <url>')
    } else if (dryRun) {
      push('remote', 'planned', `would run \`git remote add origin ${url}\``)
    } else {
      const r = connectRemote(dir, url, gitState(dir))
      push('remote', r.ok ? 'ok' : 'failed', r.detail)
    }
  } else if (options.github === 'create') {
    if (dryRun) {
      push('remote', 'planned', `would run \`gh repo create\` for ${options.repoName ?? '(directory name)'}` +
        `${options.push ? ' and push' : ' (no push)'}`)
    } else if (!gh?.installed || !gh.authenticated) {
      push('remote', 'failed', 'cannot create a GitHub repo: gh missing or not authenticated. ' +
        'This is optional — sketch-to-code works on a local-only repo.')
    } else {
      // `gh repo create` is a network write, so the flag alone is not enough
      // unless the user also said --yes in this same invocation.
      const ok = await confirm({
        id: 'gh-create',
        message: `Create a ${options.repoName ?? 'new'} GitHub repo for this project` +
          `${options.push ? ' and push the current branch' : ' (without pushing)'}?`,
      })
      if (!ok) push('remote', 'skipped', 'declined — no repo created, nothing pushed')
      else {
        const r = createRemote(dir, { name: options.repoName, push: options.push === true })
        push('remote', r.ok ? 'ok' : 'failed', r.detail)
      }
    }
  } else if (!wantsGithub) {
    const remotes = gitState(dir).remotes
    push('github', 'skipped', remotes.length
      ? `remote(s) already configured: ${remotes.map((r) => `${r.name} → ${r.url}`).join(', ')}`
      : 'no git remote, and none needed — sketch-to-code is entirely local ' +
        '(use `--github create` or `--github connect --remote <url>` if you want one)')
  }

  // ── 9. leave the tree in a state the plugin will accept ───────────────────
  git = gitState(dir)
  if (!dryRun && git.inRepo && git.dirty && options.allowDirty !== true) {
    const ok = options.commit === true || (await confirm({
      id: 'commit-setup',
      message: 'Commit the setup changes so the tree is clean (the plugin refuses a dirty tree)?',
      detail: git.dirtyFiles.slice(0, 20).join('\n'),
    }))
    if (ok) {
      try {
        const sha = commitAll(dir, 'chore: set up sketch-to-code')
        push('commit', 'ok', `committed setup as ${sha.slice(0, 8)} — tree clean, first run will checkpoint against it`)
      } catch (err) {
        push('commit', 'failed', `commit failed: ${String(err)}`)
      }
    } else {
      push('commit', 'skipped', 'tree left dirty — the plugin will refuse to run until you commit ' +
        '(or set sketch2code({ allowDirty: true }))')
    }
    git = gitState(dir)
  }

  const port = probe ? devServerPort(probe) : options.port ?? null
  const failed = steps.filter((s) => s.status === 'failed')
  const devScript = project.pkg?.scripts?.dev ? 'npm run dev' : 'npx vite'
  const url = `http://localhost:${port ?? 5173}`

  const nextSteps = dryRun
    ? ['this was a dry run — nothing was written. Re-run without --dry-run (add --yes to skip the prompts).']
    : [
        `start the dev server: ${devScript}${port !== null ? '' : ' (Vite prints the port it picked)'}`,
        `open ${url} and press Alt+D to enter draw mode`,
        'sketch: circle a button and write "red", scribble over a card to delete it, ' +
          'or box empty space and write what belongs there',
        'hit ▶ Run in the HUD; simple shapes mount instantly, the rest goes to Claude Code',
        `every run is recorded at ${url}/@s2c/runs (ink, prompt, plan, replies, verification, tokens)`,
        'run bundles on disk: .sketch2code/runs/<id>/ ; every run prints its own revert command',
      ]

  return {
    ok: failed.length === 0,
    exitCode: failed.length === 0 ? 0 : 1,
    steps,
    project,
    gates,
    git,
    dep,
    config: plan,
    probe,
    claude,
    gh,
    port,
    nextSteps,
    dryRun,
  }
}

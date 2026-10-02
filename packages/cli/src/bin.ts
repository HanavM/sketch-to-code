#!/usr/bin/env node
import { createInterface } from 'node:readline/promises'
import { createRequire } from 'node:module'
import { parseArgs } from './args.js'
import { formatDoctor, runDoctor } from './doctor.js'
import { runInit, type Confirm, type InitResult } from './init.js'

const require = createRequire(import.meta.url)
const VERSION = (require('../package.json') as { version: string }).version

const HELP = `sketch-to-code — draw on your running app, it edits your source.

Usage
  npx sketch-to-code sketch [path] [options]   draw once, change nothing else
  npx sketch-to-code init [path] [options]     set up sketch-to-code in a project
  npx sketch-to-code doctor [path]             diagnose an existing install
  npx sketch-to-code help | --version

  path defaults to the current directory. Vite + React/JSX projects only.

sketch — for when you want one component, not a new setup
  Starts a second dev server on a spare port using YOUR vite and YOUR config,
  adds the overlay to it in memory, opens a browser, waits for one run, and
  stops. Your vite config, package.json and node_modules are untouched; the
  plugin comes with this command and npx throws it away afterwards. Your SOURCE
  is edited — that is the point — and Ctrl+Z in the overlay undoes it.

sketch options
  --port <n>            pin the throwaway server's port (default: a free one)
  --no-open             print the url instead of opening a browser
  --keep-open           stay up and keep applying edits until Ctrl+C
  --timeout <seconds>   give up waiting (default 900)
  --json                machine-readable result

init options
  -y, --yes             accept every local write without asking (never pushes)
  --dry-run             show the plan and the config diff, write nothing
  --allow-dirty         write sketch2code({ allowDirty: true }) — runs are allowed
                        with uncommitted changes
  --no-install          don't run npm install
  --git-init            pre-approve \`git init\` + an initial commit
  --commit              pre-approve committing the setup changes
  --no-gitignore        don't add .sketch2code/ to .gitignore
  --port <n>            pin server.port when init authors the config itself
  --dep <spec>          dependency spec for @s2c/vite-plugin (default: auto —
                        workspace '*', a file: link to a local checkout, or the
                        published range)
  --github create       create a GitHub repo with gh (asks first; optional)
  --github connect --remote <url>
                        add an existing remote as origin
  --repo-name <name>    name for --github create
  --push                allow \`gh repo create\` to push (off by default)
  --json                machine-readable result

doctor options
  --no-probe            skip loading the vite config through vite
  --json                machine-readable report

Once installed: npm run dev → Alt+D → sketch → ▶ Run. Run history at /@s2c/runs.
`

/** Interactive y/N confirm. Non-TTY sessions get a hard "no" instead. */
function makeConfirm(): Confirm {
  if (!process.stdin.isTTY) {
    return async (q) => {
      console.log(`\n${q.detail ? `${q.detail}\n` : ''}${q.message}`)
      console.log('  (no TTY to ask on — declining. Re-run with --yes to accept, or --dry-run to see the plan.)')
      return false
    }
  }
  return async (q) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    try {
      if (q.detail) console.log(`\n${q.detail}`)
      const answer = await rl.question(`${q.message} [y/N] `)
      return /^y(es)?$/i.test(answer.trim())
    } finally {
      rl.close()
    }
  }
}

function printInit(result: InitResult): void {
  console.log('')
  if (result.dep && result.dep.note) console.log(`  dependency source: ${result.dep.note}\n`)
  console.log(result.dryRun ? 'Dry run — nothing written. Next:' : result.ok ? 'Set up. Next:' : 'Finished with problems. Next:')
  for (const n of result.nextSteps) console.log(`  → ${n}`)
  if (!result.ok) {
    console.log('\nUnfinished steps:')
    for (const s of result.steps.filter((x) => x.status === 'failed')) console.log(`  ✗ ${s.id}: ${s.detail}`)
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))
  for (const e of args.errors) console.error(`sketch-to-code: ${e}`)
  if (args.errors.length) {
    console.error('\nRun `sketch-to-code help` for the option list.')
    return 2
  }
  if (args.bools.version) {
    console.log(VERSION)
    return 0
  }
  if (args.bools.help || args.command === '' || args.command === 'help') {
    console.log(HELP)
    return args.command === '' && !args.bools.help ? 2 : 0
  }

  const dir = args.target ?? process.cwd()
  const portRaw = args.values.port
  const port = portRaw === undefined ? undefined : Number(portRaw)
  if (port !== undefined && !Number.isInteger(port)) {
    console.error(`sketch-to-code: --port must be an integer, got ${portRaw}`)
    return 2
  }
  const github = args.values.github
  if (github !== undefined && !['create', 'connect', 'none'].includes(github)) {
    console.error(`sketch-to-code: --github must be create, connect or none (got ${github})`)
    return 2
  }

  if (args.command === 'sketch' || args.command === 'draw') {
    const { sketchOnce } = await import('./sketch.js')
    const result = await sketchOnce({
      dir,
      port,
      open: args.bools.open,
      until: args.bools['keep-open'] ? 'quit' : 'first-edit',
      ...(args.values.timeout ? { timeoutMs: Number(args.values.timeout) * 1000 } : {}),
      onEvent: ({ kind, message }) => {
        if (kind === 'ready') {
          console.log(`sketch-to-code: drawing on ${dir}`)
          console.log(`  ${message}  ← opening this; your own dev server is untouched`)
          console.log('  draw, then press ▶ Run. Esc cancels. Ctrl+C quits without waiting.')
        } else console.log(`  ${kind}: ${message}`)
      },
    })
    if (args.bools.json) {
      console.log(JSON.stringify(result, null, 2))
      return result.ok ? 0 : 1
    }
    if (result.reason === 'refused') {
      console.error('sketch-to-code: cannot draw on this project')
      for (const b of result.blockers ?? []) console.error(`  ✗ ${b.message}`)
      return 2
    }
    if (result.reason === 'timeout') {
      console.error('sketch-to-code: nothing was drawn in time — nothing was written')
      return 1
    }
    if (!result.ok) {
      console.error(`sketch-to-code: ${result.error ?? 'the run failed'}`)
      return 1
    }
    if (result.summary) console.log(`✓ ${result.summary}`)
    console.log('nothing was installed; your vite config is unchanged. Ctrl+Z in the overlay undoes the edit.')
    return 0
  }

  if (args.command === 'init') {
    const result = await runInit({
      dir,
      yes: args.bools.yes,
      dryRun: args.bools['dry-run'],
      allowDirty: args.bools['allow-dirty'],
      install: args.bools.install,
      gitInit: args.bools['git-init'],
      commit: args.bools.commit,
      gitignore: args.bools.gitignore,
      port,
      dep: args.values.dep,
      github: github as 'create' | 'connect' | 'none' | undefined,
      remote: args.values.remote,
      repoName: args.values['repo-name'],
      push: args.bools.push,
      confirm: makeConfirm(),
      log: (line) => console.log(line),
    })
    if (args.bools.json) console.log(JSON.stringify(result, null, 2))
    else printInit(result)
    return result.exitCode
  }

  if (args.command === 'doctor' || args.command === 'check') {
    const report = runDoctor({ dir, probe: args.bools.probe })
    console.log(args.bools.json ? JSON.stringify(report, null, 2) : formatDoctor(report))
    return report.exitCode
  }

  console.error(`sketch-to-code: unknown command "${args.command}"\n`)
  console.log(HELP)
  return 2
}

process.exitCode = await main()

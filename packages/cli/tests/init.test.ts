import { afterAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInit, type InitResult, type Question } from '../src/init.js'
import { gitState } from '../src/git.js'
import { cleanupTempDirs, DEFAULT_VITE_CONFIG, initRepo, scaffoldViteReact, tempDir, write } from './helpers.js'

afterAll(cleanupTempDirs)

const step = (r: InitResult, id: string) => r.steps.filter((s) => s.id === id)
const statusOf = (r: InitResult, id: string) => step(r, id).map((s) => s.status)
const detailOf = (r: InitResult, id: string) => step(r, id).map((s) => s.detail).join('\n')

/**
 * Every test runs offline: no npm install, no vite config load, and no
 * `claude --version` (which costs ~2s a call). One test below turns the Claude
 * check back on to prove it reports.
 */
const base = { install: false as const, probe: false as const, claudeCheck: false as const }

const configOf = (dir: string, name = 'vite.config.ts'): string => readFileSync(join(dir, name), 'utf8')
const pkgOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
  devDependencies?: Record<string, string>
  dependencies?: Record<string, string>
}

describe('init on a clean Vite + React project', () => {
  it('wires the plugin, the dependency and the ignore entry, and says what to do next', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })

    expect(result.ok).toBe(true)
    expect(statusOf(result, 'detect')).toEqual(['ok'])
    expect(statusOf(result, 'config')).toEqual(['ok'])
    expect(configOf(dir)).toContain("import sketch2code from '@s2c/vite-plugin'")
    expect(configOf(dir)).toContain('plugins: [sketch2code(), react()]')
    expect(pkgOf(dir).devDependencies!['@s2c/vite-plugin']).toBe('*')
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toContain('.sketch2code/')
    expect(result.nextSteps.join('\n')).toMatch(/Alt\+D/)
    expect(result.nextSteps.join('\n')).toMatch(/@s2c\/runs/)
  })

  it('commits the setup so the tree the plugin sees is clean', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(statusOf(result, 'commit')).toEqual(['ok'])
    expect(gitState(dir).dirty).toBe(false)
  })

  it('leaves the tree alone when --allow-dirty is the chosen escape hatch', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*', allowDirty: true })
    expect(configOf(dir)).toContain('sketch2code({ allowDirty: true })')
    expect(statusOf(result, 'commit')).toEqual([])
    expect(gitState(dir).dirty).toBe(true)
  })

  it('writes nothing on --dry-run, and shows the diff it would have applied', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, dryRun: true, dep: '*' })
    expect(configOf(dir)).toBe(DEFAULT_VITE_CONFIG)
    expect(pkgOf(dir).devDependencies!['@s2c/vite-plugin']).toBeUndefined()
    expect(existsSync(join(dir, '.gitignore'))).toBe(false)
    expect(detailOf(result, 'config')).toContain('+import sketch2code')
    expect(result.nextSteps.join(' ')).toMatch(/dry run/)
  })
})

describe('the reachability checks init reports without spending a token', () => {
  it('reports Claude Code and the missing dependency install honestly', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ dir, yes: true, dep: '*', install: false, probe: false })
    expect(result.claude).not.toBeNull()
    // the temp project has no node_modules, so the SDK cannot resolve there
    expect(result.claude!.sdk).toBe(false)
    expect(detailOf(result, 'claude-code')).toMatch(/claude-agent-sdk|PATH/)
    expect(statusOf(result, 'install')).toEqual(['skipped'])
  })

  it('skips verification when the config was not wired, instead of claiming success', async () => {
    const dir = scaffoldViteReact({
      configName: 'vite.config.cjs',
      viteConfig: "module.exports = { plugins: [] }\n",
    })
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(statusOf(result, 'config')).toEqual(['failed'])
    expect(detailOf(result, 'config')).toMatch(/CommonJS/)
    expect(statusOf(result, 'verify')).toEqual(['skipped'])
    expect(result.ok).toBe(false)
  })
})

describe('init on the shapes a real project comes in', () => {
  it('handles a project whose config has an existing plugins array with several entries', async () => {
    const dir = scaffoldViteReact({
      viteConfig: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'

export default defineConfig({
  plugins: [react(), svgr()],
  server: { port: 4321 },
})
`,
    })
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(result.ok).toBe(true)
    const text = configOf(dir)
    expect(text).toContain('plugins: [sketch2code(), react(), svgr()]')
    expect(text).toContain('server: { port: 4321 }')
  })

  it('creates the config when the project has none', async () => {
    const dir = scaffoldViteReact({ viteConfig: null })
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*', port: 5221 })
    expect(result.ok).toBe(true)
    expect(result.config!.action).toBe('create')
    const text = configOf(dir)
    expect(text).toContain('plugins: [sketch2code(), react()]')
    expect(text).toContain('port: 5221')
  })

  it('handles a .js config in a JS-only project', async () => {
    const dir = scaffoldViteReact({
      configName: 'vite.config.js',
      viteConfig: "import { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [] })\n",
    })
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(result.ok).toBe(true)
    expect(configOf(dir, 'vite.config.js')).toContain('plugins: [sketch2code()]')
  })

  it('refuses a Next.js project without writing anything', async () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      name: 'next-app',
      dependencies: { next: '^15.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
      scripts: { dev: 'next dev' },
    }, null, 2))
    const result = await runInit({ ...base, dir, yes: true })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(detailOf(result, 'detect')).toMatch(/Next\.js/)
    expect(detailOf(result, 'detect')).toMatch(/nothing was written/)
    expect(pkgOf(dir).devDependencies).toBeUndefined()
    expect(existsSync(join(dir, 'vite.config.ts'))).toBe(false)
    expect(existsSync(join(dir, '.gitignore'))).toBe(false)
  })

  it('refuses a directory with no package.json and points at the app root', async () => {
    const result = await runInit({ ...base, dir: tempDir(), yes: true })
    expect(result.ok).toBe(false)
    expect(detailOf(result, 'detect')).toMatch(/no package\.json/)
  })
})

describe('init and the git safety gates, checked before anything is written', () => {
  it('offers git init + an initial commit in a non-git folder, and takes yes for an answer', async () => {
    const dir = scaffoldViteReact()
    const asked: Question[] = []
    const result = await runInit({
      ...base,
      dir,
      dep: '*',
      confirm: async (q) => {
        asked.push(q)
        return true
      },
    })
    expect(asked[0]!.id).toBe('git-init')
    expect(asked[0]!.detail).toMatch(/checkpoint/)
    expect(result.ok).toBe(true)
    const state = gitState(dir)
    expect(state.inRepo).toBe(true)
    expect(state.hasCommits).toBe(true)
    expect(state.dirty).toBe(false)
    expect(configOf(dir)).toContain('sketch2code()')
  })

  it('writes nothing when the git offer is declined, and says why', async () => {
    const dir = scaffoldViteReact()
    const result = await runInit({ ...base, dir, dep: '*', confirm: async () => false })
    expect(result.ok).toBe(false)
    expect(detailOf(result, 'git')).toMatch(/declined — nothing written/)
    expect(configOf(dir)).toBe(DEFAULT_VITE_CONFIG)
    expect(pkgOf(dir).devDependencies!['@s2c/vite-plugin']).toBeUndefined()
    expect(existsSync(join(dir, '.git'))).toBe(false)
  })

  it('makes the missing initial commit in a repo that has none', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir, false)
    expect(gitState(dir).hasCommits).toBe(false)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(result.ok).toBe(true)
    expect(statusOf(result, 'git')).toContain('ok')
    expect(gitState(dir).hasCommits).toBe(true)
  })

  it('reports a dirty tree up front and resolves it at the end', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    write(dir, 'src/WorkInProgress.tsx', 'export const wip = 1\n')
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(detailOf(result, 'git')).toMatch(/uncommitted changes/)
    expect(statusOf(result, 'commit')).toEqual(['ok'])
    expect(gitState(dir).dirty).toBe(false)
  })

  it('keeps a dirty tree dirty when the commit is declined, and says the plugin will refuse', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    write(dir, 'src/WorkInProgress.tsx', 'export const wip = 1\n')
    const result = await runInit({
      ...base,
      dir,
      dep: '*',
      // approve the config write, decline the commit
      confirm: async (q) => q.id === 'write-config',
    })
    expect(statusOf(result, 'commit')).toEqual(['skipped'])
    expect(detailOf(result, 'commit')).toMatch(/allowDirty/)
    expect(gitState(dir).dirty).toBe(true)
  })

  it('declining the config write leaves the file untouched and reports the manual step', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, dep: '*', confirm: async () => false })
    expect(result.ok).toBe(false)
    expect(configOf(dir)).toBe(DEFAULT_VITE_CONFIG)
    expect(detailOf(result, 'config')).toMatch(/Add it by hand/)
  })
})

describe('running init twice', () => {
  it('changes nothing the second time', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const first = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(first.ok).toBe(true)
    const configAfterFirst = configOf(dir)
    const pkgAfterFirst = readFileSync(join(dir, 'package.json'), 'utf8')
    const ignoreAfterFirst = readFileSync(join(dir, '.gitignore'), 'utf8')
    const headAfterFirst = gitState(dir)

    const second = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(second.ok).toBe(true)
    expect(configOf(dir)).toBe(configAfterFirst)
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(pkgAfterFirst)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(ignoreAfterFirst)
    expect(second.config!.action).toBe('none')
    expect(statusOf(second, 'config')).toEqual(['skipped'])
    expect(detailOf(second, 'dependency')).toMatch(/already in devDependencies/)
    // nothing to commit, so no second setup commit
    expect(statusOf(second, 'commit')).toEqual([])
    expect(gitState(dir).branch).toBe(headAfterFirst.branch)
  })

  it('only adds one plugin entry even if the first run was interrupted after the import', async () => {
    const dir = scaffoldViteReact({
      viteConfig: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import sketch2code from '@s2c/vite-plugin'

export default defineConfig({
  plugins: [react()],
})
`,
    })
    initRepo(dir)
    await runInit({ ...base, dir, yes: true, dep: '*' })
    const text = configOf(dir)
    expect(text.match(/import sketch2code/g)).toHaveLength(1)
    expect(text.match(/sketch2code\(\)/g)).toHaveLength(1)
  })
})

describe('GitHub stays optional', () => {
  it('says so when no remote is configured and none was asked for', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*' })
    expect(detailOf(result, 'github')).toMatch(/entirely local/)
    expect(result.gh).toBeNull()
  })

  it('never creates or pushes without a confirmation in the same invocation', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const asked: string[] = []
    const result = await runInit({
      ...base,
      dir,
      dep: '*',
      github: 'create',
      confirm: async (q) => {
        asked.push(q.id)
        return q.id !== 'gh-create'
      },
    })
    expect(asked).toContain('gh-create')
    expect(detailOf(result, 'remote')).toMatch(/declined|not authenticated|gh missing/)
    expect(gitState(dir).remotes).toEqual([])
  })

  it('connect needs a url, and reports it rather than half-doing it', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const result = await runInit({ ...base, dir, yes: true, dep: '*', github: 'connect' })
    expect(detailOf(result, 'remote')).toMatch(/needs --remote/)
  })

  it('attaches an existing remote when given one, and is idempotent', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const url = 'git@example.com:me/app.git'
    await runInit({ ...base, dir, yes: true, dep: '*', remote: url })
    expect(gitState(dir).remotes).toEqual([{ name: 'origin', url }])
    const again = await runInit({ ...base, dir, yes: true, dep: '*', remote: url })
    expect(detailOf(again, 'remote')).toMatch(/already points at/)
    expect(gitState(dir).remotes).toHaveLength(1)
  })

  it('refuses to repoint an existing origin at a different url', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    await runInit({ ...base, dir, yes: true, dep: '*', remote: 'git@example.com:me/a.git' })
    const result = await runInit({ ...base, dir, yes: true, dep: '*', remote: 'git@example.com:me/b.git' })
    expect(statusOf(result, 'remote')).toEqual(['failed'])
    expect(gitState(dir).remotes[0]!.url).toBe('git@example.com:me/a.git')
  })
})

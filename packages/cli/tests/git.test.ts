import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { commitAll, ensureGitignore, evaluateGates, gitInit, gitState } from '../src/git.js'
import { cleanupTempDirs, git, initRepo, scaffoldViteReact, tempDir, write } from './helpers.js'

afterAll(cleanupTempDirs)

describe('the git state the plugin will judge us by', () => {
  it('reports "no repo" for a plain folder', () => {
    const dir = scaffoldViteReact()
    const state = gitState(dir)
    expect(state.inRepo).toBe(false)
    const gates = evaluateGates(state, false)
    expect(gates.map((g) => g.id)).toEqual(['no-repo'])
    expect(gates[0]!.blocking).toBe(true)
  })

  it('reports "no commits" for a fresh git init', () => {
    const dir = scaffoldViteReact()
    initRepo(dir, false)
    const state = gitState(dir)
    expect(state.inRepo).toBe(true)
    expect(state.hasCommits).toBe(false)
    expect(evaluateGates(state, false).map((g) => g.id)).toContain('no-commits')
  })

  it('reports a clean committed repo as gate-free', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const state = gitState(dir)
    expect(state.dirty).toBe(false)
    expect(state.hasCommits).toBe(true)
    expect(evaluateGates(state, false)).toEqual([])
  })

  it('reports a dirty tree, and allowDirty clears exactly that gate', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    write(dir, 'src/extra.tsx', 'export const x = 1\n')
    const state = gitState(dir)
    expect(state.dirty).toBe(true)
    expect(state.dirtyFiles.some((f) => f.includes('extra.tsx'))).toBe(true)
    expect(evaluateGates(state, false).map((g) => g.id)).toEqual(['dirty'])
    expect(evaluateGates(state, true)).toEqual([])
  })

  it('refuses a repo whose toplevel is the home directory', () => {
    const fakeHome = tempDir('s2c-home-')
    const realHome = process.env.HOME
    try {
      // os.homedir() follows $HOME on POSIX, which is the only way to exercise
      // the gate the pipeline enforces without touching the real home dir.
      process.env.HOME = fakeHome
      initRepo(fakeHome, false)
      const state = gitState(fakeHome)
      expect(state.isHome).toBe(true)
      expect(evaluateGates(state, true).map((g) => g.id)).toContain('home-repo')
    } finally {
      if (realHome === undefined) delete process.env.HOME
      else process.env.HOME = realHome
    }
  })

  it('sees remotes, and reports none when there are none', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    expect(gitState(dir).remotes).toEqual([])
    git(dir, 'remote', 'add', 'origin', 'git@example.com:me/app.git')
    expect(gitState(dir).remotes).toEqual([{ name: 'origin', url: 'git@example.com:me/app.git' }])
  })

  it('init + commit leaves a clean tree with a HEAD', () => {
    const dir = scaffoldViteReact()
    gitInit(dir)
    const sha = commitAll(dir, 'initial commit')
    expect(sha).toMatch(/^[0-9a-f]{40}$/)
    const state = gitState(dir)
    expect(state.hasCommits).toBe(true)
    expect(state.dirty).toBe(false)
    expect(evaluateGates(state, false)).toEqual([])
  })
})

describe('ignoring run bundles', () => {
  afterEach(() => {})

  it('creates .gitignore with the entry', () => {
    const dir = scaffoldViteReact()
    const res = ensureGitignore(dir)
    expect(res.changed).toBe(true)
    expect(readFileSync(res.path, 'utf8')).toContain('.sketch2code/')
  })

  it('appends to an existing .gitignore without clobbering it', () => {
    const dir = scaffoldViteReact()
    writeFileSync(join(dir, '.gitignore'), 'node_modules\ndist')
    ensureGitignore(dir)
    const text = readFileSync(join(dir, '.gitignore'), 'utf8')
    expect(text).toContain('node_modules')
    expect(text).toContain('dist')
    expect(text).toContain('.sketch2code/')
  })

  it('is idempotent — a second run adds nothing', () => {
    const dir = scaffoldViteReact()
    ensureGitignore(dir)
    const once = readFileSync(join(dir, '.gitignore'), 'utf8')
    const again = ensureGitignore(dir)
    expect(again.changed).toBe(false)
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe(once)
  })

  it('recognizes the entry in other spellings', () => {
    const dir = scaffoldViteReact()
    writeFileSync(join(dir, '.gitignore'), '.sketch2code\n')
    expect(ensureGitignore(dir).changed).toBe(false)
  })
})

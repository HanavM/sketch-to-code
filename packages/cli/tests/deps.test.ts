import { afterAll, describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { addDevDependency, resolveChain, resolveDepSpec, resolveFromProject } from '../src/deps.js'
import { cleanupTempDirs, scaffoldViteReact } from './helpers.js'

afterAll(cleanupTempDirs)

const read = (dir: string) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('which dependency string to write', () => {
  it('links a project outside the repo to the local checkout, because nothing is published yet', () => {
    const dir = scaffoldViteReact()
    const spec = resolveDepSpec(dir)
    expect(spec.source).toBe('local-checkout')
    expect(spec.spec.startsWith('file:')).toBe(true)
    expect(spec.spec).toMatch(/packages\/vite-plugin$/)
    expect(spec.note).toMatch(/npm run build/)
  })

  it('uses the workspace protocol-free "*" for a project inside this repo', () => {
    // the demo app in this very workspace
    const inside = new URL('../../../examples/demo-app', import.meta.url).pathname
    expect(resolveDepSpec(inside).source).toBe('workspace')
    expect(resolveDepSpec(inside).spec).toBe('*')
  })

  it('takes an explicit override verbatim', () => {
    const spec = resolveDepSpec(scaffoldViteReact(), '^1.2.3')
    expect(spec).toMatchObject({ spec: '^1.2.3', source: 'override' })
  })
})

describe('adding the dependency', () => {
  it('adds it to devDependencies, sorted, preserving indentation and the trailing newline', () => {
    const dir = scaffoldViteReact()
    const res = addDevDependency(join(dir, 'package.json'), '@s2c/vite-plugin', '*')
    expect(res.changed).toBe(true)
    const raw = readFileSync(join(dir, 'package.json'), 'utf8')
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toContain('\n  "name"')
    expect(Object.keys(read(dir).devDependencies!)).toEqual(['@s2c/vite-plugin', '@vitejs/plugin-react', 'vite'])
  })

  it('never adds a second entry, and never rewrites an existing spec', () => {
    const dir = scaffoldViteReact()
    addDevDependency(join(dir, 'package.json'), '@s2c/vite-plugin', '*')
    const after = readFileSync(join(dir, 'package.json'), 'utf8')
    const second = addDevDependency(join(dir, 'package.json'), '@s2c/vite-plugin', 'file:/somewhere/else')
    expect(second).toMatchObject({ changed: false, existing: '*', where: 'devDependencies' })
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(after)
  })

  it('leaves it alone when it is a runtime dependency instead', () => {
    const dir = scaffoldViteReact()
    const pkgPath = join(dir, 'package.json')
    const pkg = read(dir)
    pkg.dependencies = { ...pkg.dependencies, '@s2c/vite-plugin': '^0.1.0' }
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    expect(addDevDependency(pkgPath, '@s2c/vite-plugin', '*')).toMatchObject({
      changed: false, existing: '^0.1.0', where: 'dependencies',
    })
  })
})

describe('resolving the plugin from a project', () => {
  it('returns null for a project with no node_modules', () => {
    expect(resolveFromProject(scaffoldViteReact(), '@s2c/vite-plugin')).toBeNull()
  })

  it('follows the chain through a linked plugin, the way Node will at run time', () => {
    // This is what a `file:` install looks like on disk: the app can see the
    // plugin and nothing else. The pipeline and the agent SDK live in the
    // checkout, and the plugin resolves them from there — a check anchored at
    // the app root would call a working install broken (the e2e caught exactly
    // this).
    const dir = scaffoldViteReact()
    const repo = new URL('../../..', import.meta.url).pathname
    mkdirSync(join(dir, 'node_modules', '@s2c'), { recursive: true })
    symlinkSync(join(repo, 'packages', 'vite-plugin'), join(dir, 'node_modules', '@s2c', 'vite-plugin'))

    expect(resolveFromProject(dir, '@s2c/pipeline')).toBeNull()
    const chain = resolveChain(dir)
    expect(chain.plugin).not.toBeNull()
    expect(chain.pipeline).not.toBeNull()
    expect(chain.sdk).not.toBeNull()
    expect(chain.sdk).toMatch(/claude-agent-sdk/)
  })

  it('resolves a package that is installed in this repo', () => {
    const here = new URL('../../..', import.meta.url).pathname
    expect(resolveFromProject(here, 'vite')).not.toBeNull()
  })
})

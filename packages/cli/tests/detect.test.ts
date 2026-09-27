import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProject } from '../src/detect.js'
import { cleanupTempDirs, scaffoldViteReact, tempDir, write } from './helpers.js'

afterAll(cleanupTempDirs)

const pkg = (dir: string, obj: unknown): void => {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(obj, null, 2)}\n`)
}

describe('deciding whether a project can be driven at all', () => {
  it('accepts a Vite + React app and finds its config', () => {
    const dir = scaffoldViteReact()
    const info = detectProject(dir)
    expect(info.verdict).toBe('supported')
    expect(info.viteConfigPath).toBe(join(dir, 'vite.config.ts'))
    expect(info.hasReactPlugin).toBe(true)
    expect(info.hasTypeScript).toBe(true)
    expect(info.jsxFiles).toBeGreaterThan(0)
  })

  it('reports no project when there is no package.json — rather than guessing', () => {
    const info = detectProject(tempDir())
    expect(info.verdict).toBe('no-project')
    expect(info.viteConfigPath).toBeNull()
  })

  it('refuses Next.js by dependency AND by config file', () => {
    const dir = tempDir()
    pkg(dir, { name: 'next-app', dependencies: { next: '^15.0.0', react: '^19.0.0' } })
    expect(detectProject(dir).blockers.map((b) => b.id)).toContain('next')

    const dir2 = tempDir()
    pkg(dir2, { name: 'next-app', dependencies: { react: '^19.0.0', vite: '^7.0.0' } })
    write(dir2, 'next.config.mjs', 'export default {}\n')
    const info = detectProject(dir2)
    expect(info.verdict).toBe('unsupported')
    expect(info.blockers[0]!.message).toMatch(/Next\.js/)
  })

  it.each([
    ['cra', { 'react-scripts': '5.0.1', react: '^18' }],
    ['vue', { vue: '^3.4.0', vite: '^7.0.0' }],
    ['svelte', { svelte: '^5.0.0', vite: '^7.0.0' }],
    ['nuxt', { nuxt: '^3.0.0' }],
    ['angular', { '@angular/core': '^18.0.0' }],
    ['astro', { astro: '^5.0.0' }],
    ['remix', { '@remix-run/dev': '^2.0.0', react: '^18' }],
  ])('refuses %s', (id, deps) => {
    const dir = tempDir()
    pkg(dir, { name: id, dependencies: deps })
    const info = detectProject(dir)
    expect(info.verdict).toBe('unsupported')
    expect(info.blockers.map((b) => b.id)).toContain(id)
  })

  it('names the missing half when only one of vite/react is present', () => {
    const noVite = tempDir()
    pkg(noVite, { dependencies: { react: '^19.0.0' } })
    expect(detectProject(noVite).blockers.map((b) => b.id)).toEqual(['no-vite'])

    const noReact = tempDir()
    pkg(noReact, { devDependencies: { vite: '^7.0.0' } })
    expect(detectProject(noReact).blockers.map((b) => b.id)).toEqual(['no-react'])
  })

  it('lists every vite config candidate, so an ambiguous project is reportable', () => {
    const dir = scaffoldViteReact()
    write(dir, 'vite.config.js', 'export default {}\n')
    const info = detectProject(dir)
    expect(info.viteConfigPaths).toHaveLength(2)
    // .ts first: the same order Vite itself resolves in
    expect(info.viteConfigPath!.endsWith('vite.config.ts')).toBe(true)
  })

  it('sees the plugin when it is already a dependency', () => {
    const dir = scaffoldViteReact({
      pkg: { devDependencies: { vite: '^7.0.0', '@s2c/vite-plugin': '*' }, dependencies: { react: '^19' } },
    })
    expect(detectProject(dir).hasPluginDep).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { overlayAliases, overlayFailedScript } from '../src/overlay-bundle.js'

const REPO = resolve(__dirname, '../../..')

describe('overlayAliases (s2c-047)', () => {
  it('points at TS source in a checkout, so no prebuild is needed', () => {
    const a = overlayAliases(join(REPO, 'packages/dom'), join(REPO, 'packages/ink'))
    expect(a['@s2c/dom']).toBe(join(REPO, 'packages/dom/src/index.ts'))
    expect(a['@s2c/ink/classify']).toBe(join(REPO, 'packages/ink/src/classify.ts'))
  })

  it('aliases nothing in a published install, where only dist/ ships', () => {
    // the bug: an alias to node_modules/@s2c/dom/src/index.ts, which npm never installs
    const a = overlayAliases('/app/node_modules/@s2c/dom', '/app/node_modules/@s2c/ink', () => false)
    expect(a).toEqual({})
  })

  it('aliases each package on its own', () => {
    const a = overlayAliases('/d', '/i', (p) => p.startsWith('/d/'))
    expect(Object.keys(a)).toEqual(['@s2c/dom'])
  })
})

describe('overlayFailedScript (s2c-047)', () => {
  const run = (src: string, withBody = true) => {
    const appended: Array<Record<string, unknown>> = []
    const listeners: Array<() => void> = []
    const document = {
      body: withBody ? { appendChild: (el: Record<string, unknown>) => appended.push(el) } : null,
      getElementById: () => null,
      createElement: () => ({ style: {}, setAttribute(k: string, v: string) { (this as Record<string, unknown>)[k] = v } }),
      addEventListener: (_: string, f: () => void) => listeners.push(f),
    }
    const errors: unknown[][] = []
    const console = { error: (...a: unknown[]) => errors.push(a) }
    new Function('document', 'console', src)(document, console)
    return { appended, listeners, errors, document }
  }

  it('says on the page, in words, why there is nothing to draw on', () => {
    const { appended, errors } = run(overlayFailedScript('Error: Could not resolve "x"'))
    expect(appended).toHaveLength(1)
    expect(appended[0]!.textContent).toMatch(/could not start its drawing layer/)
    expect(appended[0]!.textContent).toMatch(/npx sketch-to-code doctor/)
    expect(appended[0]!.role).toBe('alert')
    // the build error stays in the console for whoever reports it
    expect(String(errors[0]![1])).toMatch(/Could not resolve/)
  })

  it('waits for the body when the script runs in <head>', () => {
    const { appended, listeners } = run(overlayFailedScript('e'), false)
    expect(appended).toHaveLength(0)
    expect(listeners).toHaveLength(1)
  })

  it('cannot be broken by quotes or newlines in the error', () => {
    expect(() => run(overlayFailedScript('a "quoted" `tick` \'x\'\n</script>'))).not.toThrow()
  })
})

describe('what npm would publish (s2c-047)', () => {
  // `files` decides what a published install has. Everything a package's
  // exports/main point at must be inside it, and anything the overlay bundle
  // reads at serve time must ship too.
  const pkgs = ['cli', 'dom', 'ink', 'intent', 'overlay-client', 'pipeline', 'providers', 'vite-plugin']
  const read = (p: string) => JSON.parse(readFileSync(join(REPO, 'packages', p, 'package.json'), 'utf8'))
  const targets = (exp: unknown): string[] =>
    typeof exp === 'string' ? [exp] : exp && typeof exp === 'object' ? Object.values(exp).flatMap(targets) : []

  for (const p of pkgs) {
    it(`${p}: every entry point is inside "files"`, () => {
      const pkg = read(p)
      expect(Array.isArray(pkg.files), `${p} has no "files" list, so npm would publish its tests and config`).toBe(true)
      const entries = [pkg.main, ...targets(pkg.exports), ...Object.values(pkg.bin ?? {})].filter(Boolean) as string[]
      for (const e of entries.filter((x) => x !== './package.json')) { // npm always ships package.json
        const top = e.replace(/^\.\//, '').split('/')[0]
        expect(pkg.files, `${p}: ${e} is not published`).toContain(top)
      }
    })
  }

  it('the overlay client ships the source the plugin bundles', () => {
    const pkg = read('overlay-client')
    expect(pkg.files).toContain('src')
    expect(existsSync(join(REPO, 'packages/overlay-client', pkg.main))).toBe(true)
  })
})

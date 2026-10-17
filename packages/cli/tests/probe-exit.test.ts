import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { probeViteConfig } from '../src/probe.js'

// s2c-043: React Router framework mode's plugin starts a watcher in
// configResolved, which kept the probe's child alive until its timeout:
// init and doctor each sat for 2 minutes on a healthy project.
const viteDir = dirname(createRequire(import.meta.url).resolve('vite/package.json'))
const dir = mkdtempSync(join(tmpdir(), 's2c-probe-exit-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('probeViteConfig', () => {
  it('returns as soon as the config resolves, even when a plugin keeps the process alive', () => {
    mkdirSync(join(dir, 'node_modules'))
    symlinkSync(viteDir, join(dir, 'node_modules', 'vite'), 'dir')
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}')
    writeFileSync(join(dir, 'vite.config.mjs'),
      "export default { server: { port: 4321 }, plugins: [{ name: 'watcher', configResolved() { setInterval(() => {}, 1000) } }] }\n")
    const t = Date.now()
    const p = probeViteConfig(dir, join(dir, 'vite.config.mjs'), 30_000)
    expect(p.ok).toBe(true)
    expect(p.plugins).toContain('watcher')
    expect(p.port).toBe(4321)
    expect(Date.now() - t).toBeLessThan(15_000)
  }, 40_000)
})

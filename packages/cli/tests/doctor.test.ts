import { afterAll, describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formatDoctor, runDoctor } from '../src/doctor.js'
import { runInit } from '../src/init.js'
import { cleanupTempDirs, initRepo, scaffoldViteReact, tempDir, write } from './helpers.js'

afterAll(cleanupTempDirs)

const quiet = { externalChecks: false as const, probe: false as const }
const finding = (r: ReturnType<typeof runDoctor>, id: string) => r.findings.filter((f) => f.id === id)
const level = (r: ReturnType<typeof runDoctor>, id: string) => finding(r, id).map((f) => f.level)
const text = (r: ReturnType<typeof runDoctor>, id: string) => finding(r, id).map((f) => f.message).join('\n')

describe('doctor on a project that has never been set up', () => {
  it('reports the missing dependency, the unwired config and what to run', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const report = runDoctor({ dir, ...quiet })
    expect(report.healthy).toBe(false)
    expect(report.exitCode).toBe(1)
    expect(level(report, 'dependency')).toEqual(['error'])
    expect(level(report, 'config')).toEqual(['error'])
    expect(text(report, 'config')).toMatch(/sketch-to-code init/)
    expect(report.nextSteps.join(' ')).toMatch(/sketch-to-code init/)
  })

  it('reports git problems with the fix beside them', () => {
    const dir = scaffoldViteReact()
    const report = runDoctor({ dir, ...quiet })
    expect(level(report, 'git:no-repo')).toEqual(['error'])
    expect(text(report, 'git:no-repo')).toMatch(/git init/)
  })
})

describe('doctor after init', () => {
  it('sees the wiring and stops complaining about it', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    await runInit({ dir, yes: true, dep: '*', install: false, probe: false, claudeCheck: false })
    const report = runDoctor({ dir, ...quiet })
    expect(level(report, 'dependency')).toEqual(['ok'])
    expect(level(report, 'config')).toEqual(['ok'])
    expect(level(report, 'git')).toEqual(['ok'])
    // still not healthy: nothing is installed in this temp project
    expect(level(report, 'resolve')).toEqual(['error'])
    expect(text(report, 'resolve')).toMatch(/npm install/)
  })

  it('explains a dirty tree only when the config did not ask for allowDirty', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    await runInit({ dir, yes: true, dep: '*', allowDirty: true, install: false, probe: false, claudeCheck: false })
    write(dir, 'src/Extra.tsx', 'export const e = 1\n')
    // the config declares allowDirty: true, so the dirty tree is not a problem
    const relaxed = runDoctor({ dir, ...quiet })
    expect(level(relaxed, 'git')).toEqual(['ok'])
    expect(text(relaxed, 'git')).toMatch(/allowDirty/)
    // the same tree judged without that licence is a blocking gate
    const strict = runDoctor({ dir, ...quiet, allowDirty: false })
    expect(level(strict, 'git:dirty')).toEqual(['error'])
  })

  it('reports capture-only mode when the pipeline is not resolvable', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const report = runDoctor({ dir, ...quiet })
    expect(level(report, 'pipeline')).toEqual(['warn'])
    expect(text(report, 'pipeline')).toMatch(/capture-only/)
  })
})

describe('doctor on a project it cannot support', () => {
  it('says so instead of listing wiring problems as if they were fixable', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'nextish', dependencies: { next: '^15' } }))
    const report = runDoctor({ dir, ...quiet })
    expect(text(report, 'project')).toMatch(/Next\.js/)
    expect(report.healthy).toBe(false)
  })
})

describe('the printed report', () => {
  it('renders one line per finding plus the next steps', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const out = formatDoctor(runDoctor({ dir, ...quiet }))
    expect(out).toMatch(/sketch-to-code doctor —/)
    expect(out).toMatch(/[✓!✗] \w+/)
    expect(out).toMatch(/Not ready\. Next:/)
  })

  it('reports the default dev-server port when it cannot load the config', () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const report = runDoctor({ dir, ...quiet })
    expect(report.port).toBeNull()
    expect(formatDoctor(report)).toMatch(/localhost:5173|sketch-to-code init/)
  })
})

describe('overlayFinding (s2c-047)', () => {
  it('a drawing layer that cannot be built is an error, in words', async () => {
    const { overlayFinding } = await import('../src/probe.js')
    const f = overlayFinding({ overlay: 'failed', overlayDetail: 'Build failed with 3 errors:\nmore' })
    expect(f?.level).toBe('error')
    expect(f?.message).toMatch(/nothing to draw on/)
    expect(f?.message).toMatch(/Build failed with 3 errors:$/)
    expect(overlayFinding({ overlay: 'ok', overlayDetail: '' })?.level).toBe('ok')
    // an older plugin can't answer: no claim either way
    expect(overlayFinding({ overlay: 'unknown', overlayDetail: '' })).toBeNull()
  })
})

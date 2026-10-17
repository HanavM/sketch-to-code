import { afterAll, describe, expect, it } from 'vitest'
import { scriptPort } from '../src/probe.js'
import { runInit } from '../src/init.js'
import { cleanupTempDirs, initRepo, scaffoldViteReact } from './helpers.js'

afterAll(cleanupTempDirs)

// s2c-005: create-tsrouter-app's `dev` is `vite dev --port 3000`; init and
// doctor told people to open :5173, where nothing answers.
describe('scriptPort: a --port on the dev script', () => {
  it('reads the flag in both spellings', () => {
    expect(scriptPort('vite dev --port 3000')).toBe(3000)
    expect(scriptPort('vite --port=4100 --host')).toBe(4100)
    expect(scriptPort('vite --host --port 8080 && echo hi')).toBe(8080)
  })
  it('is null when nothing pins it, or the script is not vite', () => {
    expect(scriptPort('vite')).toBeNull()
    expect(scriptPort('vite dev')).toBeNull()
    expect(scriptPort(undefined)).toBeNull()
    expect(scriptPort('node server --port 3000')).toBeNull()
    expect(scriptPort('vite --portal 3000')).toBeNull()
  })
})

describe('the address init and doctor print', () => {
  const pkg = { scripts: { dev: 'vite dev --port 3000' } }
  it('init sends you to the dev script\'s port', async () => {
    const dir = scaffoldViteReact({ pkg })
    initRepo(dir)
    const r = await runInit({ dir, yes: true, dep: '*', install: false, probe: false, claudeCheck: false })
    const next = r.nextSteps.join('\n')
    expect(next).toContain('http://localhost:3000')
    expect(next).not.toContain('5173')
  })
  // doctor's healthy path needs a real install; onboard-real-projects.mjs
  // checks its printed address on the TanStack starter.
  it('a plain `vite` script keeps the default', async () => {
    const dir = scaffoldViteReact()
    initRepo(dir)
    const r = await runInit({ dir, yes: true, dep: '*', install: false, probe: false, claudeCheck: false })
    expect(r.nextSteps.join('\n')).toContain('http://localhost:5173')
  })
})

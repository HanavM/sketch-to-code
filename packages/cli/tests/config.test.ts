import { afterAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planViteConfig } from '../src/config.js'
import { detectProject } from '../src/detect.js'
import { unifiedDiff } from '../src/diff.js'
import { cleanupTempDirs, DEFAULT_VITE_CONFIG, scaffoldViteReact } from './helpers.js'

afterAll(cleanupTempDirs)

const planFor = (dir: string, opts = {}) => planViteConfig(detectProject(dir), opts)

describe('wiring sketch2code() into a vite config', () => {
  it('authors a whole config when the project has none', () => {
    const dir = scaffoldViteReact({ viteConfig: null })
    const plan = planFor(dir, { port: 5225 })
    expect(plan.action).toBe('create')
    expect(plan.path).toBe(join(dir, 'vite.config.ts'))
    expect(plan.after).toContain("import sketch2code from '@s2c/vite-plugin'")
    expect(plan.after).toContain('plugins: [sketch2code(), react()]')
    expect(plan.after).toContain('server: { port: 5225, strictPort: true }')
    expect(plan.diff).toContain('+export default defineConfig({')
  })

  it('writes .js when the project shows no TypeScript', () => {
    const dir = scaffoldViteReact({ viteConfig: null })
    const plan = planViteConfig({ ...detectProject(dir), hasTypeScript: false }, {})
    expect(plan.path.endsWith('vite.config.js')).toBe(true)
  })

  it('inserts into an existing multiline plugins array, keeping its indentation', () => {
    const dir = scaffoldViteReact({
      viteConfig: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react(),
  ],
})
`,
    })
    const plan = planFor(dir)
    expect(plan.action).toBe('edit')
    expect(plan.after).toMatch(/plugins: \[\n {4}sketch2code\(\),\n {4}react\(\),\n {2}\]/)
    expect(plan.diff).toContain('+import sketch2code')
  })

  it('inserts into a single-line plugins array', () => {
    const dir = scaffoldViteReact({
      viteConfig: "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n",
    })
    const plan = planFor(dir)
    expect(plan.after).toContain('plugins: [sketch2code(), react()]')
  })

  it('handles an empty plugins array', () => {
    const dir = scaffoldViteReact({
      viteConfig: "import { defineConfig } from 'vite'\n\nexport default defineConfig({ plugins: [] })\n",
    })
    expect(planFor(dir).after).toContain('plugins: [sketch2code()]')
  })

  it('adds a plugins array when the config has none', () => {
    const dir = scaffoldViteReact({
      viteConfig: "import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  server: { port: 3000 },\n})\n",
    })
    const plan = planFor(dir)
    expect(plan.after).toContain('plugins: [sketch2code()],')
    expect(plan.notes.join(' ')).toMatch(/added a plugins array/)
    expect(plan.after).toContain('server: { port: 3000 }')
  })

  it('handles a plain object default export', () => {
    const dir = scaffoldViteReact({ viteConfig: "export default {\n  root: '.',\n}\n" })
    expect(planFor(dir).after).toContain('plugins: [sketch2code()],')
  })

  it('writes allowDirty into the call when asked', () => {
    const dir = scaffoldViteReact()
    expect(planFor(dir, { allowDirty: true }).after).toContain('sketch2code({ allowDirty: true })')
  })

  it('is a no-op when the config is already wired — init is re-runnable', () => {
    const dir = scaffoldViteReact({
      viteConfig: `import { defineConfig } from 'vite'\nimport sketch2code from '@s2c/vite-plugin'\n\nexport default defineConfig({\n  plugins: [sketch2code()],\n})\n`,
    })
    const plan = planFor(dir)
    expect(plan.action).toBe('none')
    expect(plan.after).toBe(plan.before)
    expect(plan.diff).toBe('')
  })

  it('adds only the missing import when the call is there but the import is not', () => {
    const dir = scaffoldViteReact({
      viteConfig: "import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: [sketch2code()],\n})\n",
    })
    const plan = planFor(dir)
    expect(plan.after).toContain("import sketch2code from '@s2c/vite-plugin'")
    expect(plan.after.match(/sketch2code\(\)/g)).toHaveLength(1)
    expect(plan.notes.join(' ')).toMatch(/only the missing import/)
  })

  it('refuses a CommonJS config with a snippet instead of mangling it', () => {
    const dir = scaffoldViteReact({
      configName: 'vite.config.cjs',
      viteConfig: "const react = require('@vitejs/plugin-react')\nmodule.exports = { plugins: [react()] }\n",
    })
    const plan = planFor(dir)
    expect(plan.action).toBe('manual')
    expect(plan.snippet).toContain("import sketch2code from '@s2c/vite-plugin'")
    expect(readFileSync(plan.path, 'utf8')).toBe(plan.before)
  })

  it('refuses a function config rather than guessing where plugins live', () => {
    const dir = scaffoldViteReact({
      viteConfig: "import { defineConfig } from 'vite'\n\nexport default defineConfig(({ mode }) => loadCfg(mode))\n",
    })
    const plan = planFor(dir)
    expect(plan.action).toBe('manual')
    expect(plan.notes[0]).toMatch(/could not find a plugins array/)
  })

  it('never rewrites the rest of the file', () => {
    const dir = scaffoldViteReact()
    const plan = planFor(dir)
    const beforeLines = DEFAULT_VITE_CONFIG.split('\n')
    const afterLines = plan.after.split('\n')
    // exactly two lines differ: the new import, and the edited plugins line
    expect(afterLines.filter((l) => !beforeLines.includes(l)).sort()).toEqual(
      ['  plugins: [sketch2code(), react()],', "import sketch2code from '@s2c/vite-plugin'"],
    )
    expect(beforeLines.filter((l) => !afterLines.includes(l))).toEqual(['  plugins: [react()],'])
  })

  it('uses a custom import specifier when the dependency is a file: link', () => {
    const dir = scaffoldViteReact()
    const plan = planFor(dir, { importSpec: '@s2c/vite-plugin' })
    expect(plan.after).toContain("from '@s2c/vite-plugin'")
  })
})

describe('the diff shown before any write', () => {
  it('produces a unified diff with hunk headers', () => {
    const d = unifiedDiff('a\nb\nc\n', 'a\nB\nc\n', 'x.ts')
    expect(d).toContain('--- a/x.ts')
    expect(d).toContain('+++ b/x.ts')
    expect(d).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/)
    expect(d).toContain('-b')
    expect(d).toContain('+B')
  })

  it('is empty for identical text', () => {
    expect(unifiedDiff('same\n', 'same\n', 'x.ts')).toBe('')
  })

  it('handles creation from nothing', () => {
    const d = unifiedDiff('', 'one\ntwo\n', 'new.ts')
    expect(d).toContain('+one')
    expect(d).toContain('+two')
    expect(d.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'))).toHaveLength(0)
  })
})

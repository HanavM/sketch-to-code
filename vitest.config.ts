import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Test against live TS source, not built dist — otherwise cross-package test
// runs silently use stale output.
const pkg = (name: string) => resolve(__dirname, `packages/${name}/src/index.ts`)

export default defineConfig({
  resolve: {
    alias: {
      // before '@s2c/ink': a string alias also matches its subpaths
      '@s2c/ink/classify': resolve(__dirname, 'packages/ink/src/classify.ts'),
      '@s2c/ink/notefocus': resolve(__dirname, 'packages/ink/src/notefocus.ts'),
      '@s2c/ink/scene': resolve(__dirname, 'packages/ink/src/scene.ts'),
      '@s2c/ink': pkg('ink'),
      '@s2c/dom': pkg('dom'),
      '@s2c/intent': pkg('intent'),
      '@s2c/vite-plugin': pkg('vite-plugin'),
      '@s2c/providers': pkg('providers'),
      '@s2c/pipeline': pkg('pipeline'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
})

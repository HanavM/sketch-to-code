import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Test against live TS source, not built dist — otherwise cross-package test
// runs silently use stale output.
const pkg = (name: string) => resolve(__dirname, `packages/${name}/src/index.ts`)

export default defineConfig({
  resolve: {
    alias: {
      '@s2c/ink': pkg('ink'),
      '@s2c/dom': pkg('dom'),
      '@s2c/intent': pkg('intent'),
      '@s2c/vite-plugin': pkg('vite-plugin'),
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
})

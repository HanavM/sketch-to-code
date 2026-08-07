import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

let cached: string | null = null

/**
 * Bundle the overlay client (TS, plus its @s2c/dom import) to a single IIFE
 * with esbuild, on demand, cached for the dev-server lifetime.
 */
export async function bundleOverlayClient(): Promise<string> {
  if (cached) return cached
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@s2c/overlay-client')
  const domPkg = dirname(require.resolve('@s2c/dom/package.json'))
  const esbuild = await import('esbuild')
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    // resolve @s2c/dom to TS source so no prebuild step is required
    alias: { '@s2c/dom': resolve(domPkg, 'src/index.ts') },
    minify: false,
    sourcemap: 'inline',
    logLevel: 'silent',
  })
  cached = result.outputFiles[0]!.text
  return cached
}

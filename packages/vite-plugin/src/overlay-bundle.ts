import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

let cached: Promise<string> | null = null

/**
 * Bundle the overlay client (TS, plus its @s2c/dom import) to a single IIFE
 * with esbuild, on demand, cached for the dev-server lifetime. The promise
 * (not the result) is cached so N concurrent first requests share one build.
 */
export function bundleOverlayClient(): Promise<string> {
  cached ??= doBundle().catch((err: unknown) => {
    cached = null // let a later request retry after a transient failure
    throw err
  })
  return cached
}

async function doBundle(): Promise<string> {
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
  return result.outputFiles[0]!.text
}

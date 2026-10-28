import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

let cached: Promise<string> | null = null

/**
 * Bundle the overlay client (TS, plus its @s2c/dom and @s2c/ink/classify imports) to a single IIFE
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

/**
 * In this repo's checkout, point @s2c/dom and ink's classifier at their TS
 * source so the overlay works without a prebuild. A published install ships
 * only dist/ (s2c-047): aliasing to src/ there made every bundle fail, so the
 * page showed no overlay while doctor said "Healthy". Alias a package only when
 * its source file is really there; otherwise esbuild resolves it through the
 * package's own exports map (dist/*.js), the way any dependency resolves.
 */
export function overlayAliases(
  domPkg: string,
  inkPkg: string,
  exists: (path: string) => boolean = existsSync,
): Record<string, string> {
  const alias: Record<string, string> = {}
  const domSrc = resolve(domPkg, 'src/index.ts')
  const classifySrc = resolve(inkPkg, 'src/classify.ts')
  if (exists(domSrc)) alias['@s2c/dom'] = domSrc
  if (exists(classifySrc)) alias['@s2c/ink/classify'] = classifySrc
  // the stroke scene (arrows), zlib-free like the classifier (goal loop n7)
  const sceneSrc = resolve(inkPkg, 'src/scene.ts')
  if (exists(sceneSrc)) alias['@s2c/ink/scene'] = sceneSrc
  // which mark each note is about, shown before the build (goal loop n9)
  const focusSrc = resolve(inkPkg, 'src/notefocus.ts')
  if (exists(focusSrc)) alias['@s2c/ink/notefocus'] = focusSrc
  return alias
}

async function doBundle(): Promise<string> {
  const require = createRequire(import.meta.url)
  const entry = require.resolve('@s2c/overlay-client')
  // resolve dom/ink from where the overlay client lives: with a hoisted or
  // nested install that is the copy esbuild would find from the entry anyway
  const fromEntry = createRequire(entry)
  const domPkg = dirname(fromEntry.resolve('@s2c/dom/package.json'))
  const inkPkg = dirname(fromEntry.resolve('@s2c/ink/package.json'))
  const esbuild = await import('esbuild')
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    // Only ink's classifier and scene, never ink's index: it pulls node:zlib (png.ts).
    alias: overlayAliases(domPkg, inkPkg),
    minify: false,
    sourcemap: 'inline',
    logLevel: 'silent',
  })
  return result.outputFiles[0]!.text
}

/**
 * What /@s2c/overlay.js sends when the drawing layer can't be built. It used
 * to be a console.error only, so the page looked normal and nothing said why
 * there was nothing to draw on. Now the page says so, in words, and names the
 * one command that explains it; the build error stays in the console.
 */
export function overlayFailedScript(error: string): string {
  const say = 'sketch-to-code could not start its drawing layer, so you can\'t draw on this page yet. ' +
    'Run `npx sketch-to-code doctor` in the project folder to see why.'
  return [
    `console.error("[s2c] overlay bundle failed:", ${JSON.stringify(error)});`,
    '(() => {',
    '  const show = () => {',
    '    if (document.getElementById("s2c-overlay-failed")) return;',
    '    const el = document.createElement("div");',
    '    el.id = "s2c-overlay-failed";',
    '    el.setAttribute("role", "alert");',
    `    el.textContent = ${JSON.stringify(say)};`,
    '    el.style.cssText = "position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;padding:10px 14px;' +
      'border-radius:8px;background:#7f1d1d;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.3)";',
    '    document.body.appendChild(el);',
    '  };',
    '  if (document.body) show(); else document.addEventListener("DOMContentLoaded", show);',
    '})();',
  ].join('\n')
}

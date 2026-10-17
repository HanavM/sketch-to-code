import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * s2c-043: React Router framework mode (what `npx create-react-router` makes)
 * has no index.html. The page is server-rendered by the root route's
 * `<Layout>`, so `transformIndexHtml` never runs and the overlay never loads,
 * while `init` and `doctor` both report the project healthy. The stamps do
 * reach the page (the JSX transform runs for the SSR and client builds alike).
 *
 * So in framework mode the overlay is loaded from the root route module
 * instead: every page imports it on the client. It is added as a script tag
 * after the window's load event, not imported, so vite's import analysis
 * never sees the dev-only URL and nothing new is in the DOM while React
 * hydrates `document` (React 18 would throw away the server HTML over an
 * unexpected node in <body>).
 */

/** Plugin names `@react-router/dev/vite` registers; the first is the main one. */
export function isReactRouterFramework(pluginNames: readonly string[]): boolean {
  return pluginNames.includes('react-router')
}

const CONFIG_NAMES = ['react-router.config.ts', 'react-router.config.mts', 'react-router.config.js', 'react-router.config.mjs']
const ROOT_NAMES = ['root.tsx', 'root.jsx', 'root.ts', 'root.js']

/**
 * The root route file: `<appDirectory>/root.{tsx,jsx,ts,js}`. appDirectory is
 * "app" unless react-router.config sets it to a plain string literal; a
 * computed one is not evaluated, and then the default is tried.
 */
export function findRootRoute(root: string): string | null {
  let appDir = 'app'
  for (const name of CONFIG_NAMES) {
    const p = join(root, name)
    if (!existsSync(p)) continue
    const m = readFileSync(p, 'utf8').match(/\bappDirectory\s*:\s*(['"`])([^'"`$]+)\1/)
    if (m) appDir = m[2]!
    break
  }
  const dirs = [...new Set([appDir, 'app'])]
  for (const d of dirs) {
    const abs = resolve(root, d)
    let files: string[]
    try { files = readdirSync(abs) } catch { continue }
    const hit = ROOT_NAMES.find((n) => files.includes(n))
    if (hit) return join(abs, hit)
  }
  return null
}

export const OVERLAY_SRC = '/@s2c/overlay.js'

/** Appended to the root route's client module. Idempotent across HMR. */
export const OVERLAY_LOADER =
  '\n;if (typeof window !== "undefined") {' +
  ' const __s2cLoad = () => setTimeout(() => {' +
  ` if (document.querySelector('script[src="${OVERLAY_SRC}"]')) return;` +
  ' const s = document.createElement("script"); s.type = "module";' +
  ` s.src = "${OVERLAY_SRC}"; document.body.appendChild(s) }, 0);` +
  ' if (document.readyState === "complete") __s2cLoad();' +
  ' else window.addEventListener("load", __s2cLoad, { once: true }) }\n'

import { relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { stampJsxSource } from './jsx-source.js'

export interface Sketch2CodeOptions {
  /** Allow running with uncommitted changes in the target repo. Default false. */
  allowDirty?: boolean
  /** Extra file extensions to stamp. */
  extensions?: string[]
}

const DEFAULT_EXTS = ['.jsx', '.tsx']

/**
 * vite-plugin-sketch2code: dev-only.
 * - stamps JSX host elements with data-s2c="file:line:col"
 * - injects the overlay client into index.html
 * - mounts /@s2c/* middleware (snapshot intake, pipeline trigger, SSE events)
 *
 * The plugin no-ops entirely for builds (`vite build`), so neither the stamps
 * nor the overlay can ever reach production output.
 */
export default function sketch2code(options: Sketch2CodeOptions = {}): Plugin {
  const exts = options.extensions ?? DEFAULT_EXTS
  let root = process.cwd()
  let isServe = false

  return {
    name: 'sketch2code',
    apply: 'serve', // dev-only: never applies to `vite build`
    enforce: 'pre', // run before @vitejs/plugin-react compiles JSX away

    configResolved(config) {
      root = config.root
      isServe = config.command === 'serve'
    },

    transform(code, id) {
      if (!isServe) return null
      const clean = id.split('?')[0]!
      if (!exts.some((e) => clean.endsWith(e))) return null
      if (clean.includes('/node_modules/')) return null
      const rel = relative(root, clean)
      if (rel.startsWith('..')) return null // outside the app root
      const res = stampJsxSource(code, rel)
      if (!res) return null
      return { code: res.code, map: res.map }
    },

    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', src: '/@s2c/overlay.js' },
          injectTo: 'body',
        },
      ]
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use('/@s2c/ping', (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ ok: true, root, allowDirty: options.allowDirty ?? false }))
      })
      // Overlay client + pipeline endpoints are mounted by later layers via
      // registerMiddleware; keep a stub so the injected script never 404s.
      server.middlewares.use('/@s2c/overlay.js', (_req, res) => {
        res.setHeader('content-type', 'text/javascript')
        res.end(overlayClientSource ?? 'console.warn("[s2c] overlay client not built yet")')
      })
    },
  }
}

/** Set by the overlay-client build (layer 3); stubbed until then. */
export let overlayClientSource: string | null = null
export function setOverlayClientSource(src: string): void {
  overlayClientSource = src
}

export { stampJsxSource } from './jsx-source.js'

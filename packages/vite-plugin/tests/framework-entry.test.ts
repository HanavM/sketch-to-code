import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findRootRoute, isReactRouterFramework, OVERLAY_LOADER } from '../src/framework-entry.js'
import sketch2code from '../src/index.js'

const dirs: string[] = []
const project = (files: Record<string, string>): string => {
  const d = mkdtempSync(join(tmpdir(), 's2c-fw-'))
  dirs.push(d)
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(d, rel, '..'), { recursive: true })
    writeFileSync(join(d, rel), body)
  }
  return d
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

const ROOT = 'export default function App() { return <div>hi</div> }\n'

describe('isReactRouterFramework', () => {
  it('is the @react-router/dev plugin, not any router', () => {
    expect(isReactRouterFramework(['sketch2code', 'react-router:virtual-modules', 'react-router'])).toBe(true)
    expect(isReactRouterFramework(['vite:react-babel', 'tanstack-router:generator'])).toBe(false)
    expect(isReactRouterFramework(['react-router:hmr-runtime'])).toBe(false)
  })
})

describe('findRootRoute', () => {
  it('finds app/root.tsx by default', () => {
    const d = project({ 'app/root.tsx': ROOT, 'react-router.config.ts': 'export default { ssr: true }' })
    expect(findRootRoute(d)).toBe(join(d, 'app', 'root.tsx'))
  })
  it('follows a literal appDirectory', () => {
    const d = project({ 'src/root.jsx': ROOT, 'react-router.config.ts': 'export default { appDirectory: "src" }' })
    expect(findRootRoute(d)).toBe(join(d, 'src', 'root.jsx'))
  })
  it('falls back to app/ when appDirectory is computed', () => {
    const d = project({ 'app/root.tsx': ROOT, 'react-router.config.ts': 'export default { appDirectory: `${base}/x` }' })
    expect(findRootRoute(d)).toBe(join(d, 'app', 'root.tsx'))
  })
  it('is null with no root route', () => {
    expect(findRootRoute(project({ 'src/main.tsx': ROOT }))).toBeNull()
  })
})

type Hook = (code: string, id: string, opts?: { ssr?: boolean }) => { code: string } | null
const wire = (d: string, pluginNames: string[]): Hook => {
  const p = sketch2code()
  ;(p.configResolved as (c: unknown) => void)({ root: d, plugins: pluginNames.map((name) => ({ name })) })
  return (p.transform as Hook).bind(p)
}

describe('the plugin loads the overlay from the root route in framework mode', () => {
  it('appends the loader to the client root route only', () => {
    const d = project({ 'app/root.tsx': ROOT, 'app/routes/home.tsx': ROOT })
    const t = wire(d, ['sketch2code', 'react-router'])
    const client = t(ROOT, join(d, 'app', 'root.tsx'))!
    expect(client.code).toContain('data-s2c="app/root.tsx:1:40"')
    expect(client.code.endsWith(OVERLAY_LOADER)).toBe(true)
    // the server render never gets it, nor does any other route, nor a split chunk
    expect(t(ROOT, join(d, 'app', 'root.tsx'), { ssr: true })!.code).not.toContain('/@s2c/overlay.js')
    expect(t(ROOT, join(d, 'app', 'routes', 'home.tsx'))!.code).not.toContain('/@s2c/overlay.js')
    expect(t(ROOT, `${join(d, 'app', 'root.tsx')}?route-chunk=main`)!.code).not.toContain('/@s2c/overlay.js')
  })
  it('a root route with no JSX still gets it', () => {
    const d = project({ 'app/root.tsx': 'export const x = 1\n' })
    const out = wire(d, ['react-router'])('export const x = 1\n', join(d, 'app', 'root.tsx'))
    expect(out!.code).toBe(`export const x = 1\n${OVERLAY_LOADER}`)
  })
  it('a Vite SPA is untouched (index.html carries the overlay there)', () => {
    const d = project({ 'app/root.tsx': ROOT })
    const out = wire(d, ['vite:react-babel'])(ROOT, join(d, 'app', 'root.tsx'))
    expect(out!.code).not.toContain('/@s2c/overlay.js')
  })
  it('the loader is valid JS that adds one script tag after load, once', () => {
    const added: Array<{ type: string; src: string }> = []
    const listeners: Array<() => void> = []
    const timers: Array<() => void> = []
    const doc = {
      readyState: 'loading',
      querySelector: (q: string) => (added.some((s) => q.includes(s.src)) ? {} : null),
      createElement: () => ({ type: '', src: '' }),
      body: { appendChild: (s: { type: string; src: string }) => added.push(s) },
    }
    const win = { addEventListener: (_: string, f: () => void) => listeners.push(f) }
    const run = () => new Function('window', 'document', 'setTimeout', OVERLAY_LOADER)(win, doc, (f: () => void) => timers.push(f))
    run()
    expect(added).toHaveLength(0) // nothing while React hydrates
    listeners.forEach((f) => f()); timers.splice(0).forEach((f) => f())
    expect(added).toEqual([{ type: 'module', src: '/@s2c/overlay.js' }])
    doc.readyState = 'complete'
    run(); timers.splice(0).forEach((f) => f()) // an HMR re-run of the module
    expect(added).toHaveLength(1)
  })
})

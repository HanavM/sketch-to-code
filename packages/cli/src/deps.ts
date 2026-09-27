import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PLUGIN_PKG } from './config.js'
import { readPackageJson, type PackageJson } from './detect.js'

export type DepSource = 'override' | 'workspace' | 'local-checkout' | 'registry'

export interface DepSpec {
  name: string
  spec: string
  source: DepSource
  note: string | null
}

/** Directory of this CLI's own source/dist — the anchor for finding a sibling checkout. */
function selfDir(): string {
  return dirname(fileURLToPath(import.meta.url))
}

/** Walk up looking for the monorepo that ships @s2c/vite-plugin. */
function findCheckout(from: string): string | null {
  let dir = resolve(from)
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'packages', 'vite-plugin', 'package.json')
    if (existsSync(candidate) && readPackageJson(candidate)?.name === PLUGIN_PKG) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

const inside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * Which dependency string to write. The packages in this repo are not published
 * to npm yet, so the honest answer depends on where init is run from:
 * - inside this workspace → '*' (npm links the workspace package)
 * - from a checkout, into a project elsewhere → 'file:<abs path>' (npm symlinks
 *   it; Node resolves through the real path, so the plugin's own @s2c/* deps
 *   resolve inside the checkout)
 * - neither → the registry range, which is what a published install will use.
 */
export function resolveDepSpec(projectDir: string, override?: string): DepSpec {
  if (override) return { name: PLUGIN_PKG, spec: override, source: 'override', note: 'spec given with --dep' }

  const checkout = findCheckout(selfDir())
  if (checkout && inside(checkout, resolve(projectDir))) {
    return { name: PLUGIN_PKG, spec: '*', source: 'workspace', note: `inside the ${checkout} workspace` }
  }
  if (checkout) {
    const abs = join(checkout, 'packages', 'vite-plugin')
    return {
      name: PLUGIN_PKG,
      spec: `file:${abs}`,
      source: 'local-checkout',
      note: `linked to the local checkout at ${abs} (these packages are not on npm yet); ` +
        'run `npm run build` there first so dist/ exists',
    }
  }
  return { name: PLUGIN_PKG, spec: '^0.1.0', source: 'registry', note: null }
}

export interface DepWrite {
  changed: boolean
  /** The spec already in package.json, when we left it alone. */
  existing: string | null
  where: 'dependencies' | 'devDependencies' | null
}

/** Idempotent: a second init never adds a second entry or rewrites the first. */
export function addDevDependency(pkgPath: string, name: string, spec: string): DepWrite {
  const raw = readFileSync(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as PackageJson
  const inDeps = pkg.dependencies?.[name]
  const inDev = pkg.devDependencies?.[name]
  if (inDeps !== undefined) return { changed: false, existing: inDeps, where: 'dependencies' }
  if (inDev !== undefined) return { changed: false, existing: inDev, where: 'devDependencies' }

  const dev = { ...(pkg.devDependencies ?? {}), [name]: spec }
  pkg.devDependencies = Object.fromEntries(Object.entries(dev).sort(([a], [b]) => a.localeCompare(b)))
  const indent = /\n(\s+)"/.exec(raw)?.[1] ?? '  '
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`)
  return { changed: true, existing: null, where: 'devDependencies' }
}

export interface InstallResult {
  ok: boolean
  command: string
  output: string
}

export function runInstall(dir: string, timeoutMs = 10 * 60_000): InstallResult {
  const args = ['install']
  const res = spawnSync('npm', args, { cwd: dir, encoding: 'utf8', timeout: timeoutMs })
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim()
  return { ok: res.status === 0, command: `npm ${args.join(' ')}`, output }
}

/** Can the project actually resolve the plugin (and the pipeline behind it)? */
export function resolveFromProject(dir: string, specifier: string): string | null {
  return resolveFromFile(join(resolve(dir), 'package.json'), specifier)
}

/** Resolve as the given file would — the only honest question for a linked package. */
export function resolveFromFile(fromFile: string, specifier: string): string | null {
  try {
    return createRequire(fromFile).resolve(specifier)
  } catch {
    return null
  }
}

export interface ResolveChain {
  plugin: string | null
  pipeline: string | null
  sdk: string | null
}

/**
 * The plugin loads @s2c/pipeline, and the pipeline loads the Claude Agent SDK —
 * each from ITS OWN install, not the app's. With a `file:` link (or any pnpm-ish
 * layout) those live outside the project's node_modules entirely, so asking
 * "can the app resolve @s2c/pipeline?" answers the wrong question and reports a
 * working install as broken. Walk the chain the way Node will at run time.
 */
export function resolveChain(dir: string, pluginPkg = PLUGIN_PKG): ResolveChain {
  const plugin = resolveFromProject(dir, pluginPkg)
  const pipeline =
    resolveFromProject(dir, '@s2c/pipeline') ?? (plugin ? resolveFromFile(plugin, '@s2c/pipeline') : null)
  // the bare specifier, not '<pkg>/package.json': the SDK's exports map has no
  // './package.json' entry, so the subpath is unresolvable even when installed
  const sdkSpec = '@anthropic-ai/claude-agent-sdk'
  const sdk =
    resolveFromProject(dir, sdkSpec) ??
    (pipeline ? resolveFromFile(pipeline, sdkSpec) : null) ??
    (plugin ? resolveFromFile(plugin, sdkSpec) : null)
  return { plugin, pipeline, sdk }
}

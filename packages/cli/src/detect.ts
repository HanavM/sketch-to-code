import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface PackageJson {
  name?: string
  private?: boolean
  type?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  workspaces?: string[] | { packages?: string[] }
}

export type Verdict = 'supported' | 'unsupported' | 'no-project'

export interface Blocker {
  /** Machine-readable so tests assert the reason, not the prose. */
  id: string
  message: string
}

export interface ProjectInfo {
  dir: string
  pkgPath: string | null
  pkg: PackageJson | null
  /** The config file we will edit, or null when none exists yet. */
  viteConfigPath: string | null
  /** Every candidate found — more than one is itself worth reporting. */
  viteConfigPaths: string[]
  hasVite: boolean
  hasReact: boolean
  hasReactPlugin: boolean
  hasTypeScript: boolean
  /** Already has the plugin as a dependency (either dep list). */
  hasPluginDep: boolean
  jsxFiles: number
  verdict: Verdict
  blockers: Blocker[]
}

// Every name here means "this is not a Vite + React app the stamp pass can
// reach". The plugin's transform gates on .jsx/.tsx and runs only under Vite
// dev, so these are hard stops, not warnings — half-installing into a Next.js
// app produces a config that loads and an overlay that never stamps anything.
const FRAMEWORK_BLOCKERS: Array<{ id: string; dep: RegExp; file?: RegExp; label: string }> = [
  { id: 'next', dep: /^next$/, file: /^next\.config\.(js|mjs|ts|cjs)$/, label: 'Next.js' },
  { id: 'cra', dep: /^react-scripts$/, label: 'Create React App (webpack, not Vite)' },
  { id: 'gatsby', dep: /^gatsby$/, file: /^gatsby-config\./, label: 'Gatsby' },
  { id: 'remix', dep: /^@remix-run\/(dev|react)$/, label: 'Remix' },
  { id: 'nuxt', dep: /^nuxt$/, file: /^nuxt\.config\./, label: 'Nuxt' },
  { id: 'vue', dep: /^(vue|@vitejs\/plugin-vue)$/, label: 'Vue' },
  { id: 'svelte', dep: /^(svelte|@sveltejs\/kit)$/, file: /^svelte\.config\./, label: 'Svelte' },
  { id: 'angular', dep: /^@angular\/core$/, file: /^angular\.json$/, label: 'Angular' },
  { id: 'solid', dep: /^solid-js$/, label: 'Solid' },
  { id: 'astro', dep: /^astro$/, file: /^astro\.config\./, label: 'Astro' },
]

const CONFIG_NAMES = [
  'vite.config.ts',
  'vite.config.mts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.cts',
  'vite.config.cjs',
]

export function readPackageJson(path: string): PackageJson | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

const allDeps = (pkg: PackageJson | null): Record<string, string> => ({
  ...(pkg?.dependencies ?? {}),
  ...(pkg?.devDependencies ?? {}),
})

/** Count .jsx/.tsx files, capped — we only need "does this app have JSX at all". */
function countJsx(dir: string, budget = 400): number {
  let seen = 0
  const walk = (d: string, depth: number): void => {
    if (seen >= budget || depth > 5) return
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const name of entries) {
      if (seen >= budget) return
      if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
      const full = join(d, name)
      let s
      try {
        s = statSync(full)
      } catch {
        continue
      }
      if (s.isDirectory()) walk(full, depth + 1)
      else if (name.endsWith('.jsx') || name.endsWith('.tsx')) seen++
    }
  }
  walk(dir, 0)
  return seen
}

export function detectProject(dirIn: string): ProjectInfo {
  const dir = resolve(dirIn)
  const pkgPath = existsSync(join(dir, 'package.json')) ? join(dir, 'package.json') : null
  const pkg = pkgPath ? readPackageJson(pkgPath) : null
  const deps = allDeps(pkg)
  const files = existsSync(dir) ? readdirSync(dir) : []

  const viteConfigPaths = CONFIG_NAMES.filter((n) => files.includes(n)).map((n) => join(dir, n))
  const blockers: Blocker[] = []

  for (const b of FRAMEWORK_BLOCKERS) {
    const byDep = Object.keys(deps).find((d) => b.dep.test(d))
    const byFile = b.file ? files.find((f) => b.file!.test(f)) : undefined
    if (byDep || byFile) {
      blockers.push({
        id: b.id,
        message: `${b.label} detected (${byDep ? `dependency "${byDep}"` : `file "${byFile!}"`}). ` +
          'sketch-to-code is a Vite dev plugin that stamps React JSX — it cannot drive this project.',
      })
    }
  }

  const hasVite = 'vite' in deps
  const hasReact = 'react' in deps
  const hasReactPlugin = '@vitejs/plugin-react' in deps || '@vitejs/plugin-react-swc' in deps
  const hasTypeScript =
    'typescript' in deps || existsSync(join(dir, 'tsconfig.json')) || viteConfigPaths.some((p) => p.endsWith('.ts'))
  const hasPluginDep = '@s2c/vite-plugin' in deps

  if (pkg && !hasVite) {
    blockers.push({
      id: 'no-vite',
      message: 'no "vite" dependency in package.json. sketch-to-code only runs as a Vite dev plugin ' +
        '(if this is a monorepo, point init at the app package, not the root).',
    })
  }
  if (pkg && !hasReact) {
    blockers.push({
      id: 'no-react',
      message: 'no "react" dependency in package.json. The stamp pass only understands React JSX.',
    })
  }

  const verdict: Verdict = !pkg ? 'no-project' : blockers.length > 0 ? 'unsupported' : 'supported'

  return {
    dir,
    pkgPath,
    pkg,
    viteConfigPath: viteConfigPaths[0] ?? null,
    viteConfigPaths,
    hasVite,
    hasReact,
    hasReactPlugin,
    hasTypeScript,
    hasPluginDep,
    jsxFiles: countJsx(dir),
    verdict,
    blockers,
  }
}

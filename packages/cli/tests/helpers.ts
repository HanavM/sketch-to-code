import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const made: string[] = []

/** A throwaway directory, realpathed (macOS /tmp → /private/tmp) so paths compare. */
export function tempDir(prefix = 's2c-cli-'): string {
  const dir = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), prefix)))
  made.push(dir)
  return dir
}

export function cleanupTempDirs(): void {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true })
}

export function write(dir: string, rel: string, content: string): string {
  const path = join(dir, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
  return path
}

export const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export function initRepo(dir: string, commit = true): void {
  git(dir, 'init')
  git(dir, 'config', 'user.name', 'test')
  git(dir, 'config', 'user.email', 'test@example.com')
  if (commit) {
    git(dir, 'add', '-A')
    git(dir, 'commit', '--no-verify', '-m', 'initial')
  }
}

export interface ScaffoldOptions {
  /** Contents of the vite config; null writes none. */
  viteConfig?: string | null
  configName?: string
  pkg?: Record<string, unknown>
  /** Extra source files, relative path → content. */
  files?: Record<string, string>
}

const DEFAULT_PKG = {
  name: 'temp-app',
  private: true,
  version: '0.0.0',
  type: 'module',
  scripts: { dev: 'vite', build: 'vite build' },
  dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
  devDependencies: { '@vitejs/plugin-react': '^5.0.0', vite: '^7.0.0' },
}

export const DEFAULT_VITE_CONFIG = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`

/** A minimal, believable Vite + React app on disk. No install, no network. */
export function scaffoldViteReact(options: ScaffoldOptions = {}): string {
  const dir = tempDir()
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ ...DEFAULT_PKG, ...(options.pkg ?? {}) }, null, 2)}\n`)
  const config = options.viteConfig === undefined ? DEFAULT_VITE_CONFIG : options.viteConfig
  if (config !== null) writeFileSync(join(dir, options.configName ?? 'vite.config.ts'), config)
  write(dir, 'index.html', '<!doctype html><div id="root"></div><script type="module" src="/src/main.tsx"></script>')
  write(dir, 'src/main.tsx', "export default function App() {\n  return <div>hi</div>\n}\n")
  write(dir, 'tsconfig.json', '{ "compilerOptions": { "jsx": "react-jsx" } }\n')
  return dir
}

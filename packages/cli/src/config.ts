import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { unifiedDiff } from './diff.js'

export const PLUGIN_PKG = '@s2c/vite-plugin'

export interface ConfigPlanInput {
  dir: string
  /** Existing config file, or null when the project has none. */
  viteConfigPath: string | null
  hasReactPlugin: boolean
  hasTypeScript: boolean
}

export interface ConfigPlanOptions {
  allowDirty?: boolean
  /** Pin a dev-server port when we author the file ourselves. */
  port?: number
  importSpec?: string
}

export interface ConfigPlan {
  /** 'none' = already wired (init is re-runnable); 'manual' = we refuse to guess. */
  action: 'create' | 'edit' | 'none' | 'manual'
  path: string
  before: string
  after: string
  diff: string
  notes: string[]
  /** For 'manual': the exact lines the user has to add by hand. */
  snippet: string | null
}

/** Path as the user thinks of it: relative to their project root. */
const label = (dir: string, path: string): string => relative(dir, path) || path

const callText = (allowDirty: boolean): string =>
  allowDirty ? 'sketch2code({ allowDirty: true })' : 'sketch2code()'

/** Last top-level `import …` statement, so our import lands with the others. */
function lastImportEnd(text: string): number | null {
  const re = /^import[^\n]*\n/gm
  let end: number | null = null
  for (const m of text.matchAll(re)) end = m.index + m[0].length
  return end
}

function indentOfLineAt(text: string, idx: number): string {
  const start = text.lastIndexOf('\n', idx - 1) + 1
  return /^[ \t]*/.exec(text.slice(start, idx))?.[0] ?? ''
}

function freshConfig(input: ConfigPlanInput, opts: ConfigPlanOptions): string {
  const spec = opts.importSpec ?? PLUGIN_PKG
  const lines = ["import { defineConfig } from 'vite'"]
  if (input.hasReactPlugin) lines.push("import react from '@vitejs/plugin-react'")
  lines.push(`import sketch2code from '${spec}'`, '', 'export default defineConfig({')
  // sketch2code first: it is enforce:'pre' anyway, but keeping it first in the
  // list is what the docs show, so a user comparing the two sees the same shape.
  lines.push(`  plugins: [${callText(opts.allowDirty ?? false)}${input.hasReactPlugin ? ', react()' : ''}],`)
  if (opts.port !== undefined) lines.push(`  server: { port: ${opts.port}, strictPort: true },`)
  lines.push('})', '')
  return lines.join('\n')
}

export function planViteConfig(input: ConfigPlanInput, opts: ConfigPlanOptions = {}): ConfigPlan {
  const spec = opts.importSpec ?? PLUGIN_PKG
  const call = callText(opts.allowDirty ?? false)
  const notes: string[] = []

  if (!input.viteConfigPath) {
    const path = join(input.dir, input.hasTypeScript ? 'vite.config.ts' : 'vite.config.js')
    const after = freshConfig(input, opts)
    if (!input.hasReactPlugin) {
      notes.push('no @vitejs/plugin-react dependency found — the generated config has no react() plugin; ' +
        'add it if your app needs JSX transform from Vite.')
    }
    // relative label: the diff is for a human reading it in their own project
    return { action: 'create', path, before: '', after, diff: unifiedDiff('', after, label(input.dir, path)), notes, snippet: null }
  }

  const path = input.viteConfigPath
  const before = readFileSync(path, 'utf8')
  let text = before

  const hasImport = new RegExp(`import\\s+\\w+\\s+from\\s+['"]${spec.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')}['"]`)
    .test(text)
  const hasCall = /sketch2code\s*\(/.test(text)

  if (hasImport && hasCall) {
    return { action: 'none', path, before, after: before, diff: '', notes: ['already wired'], snippet: null }
  }

  const manual = (why: string): ConfigPlan => ({
    action: 'manual',
    path,
    before,
    after: before,
    diff: '',
    notes: [why],
    snippet: `import sketch2code from '${spec}'\n// …\nplugins: [${call}, /* your other plugins */]`,
  })

  // A CommonJS config can't `import` an ESM-only plugin, and rewriting someone's
  // module system for them is not a thing an installer should do unasked.
  if (!/^\s*import\s/m.test(text) && /(module\.exports|require\s*\()/.test(text)) {
    return manual(`${path} is a CommonJS config — convert it to ESM (or rename to .mts) and add the plugin by hand.`)
  }

  if (!hasImport) {
    const importLine = `import sketch2code from '${spec}'\n`
    const at = lastImportEnd(text)
    text = at === null ? importLine + text : text.slice(0, at) + importLine + text.slice(at)
  }

  if (!hasCall) {
    const arr = /plugins\s*:\s*\[/.exec(text)
    if (arr) {
      const open = arr.index + arr[0].length
      const rest = text.slice(open)
      if (/^\s*\n/.test(rest)) {
        // multiline array: match the indentation of its first entry
        const firstEntry = /^\s*\n([ \t]*)/.exec(rest)
        const indent = firstEntry?.[1] ?? `${indentOfLineAt(text, arr.index)}  `
        text = `${text.slice(0, open)}\n${indent}${call},${text.slice(open)}`
      } else if (/^\s*\]/.test(rest)) {
        text = text.slice(0, open) + call + text.slice(open) // empty array
      } else {
        text = `${text.slice(0, open)}${call}, ${text.slice(open)}`
      }
    } else {
      // no plugins array at all — add one as the first key of the config object
      const obj = /defineConfig\s*\(\s*\{/.exec(text) ?? /export\s+default\s*\{/.exec(text)
      if (!obj) {
        return manual(
          `could not find a plugins array or a config object literal in ${path} ` +
          '(a function/async config is not edited automatically).',
        )
      }
      const open = obj.index + obj[0].length
      const indent = `${indentOfLineAt(text, obj.index)}  `
      text = `${text.slice(0, open)}\n${indent}plugins: [${call}],${text.slice(open)}`
      notes.push('added a plugins array — your config had none')
    }
  } else {
    notes.push('plugin call already present; only the missing import was added')
  }

  return { action: 'edit', path, before, after: text, diff: unifiedDiff(before, text, label(input.dir, path)), notes, snippet: null }
}

/**
 * The element library's STORE: where an entry lives, and what it costs to keep.
 *
 * library-types.ts says what an entry is — a pointer at a component that
 * already compiles, not a picture of one. This file is the consequence of that
 * sentence. Because an entry is a pointer, capturing one must never copy the
 * user's code into a database, and removing one must never delete their file;
 * both of those would turn a library back into the clipboard the whole feature
 * exists to replace.
 *
 * Three decisions carry the weight here.
 *
 * Capture UPDATES. Capture fires on every sketch, every extraction, every
 * scan, which is far more often than a new component appears. An index keyed on
 * file+export means the tenth capture of Card refreshes one card rather than
 * adding a tenth, and keeps the id — so the thumbnail path, the global mirror
 * and `usedCount` all survive. That is not a nicety: a panel that fills with
 * ten identical Cards is a panel nobody opens.
 *
 * Similar is NOT the same. A separate entry whose ink signature nearly matches
 * is interesting — "you drew this before" is the single most useful thing the
 * panel can say — but it is a suggestion, not a verdict. Two buttons that
 * occupy the same rough rectangle are frequently two different buttons, and a
 * store that silently merged them would be destroying work on a guess. So a
 * near-match is REPORTED as `duplicateOf` and nothing is blocked.
 *
 * Storage follows history.ts, deliberately, so a reader who knows one knows
 * both: thumbnails are real PNG files validated against the magic bytes, the
 * index stays a small readable list, every path we delete is rebuilt from a
 * validated id rather than read out of the index, and a corrupt or hand-edited
 * index drops the bad rows instead of taking the panel down.
 *
 * The global library is the one place this reaches outside the project, and it
 * is allowed to fail. A user's home directory may be read-only, missing, or on
 * a volume that vanished; none of that is a reason to lose the capture they
 * just made, so the mirror degrades to project-only and says so in a `note`.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import { compositionFromSource, type CompositionSignature } from './composition.js'
import {
  LIBRARY_DIR, LIBRARY_INDEX,
  type EntryKind, type EntryProp, type LibraryEntry, type ListedEntry,
} from './library-types.js'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export interface CaptureRequest {
  /** The file that declares the component, project-relative or absolute. */
  file: string
  /** Export to capture. Defaults to the file's default export. */
  exportName?: string
  /** What to call it in the panel. Defaults to the export name. */
  name?: string
  kind: EntryKind
  /** PNG of the component as rendered: a data URL, or bare base64. */
  thumbnail?: string
  /**
   * Ink signature, when the entry came from a drawing. Always preferred over
   * one derived from the generated source: the strokes are what the user meant,
   * the source is only what came out.
   */
  signature?: number[]
  /** Prop values the component demonstrably rendered with, where captured. */
  defaults?: Record<string, string>
  /** Flattened from readComponentProps, which owns reading them off the types. */
  props?: EntryProp[]
}

export interface CaptureResult {
  ok: boolean
  entry?: LibraryEntry
  error?: string
  /**
   * A DIFFERENT entry that looks almost the same. Advisory: the capture
   * succeeded, and what to do about the resemblance is the user's call.
   */
  duplicateOf?: LibraryEntry
  /** Something that went wrong without costing the capture — the mirror. */
  note?: string
}

export interface RemoveResult {
  ok: boolean
  removed: boolean
  error?: string
}

/** Ids, thumbnails and pruned rows, in the shape history.ts validates them. */
const ID_OK = /^[A-Za-z0-9_-]{1,64}$/
const EXPORT_OK = /^(default|[A-Za-z_$][\w$]*)$/
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const KINDS = new Set<string>(['drawn', 'extracted', 'scanned'])
const PROP_KINDS = new Set<string>(['string', 'number', 'boolean', 'enum', 'other'])

/** Shared with history.ts and constraints.ts: one state directory per project. */
const STATE_DIR = '.sketch2code'

/**
 * How many entries a library keeps.
 *
 * Far more generous than the timeline's fifty, because the two are different
 * kinds of thing: a version is worth keeping until you have scrubbed past it,
 * an entry is worth keeping until you stop using the component. The bound
 * exists only so a long-lived global library cannot grow thumbnails forever.
 */
const MAX_ENTRIES = 200

/**
 * How alike two signatures must be to be worth mentioning. Loose on purpose —
 * this number decides what gets SHOWN as a resemblance, never what gets
 * merged, so a false positive costs one dismissed hint.
 */
const NEAR_IDENTICAL = 0.9

/** A refusal raised from deep inside, carrying text meant for the user. */
class Refusal extends Error {}

// ── where things live ───────────────────────────────────────────────────────

/** This project's library, beside its timeline and its drawn rules. */
export const libraryDir = (root: string): string => join(root, STATE_DIR, LIBRARY_DIR)
export const libraryIndexPath = (root: string): string => join(libraryDir(root), LIBRARY_INDEX)

/**
 * The library that follows the user between projects.
 *
 * `XDG_DATA_HOME` first, because a user who has set it has said where their
 * tools' data goes and it would be rude to argue; otherwise `~/.sketch2code/`,
 * which is what the dev tools this sits next to do (npm, git, claude) and —
 * more usefully — is the same name as the per-project state directory, so the
 * two libraries are visibly the same feature rather than two mysteries.
 *
 * Read at call time, not at import, so a process that relocates its home (a
 * test, a sandbox, a CI runner) is not stuck with a path decided at load.
 */
export function globalLibraryDir(): string {
  const xdg = process.env.XDG_DATA_HOME
  if (xdg && isAbsolute(xdg)) return join(xdg, 'sketch2code', LIBRARY_DIR)
  return join(homedir(), STATE_DIR, LIBRARY_DIR)
}

export const globalLibraryIndexPath = (): string => join(globalLibraryDir(), LIBRARY_INDEX)

/**
 * A thumbnail's file, rebuilt from the id rather than read out of the index.
 *
 * The index is a file in a user's project that gets hand-edited; a path taken
 * from it and handed to `rm` is a way to delete something that is not ours.
 */
export const entryThumbPath = (dir: string, id: string): string => join(dir, `${id}.png`)

// ── the index, validated rather than trusted ────────────────────────────────

/** A path we will accept out of an index: relative, and inside the project. */
const safeRel = (p: string): boolean =>
  p.length > 0 && !p.startsWith('/') && !/(^|\/)\.\.(\/|$)/.test(p) && !/^[A-Za-z]:/.test(p)

function coerceProps(raw: unknown): EntryProp[] {
  if (!Array.isArray(raw)) return []
  const out: EntryProp[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    if (typeof o.name !== 'string' || o.name.trim().length === 0) continue
    const kind = typeof o.kind === 'string' && PROP_KINDS.has(o.kind)
      ? (o.kind as EntryProp['kind'])
      : 'other'
    const options = Array.isArray(o.options)
      ? o.options.filter((s): s is string => typeof s === 'string')
      : []
    out.push({
      name: o.name,
      kind,
      required: o.required === true,
      ...(options.length > 0 ? { options } : {}),
    })
  }
  return out
}

function coerceDefaults(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

/** Finite numbers only: one NaN in here poisons every comparison downstream. */
function coerceSignature(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined
  const nums = raw.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  return nums.length === raw.length ? nums : undefined
}

/**
 * One row, or nothing. Same contract as history.ts's `coerce`: a half-written
 * or hand-edited index must cost the bad row and nothing else, and everything
 * we will later delete or serve is checked HERE rather than at the point of use.
 */
function coerceEntry(dir: string, raw: unknown): LibraryEntry | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = o.id
  const file = o.file
  const exportName = o.exportName
  if (typeof id !== 'string' || !ID_OK.test(id)) return null
  if (typeof file !== 'string' || !safeRel(file)) return null
  if (typeof exportName !== 'string' || !EXPORT_OK.test(exportName)) return null
  if (typeof o.kind !== 'string' || !KINDS.has(o.kind)) return null

  const name = typeof o.name === 'string' && o.name.trim().length > 0 ? o.name.trim() : exportName
  // A thumb is only ever OUR canonical filename, and only while the PNG is
  // really there: the panel must never be handed a dead image.
  const thumb = o.thumb === `${id}.png` && existsSync(entryThumbPath(dir, id))
    ? `${id}.png`
    : undefined
  const usedRaw = o.usedCount
  const usedCount = typeof usedRaw === 'number' && Number.isFinite(usedRaw) && usedRaw > 0
    ? Math.floor(usedRaw)
    : 0

  return {
    id,
    name,
    kind: o.kind as EntryKind,
    file,
    exportName,
    props: coerceProps(o.props),
    defaults: coerceDefaults(o.defaults),
    signature: coerceSignature(o.signature),
    thumb,
    // portable is load-bearing at placement time, so an index that does not
    // say `true` is read as "we don't know, treat it as local".
    portable: o.portable === true,
    source: typeof o.source === 'string' && o.source.length > 0 ? o.source : undefined,
    createdAt: typeof o.createdAt === 'number' && Number.isFinite(o.createdAt) ? o.createdAt : 0,
    usedCount,
  }
}

/** Newest first, the way the panel reads. Never throws. */
function readIndex(dir: string): LibraryEntry[] {
  try {
    const file = join(dir, LIBRARY_INDEX)
    if (!existsSync(file)) return []
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: LibraryEntry[] = []
    for (const item of raw) {
      const e = coerceEntry(dir, item)
      if (!e || seen.has(e.id)) continue
      seen.add(e.id)
      out.push(e)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function writeIndex(dir: string, entries: LibraryEntry[]): void {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, LIBRARY_INDEX), `${JSON.stringify(entries, null, 2)}\n`)
}

// ── signatures ──────────────────────────────────────────────────────────────

/**
 * A composition signature in the flat form an entry stores.
 *
 * Only the mass grid, because the grid is exactly the question "does this look
 * like what I just drew?" — and because the scalars beside it in a
 * CompositionSignature live on wildly different scales, so mixing them into
 * one vector would make any distance measure mostly a statement about aspect
 * ratio. Returns nothing for an empty signature: a row of 256 zeros is not a
 * shape, it is the absence of one, and storing it would make every shapeless
 * entry a near-match for every other.
 */
export function entrySignature(sig: CompositionSignature): number[] | undefined {
  const total = sig.grid.reduce((a, b) => a + b, 0)
  if (!(total > 0)) return undefined
  return sig.grid.slice()
}

/**
 * 0..1, where 1 is identical. The producer normalises the grid to sum 1, so
 * half the L1 distance is already in range; the clamps are there for a vector
 * that came back out of a hand-edited index.
 */
export function signatureSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let l1 = 0
  for (let i = 0; i < a.length; i++) l1 += Math.abs((a[i] ?? 0) - (b[i] ?? 0))
  return Math.min(1, Math.max(0, 1 - l1 / 2))
}

// ── reading the component out of the file ───────────────────────────────────

interface Resolved {
  /** Local binding name — what the declaration actually calls it. */
  local: string
  /** Index in the program body of the statement that declares it. */
  declIdx: number
  /** True when that statement already carries the `export` keyword. */
  declExports: boolean
  /** Source text of the declaration statement, verbatim. */
  declText: string
}

const isComponentish = (node: t.Node | null | undefined): boolean => {
  if (!node) return false
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
    case 'ClassDeclaration':
    case 'ClassExpression':
      return true
    // memo(...) / forwardRef(...) / styled.div`…` — a component made by a call
    case 'CallExpression':
    case 'TaggedTemplateExpression':
      return true
    default:
      return false
  }
}

/** PascalCase from a filename, for `export default function () {}`. */
function nameFromFile(rel: string): string {
  const base = (rel.split('/').pop() ?? '').replace(/\.[jt]sx?$/, '')
  const words = base.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const pascal = words.map((w) => (w[0] ?? '').toUpperCase() + w.slice(1)).join('')
  return /^[A-Z]/.test(pascal) ? pascal : 'Component'
}

const declaredNames = (node: t.Node): string[] => {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      return node.id ? [node.id.name] : []
    case 'VariableDeclaration':
      return node.declarations
        .map((d) => (d.id.type === 'Identifier' ? d.id.name : ''))
        .filter(Boolean)
    case 'TSInterfaceDeclaration':
    case 'TSTypeAliasDeclaration':
    case 'TSEnumDeclaration':
      return [node.id.name]
    default:
      return []
  }
}

/** Names a top-level statement introduces, unwrapping `export`. */
function topLevelNames(node: t.Statement): string[] {
  if (node.type === 'ExportNamedDeclaration' && node.declaration) {
    return declaredNames(node.declaration)
  }
  if (node.type === 'ExportDefaultDeclaration') return declaredNames(node.declaration)
  return declaredNames(node)
}

/** Every value a statement declares that is shaped like a component. */
function componentNames(node: t.Statement): Set<string> {
  const out = new Set<string>()
  const inner = node.type === 'ExportNamedDeclaration' && node.declaration
    ? node.declaration
    : node.type === 'ExportDefaultDeclaration' ? node.declaration : node
  if (inner.type === 'FunctionDeclaration' || inner.type === 'ClassDeclaration') {
    if (inner.id) out.add(inner.id.name)
  } else if (inner.type === 'VariableDeclaration') {
    for (const d of inner.declarations) {
      if (d.id.type === 'Identifier' && isComponentish(d.init)) out.add(d.id.name)
    }
  }
  return out
}

/** Module specifiers a statement pulls in, import and re-export alike. */
function specifiersOf(node: t.Statement): string[] {
  if (node.type === 'ImportDeclaration') return [node.source.value]
  if (node.type === 'ExportAllDeclaration') return [node.source.value]
  if (node.type === 'ExportNamedDeclaration' && node.source) return [node.source.value]
  return []
}

const isRelative = (spec: string): boolean => spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..'

/**
 * Which export the caller meant, and where it is declared.
 *
 * Refuses rather than guesses at every fork, because every wrong answer here
 * ends as a library card that cannot be placed. The awkward case worth naming
 * is `export { Button } from './Button'`: the name IS exported, so a check
 * that only looked at names would pass, and then there would be no
 * declaration to store, measure or mirror. That refuses and says where to go.
 */
function resolveExport(
  code: string,
  body: t.Statement[],
  rel: string,
  wanted: string | undefined,
): { resolved?: Resolved; error?: string } {
  const named = new Map<string, number>()      // exported name → body index
  const locals = new Map<string, number>()     // local name → body index
  const reexported = new Set<string>()
  let defaultIdx: number | undefined
  let defaultLocal: string | undefined
  let starReexport = false

  body.forEach((node, i) => {
    for (const n of topLevelNames(node)) if (!locals.has(n)) locals.set(n, i)
    if (node.type === 'ExportAllDeclaration') starReexport = true
    if (node.type === 'ExportNamedDeclaration') {
      if (node.source) {
        for (const s of node.specifiers) {
          if (s.type === 'ExportSpecifier') {
            reexported.add(s.exported.type === 'Identifier' ? s.exported.name : s.exported.value)
          }
        }
        return
      }
      if (node.declaration) {
        for (const n of declaredNames(node.declaration)) named.set(n, i)
      }
      for (const s of node.specifiers) {
        if (s.type !== 'ExportSpecifier') continue
        const out = s.exported.type === 'Identifier' ? s.exported.name : s.exported.value
        // `export { Button }` points at a declaration further up the file
        const at = locals.get(s.local.name)
        if (at === undefined) reexported.add(out)
        else named.set(out, at)
      }
    }
    if (node.type === 'ExportDefaultDeclaration') {
      const d = node.declaration
      if (d.type === 'Identifier') {
        defaultLocal = d.name
        defaultIdx = locals.get(d.name)
        if (defaultIdx === undefined) reexported.add('default')
      } else {
        defaultIdx = i
        if ((d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') && d.id) {
          defaultLocal = d.id.name
        }
      }
    }
  })

  // `export { Button }` written BEFORE the const it exports: one more pass,
  // now that every local name is known, rather than refusing on file order.
  body.forEach((node) => {
    if (node.type !== 'ExportNamedDeclaration' || node.source) return
    for (const s of node.specifiers) {
      if (s.type !== 'ExportSpecifier') continue
      const out = s.exported.type === 'Identifier' ? s.exported.name : s.exported.value
      const at = locals.get(s.local.name)
      if (at !== undefined) {
        named.set(out, at)
        reexported.delete(out)
      }
    }
  })
  if (defaultIdx === undefined && defaultLocal !== undefined) {
    defaultIdx = locals.get(defaultLocal)
    if (defaultIdx !== undefined) reexported.delete('default')
  }

  const offered = [...named.keys()].sort()
  const list = offered.length > 0 ? offered.map((n) => `"${n}"`).join(', ') : ''
  const alsoDefault = defaultIdx !== undefined ? 'a default export' : ''

  const target = wanted && wanted.length > 0 ? wanted : 'default'
  if (!EXPORT_OK.test(target)) {
    return { error: `"${target}" is not an export name — pass the identifier the component is exported under, or leave exportName out for the default export.` }
  }

  let idx: number | undefined
  let local: string
  if (target === 'default') {
    idx = defaultIdx
    local = defaultLocal ?? nameFromFile(rel)
    if (idx === undefined) {
      if (reexported.has('default')) {
        return { error: `${rel} re-exports its default from another module, so the library cannot see the declaration — capture the component from the file that declares it.` }
      }
      if (offered.length === 0) {
        return { error: `${rel} exports nothing, so there is no component to capture — add \`export\` to the component you want in the library.` }
      }
      return { error: `${rel} has no default export — pass exportName, one of ${list}.` }
    }
  } else {
    idx = named.get(target)
    local = target
    if (idx === undefined) {
      if (reexported.has(target)) {
        return { error: `${rel} re-exports "${target}" from another module, so the library cannot see its declaration — capture it from the file that declares it.` }
      }
      if (starReexport) {
        return { error: `${rel} doesn't declare "${target}" — it only re-exports another module wholesale (\`export * from\`). Capture "${target}" from the file that declares it.` }
      }
      const has = [list, alsoDefault].filter(Boolean).join(' and ')
      return {
        error: has
          ? `${rel} doesn't export "${target}" — it exports ${has}. Pick one of those, or export the component you meant.`
          : `${rel} exports nothing, so there is no component to capture — add \`export\` to the component you want in the library.`,
      }
    }
  }

  const stmt = body[idx]
  if (!stmt || stmt.start == null || stmt.end == null) {
    return { error: `the declaration of "${target}" in ${rel} could not be read back out of the file — save the file and try again.` }
  }
  if (!componentNames(stmt).has(local)) {
    return {
      error: `"${target}" in ${rel} isn't a component — the library stores things you can place on a page, so capture a function or class that returns JSX.`,
    }
  }

  return {
    resolved: {
      local,
      declIdx: idx,
      declExports: stmt.type === 'ExportNamedDeclaration' || stmt.type === 'ExportDefaultDeclaration',
      declText: code.slice(stmt.start, stmt.end),
    },
  }
}

// ── what the component needs to stand alone ─────────────────────────────────

/** The top-level statement an inner path belongs to, or nothing. */
function topLevelOf(p: NodePath<t.Node>): NodePath<t.Node> | undefined {
  let q: NodePath<t.Node> | null = p
  while (q?.parentPath && q.parentPath.node.type !== 'Program') q = q.parentPath
  return q?.parentPath?.node.type === 'Program' ? q : undefined
}

/**
 * Top-level statements the component actually references, transitively.
 *
 * This is what makes a stored `source` more than a hopeful slice. A component
 * that reads a module-scope `const TONES = {…}` or a `type Tone = …` is not
 * self-contained without them, and shipping the declaration alone would
 * produce a file that does not compile in the project it was mirrored into.
 * The walk closes over itself, so a constant that references another constant
 * brings its friend.
 *
 * Side-effect imports (`import 'normalize.css'`) have no binding to discover,
 * so they are taken unconditionally: they are there precisely because someone
 * decided the module needs them.
 */
function neededStatements(
  program: NodePath<t.Program>,
  body: t.Statement[],
  startIdx: number,
): number[] {
  const paths = program.get('body') as NodePath<t.Statement>[]
  const idxOf = new Map<t.Node, number>()
  paths.forEach((p, i) => idxOf.set(p.node, i))
  // Types get their own lookup: a `TSTypeReference` is not a referenced
  // identifier, so scope bindings alone would silently drop every interface.
  const typeIdx = new Map<string, number>()
  body.forEach((node, i) => {
    for (const n of topLevelNames(node)) typeIdx.set(n, i)
  })

  const picked = new Set<number>()
  const queue = [startIdx]
  const want = (name: string, scopeAt: NodePath<t.Node>): void => {
    const binding = scopeAt.scope.getBinding(name)
    const from = binding && binding.scope.block.type === 'Program'
      ? idxOf.get(topLevelOf(binding.path)?.node ?? binding.path.node)
      : undefined
    const at = from ?? typeIdx.get(name)
    if (at !== undefined && !picked.has(at)) queue.push(at)
  }

  while (queue.length > 0) {
    const i = queue.pop()
    if (i === undefined || picked.has(i)) continue
    picked.add(i)
    const p = paths[i]
    if (!p) continue
    p.traverse({
      Identifier(id: NodePath<t.Identifier>) {
        if (!id.isReferencedIdentifier()) return
        want(id.node.name, id)
      },
      JSXIdentifier(id: NodePath<t.JSXIdentifier>) {
        if (!/^[A-Z]/.test(id.node.name)) return // <div> is not a binding
        want(id.node.name, id)
      },
      TSTypeReference(ref: NodePath<t.TSTypeReference>) {
        let n: t.TSEntityName = ref.node.typeName
        while (n.type === 'TSQualifiedName') n = n.left
        want(n.name, ref)
      },
    })
  }

  for (let i = 0; i < body.length; i++) {
    const node = body[i]
    if (node?.type === 'ImportDeclaration' && node.specifiers.length === 0) picked.add(i)
  }
  return [...picked].sort((a, b) => a - b)
}

/**
 * A portable entry's source: the statements above, in file order, verbatim.
 *
 * Verbatim is the point. Re-printing through a code generator would reformat
 * someone's component on its way into the library and then again on its way
 * out, so the file that lands in the next project would not be the file they
 * wrote. An `export` is appended when the declaration did not carry one, so
 * what comes back is always a module that exports the component.
 */
function portableSource(
  code: string,
  program: NodePath<t.Program>,
  body: t.Statement[],
  r: Resolved,
): string {
  const parts: string[] = []
  for (const i of neededStatements(program, body, r.declIdx)) {
    const node = body[i]
    if (!node || node.start == null || node.end == null) continue
    parts.push(code.slice(node.start, node.end))
  }
  if (!r.declExports) parts.push(`export default ${r.local}`)
  return `${parts.join('\n\n')}\n`
}

// ── thumbnails ──────────────────────────────────────────────────────────────

/**
 * The PNG the browser hands over, as bytes. Same contract and same register as
 * history.ts: a card whose picture does not load is worse than one that
 * explained why there is no picture.
 */
function decodeThumbnail(thumbnail: string): Buffer {
  let b64 = thumbnail.trim()
  const url = /^data:([^;,]*)(;base64)?,/.exec(b64)
  if (url) {
    const media = (url[1] ?? '').toLowerCase()
    if (media && media !== 'image/png') {
      throw new Refusal(
        `that thumbnail is ${media}, and the library stores PNGs — hand over ` +
        `canvas.toDataURL('image/png').`,
      )
    }
    if (!url[2]) {
      throw new Refusal(
        'that thumbnail is a data URL but not a base64 one — hand over ' +
        "canvas.toDataURL('image/png').",
      )
    }
    b64 = b64.slice(url[0].length)
  }
  const bytes = Buffer.from(b64.replace(/\s+/g, ''), 'base64')
  if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new Refusal(
      "that thumbnail isn't a PNG — hand over canvas.toDataURL('image/png'), as a data URL " +
      'or as bare base64.',
    )
  }
  return bytes
}

/** Time-ordered, filename-safe, and never colliding with a row we already have. */
function nextId(taken: Iterable<string>): string {
  const used = new Set(taken)
  const stem = `l${Date.now().toString(36)}`
  let id = stem
  for (let n = 1; used.has(id); n++) id = `${stem}-${String(n)}`
  return id
}

// ── capture ─────────────────────────────────────────────────────────────────

/**
 * Put a component in the library, or say why not.
 *
 * Everything that can refuse does so BEFORE anything is written: an unparseable
 * file, a missing export and a non-PNG thumbnail all cost nothing, which
 * matters because this runs off a gesture and a half-written library is much
 * worse than a refused one.
 */
export function captureEntry(root: string, req: CaptureRequest): CaptureResult {
  if (typeof req.kind !== 'string' || !KINDS.has(req.kind)) {
    return {
      ok: false,
      error: `"${String(req.kind)}" is not a kind of entry — pass 'drawn' for something sketched, 'extracted' for something lassoed out of the page, or 'scanned' for a component the project already had.`,
    }
  }
  const asked = typeof req.file === 'string' ? req.file.trim() : ''
  if (asked.length === 0) {
    return {
      ok: false,
      error: 'the library needs a file to capture from — pass the project-relative path of the file that declares the component.',
    }
  }

  const rootAbs = resolve(root)
  const abs = isAbsolute(asked) ? resolve(asked) : resolve(rootAbs, asked)
  if (abs !== rootAbs && !abs.startsWith(rootAbs + sep)) {
    return { ok: false, error: `"${asked}" is outside this project — capture a component from a file inside it.` }
  }
  const rel = relative(rootAbs, abs).replace(/\\/g, '/')

  let code: string
  try {
    code = readFileSync(abs, 'utf8')
  } catch {
    return { ok: false, error: `there is no readable file at ${rel} — capture from a file that exists in this project.` }
  }
  let ast: t.File
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `${rel} doesn't parse, so nothing can be captured from it — fix the syntax error (${why}) and capture again.` }
  }

  let program: NodePath<t.Program> | undefined
  traverse(ast, {
    Program(p: NodePath<t.Program>) {
      program = p
      p.stop()
    },
  })
  if (!program) return { ok: false, error: `${rel} has no module body to read — capture from a source file.` }

  const body = ast.program.body
  const { resolved, error } = resolveExport(code, body, rel, req.exportName)
  if (!resolved) return { ok: false, error }

  let png: Buffer | null = null
  try {
    png = req.thumbnail === undefined || req.thumbnail.trim().length === 0
      ? null
      : decodeThumbnail(req.thumbnail)
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message }
    throw e
  }

  // ── portable? one relative specifier anywhere in the file is enough ──
  //
  // Deliberately a whole-file test rather than a per-component one. It
  // under-reports — a file whose OTHER component imports './Icon' drags this
  // one down with it — and that is the safe direction: the cost of saying
  // "local" about something portable is one entry that stays in this project,
  // while the cost of the opposite is a global entry that fails to resolve in
  // a project that never had an Icon.
  const portable = !body.some((node) => specifiersOf(node).some(isRelative))

  const declSource = resolved.declText
  const source = portable ? portableSource(code, program, body, resolved) : undefined

  // The caller's signature wins: an ink signature is what the user drew, and
  // one derived from generated source is only what came out the other end.
  const signature = coerceSignature(req.signature)
    ?? entrySignature(compositionFromSource(declSource))

  const name = (req.name ?? '').trim() ||
    (resolved.local === '' ? nameFromFile(rel) : resolved.local)
  const exportName = req.exportName && req.exportName.length > 0 ? req.exportName : 'default'

  const dir = libraryDir(root)
  const entries = readIndex(dir)
  // One row per file+export: capture fires on every sketch, and the panel must
  // not fill with the same card. The id survives, so the thumbnail path, the
  // global mirror and the placement count all survive with it.
  const existing = entries.find((e) => e.file === rel && e.exportName === exportName)
  const id = existing?.id ?? nextId(entries.map((e) => e.id))

  let thumb = existing?.thumb
  if (png) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(entryThumbPath(dir, id), png)
    thumb = `${id}.png`
  }

  const entry: LibraryEntry = {
    id,
    name,
    kind: req.kind,
    file: rel,
    exportName,
    props: coerceProps(req.props),
    defaults: coerceDefaults(req.defaults),
    signature,
    thumb,
    portable,
    source,
    createdAt: existing?.createdAt ?? Date.now(),
    usedCount: existing?.usedCount ?? 0,
  }

  writeIndex(dir, [entry, ...entries.filter((e) => e.id !== id)])

  let note: string | undefined
  if (portable) note = mirrorToGlobal(dir, entry)

  // Bounded without anyone having to remember to do it — and the row just
  // captured is never the one that goes. It has a use count of zero by
  // definition, so an unprotected prune would delete, at the moment of
  // capture, the very thing the user was looking at.
  prune(dir, MAX_ENTRIES, id)

  // Similar, not the same — offered so the UI can say "you drew this before",
  // and never allowed to decide anything on its own.
  const duplicateOf = signature
    ? nearest(signature, [...entries, ...readIndex(globalLibraryDirSafe())].filter(
        (e) => e.id !== id && !(e.file === rel && e.exportName === exportName),
      ))
    : undefined

  return { ok: true, entry, ...(duplicateOf ? { duplicateOf } : {}), ...(note ? { note } : {}) }
}

/** The global directory, or a path that simply will not exist. Never throws. */
function globalLibraryDirSafe(): string {
  try {
    return globalLibraryDir()
  } catch {
    return join(STATE_DIR, LIBRARY_DIR)
  }
}

function nearest(signature: number[], pool: LibraryEntry[]): LibraryEntry | undefined {
  let best: LibraryEntry | undefined
  let bestScore = NEAR_IDENTICAL
  for (const e of pool) {
    if (!e.signature) continue
    const s = signatureSimilarity(signature, e.signature)
    if (s >= bestScore) {
      bestScore = s
      best = e
    }
  }
  return best
}

/**
 * Mirror a portable entry into the library that follows the user, and return a
 * note if that could not be done.
 *
 * Keyed on NAME, not on file: the project-relative path an entry came from
 * means nothing in the next project, and the name is what the panel dedupes
 * on. So capturing a `Button` in a second project replaces the global
 * `Button` rather than offering two cards that read identically — newest wins,
 * because the newest is the one the user was just looking at.
 *
 * Every failure here is a note rather than an error. A read-only or missing
 * home directory is a real situation, and losing the capture over it would be
 * absurd: the project library already has the entry.
 */
function mirrorToGlobal(projectDir: string, entry: LibraryEntry): string | undefined {
  let dir: string
  try {
    dir = globalLibraryDir()
  } catch {
    return 'this entry is only in the project library: there is no home directory to keep a global one in.'
  }
  try {
    const rows = readIndex(dir)
    const kept = rows.filter((e) => e.id !== entry.id && e.name !== entry.name)
    mkdirSync(dir, { recursive: true })
    if (entry.thumb) {
      copyFileSync(entryThumbPath(projectDir, entry.id), entryThumbPath(dir, entry.id))
    }
    writeIndex(dir, [entry, ...kept])
    prune(dir, MAX_ENTRIES, entry.id)
    return undefined
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    return (
      `"${entry.name}" is in this project's library but couldn't be added to your global one ` +
      `(${dir}): ${why}. Make that directory writable if you want entries to follow you between projects.`
    )
  }
}

// ── reading the library ─────────────────────────────────────────────────────

/**
 * Both libraries, merged, newest first.
 *
 * Global rows are kept even when the project already has the same name, and
 * marked `alreadyHere` instead of being dropped: whether to show one card or
 * two is a question about the panel, and a store that silently hid rows would
 * leave the panel unable to say "you already have this".
 */
export function listEntries(root: string): ListedEntry[] {
  const mine = readIndex(libraryDir(root))
  const theirs = readIndex(globalLibraryDirSafe())
  const names = new Set(mine.map((e) => e.name))
  const out: ListedEntry[] = [
    ...mine.map((e) => ({ ...e, home: 'project' as const })),
    ...theirs.map((e) => ({
      ...e,
      home: 'global' as const,
      ...(names.has(e.name) ? { alreadyHere: true } : {}),
    })),
  ]
  return out.sort((a, b) => b.createdAt - a.createdAt)
}

/** One entry by id, project first — what placement needs to do its work. */
export function findEntry(root: string, id: string): ListedEntry | undefined {
  if (!ID_OK.test(id)) return undefined
  return listEntries(root).find((e) => e.id === id)
}

// ── removing, and what removing is NOT ──────────────────────────────────────

/**
 * Forget an entry.
 *
 * This deletes a row and a thumbnail. It does NOT touch the component's file,
 * and that restraint is the whole meaning of an entry: an entry is a POINTER
 * at code the user wrote, so taking it out of the library is closing a
 * drawer, not deleting their work. If removal deleted source, nobody could
 * ever safely tidy the panel, and the library would become a thing people are
 * afraid of.
 *
 * With no `home`, whichever library holds it is the one that loses it —
 * starting with the project's, so tidying this project's panel never quietly
 * empties the library that follows the user between projects.
 */
export function removeEntry(
  root: string,
  id: string,
  opts: { home?: 'project' | 'global' } = {},
): RemoveResult {
  if (typeof id !== 'string' || !ID_OK.test(id)) {
    return { ok: false, removed: false, error: `"${String(id)}" isn't a library id — pick an entry from the library panel.` }
  }
  const homes: ('project' | 'global')[] = opts.home ? [opts.home] : ['project', 'global']
  for (const home of homes) {
    const dir = home === 'project' ? libraryDir(root) : globalLibraryDirSafe()
    const rows = readIndex(dir)
    if (!rows.some((e) => e.id === id)) continue
    try {
      writeIndex(dir, rows.filter((e) => e.id !== id))
      // Path rebuilt from the validated id, never read out of the index, so
      // this can only ever delete our own PNG.
      rmSync(entryThumbPath(dir, id), { force: true })
      return { ok: true, removed: true }
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        removed: false,
        error: `couldn't remove that entry from the ${home} library (${dir}): ${why}. Your component file was not touched.`,
      }
    }
  }
  return { ok: true, removed: false }
}

/**
 * Count a placement.
 *
 * Silent by design: this is called from the placement path, after the edit has
 * already landed, and a library that could not write a counter is no reason to
 * fail an edit the user can see on the page. Both homes are bumped, so an
 * entry's popularity does not reset when the panel shows the global copy.
 */
export function bumpUsed(root: string, id: string): void {
  if (typeof id !== 'string' || !ID_OK.test(id)) return
  for (const dir of [libraryDir(root), globalLibraryDirSafe()]) {
    try {
      const rows = readIndex(dir)
      if (!rows.some((e) => e.id === id)) continue
      writeIndex(dir, rows.map((e) => (e.id === id ? { ...e, usedCount: e.usedCount + 1 } : e)))
    } catch {
      // see above: a counter is not worth an exception
    }
  }
}

// ── keeping it bounded ──────────────────────────────────────────────────────

/**
 * Drop the least valuable entries, thumbnails and all.
 *
 * Ranked by how often an entry has actually been placed, and only then by
 * recency. That ordering is the interesting part: a library is not a timeline,
 * so "oldest goes first" would throw away the button someone has used forty
 * times in favour of a shape they drew this morning and never placed again.
 */
export function pruneLibrary(root: string, max: number = MAX_ENTRIES): { removed: string[] } {
  const removed = [
    ...prune(libraryDir(root), max),
    ...prune(globalLibraryDirSafe(), max),
  ]
  return { removed }
}

function prune(dir: string, max: number, keepId?: string): string[] {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_ENTRIES
  try {
    if (!existsSync(join(dir, LIBRARY_INDEX))) return []
    const rows = readIndex(dir)
    if (rows.length <= limit) return []
    const ranked = [...rows].sort((a, b) =>
      Number(b.id === keepId) - Number(a.id === keepId) ||
      b.usedCount - a.usedCount ||
      b.createdAt - a.createdAt)
    const kept = ranked.slice(0, limit)
    const dropped = ranked.slice(limit)
    // The index keeps its own newest-first order; only membership changes.
    const keptIds = new Set(kept.map((e) => e.id))
    writeIndex(dir, rows.filter((e) => keptIds.has(e.id)))
    for (const e of dropped) rmSync(entryThumbPath(dir, e.id), { force: true })
    return dropped.map((e) => e.id)
  } catch {
    return []
  }
}

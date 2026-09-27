/**
 * Putting a library entry onto the page — as code, not as a copy.
 *
 * The library's whole claim (library-types.ts) is that an entry is a component
 * that already compiles, so "add this here" is an import plus one JSX child.
 * That claim only holds if placing is exact. A design tool can paste a picture
 * and be approximately right; this writes into someone's source, where
 * approximately right means a red squiggle or, worse, a silently different
 * component than the one in the thumbnail.
 *
 * Three things are therefore decided rather than guessed.
 *
 * Values come from `entry.defaults` — props it demonstrably rendered with once
 * — and never from invention. `title="Title"` is a lie that looks like a
 * result: it renders, so nobody notices it was never chosen. A required prop
 * with no recorded value is NAMED in the result instead, and the call site is
 * written without it, which leaves a type error exactly where the decision is
 * still outstanding. That is the honest state of affairs, and the UI can ask.
 *
 * Names are the hard part. A file that already has its own `PlanCard` cannot
 * receive `import PlanCard from …` — that is a duplicate declaration, and the
 * near-miss versions of this (shadow it, or concatenate a suffix without
 * re-checking) produce code that either renders the wrong component or fails
 * to parse. So the target's scope is read, the desired binding is tested
 * against it, and an alias is chosen that is itself free. The mirror case
 * matters just as much: if the file ALREADY imports this component, reuse that
 * binding. Two imports of one module is how a codebase starts to sprawl, which
 * is the opposite of what the library is for.
 *
 * Where it goes follows instant.ts. That file already worked out which
 * container is a legitimate mount point (tightest, positioned, not a
 * click-through decoration layer) and the ordering discipline for a
 * child-plus-import edit: write the LATER offset first so the earlier one
 * stays valid. The overlay hands over the stamp that reasoning produced, so
 * this works from the stamp and repeats the parts that are visible in source —
 * a `pointer-events-none` layer is still not somewhere to put content, and a
 * self-closing element still has no inside.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath, type Scope } from '@babel/traverse'
import type * as t from '@babel/types'
import { importAnchor } from './imports.js'
import type { EntryProp, LibraryEntry } from './library-types.js'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

const LOC = /^(.+):(\d+):(\d+)$/
const COMPONENT = /^[A-Z][\w$]*$/
const PROP_NAME = /^[A-Za-z_$][\w$]*(-[\w$]+)*$/
/** Extensions a module specifier drops, and that we resolve one against. */
const EXTS = ['', '.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts', '/index.jsx', '/index.js']
/** How many suffixed names to try before admitting the file is unusual. */
const ALIAS_TRIES = 50

/**
 * Where the entry goes, relative to the element the user dropped onto.
 *
 * Both are needed, and only the overlay can tell them apart. Dropping into the
 * empty space of a card means INSIDE it; dropping onto a heading, an image or
 * a button means BESIDE it, because a leaf that renders text has no room and
 * the user was pointing at the flow it sits in. The DOM knows which — it has
 * the rects and the computed styles that mountPoint reasons about — whereas
 * the AST only knows the element has a closing tag, which is true of both. So
 * the caller says, rather than this file inferring from the one signal that
 * cannot distinguish them. 'inside' is the default because that is what a drop
 * onto a region means, and the impossible case refuses and names 'after'
 * instead of quietly switching, so the user is never told "placed" about a
 * placement they did not ask for.
 */
export type PlaceWhere = 'inside' | 'after'

export interface PlaceRequest {
  entry: LibraryEntry
  /** data-s2c stamp of the element that was dropped onto. */
  at: string
  /** Default 'inside'. */
  where?: PlaceWhere
  /** Directory for an entry that has to be materialised first. */
  dir?: string
}

export interface PlaceResult {
  ok: boolean
  /** File the call site now lives in, relative to the app root. */
  file?: string
  /** The call site's own stamp, so the UI can select what it just placed. */
  callSite?: string
  /** JSX that was written, e.g. '<PlanCard title="Team" seats={12} />'. */
  jsx?: string
  /** Local name used at the call site — an alias when the plain name was taken. */
  name?: string
  where?: PlaceWhere
  /** The import line added. Absent when an existing import was reused. */
  imported?: string
  /** True when the file already imported this component and it was reused. */
  reusedImport?: boolean
  /** True when the local name had to be aliased around something else. */
  aliased?: boolean
  /** Required props with no recorded value — what still needs filling in. */
  needs?: string[]
  /** Set when the entry had to be written into this project first. */
  materialised?: string
  error?: string
}

export interface MaterialiseResult {
  ok: boolean
  /** The entry's file in THIS project, relative to the app root. */
  file?: string
  error?: string
}

export type EnsureResult =
  | { ok: true; entry: LibraryEntry; materialised?: string }
  | { ok: false; error: string }

/** PascalCase words, the way extract.ts builds a component name. */
const pascal = (raw: string): string =>
  raw
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join('')

/** POSIX, extension-less, always relative — a specifier a bundler accepts. */
function specifierFor(fromDir: string, toAbs: string): string {
  const spec = relative(fromDir, toAbs).replace(/\\/g, '/').replace(/\.[jt]sx?$/, '')
  return spec.startsWith('.') ? spec : `./${spec}`
}

/** Does this specifier, resolved from the importing file, mean that file? */
const sameModule = (specAbs: string, target: string): boolean =>
  EXTS.some((e) => specAbs + e === target)

const indentAt = (code: string, index: number): string => {
  const lineStart = code.lastIndexOf('\n', index - 1) + 1
  return /^[ \t]*/.exec(code.slice(lineStart, index))![0]
}

/**
 * One prop, rendered the way props.ts renders an attribute.
 *
 * Null means "this value cannot be written as a literal here" — an `other`
 * prop was wired to an expression at the capture site (`items={rows}`), and
 * `rows` is a name that lives in a scope this file has never heard of.
 */
function attrText(name: string, kind: EntryProp['kind'], raw: string): string | null {
  switch (kind) {
    case 'number': {
      const n = Number(raw.trim())
      return raw.trim() !== '' && Number.isFinite(n) ? `${name}={${String(n)}}` : null
    }
    case 'boolean': {
      const s = raw.trim().toLowerCase()
      // `dense` reads better than `dense={true}`, and false is worth stating
      if (s === 'true') return name
      if (s === 'false') return `${name}={false}`
      return null
    }
    case 'string':
    case 'enum': {
      if (!raw.includes('"')) return `${name}="${raw}"`
      if (!raw.includes("'")) return `${name}='${raw}'`
      return `${name}={${JSON.stringify(raw)}}`
    }
    default:
      return null
  }
}

/**
 * The kind of a recorded value whose prop the entry never typed.
 *
 * Only reached for entries with no readable types (an untyped scanned
 * component, or props arriving through a spread). Dropping those values would
 * place a bare `<PlanCard />` and throw away the design the entry was captured
 * FOR, so they are rendered on the shape of the text: a recorded '12' came
 * from a number literal at a call site far more often than from the string
 * "12", and `"12"` would be the type error rather than the working call.
 */
const guessKind = (raw: string): EntryProp['kind'] => {
  const s = raw.trim()
  if (s === 'true' || s === 'false') return 'boolean'
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number'
  return 'string'
}

/** Names visible at the call site: its own scopes, up to and including module scope. */
function namesInScope(path: NodePath<t.JSXOpeningElement>): Set<string> {
  const taken = new Set<string>()
  for (let s: Scope | undefined = path.scope; s; s = s.parent) {
    for (const n of Object.keys(s.bindings)) taken.add(n)
  }
  return taken
}

/**
 * A binding name that is free here.
 *
 * Suffixing is the obvious move and the obvious bug: `PlanCard2` is exactly as
 * likely to be taken as `PlanCard` was, so every candidate is tested, not just
 * the first. Trailing digits are stripped first so a second collision does not
 * compound into `PlanCard22`.
 */
function freeName(desired: string, taken: Set<string>): string | null {
  if (!taken.has(desired)) return desired
  const base = desired.replace(/\d+$/, '') || desired
  for (let n = 2; n < ALIAS_TRIES; n++) {
    const candidate = `${base}${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
  return null
}

/** Is there a non-whitespace child? Proof that this element renders children. */
const hasRealChildren = (el: t.JSXElement): boolean =>
  el.children.some((c) => (c.type === 'JSXText' ? c.value.trim() !== '' : true))

const classNameOf = (el: t.JSXOpeningElement): string => {
  const a = el.attributes.find(
    (x): x is t.JSXAttribute =>
      x.type === 'JSXAttribute' && x.name.type === 'JSXIdentifier' && x.name.name === 'className',
  )
  return a?.value?.type === 'StringLiteral' ? a.value.value : ''
}

/**
 * Write a portable entry into this project so it can be placed.
 *
 * A global entry follows the user between apps, which means the file it names
 * does not exist here. `portable` already recorded whether that is fixable:
 * self-contained source can be written anywhere, and source that imports
 * `./Icon` cannot, because this project has no Icon and the component would
 * fail to resolve the moment it rendered. That is a refusal, not a best
 * effort — a broken import is worse than being told no.
 */
export function materialiseEntry(root: string, entry: LibraryEntry, dir?: string): MaterialiseResult {
  const rel = entry.file
  if (!rel) return { ok: false, error: `"${entry.name}" has no file recorded, so there is nothing to place.` }
  if (!resolve(root, rel).startsWith(resolve(root))) {
    return { ok: false, error: `${rel} is outside the app root — that entry cannot be written here.` }
  }
  // already here: placing is an import away, and rewriting the file would
  // discard whatever this project has since done to it
  if (existsSync(join(root, rel))) return { ok: true, file: rel }

  if (!entry.portable) {
    return {
      ok: false,
      error:
        `${entry.name} is not in this project (${rel} is missing) and cannot be copied in: ` +
        `its source imports files from the project it was captured in, which this one does not have. ` +
        `Open it in that project, or capture it again from a component that stands on its own.`,
    }
  }
  const source = entry.source
  if (!source?.trim()) {
    return {
      ok: false,
      error:
        `${entry.name} is not in this project (${rel} is missing) and no source was stored with it, ` +
        `so there is nothing to write. Capture it again from a project where its file exists.`,
    }
  }
  // portable is a claim the store made; a relative import here disproves it,
  // and writing the file anyway would produce one that cannot resolve
  const relImport = /^\s*(?:import|export)\b[^\n]*from\s*['"](\.[^'"]*)['"]/m.exec(source)
  if (relImport) {
    return {
      ok: false,
      error:
        `${entry.name} is stored as portable but its source imports '${relImport[1]!}', ` +
        `which this project does not have. Capture it again as a self-contained component.`,
    }
  }
  try {
    parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, error: `${entry.name}'s stored source no longer parses (${String(err)}).` }
  }

  const intoDir = dir ?? defaultDir(root, rel)
  const ext = /\.[jt]sx?$/.exec(rel)?.[0] ?? '.tsx'
  const stem = basename(rel).replace(/\.[jt]sx?$/, '')
  const base = (entry.exportName !== 'default' ? pascal(entry.exportName) : pascal(entry.name)) || pascal(stem)
  if (!COMPONENT.test(base)) {
    return { ok: false, error: `"${entry.name}" has no usable component name — rename the entry first.` }
  }
  // never overwrite: the same reasoning as extract.ts's componentName. The
  // source keeps its own export name, so a suffixed FILE name costs nothing —
  // the import is written from the file, and the binding from the export.
  let name = base
  for (let n = 2; existsSync(join(root, intoDir, `${name}${ext}`)); n++) {
    if (n > ALIAS_TRIES) return { ok: false, error: `${intoDir} already has every name like ${base}${ext}.` }
    name = `${base.replace(/\d+$/, '')}${String(n)}`
  }

  const outRel = `${intoDir}/${name}${ext}`
  mkdirSync(join(root, intoDir), { recursive: true })
  writeFileSync(join(root, outRel), source)
  return { ok: true, file: outRel }
}

/**
 * Where a materialised entry lands.
 *
 * Its own directory when this project has the same layout — an entry captured
 * from a similar app should not invent a second convention next to the one the
 * project already follows — and the conventional place otherwise.
 */
function defaultDir(root: string, entryFile: string): string {
  const own = dirname(entryFile).replace(/\\/g, '/')
  if (own && own !== '.' && existsSync(join(root, own))) return own
  return existsSync(join(root, 'src')) ? 'src/components' : 'components'
}

/**
 * The entry, guaranteed present in this project.
 *
 * One call for the UI: the overlay drops an entry and does not care whether it
 * came from this repo's library or followed the user in from another app.
 */
export function ensureEntry(root: string, entry: LibraryEntry, dir?: string): EnsureResult {
  if (entry.file && existsSync(join(root, entry.file))) return { ok: true, entry }
  const made = materialiseEntry(root, entry, dir)
  if (!made.ok || !made.file) return { ok: false, error: made.error ?? 'that entry could not be written here.' }
  return { ok: true, entry: { ...entry, file: made.file }, materialised: made.file }
}

export function placeEntry(root: string, req: PlaceRequest): PlaceResult {
  const where: PlaceWhere = req.where ?? 'inside'
  const ready = ensureEntry(root, req.entry, req.dir)
  if (!ready.ok) return { ok: false, error: ready.error }
  const entry = ready.entry

  const m = LOC.exec(req.at)
  if (!m) return { ok: false, error: `bad drop location "${req.at}".` }
  const [, rel, lineS, colS] = m
  const abs = resolve(root, rel!)
  if (!abs.startsWith(resolve(root))) return { ok: false, error: 'that drop location escapes the app root.' }

  const entryAbs = resolve(root, entry.file)
  if (entryAbs === abs) {
    return {
      ok: false,
      error:
        `${entry.name} is declared in ${rel!} itself — placing it there would make it render itself. ` +
        `Drop it somewhere that uses ${entry.name} instead.`,
    }
  }

  let code: string
  try {
    code = readFileSync(abs, 'utf8')
  } catch {
    return { ok: false, error: `cannot read ${rel!}.` }
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return { ok: false, error: `cannot parse ${rel!} — fix what is broken there and drop again.` }
  }

  // ── the target, and every import the file already has ──
  let open: NodePath<t.JSXOpeningElement> | undefined
  const imports: t.ImportDeclaration[] = []
  traverse(ast, {
    ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
      imports.push(path.node)
    },
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) open = path
    },
  })
  if (!open) return { ok: false, error: `no element at ${req.at} (stale stamp?).` }
  const openEl = open.node
  const element = open.parentPath.node as t.JSXElement
  if (element.type !== 'JSXElement' || openEl.end == null || element.end == null || element.start == null) {
    return { ok: false, error: `the element at ${req.at} has no source range to edit.` }
  }
  const tag = openEl.name.type === 'JSXIdentifier' ? openEl.name.name : null

  // ── is this somewhere content belongs? (instant.ts's mountPoint, in source) ──
  if (classNameOf(openEl).split(/\s+/).includes('pointer-events-none')) {
    return {
      ok: false,
      error:
        `<${tag ?? 'element'}> at ${req.at} is a click-through decoration layer — things are drawn on top of it, ` +
        `not put inside it. Drop onto the container it sits over.`,
    }
  }

  // ── work out the insertion point ──
  let at: number
  let indent: string
  if (where === 'after') {
    const host = open.parentPath.parentPath?.node
    if (!host || (host.type !== 'JSXElement' && host.type !== 'JSXFragment')) {
      return {
        ok: false,
        error:
          `<${tag ?? 'element'}> at ${req.at} is the outermost element in ${rel!}, so there is no slot beside it. ` +
          `Drop onto something inside it instead.`,
      }
    }
    at = element.end
    indent = indentAt(code, element.start)
  } else {
    if (!element.closingElement) {
      return {
        ok: false,
        error:
          `<${tag ?? 'element'}> at ${req.at} is self-closing, so nothing can go inside it. ` +
          `Drop onto the container around it, or ask for it to be placed after it.`,
      }
    }
    // A component with no children today may not render children at all, and a
    // child that is silently dropped looks exactly like a placement that
    // failed for no reason. An element that already has children has proved it.
    if (tag && COMPONENT.test(tag) && !hasRealChildren(element)) {
      return {
        ok: false,
        error:
          `<${tag}> is a component with no children of its own, so anything placed inside it only appears ` +
          `if ${tag} renders children. Drop onto a plain container, or add ${entry.name} inside ${tag}'s own file.`,
      }
    }
    const kids = element.children.filter((c) => (c.type === 'JSXText' ? c.value.trim() !== '' : true))
    const last = kids[kids.length - 1]
    // last child, not first: a drop joins the end of the flow, and inserting
    // ahead of what is already there would push the container's existing
    // content down — a reorder of things the user did not touch
    if (last?.end != null && last.start != null) {
      at = last.end
      indent = indentAt(code, last.start)
    } else {
      at = openEl.end
      indent = `${indentAt(code, element.start)}  `
    }
  }

  // ── the binding: reuse, plain, or aliased ──
  const named = entry.exportName !== 'default'
  const imported = named ? entry.exportName : null
  let local: string | null = null
  let reused = false
  for (const decl of imports) {
    if (!sameModule(resolve(dirname(abs), decl.source.value), entryAbs)) continue
    for (const s of decl.specifiers) {
      if (!named && s.type === 'ImportDefaultSpecifier') local = s.local.name
      if (
        named && s.type === 'ImportSpecifier' &&
        (s.imported.type === 'Identifier' ? s.imported.name : s.imported.value) === imported
      ) local = s.local.name
    }
    if (local) {
      reused = true
      break
    }
  }

  const desired = (named ? pascal(entry.exportName) : pascal(entry.name)) ||
    pascal(basename(entry.file).replace(/\.[jt]sx?$/, ''))
  if (!reused) {
    if (!COMPONENT.test(desired)) {
      return {
        ok: false,
        error: `"${entry.name}" has no usable component name — rename the entry to something like PlanCard.`,
      }
    }
    local = freeName(desired, namesInScope(open))
    if (!local) {
      return {
        ok: false,
        error: `${rel!} already uses every name like ${desired} — rename one of them, or rename the entry.`,
      }
    }
  }
  if (!local) return { ok: false, error: `could not work out what to call ${entry.name} in ${rel!}.` }

  // ── props: recorded values only, and say what is still missing ──
  const attrs: string[] = []
  const needs: string[] = []
  const done = new Set<string>()
  for (const p of entry.props) {
    if (!PROP_NAME.test(p.name)) {
      return { ok: false, error: `${entry.name} records a prop called "${p.name}", which is not a usable prop name.` }
    }
    done.add(p.name)
    const raw = entry.defaults[p.name]
    const text = raw == null ? null : attrText(p.name, p.kind, raw)
    if (text) attrs.push(text)
    // named, never invented: a placeholder renders, so nobody would ever
    // notice the value was not chosen
    else if (p.required) needs.push(p.name)
  }
  for (const [name, raw] of Object.entries(entry.defaults)) {
    if (done.has(name) || !PROP_NAME.test(name)) continue
    const text = attrText(name, guessKind(raw), raw)
    if (text) attrs.push(text)
  }

  const jsx = `<${local}${attrs.length ? ` ${attrs.join(' ')}` : ''} />`
  const childText = `\n${indent}${jsx}`

  const importLine = reused
    ? ''
    : named
      ? `import { ${imported!}${local === imported ? '' : ` as ${local}`} } from '${specifierFor(dirname(abs), entryAbs)}'\n`
      : `import ${local} from '${specifierFor(dirname(abs), entryAbs)}'\n`
  // The anchor comes from the AST, not from a `^import` match — see imports.ts
  // for the bug that taught this, which the lasso and the instant render shared.
  const importAt = importAnchor(ast, code)

  // Later offset first (instant.ts): inserting the further edit leaves the
  // earlier one's offset valid, so no arithmetic keeps them in step. Usually
  // that means child then import — but an import is legal below a function
  // that uses it, so the order is derived rather than assumed.
  const edits = importLine ? [{ at, text: childText }, { at: importAt, text: importLine }] : [{ at, text: childText }]
  edits.sort((a, b) => b.at - a.at)
  let next = code
  for (const e of edits) next = next.slice(0, e.at) + e.text + next.slice(e.at)

  // never hand back something that will not compile
  try {
    parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch (err) {
    return { ok: false, error: `placing ${entry.name} in ${rel!} would not parse (${String(err)}).` }
  }
  writeFileSync(abs, next)

  // the call site's own stamp, in the same currency everything else speaks
  const jsxAt = at + childText.indexOf('<') + (importLine && importAt <= at ? importLine.length : 0)
  const before = next.slice(0, jsxAt)
  const line = before.split('\n').length
  const col = jsxAt - (before.lastIndexOf('\n') + 1) + 1

  return {
    ok: true,
    file: rel!,
    callSite: `${rel!}:${String(line)}:${String(col)}`,
    jsx,
    name: local,
    where,
    ...(importLine ? { imported: importLine.trimEnd() } : { reusedImport: true }),
    ...(!reused && local !== desired ? { aliased: true } : {}),
    ...(needs.length ? { needs } : {}),
    ...(ready.materialised ? { materialised: ready.materialised } : {}),
  }
}

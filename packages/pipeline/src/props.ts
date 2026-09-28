/**
 * A props panel read off the component's own types.
 *
 * Every direct-manipulation surface built so far edits the ELEMENT under the
 * cursor — its colour, its spacing, its position. But half of what a page is
 * made of lives one level up: a card is dark because someone passed
 * `tone="dark"`, a stat reads 12 because someone passed `count={12}`. Those
 * are the knobs the component's author actually designed, and today the only
 * way to turn one is to find the call site and type.
 *
 * A panel of controls for them would normally need a schema — a registry of
 * prop names, kinds and allowed values, declared a second time, drifting from
 * the code the moment anyone edits either. This project doesn't need that,
 * because the schema already exists and is already authoritative: TypeScript
 * says `tone: 'light' | 'dark'`, which is a dropdown with two entries, and
 * `count: number`, which is a number field. The types ARE the panel.
 *
 * So: resolve the clicked element's stamp to the component that renders it,
 * read that component's parameter type, and emit one control spec per prop.
 * Where a type cannot honestly become a control — a callback, a nested object,
 * ReactNode, a type imported from somewhere this file can't see — the prop is
 * returned with `editable: false` and a SENTENCE saying why, because a greyed
 * row that explains itself is more useful than a prop that silently vanished
 * from the panel.
 *
 * Writing back is an AST edit at one named call site. The one thing it will
 * never do is overwrite `title={heading}`: that attribute is wiring, and
 * replacing it with a literal would quietly delete a data flow the user can't
 * see from the page. That case refuses and says what to do instead.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, type Dirent } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (ast: unknown, visitor: Record<string, unknown>) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

/** What kind of control the prop's declared type asks for. */
export type PropKind = 'string' | 'number' | 'boolean' | 'enum' | 'other'

export interface PropSpec {
  name: string
  kind: PropKind
  /** 'enum' only: the literals the type allows, in declaration order. */
  options?: string[]
  required: boolean
  /** The annotation exactly as written, so the panel can show the truth. */
  typeText: string
  editable: boolean
  /** Why not, as a sentence — shown next to the greyed row. */
  why?: string
}

export interface CallSite {
  /** 'src/App.tsx:12:7' — same shape as a data-s2c stamp. */
  loc: string
  /** Attributes whose value is a literal, by name: what the panel shows. */
  values: Record<string, string>
  /**
   * Attributes wired to an expression (and any spreads, as '...rest').
   * Named so the panel can mark them read-only instead of offering a control
   * that would drop the wiring on first use.
   */
  expressions: string[]
}

export interface ReadPropsResult {
  ok: boolean
  component?: string
  file?: string
  props?: PropSpec[]
  callSites?: CallSite[]
  /**
   * Things about the props TYPE the panel should say out loud: an interface
   * that extends something, an index signature, a shape read from elsewhere.
   * Per-prop reasons live on the prop; these are about props that could not
   * even be NAMED, which no row can carry.
   */
  notes?: string[]
  error?: string
}

export interface SetPropRequest {
  /** A `loc` from readComponentProps — the exact call site to edit. */
  callSite: string
  name: string
  value: string | number | boolean
}

export interface SetPropResult {
  ok: boolean
  file?: string
  /** e.g. `tone: "light" → "dark"`. */
  change?: string
  error?: string
}

const LOC = /^(.+):(\d+):(\d+)$/
/** JSX attribute names allow dashes (data-*, aria-*); identifiers do not. */
const ATTR_NAME = /^[A-Za-z_$][\w$]*(-[\w$]+)*$/
const PASCAL = /^[A-Z][A-Za-z0-9_$]*$/

const parseSource = (code: string) => parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

const textOf = (code: string, node: { start?: number | null; end?: number | null }): string =>
  node.start == null || node.end == null ? '' : code.slice(node.start, node.end)

// ── reading a file once, with everything the reader needs from it ────────────

interface FileCtx {
  abs: string
  rel: string
  code: string
  ast: t.File
  /** interface / type alias declarations in THIS file, by name. */
  types: Map<string, t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration>
  /** local name → module specifier, for types and components alike. */
  imports: Map<string, string>
  /** Which names the file exports, and whether it has a default. */
  exported: Set<string>
  hasDefault: boolean
  /** Local name the default export refers to, when it has one. */
  defaultLocal?: string
}

function loadCtx(abs: string, rel: string): { ctx?: FileCtx; error?: string } {
  let code: string
  try {
    code = readFileSync(abs, 'utf8')
  } catch {
    return { error: `cannot read ${rel}` }
  }
  let ast: t.File
  try {
    ast = parseSource(code)
  } catch {
    return { error: `cannot parse ${rel}` }
  }

  const types = new Map<string, t.TSInterfaceDeclaration | t.TSTypeAliasDeclaration>()
  const imports = new Map<string, string>()
  const exported = new Set<string>()
  let hasDefault = false
  let defaultLocal: string | undefined

  const note = (decl: t.Statement, isExport: boolean) => {
    if (decl.type === 'TSInterfaceDeclaration' || decl.type === 'TSTypeAliasDeclaration') {
      types.set(decl.id.name, decl)
      if (isExport) exported.add(decl.id.name)
    } else if (decl.type === 'FunctionDeclaration' && decl.id) {
      if (isExport) exported.add(decl.id.name)
    } else if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.id.type === 'Identifier' && isExport) exported.add(d.id.name)
      }
    }
  }

  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      for (const s of stmt.specifiers) imports.set(s.local.name, stmt.source.value)
      continue
    }
    if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.declaration) note(stmt.declaration, true)
      for (const s of stmt.specifiers) {
        if (s.type === 'ExportSpecifier') exported.add(s.local.name)
      }
      continue
    }
    if (stmt.type === 'ExportDefaultDeclaration') {
      hasDefault = true
      const d = stmt.declaration
      if (d.type === 'Identifier') defaultLocal = d.name
      else if (d.type === 'FunctionDeclaration' && d.id) defaultLocal = d.id.name
      else if (d.type === 'ClassDeclaration' && d.id) defaultLocal = d.id.name
      continue
    }
    note(stmt, false)
  }

  return { ctx: { abs, rel, code, ast, types, imports, exported, hasDefault, defaultLocal } }
}

// ── turning a type into a control ───────────────────────────────────────────

interface Classified {
  kind: PropKind
  options?: string[]
  editable: boolean
  why?: string
  /** `string | undefined` makes a prop optional as surely as `title?` does. */
  optional: boolean
}

/** Types that hold markup rather than a value. */
const REACT_CONTENT = new Set([
  'ReactNode', 'ReactElement', 'ReactChild', 'ReactChildren', 'ReactNodeArray',
  'ReactFragment', 'ReactPortal', 'JSX.Element', 'Element', 'ComponentType', 'ComponentProps',
])

const refName = (n: t.TSEntityName): string =>
  n.type === 'Identifier' ? n.name : `${refName(n.left)}.${n.right.name}`

const NULLISH = new Set(['TSUndefinedKeyword', 'TSNullKeyword', 'TSVoidKeyword'])

const stringLiteral = (n: t.TSType): string | undefined =>
  n.type === 'TSLiteralType' && n.literal.type === 'StringLiteral' ? n.literal.value : undefined

const booleanish = (n: t.TSType): boolean =>
  n.type === 'TSBooleanKeyword' || (n.type === 'TSLiteralType' && n.literal.type === 'BooleanLiteral')

/**
 * What control this type asks for, following type aliases declared in the same
 * file (`type Tone = 'ok' | 'warn'` used as `tone: Tone` is a dropdown, and
 * refusing to follow one alias would make the panel useless on real code).
 *
 * `seen` stops a self-referential alias from spinning.
 */
function classify(node: t.TSType, ctx: FileCtx, seen: Set<string>): Classified {
  const yes = (kind: PropKind, options?: string[]): Classified =>
    options ? { kind, options, editable: true, optional: false } : { kind, editable: true, optional: false }
  const no = (why: string): Classified => ({ kind: 'other', editable: false, why, optional: false })
  const text = textOf(ctx.code, node)

  switch (node.type) {
    case 'TSParenthesizedType':
      return classify(node.typeAnnotation, ctx, seen)
    case 'TSStringKeyword':
      return yes('string')
    case 'TSNumberKeyword':
      return yes('number')
    case 'TSBooleanKeyword':
      return yes('boolean')

    case 'TSLiteralType': {
      const s = stringLiteral(node)
      if (s != null) return yes('enum', [s])
      if (node.literal.type === 'BooleanLiteral') return yes('boolean')
      return no(`it's the literal ${text} — the panel only builds dropdowns out of string unions`)
    }

    case 'TSUnionType': {
      const parts = node.types.filter((p) => !NULLISH.has(p.type))
      const optional = parts.length !== node.types.length
      const with_ = (c: Classified): Classified => (optional ? { ...c, optional: true } : c)
      if (parts.length === 0) return no(`its type is ${text}, which has no value to edit`)
      if (parts.length === 1) return with_(classify(parts[0]!, ctx, seen))
      // a union of string literals is exactly a dropdown
      const lits = parts.map(stringLiteral)
      if (lits.every((l) => l != null)) return with_(yes('enum', [...new Set(lits as string[])]))
      // `'a' | 'b' | string` collapses to string in TS; so should the control
      if (parts.every((p) => p.type === 'TSStringKeyword' || stringLiteral(p) != null)) return with_(yes('string'))
      if (parts.every(booleanish)) return with_(yes('boolean'))
      return no(`its type is a union of unlike things (${text}) — one control can't honestly cover it`)
    }

    case 'TSTypeReference': {
      const name = refName(node.typeName)
      const last = name.split('.').pop() ?? name
      if (REACT_CONTENT.has(name) || REACT_CONTENT.has(last)) {
        return no(`it holds markup (${text}), not a value — change it in the JSX at the call site`)
      }
      const decl = ctx.types.get(name)
      if (decl) {
        if (seen.has(name)) return no(`its type ${text} refers back to itself`)
        const next = new Set(seen).add(name)
        if (decl.type === 'TSTypeAliasDeclaration') return classify(decl.typeAnnotation, ctx, next)
        return no(`${name} is an object shape — too structured for a single control`)
      }
      const from = ctx.imports.get(name)
      if (from) {
        return no(`${name} is imported from '${from}', so this panel can't see which values it allows`)
      }
      return no(`${text} isn't declared in this file, so the panel can't tell what it allows`)
    }

    case 'TSFunctionType':
    case 'TSConstructorType':
      return no(`it's a callback — a control can't write behaviour, so wire it up in source`)

    case 'TSTypeLiteral':
    case 'TSMappedType':
    case 'TSIntersectionType':
      return no(`it's an object shape (${text}) — too structured for a single control`)

    case 'TSArrayType':
    case 'TSTupleType':
      return no(`it's a list (${text}) — the panel edits one value at a time`)

    case 'TSAnyKeyword':
    case 'TSUnknownKeyword':
      return no(`its type is ${text}, which says nothing about what values are allowed`)

    default:
      return no(`its type (${text}) isn't one the panel can turn into a control`)
  }
}

// ── reading the props type into named members ───────────────────────────────

interface RawMember {
  name: string
  typeText: string
  optional: boolean
  type?: t.TSType
  /** Set when the member is known but unreadable (a method signature). */
  why?: string
}

interface Members {
  members: RawMember[]
  notes: string[]
}

function fromSignatures(sigs: t.TSTypeElement[], ctx: FileCtx): Members {
  const members: RawMember[] = []
  const notes: string[] = []
  for (const s of sigs) {
    if (s.type === 'TSPropertySignature') {
      const key = s.key
      const name = key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : undefined
      if (name == null || !ATTR_NAME.test(name)) {
        notes.push(`one prop's name (${textOf(ctx.code, key)}) isn't a plain attribute name, so it has no control`)
        continue
      }
      const ann = s.typeAnnotation?.typeAnnotation
      members.push({
        name,
        typeText: ann ? textOf(ctx.code, ann) : 'unknown',
        optional: s.optional === true,
        ...(ann ? { type: ann } : {}),
      })
    } else if (s.type === 'TSMethodSignature') {
      const key = s.key
      const name = key.type === 'Identifier' ? key.name : undefined
      if (name == null) continue
      members.push({
        name,
        typeText: textOf(ctx.code, s),
        optional: s.optional === true,
        why: `it's a callback — a control can't write behaviour, so wire it up in source`,
      })
    } else if (s.type === 'TSIndexSignature') {
      notes.push(
        `the props type has an index signature (${textOf(ctx.code, s)}) — the panel can't enumerate keys nobody named`,
      )
    }
  }
  return { members, notes }
}

/**
 * An interface or alias declared in this file, as members.
 *
 * `extends` is followed when the base is also declared here — inheritance is
 * how people actually factor props apart, and a panel that dropped inherited
 * props would be missing exactly the shared ones. A base it cannot see becomes
 * a note, since props nobody can NAME cannot be greyed rows either.
 */
function membersOfNamed(name: string, ctx: FileCtx, seen: Set<string>): Members {
  const decl = ctx.types.get(name)
  if (!decl) return { members: [], notes: [`the props type ${name} isn't declared in this file`] }
  if (seen.has(name)) return { members: [], notes: [`the props type ${name} refers back to itself`] }
  const next = new Set(seen).add(name)
  if (decl.type === 'TSTypeAliasDeclaration') return membersOf(decl.typeAnnotation, ctx, next)

  const own = fromSignatures(decl.body.body, ctx)
  for (const heritage of decl.extends ?? []) {
    const base = refName(heritage.expression)
    if (ctx.types.has(base)) {
      const got = membersOfNamed(base, ctx, next)
      // what the interface itself declares wins, as it does in TS
      for (const m of got.members) if (!own.members.some((x) => x.name === m.name)) own.members.push(m)
      own.notes.push(...got.notes)
      continue
    }
    const from = ctx.imports.get(base)
    own.notes.push(
      from
        ? `${name} extends ${base} from '${from}' — those inherited props can't be read from this file`
        : `${name} extends ${base}, which isn't declared in this file — those inherited props aren't listed`,
    )
  }
  return own
}

/** The props type, resolved to named members as far as this file can see. */
function membersOf(node: t.TSType, ctx: FileCtx, seen: Set<string>): Members {
  switch (node.type) {
    case 'TSParenthesizedType':
      return membersOf(node.typeAnnotation, ctx, seen)

    case 'TSTypeLiteral':
      return fromSignatures(node.members, ctx)

    case 'TSTypeReference': {
      const name = refName(node.typeName)
      if (ctx.types.has(name)) return membersOfNamed(name, ctx, seen)
      const from = ctx.imports.get(name)
      if (from) {
        return {
          members: [],
          notes: [`the props type ${name} is imported from '${from}', so its fields can't be read from this file`],
        }
      }
      return {
        members: [],
        notes: [`the props type ${textOf(ctx.code, node)} isn't declared in this file, so its fields can't be read`],
      }
    }

    case 'TSIntersectionType': {
      const members: RawMember[] = []
      const notes: string[] = []
      for (const part of node.types) {
        const got = membersOf(part, ctx, seen)
        // first declaration of a name wins, which is how TS narrows too
        for (const m of got.members) if (!members.some((x) => x.name === m.name)) members.push(m)
        notes.push(...got.notes)
      }
      return { members, notes }
    }

    default:
      return {
        members: [],
        notes: [`the props type (${textOf(ctx.code, node)}) isn't a shape the panel can read fields out of`],
      }
  }
}

function specsOf(members: RawMember[], ctx: FileCtx): PropSpec[] {
  return members.map((m) => {
    if (m.why != null) {
      return { name: m.name, kind: 'other' as const, required: !m.optional, typeText: m.typeText, editable: false, why: m.why }
    }
    if (!m.type) {
      return {
        name: m.name,
        kind: 'other' as const,
        required: false,
        typeText: m.typeText,
        editable: false,
        why: `it has no declared type, so there's nothing to say which control it wants`,
      }
    }
    const c = classify(m.type, ctx, new Set())
    return {
      name: m.name,
      kind: c.kind,
      ...(c.options ? { options: c.options } : {}),
      required: !m.optional && !c.optional,
      typeText: m.typeText,
      editable: c.editable,
      ...(c.why ? { why: c.why } : {}),
    }
  })
}

// ── finding the component that renders an element ───────────────────────────

/** A component definition: its function, its name, and any declared FC type. */
interface Component {
  name: string
  fn: t.Function
  /** `const Card: React.FC<Props>` — the type lives on the variable. */
  declared?: t.TSType
}

const FC_TYPES = new Set([
  'FC', 'React.FC', 'FunctionComponent', 'React.FunctionComponent', 'VFC', 'React.VFC',
])

/** The type argument of a `React.FC<Props>` annotation, when that's the form. */
function fcTypeArg(id: t.LVal | t.Identifier): t.TSType | undefined {
  if (id.type !== 'Identifier') return undefined
  const ann = id.typeAnnotation
  if (!ann || ann.type !== 'TSTypeAnnotation') return undefined
  const ref = ann.typeAnnotation
  if (ref.type !== 'TSTypeReference') return undefined
  if (!FC_TYPES.has(refName(ref.typeName))) return undefined
  return ref.typeParameters?.params[0]
}

/**
 * Whether this function is a component DEFINITION at module scope, and its
 * name.
 *
 * The panel wants the component that renders the clicked element, so the
 * search walks outward from the element and stops at the first thing that
 * qualifies. Requiring module scope and a PascalCase name is what makes the
 * stop correct: a `.map()` callback and a lowercase `renderRow()` helper are
 * not components (their "props" are loop variables), while a local
 * `function Row()` that the file never exports very much IS the component
 * rendering that row — reading App's props instead, just because App is the
 * exported one, would show the panel the wrong knobs.
 */
function componentAt(path: NodePath<t.Function>): Component | undefined {
  const node = path.node
  if (node.type === 'FunctionDeclaration') {
    const parent = path.parentPath
    const top = parent?.isProgram() === true || parent?.isExportDefaultDeclaration() === true ||
      parent?.isExportNamedDeclaration() === true
    if (!top) return undefined
    if (node.id && PASCAL.test(node.id.name)) return { name: node.id.name, fn: node }
    // `export default function () {}` — nameless, so the file names it
    if (!node.id && parent?.isExportDefaultDeclaration() === true) return { name: '', fn: node }
    return undefined
  }
  if (node.type !== 'ArrowFunctionExpression' && node.type !== 'FunctionExpression') return undefined
  const decl = path.parentPath
  if (decl?.isVariableDeclarator() !== true) {
    // `export default () => <div/>` — again nameless
    if (decl?.isExportDefaultDeclaration() === true) return { name: '', fn: node }
    return undefined
  }
  const varDecl = decl.parentPath // the VariableDeclaration
  const top = varDecl?.parentPath?.isProgram() === true ||
    varDecl?.parentPath?.isExportNamedDeclaration() === true
  if (!top) return undefined
  const id = (decl.node as t.VariableDeclarator).id
  if (id.type !== 'Identifier' || !PASCAL.test(id.name)) return undefined
  const declared = fcTypeArg(id)
  return { name: id.name, fn: node, ...(declared ? { declared } : {}) }
}

/** PascalCase fallback name for a nameless default export: the file's own. */
const nameFromFile = (rel: string): string => {
  const base = basename(rel).replace(/\.[jt]sx?$/, '')
  const parts = base.split(/[^A-Za-z0-9]+/).filter(Boolean)
  const joined = parts.map((p) => p[0]!.toUpperCase() + p.slice(1)).join('')
  return PASCAL.test(joined) ? joined : 'Component'
}

/** The component declared in a file under a given name, or its default. */
function componentInFile(ctx: FileCtx, want: { name?: string; asDefault?: boolean }): Component | undefined {
  const target = want.asDefault === true ? ctx.defaultLocal : want.name
  let found: Component | undefined
  let anonymousDefault: Component | undefined
  traverse(ctx.ast, {
    FunctionDeclaration(path: NodePath<t.FunctionDeclaration>) {
      const c = componentAt(path)
      if (!c) return
      if (c.name === '' && want.asDefault === true) anonymousDefault = c
      if (target != null && c.name === target) found = c
    },
    ArrowFunctionExpression(path: NodePath<t.ArrowFunctionExpression>) {
      const c = componentAt(path)
      if (!c) return
      if (c.name === '' && want.asDefault === true) anonymousDefault = c
      if (target != null && c.name === target) found = c
    },
    FunctionExpression(path: NodePath<t.FunctionExpression>) {
      const c = componentAt(path)
      if (!c) return
      if (target != null && c.name === target) found = c
    },
  })
  const picked = found ?? anonymousDefault
  if (!picked) return undefined
  return picked.name === '' ? { ...picked, name: nameFromFile(ctx.rel) } : picked
}

/** The names a `({ a, b })` parameter pulls out, in written order. */
function destructuredNames(param: t.ObjectPattern): string[] {
  const out: string[] = []
  for (const p of param.properties) {
    if (p.type === 'RestElement') continue
    const key = p.key
    const name = key.type === 'Identifier' ? key.name : key.type === 'StringLiteral' ? key.value : undefined
    if (name == null || !ATTR_NAME.test(name)) continue
    out.push(name)
  }
  return out
}

/** Props of a component, read from its parameter type. */
function propsOf(c: Component, ctx: FileCtx): { props: PropSpec[]; notes: string[] } {
  if (c.declared) {
    const got = membersOf(c.declared, ctx, new Set())
    return { props: specsOf(got.members, ctx), notes: got.notes }
  }
  const raw = c.fn.params[0]
  // a component with no parameter simply has no props — not a failure
  if (!raw) return { props: [], notes: [] }
  const param = raw.type === 'AssignmentPattern' ? raw.left : raw
  const ann = 'typeAnnotation' in param ? param.typeAnnotation : null
  if (ann && ann.type === 'TSTypeAnnotation') {
    const got = membersOf(ann.typeAnnotation, ctx, new Set())
    const props = specsOf(got.members, ctx)
    // The destructuring names props the TYPE couldn't reach — an imported base,
    // an index signature. Those are real props of this component, so they get
    // greyed rows carrying the reason rather than disappearing.
    if (param.type === 'ObjectPattern') {
      const why = got.notes.length
        ? `it isn't among the fields this file can read — ${got.notes[0]!}`
        : `the props type doesn't declare it`
      for (const name of destructuredNames(param)) {
        if (props.some((p) => p.name === name)) continue
        props.push({ name, kind: 'other', required: false, typeText: 'unknown', editable: false, why })
      }
    }
    return { props, notes: got.notes }
  }
  // Untyped, but destructured: the NAMES are still known, and a greyed row per
  // name that says "annotate the parameter" is worth more than an empty panel.
  if (param.type === 'ObjectPattern') {
    const why = "its component's props have no declared type — annotate the parameter, e.g. ({ title }: { title: string }), and this panel fills itself in"
    const props = destructuredNames(param).map((name): PropSpec => ({
      name, kind: 'other', required: false, typeText: 'unknown', editable: false, why,
    }))
    const rest = param.properties.some((p) => p.type === 'RestElement')
    return {
      props,
      notes: rest
        ? [`the props parameter collects extra props in a rest element, which the panel can't enumerate`]
        : [],
    }
  }
  return {
    props: [],
    notes: [`the props parameter (${textOf(ctx.code, param)}) has no type annotation, so there's nothing to read`],
  }
}

// ── every place the component is used ───────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.sketch2code'])
const EXTS = ['.tsx', '.ts', '.jsx', '.js']

function appFiles(root: string): string[] {
  // the app's own source; a fixture without src/ is walked from the top
  const start = existsSync(join(root, 'src')) ? join(root, 'src') : root
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(tsx|jsx)$/.test(e.name)) out.push(p)
    }
  }
  walk(start)
  return out.sort()
}

/** A relative import specifier → the file it actually names, if any. */
function resolveSpecifier(fromFile: string, spec: string): string | undefined {
  if (!spec.startsWith('.')) return undefined // a package, never the app's own component
  const base = resolve(dirname(fromFile), spec)
  // NodeNext source imports './Card.js' for Card.tsx, so try the swap too
  const stems = [base, base.replace(/\.[jt]sx?$/, '')]
  const tries: string[] = []
  for (const stem of stems) {
    tries.push(stem, ...EXTS.map((e) => stem + e), ...EXTS.map((e) => join(stem, `index${e}`)))
  }
  for (const p of tries) {
    try {
      if (existsSync(p) && statSync(p).isFile()) return p
    } catch {
      /* raced away between the two calls */
    }
  }
  return undefined
}

/** A literal attribute value as text, or undefined when it's an expression. */
function literalText(expr: t.Expression | t.JSXEmptyExpression): string | undefined {
  if (expr.type === 'StringLiteral') return expr.value
  if (expr.type === 'NumericLiteral') return String(expr.value)
  if (expr.type === 'BooleanLiteral') return expr.value ? 'true' : 'false'
  if (expr.type === 'UnaryExpression' && expr.operator === '-' && expr.argument.type === 'NumericLiteral') {
    return `-${String(expr.argument.value)}`
  }
  // `{`plain`}` holds no substitution, so it is a literal in every sense
  if (expr.type === 'TemplateLiteral' && expr.expressions.length === 0) {
    return expr.quasis[0]?.value.cooked ?? expr.quasis[0]?.value.raw
  }
  return undefined
}

const attrName = (a: t.JSXAttribute): string =>
  a.name.type === 'JSXIdentifier' ? a.name.name : `${a.name.namespace.name}:${a.name.name.name}`

function callSiteAt(code: string, rel: string, el: t.JSXOpeningElement): CallSite {
  const values: Record<string, string> = {}
  const expressions: string[] = []
  for (const a of el.attributes) {
    if (a.type === 'JSXSpreadAttribute') {
      // a spread can supply ANY prop invisibly; the panel must be able to say so
      expressions.push(`...${textOf(code, a.argument)}`)
      continue
    }
    const name = attrName(a)
    const v = a.value
    if (v == null) {
      values[name] = 'true' // bare attribute: JSX's shorthand for true
      continue
    }
    if (v.type === 'StringLiteral') {
      values[name] = v.value
      continue
    }
    if (v.type === 'JSXExpressionContainer') {
      const lit = literalText(v.expression)
      if (lit != null) values[name] = lit
      else expressions.push(name)
      continue
    }
    expressions.push(name)
  }
  const loc = el.loc
  return {
    loc: `${rel}:${String(loc?.start.line ?? 0)}:${String((loc?.start.column ?? 0) + 1)}`,
    values,
    expressions,
  }
}

/**
 * Does `<Tag>` in this file mean the component we're reading?
 *
 * Name equality alone is not enough: two files can each have their own local
 * `Card`, and writing a prop into the wrong one is exactly the kind of silent
 * wrong edit this pipeline exists to avoid. So the JSX identifier's BINDING
 * has to lead back to the component's own file — an import that resolves to
 * it, or a declaration in that same file.
 */
function bindsToComponent(
  path: NodePath<t.JSXOpeningElement>,
  tag: string,
  file: string,
  target: { abs: string; name: string; hasDefault: boolean; named: boolean },
): boolean {
  const binding = path.scope.getBinding(tag)
  if (!binding) return false
  const specifier = binding.path.node
  if (
    specifier.type === 'ImportDefaultSpecifier' ||
    specifier.type === 'ImportSpecifier' ||
    specifier.type === 'ImportNamespaceSpecifier'
  ) {
    const decl = binding.path.parentPath?.node
    if (!decl || decl.type !== 'ImportDeclaration') return false
    if (resolveSpecifier(file, decl.source.value) !== target.abs) return false
    if (specifier.type === 'ImportDefaultSpecifier') return target.hasDefault
    if (specifier.type === 'ImportSpecifier') {
      const imported = specifier.imported
      const name = imported.type === 'Identifier' ? imported.name : imported.value
      return name === target.name && target.named
    }
    return false
  }
  // declared right here: only the component's own file can render it locally
  return file === target.abs && tag === target.name
}

function collectCallSites(
  root: string,
  target: { abs: string; name: string; hasDefault: boolean; named: boolean },
): CallSite[] {
  const out: CallSite[] = []
  for (const file of appFiles(root)) {
    let code: string
    let ast: t.File
    try {
      code = readFileSync(file, 'utf8')
      ast = parseSource(code)
    } catch {
      continue // one unparseable file elsewhere must not sink the panel
    }
    const rel = relative(root, file).replace(/\\/g, '/')
    traverse(ast, {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
        const n = path.node.name
        if (n.type !== 'JSXIdentifier') return // <Foo.Bar/> is a namespace, not this
        if (!bindsToComponent(path, n.name, file, target)) return
        out.push(callSiteAt(code, rel, path.node))
      },
    })
  }
  return out
}

// ── 1. read the panel ───────────────────────────────────────────────────────

export function readComponentProps(root: string, srcLoc: string): ReadPropsResult {
  const m = LOC.exec(srcLoc)
  if (!m) return { ok: false, error: `bad srcLoc "${srcLoc}"` }
  const [, rel, lineS, colS] = m
  const abs = resolve(root, rel!)
  if (!abs.startsWith(resolve(root))) return { ok: false, error: 'that srcLoc escapes the app root' }

  const loaded = loadCtx(abs, rel!)
  if (!loaded.ctx) return { ok: false, error: loaded.error }
  const ctx = loaded.ctx

  let element: NodePath<t.JSXOpeningElement> | undefined
  traverse(ctx.ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) element = path
    },
  })
  if (!element) return { ok: false, error: `no element at ${srcLoc} (stale stamp?)` }

  // walk outward to the component that renders it
  let fn = element.getFunctionParent()
  let component: Component | undefined
  while (fn && !component) {
    component = componentAt(fn)
    if (!component) fn = fn.getFunctionParent()
  }
  if (!component) {
    return {
      ok: false,
      error: `the element at ${srcLoc} isn't inside a component — the panel reads props from a component declared at the top level of ${rel!}`,
    }
  }
  if (component.name === '') component = { ...component, name: nameFromFile(ctx.rel) }

  const { props, notes } = propsOf(component, ctx)
  const named = ctx.exported.has(component.name)
  const hasDefault = ctx.hasDefault && (ctx.defaultLocal == null || ctx.defaultLocal === component.name)
  const callSites = collectCallSites(root, { abs, name: component.name, hasDefault, named })

  return {
    ok: true,
    component: component.name,
    file: ctx.rel,
    props,
    callSites,
    ...(notes.length ? { notes } : {}),
  }
}

// ── 2. write one value ──────────────────────────────────────────────────────

/**
 * How a value is written into JSX.
 *
 * Strings are string literals, because that is what JSX attributes are for.
 * Numbers must be expressions — `count="3"` passes the STRING "3", and a
 * component doing arithmetic on it breaks in a way nothing here would catch.
 * Booleans go the other way: `open` is the shorthand React's own docs and
 * eslint's jsx-boolean-value default prefer for true, and there is no
 * shorthand for false, so false is written `open={false}` (never `="false"`,
 * which is a truthy string).
 */
function attributeText(name: string, value: string | number | boolean, quote?: string): string {
  if (typeof value === 'boolean') return value ? name : `${name}={false}`
  if (typeof value === 'number') return `${name}={${String(value)}}`
  // keep the quote character the file already used, so the diff is one value
  if (quote != null && !value.includes(quote)) return `${name}=${quote}${value}${quote}`
  if (!value.includes('"')) return `${name}="${value}"`
  if (!value.includes("'")) return `${name}='${value}'`
  // both quote characters: an expression container keeps it unambiguous
  return `${name}={${JSON.stringify(value)}}`
}

const display = (value: string | number | boolean): string =>
  typeof value === 'string' ? `"${value}"` : String(value)

/** The component a call-site tag refers to, so its types can vet the value. */
function componentForTag(root: string, ctx: FileCtx, path: NodePath<t.JSXOpeningElement>, tag: string):
  { ctx: FileCtx; component: Component } | undefined {
  const binding = path.scope.getBinding(tag)
  if (!binding) return undefined
  const spec = binding.path.node
  if (spec.type === 'ImportDefaultSpecifier' || spec.type === 'ImportSpecifier') {
    const decl = binding.path.parentPath?.node
    if (!decl || decl.type !== 'ImportDeclaration') return undefined
    const abs = resolveSpecifier(ctx.abs, decl.source.value)
    if (!abs || !abs.startsWith(resolve(root))) return undefined
    const loaded = loadCtx(abs, relative(root, abs).replace(/\\/g, '/'))
    if (!loaded.ctx) return undefined
    const want = spec.type === 'ImportDefaultSpecifier'
      ? { asDefault: true }
      : { name: spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value }
    const component = componentInFile(loaded.ctx, want)
    return component ? { ctx: loaded.ctx, component } : undefined
  }
  const component = componentInFile(ctx, { name: tag })
  return component ? { ctx, component } : undefined
}

/** Coerce and vet the incoming value against what the type declares. */
function vet(spec: PropSpec, value: string | number | boolean):
  { value: string | number | boolean } | { error: string } {
  if (!spec.editable) return { error: `${spec.name} isn't editable from the panel: ${spec.why ?? 'its type has no control'}` }
  switch (spec.kind) {
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).trim())
      if (typeof value === 'boolean' || String(value).trim() === '' || !Number.isFinite(n)) {
        return { error: `${display(value)} isn't a number — ${spec.name} is declared ${spec.typeText}` }
      }
      return { value: n }
    }
    case 'boolean': {
      if (typeof value === 'boolean') return { value }
      const s = String(value).trim().toLowerCase()
      if (s === 'true') return { value: true }
      if (s === 'false') return { value: false }
      return { error: `${display(value)} isn't true or false — ${spec.name} is declared ${spec.typeText}` }
    }
    case 'enum': {
      const s = String(value)
      const options = spec.options ?? []
      if (!options.includes(s)) {
        return { error: `${display(value)} isn't one of ${spec.name}'s values — use one of: ${options.join(', ')}` }
      }
      return { value: s }
    }
    case 'string':
      return { value: String(value) }
    default:
      return { error: `${spec.name} isn't editable from the panel: ${spec.why ?? 'its type has no control'}` }
  }
}

export function setPropValue(root: string, req: SetPropRequest): SetPropResult {
  const m = LOC.exec(req.callSite)
  if (!m) return { ok: false, error: `bad call site "${req.callSite}"` }
  const [, rel, lineS, colS] = m
  const abs = resolve(root, rel!)
  if (!abs.startsWith(resolve(root))) return { ok: false, error: 'that call site escapes the app root' }
  if (!ATTR_NAME.test(req.name)) return { ok: false, error: `"${req.name}" isn't a usable prop name` }

  const loaded = loadCtx(abs, rel!)
  if (!loaded.ctx) return { ok: false, error: loaded.error }
  const ctx = loaded.ctx

  let element: NodePath<t.JSXOpeningElement> | undefined
  traverse(ctx.ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) element = path
    },
  })
  if (!element) return { ok: false, error: `no element at ${req.callSite} (stale stamp?)` }
  const el = element.node
  const tag = el.name.type === 'JSXIdentifier' ? el.name.name : textOf(ctx.code, el.name)

  // ── what the component's own types say about this prop ──
  let value = req.value
  const resolved = el.name.type === 'JSXIdentifier' ? componentForTag(root, ctx, element, tag) : undefined
  if (resolved) {
    const { props } = propsOf(resolved.component, resolved.ctx)
    if (props.length) {
      const spec = props.find((p) => p.name === req.name)
      if (!spec) {
        return {
          ok: false,
          error: `<${tag}> has no prop called ${req.name} — it declares ${props.map((p) => p.name).join(', ')}`,
        }
      }
      const vetted = vet(spec, value)
      if ('error' in vetted) return { ok: false, error: vetted.error }
      value = vetted.value
    }
  }

  const existing = el.attributes.find(
    (a): a is t.JSXAttribute => a.type === 'JSXAttribute' && attrName(a) === req.name,
  )

  let next: string
  let change: string
  if (!existing) {
    const anchor = el.name
    if (anchor.end == null) return { ok: false, error: 'that element has no source range to edit' }
    next = `${ctx.code.slice(0, anchor.end)} ${attributeText(req.name, value)}${ctx.code.slice(anchor.end)}`
    change = `${req.name}: none → ${display(value)}`
  } else {
    if (existing.start == null || existing.end == null) {
      return { ok: false, error: 'that attribute has no source range to edit' }
    }
    const v = existing.value
    const before =
      v == null ? 'true'
        : v.type === 'StringLiteral' ? v.value
          : v.type === 'JSXExpressionContainer' ? literalText(v.expression)
            : undefined
    if (before == null) {
      const wired = v?.type === 'JSXExpressionContainer' ? textOf(ctx.code, v) : textOf(ctx.code, v ?? existing)
      return {
        ok: false,
        error: `${req.name} is wired to an expression here (${req.name}=${wired}) — setting it would silently drop that wiring. Change the value where it comes from, or replace the expression with a literal in source first, then use the panel.`,
      }
    }
    if (before === String(value)) {
      return { ok: true, file: ctx.rel, change: `no change (${req.name} is already ${display(value)})` }
    }
    const quote = v?.type === 'StringLiteral' && v.start != null ? ctx.code[v.start] : undefined
    next = ctx.code.slice(0, existing.start) + attributeText(req.name, value, quote) +
      ctx.code.slice(existing.end)
    // a string's old value reads as a string; `count={3}` reads as 3
    const was = v?.type === 'StringLiteral' ? `"${before}"` : before
    change = `${req.name}: ${was} → ${display(value)}`
  }

  try {
    parseSource(next)
  } catch (err) {
    return { ok: false, error: `the edit would not parse (${String(err)})` }
  }
  writeFileSync(abs, next)
  return { ok: true, file: ctx.rel, change }
}

/**
 * A stamp for the first JSX element a file renders.
 *
 * The inverse of what the rest of this module does, and needed by anything that
 * has a FILE and wants the component in it: `readComponentProps` is addressed
 * by a `data-s2c` stamp, because that is what a click on the page produces. A
 * caller working from a file — the element library filing a component a run just
 * created, with no page involved — has no stamp and cannot invent one, since
 * line 1 column 1 is an import rather than an element.
 */
export function firstJsxStamp(root: string, rel: string): string | null {
  const abs = resolve(root, rel)
  if (!abs.startsWith(resolve(root))) return null
  let code: string
  try {
    code = readFileSync(abs, 'utf8')
  } catch {
    return null
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return null
  }
  let best: { line: number; col: number } | null = null
  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const loc = path.node.loc
      if (!loc) return
      // the earliest by position: the component's own root, not whichever the
      // traversal happens to reach first
      if (!best || loc.start.line < best.line ||
        (loc.start.line === best.line && loc.start.column + 1 < best.col)) {
        best = { line: loc.start.line, col: loc.start.column + 1 }
      }
    },
  })
  const at = best as { line: number; col: number } | null
  return at ? `${rel}:${String(at.line)}:${String(at.col)}` : null
}

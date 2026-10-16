/**
 * Put a picture into a box the user drew. Deterministic, zero tokens.
 *
 * "Put my logo here" is about the first edit a non-coder wants, and until now
 * it needed an editor: the sketch could make an image placeholder (a box with
 * an X), but nothing could fill it. Placing a file needs no model. The box is
 * already a stamped element, so a drop resolves to an AST node, and the edit
 * is: copy the bytes into the project, point the element at them.
 *
 * What it refuses matters as much as what it does, and the refusals are
 * written for a person:
 *   - anything that is not really an image (the bytes are sniffed; the file
 *     name and the browser's MIME type are not trusted)
 *   - an SVG that carries script or event handlers
 *   - a file over the size cap
 *   - a drop onto something that is not a placeholder: a card with a heading
 *     and a button in it is not "the image slot", and silently replacing it
 *     with a picture would delete the user's content
 *
 * Where the file goes follows the app: `src/assets/` (imported, Vite's
 * convention) when the app already has it, else an existing public images
 * folder, else `public/`. The name carries a content hash, so dropping the
 * same picture twice reuses one file instead of piling up copies.
 *
 * Undo needs nothing special: the copied file is new and untracked, and the
 * plugin's undo already deletes the untracked files an edit created.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'
import { importAnchor } from './imports.js'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

/** Decoded bytes. A phone photo is 2–4 MB; anything bigger belongs on a CDN, not in src/. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export interface PlaceImageRequest {
  /** 'src/components/Hero.tsx:12:7', the drop target's own data-s2c stamp. */
  srcLoc: string
  /** The dropped file's name, used only for a readable file name and alt text. */
  name?: string
  /** The file, base64 (no data: prefix). */
  data: string
}

export interface PlaceImageResult {
  ok: boolean
  /** The component file that was edited, relative to root. */
  file?: string
  /** Where the picture lives now, relative to root. */
  asset?: string
  /** True when an identical picture was already in the project and was reused. */
  reused?: boolean
  change?: string
  error?: string
}

export interface ImageKind {
  ext: 'png' | 'jpg' | 'gif' | 'webp' | 'svg'
  mime: string
}

/** What the bytes are, from their own header. Null for anything that is not an image. */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', mime: 'image/png' }
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return { ext: 'gif', mime: 'image/gif' }
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' }
  }
  // SVG is text: allow a BOM, an XML declaration, comments and a doctype before <svg
  const head = buf.subarray(0, 4096).toString('utf8').replace(/^﻿/, '')
  const stripped = head
    .replace(/^\s*<\?xml[\s\S]*?\?>/, '')
    .replace(/^(\s*<!--[\s\S]*?-->)*/, '')
    .replace(/^\s*<!DOCTYPE[^>]*>/i, '')
    .replace(/^(\s*<!--[\s\S]*?-->)*/, '')
  if (/^\s*<svg[\s>]/i.test(stripped)) return { ext: 'svg', mime: 'image/svg+xml' }
  return null
}

/**
 * Why an SVG is not safe to put in a project, or null. An <img src> never runs
 * an SVG's script, but the same file opened directly from public/ does, and a
 * picture someone dragged off the web is not something to check in blind.
 */
export function svgUnsafe(text: string): string | null {
  if (/<script[\s>]/i.test(text)) return 'it contains a <script>'
  if (/\son[a-z]+\s*=/i.test(text)) return 'it contains an event handler (onload=…)'
  if (/(?:href|src)\s*=\s*["']?\s*javascript:/i.test(text)) return 'it contains a javascript: link'
  if (/<foreignObject[\s>]/i.test(text)) return 'it embeds HTML (<foreignObject>)'
  if (/<!ENTITY/i.test(text)) return 'it declares XML entities'
  return null
}

/** 'My Logo (final) v2.PNG' -> 'my-logo-final-v2'. Never empty. */
export function assetSlug(name: string | undefined): string {
  const base = (name ?? '').replace(/\.[a-z0-9]{1,5}$/i, '')
  const slug = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return slug || 'image'
}

export type AssetHome =
  | { kind: 'import'; dir: string }
  | { kind: 'public'; dir: string; urlBase: string }

/**
 * Where this app keeps pictures. Order: src/assets (imported, so the bundler
 * fingerprints it), then an existing public images folder, then public/.
 * `dir` is relative to root.
 */
export function chooseAssetHome(root: string): AssetHome {
  const isDir = (rel: string): boolean => {
    try { return statSync(join(root, rel)).isDirectory() } catch { return false }
  }
  if (isDir('src/assets')) return { kind: 'import', dir: 'src/assets' }
  for (const rel of ['public/images', 'public/img', 'public/assets']) {
    if (isDir(rel)) return { kind: 'public', dir: rel, urlBase: `/${rel.slice('public/'.length)}/` }
  }
  return { kind: 'public', dir: 'public', urlBase: '/' }
}

const attrOf = (el: t.JSXOpeningElement, name: string): t.JSXAttribute | undefined =>
  el.attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  )

/** Hosts a picture can replace. A button or a heading is never "the image slot". */
const SLOT_TAGS = new Set(['div', 'span', 'figure', 'picture', 'svg', 'i', 'section', 'article', 'aside'])
/** Anything below the slot that means it holds real content. */
const CONTENT_TAGS = new Set([
  'button', 'a', 'input', 'select', 'textarea', 'form', 'label', 'img', 'video', 'iframe',
  'ul', 'ol', 'li', 'table', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p',
])
/** Placeholder copy is a word or two ("Image", "Logo here", "400×300"). */
const MAX_PLACEHOLDER_TEXT = 40

/**
 * Null if the element is an empty slot or a placeholder; otherwise the reason
 * it is not, in words. Only looks at what is written in this file: a child
 * component (uppercase) could render anything, so it counts as content.
 */
export function notAPlaceholder(el: t.JSXElement, code: string): string | null {
  let text = ''
  let reason: string | null = null
  const walk = (children: t.JSXElement['children']): void => {
    for (const c of children) {
      if (reason) return
      if (c.type === 'JSXText') text += c.value
      else if (c.type === 'JSXExpressionContainer') {
        const e = c.expression
        if (e.type === 'JSXEmptyExpression') continue
        if (e.type === 'StringLiteral') text += e.value
        else if (e.type === 'TemplateLiteral' && e.expressions.length === 0) text += e.quasis.map((q) => q.value.cooked ?? '').join('')
        else reason = `it shows a value the page computes (${code.slice(e.start ?? 0, e.end ?? 0).slice(0, 30)})`
      } else if (c.type === 'JSXElement') {
        const n = c.openingElement.name
        const tag = n.type === 'JSXIdentifier' ? n.name : code.slice(n.start ?? 0, n.end ?? 0)
        if (tag[0] !== tag[0]?.toLowerCase()) { reason = `it contains <${tag}>`; return }
        if (CONTENT_TAGS.has(tag)) { reason = `it contains a <${tag}>`; return }
        walk(c.children)
      } else if (c.type === 'JSXFragment') walk(c.children)
      else reason = 'it has content that is not plain markup'
    }
  }
  walk(el.children)
  if (reason) return reason
  const words = text.replace(/\s+/g, ' ').trim()
  if (words.length > MAX_PLACEHOLDER_TEXT) return `it holds text ("${words.slice(0, 30)}…")`
  return null
}

const hasTailwind = (root: string): boolean => {
  for (let dir = resolve(root), i = 0; i < 4; i++, dir = dirname(dir)) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
      if (pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss) return true
      return false // the nearest package.json decides
    } catch { /* keep walking up */ }
  }
  return false
}

const words = (slug: string): string => slug.replace(/-[0-9a-f]{10}$/, '').replace(/-/g, ' ')

const identFor = (slug: string, code: string): string => {
  const camel = slug.split('-').filter(Boolean)
    .map((w, i) => (i === 0 ? w : w[0]!.toUpperCase() + w.slice(1))).join('')
  let base = /^[a-z_$]/i.test(camel) ? camel : `img${camel}`
  base = `${base}Img`
  let id = base
  for (let n = 2; new RegExp(`\\b${id}\\b`).test(code); n++) id = `${base}${String(n)}`
  return id
}

/** JS string literal for a path, single-quoted like the rest of the codebase. */
const lit = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

export function placeImage(root: string, req: PlaceImageRequest): PlaceImageResult {
  // ── the bytes ────────────────────────────────────────────────────────────
  if (typeof req.data !== 'string' || req.data.length === 0) return { ok: false, error: 'no file came with the drop' }
  // a base64 string is 4/3 the size of the bytes; refuse before decoding a huge one
  if (req.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) {
    return { ok: false, error: `that picture is over ${String(MAX_IMAGE_BYTES / 1024 / 1024)} MB — use a smaller one` }
  }
  const buf = Buffer.from(req.data, 'base64')
  if (buf.length === 0) return { ok: false, error: 'the file was empty' }
  if (buf.length > MAX_IMAGE_BYTES) {
    return { ok: false, error: `that picture is over ${String(MAX_IMAGE_BYTES / 1024 / 1024)} MB — use a smaller one` }
  }
  const kind = sniffImage(buf)
  if (!kind) return { ok: false, error: 'that file is not a picture (PNG, JPEG, GIF, WebP or SVG)' }
  if (kind.ext === 'svg') {
    const why = svgUnsafe(buf.toString('utf8'))
    if (why) return { ok: false, error: `that SVG was not added: ${why}` }
  }

  // ── the target ───────────────────────────────────────────────────────────
  const m = /^(.+):(\d+):(\d+)$/.exec(req.srcLoc ?? '')
  if (!m) return { ok: false, error: `bad srcLoc "${String(req.srcLoc)}"` }
  const [, rel, lineS, colS] = m
  const rootAbs = resolve(root)
  const file = resolve(rootAbs, rel!)
  if (!file.startsWith(rootAbs + sep)) return { ok: false, error: 'srcLoc escapes the app root' }
  let code: string
  try { code = readFileSync(file, 'utf8') } catch { return { ok: false, error: `cannot read ${rel!}` } }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return { ok: false, error: `cannot parse ${rel!}` }
  }
  let found: NodePath<t.JSXOpeningElement> | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) found = path
    },
  })
  if (!found) return { ok: false, error: `no element at ${req.srcLoc} (stale stamp?)` }
  const open = (found as NodePath<t.JSXOpeningElement>).node
  const element = (found as NodePath<t.JSXOpeningElement>).parent as t.JSXElement
  const tag = open.name.type === 'JSXIdentifier' ? open.name.name : ''
  if (tag !== 'img') {
    if (!SLOT_TAGS.has(tag)) {
      return { ok: false, error: `a <${tag || 'component'}> is not an image slot — drop the picture onto an empty box` }
    }
    const why = notAPlaceholder(element, code)
    if (why) return { ok: false, error: `that box is not empty: ${why}. Drop the picture onto the image slot itself.` }
  }

  // ── the file ─────────────────────────────────────────────────────────────
  const hash = createHash('sha256').update(buf).digest('hex').slice(0, 10)
  const home = chooseAssetHome(rootAbs)
  const dirAbs = join(rootAbs, home.dir)
  let fileName = `${assetSlug(req.name)}-${hash}.${kind.ext}`
  let reused = false
  try {
    const same = readdirSync(dirAbs).find((f) => f.endsWith(`-${hash}.${kind.ext}`))
    if (same && readFileSync(join(dirAbs, same)).equals(buf)) { fileName = same; reused = true }
  } catch { /* the folder does not exist yet */ }
  const assetAbs = join(dirAbs, fileName)
  const assetRel = relative(rootAbs, assetAbs).split(sep).join('/')
  const slug = fileName.replace(/\.[a-z]+$/, '')

  // ── the source edit (computed before anything is written) ─────────────────
  let srcExpr: string
  let importLine = ''
  if (home.kind === 'import') {
    let spec = relative(dirname(file), assetAbs).split(sep).join('/')
    if (!spec.startsWith('.')) spec = `./${spec}`
    const existing = new RegExp(`^import\\s+([A-Za-z_$][\\w$]*)\\s+from\\s+['"]${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`, 'm').exec(code)
    const ident = existing?.[1] ?? identFor(slug.replace(/-[0-9a-f]{10}$/, ''), code)
    if (!existing) importLine = `import ${ident} from ${lit(spec)}\n`
    srcExpr = `{${ident}}`
  } else {
    srcExpr = `"${home.urlBase}${fileName}"`
  }

  const edits: Array<{ start: number; end: number; text: string }> = []
  let change: string
  if (tag === 'img') {
    const src = attrOf(open, 'src')
    if (src?.value && src.value.start != null && src.value.end != null) {
      edits.push({ start: src.value.start, end: src.value.end, text: srcExpr })
    } else if (src && src.end != null) {
      edits.push({ start: src.start!, end: src.end, text: `src=${srcExpr}` })
    } else {
      edits.push({ start: open.name.end!, end: open.name.end!, text: ` src=${srcExpr}` })
    }
    if (!attrOf(open, 'alt')) edits.push({ start: open.name.end!, end: open.name.end!, text: ` alt="${words(slug)}"` })
    change = `the picture now shows ${assetRel}`
  } else {
    // keep what sizes and places the box; drop what only made it look like a placeholder
    const KEEP = new Set(['className', 'style', 'id', 'key', 'width', 'height', 'title'])
    const kept: string[] = []
    let className: t.JSXAttribute | undefined
    let hasStyle = false
    let alt: string | null = null
    for (const a of open.attributes) {
      if (a.type === 'JSXSpreadAttribute') { kept.push(code.slice(a.start!, a.end!)); continue }
      const n = a.name.type === 'JSXIdentifier' ? a.name.name : ''
      if (n === 'aria-label' && a.value?.type === 'StringLiteral') alt = a.value.value
      if (n === 'className') className = a
      if (n === 'style') hasStyle = true
      if (KEEP.has(n) || n.startsWith('data-')) {
        if (n === 'className' && a.value?.type === 'StringLiteral' && hasTailwind(rootAbs) && !/\bobject-(cover|contain)\b/.test(a.value.value)) {
          kept.push(`className="${`${a.value.value.trim()} object-cover`.trim()}"`)
        } else kept.push(code.slice(a.start!, a.end!))
      }
    }
    if (!hasStyle && !(className?.value?.type === 'StringLiteral' && hasTailwind(rootAbs))) {
      kept.push(`style={{ objectFit: 'cover' }}`)
    }
    const attrs = [`src=${srcExpr}`, `alt="${(alt ?? words(slug)).replace(/"/g, '&quot;')}"`, ...kept]
    edits.push({ start: element.start!, end: element.end!, text: `<img ${attrs.join(' ')} />` })
    change = `the box now shows ${assetRel}`
  }
  if (importLine) {
    const at = importAnchor(ast, code)
    edits.push({ start: at, end: at, text: importLine })
  }

  edits.sort((a, b) => b.start - a.start || b.end - a.end)
  let next = code
  for (const e of edits) next = next.slice(0, e.start) + e.text + next.slice(e.end)
  if (next === code && reused) return { ok: true, file: rel, asset: assetRel, reused, change: 'no change (already that picture)' }

  // ── write: the picture first, so a source edit never points at nothing ────
  if (!reused) {
    mkdirSync(dirAbs, { recursive: true })
    if (!existsSync(assetAbs)) writeFileSync(assetAbs, buf)
  }
  writeFileSync(file, next)
  return { ok: true, file: rel, asset: assetRel, reused, change: reused ? `${change} (same picture reused)` : change }
}

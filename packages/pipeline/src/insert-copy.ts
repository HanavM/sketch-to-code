/**
 * goal loop n11: a drawn addition lands in code without the model.
 *
 * A caret in the gap between two siblings plus one typed word ("Blog") is a
 * plain request: one more of the thing next to it, saying that word, right
 * there. The slot (insert-slot.ts) already names the neighbours by source
 * location. This copies the neighbour's JSX element (same tag, same classes),
 * swaps its words for the typed ones, and writes it into the gap: no reading,
 * no tokens.
 *
 * Restraint, as with the other direct edits: the template must be a plain
 * leaf (an element whose only child is its words) written once in the source
 * (not a .map template), and the words must be plain. Anything else is
 * refused with the reason and goes to the model as before.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@babel/parser'
import type * as t from '@babel/types'
import type { DomSnapshot } from '@s2c/dom'

export interface InsertCopyRequest {
  /** Stamp of the child the new element goes right after. */
  afterSrcLoc: string | null
  /** Stamp of the child the new element goes right before. */
  beforeSrcLoc: string | null
  /** The words the new element says (the typed note). */
  text: string
  snapshot: DomSnapshot
}

export interface InsertCopyResult {
  ok: boolean
  file?: string
  change?: string
  error?: string
  /** Stamp-free description of what was inserted, for the overlay. */
  template?: string
}

const MAX_TEXT = 40

function splitLoc(srcLoc: string): { file: string; line: number; col: number } | null {
  const m = /^(.+):(\d+):(\d+)$/.exec(srcLoc)
  return m ? { file: m[1]!, line: Number(m[2]), col: Number(m[3]) } : null
}

/** The JSX element whose opening tag starts at line:col (1-based col), by a plain walk. */
function elementAt(ast: t.File, line: number, col: number): t.JSXElement | null {
  let found: t.JSXElement | null = null
  const walk = (n: unknown): void => {
    if (found || !n || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const node = n as { type?: string; loc?: t.SourceLocation }
    if (node.type === 'JSXElement') {
      const op = (n as t.JSXElement).openingElement.loc
      if (op && op.start.line === line && op.start.column + 1 === col) { found = n as t.JSXElement; return }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'leadingComments' || k === 'trailingComments') continue
      walk((n as Record<string, unknown>)[k])
    }
  }
  walk(ast.program)
  return found
}

/** Is `el` a direct JSX child of a JSX element (not a .map callback, not a ternary)? */
function parentIsJsx(ast: t.File, el: t.JSXElement): boolean {
  let ok = false
  const walk = (n: unknown): void => {
    if (ok || !n || typeof n !== 'object') return
    if (Array.isArray(n)) { for (const c of n) walk(c); return }
    const node = n as { type?: string }
    if ((node.type === 'JSXElement' || node.type === 'JSXFragment') && (n as t.JSXElement).children.includes(el)) {
      ok = true
      return
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc' || k === 'start' || k === 'end') continue
      walk((n as Record<string, unknown>)[k])
    }
  }
  walk(ast.program)
  return ok
}

const plainWords = (s: string) => /^[^{}<>\n\r`]+$/.test(s)

export function insertCopy(root: string, req: InsertCopyRequest): InsertCopyResult {
  const text = (req.text ?? '').trim().replace(/^["“']|["”']$/g, '').trim()
  if (!text) return { ok: false, error: 'no words for the new element' }
  if (text.length > MAX_TEXT || !plainWords(text)) return { ok: false, error: 'the note is not a plain label' }
  const snap = req.snapshot
  if (!snap || !Array.isArray(snap.nodes)) return { ok: false, error: 'no page snapshot' }

  // the neighbour to copy: the one before the gap, else the one after
  const tries: Array<{ loc: string; side: 'after' | 'before' }> = []
  if (req.afterSrcLoc) tries.push({ loc: req.afterSrcLoc, side: 'after' })
  if (req.beforeSrcLoc) tries.push({ loc: req.beforeSrcLoc, side: 'before' })
  if (tries.length === 0) return { ok: false, error: 'the gap has no stamped neighbour' }
  if (req.afterSrcLoc && req.afterSrcLoc === req.beforeSrcLoc) {
    return { ok: false, error: 'the neighbours come from one template (a list): the model adds list entries' }
  }

  let lastErr = 'no neighbour to copy'
  for (const { loc, side } of tries) {
    const where = splitLoc(loc)
    if (!where) { lastErr = `bad srcLoc "${loc}"`; continue }
    const instances = snap.nodes.filter((n) => n.srcLoc === loc)
    if (instances.length !== 1) { lastErr = `<${instances[0]?.tag ?? '?'}> renders ${String(instances.length)} times from one template`; continue }
    const abs = resolve(root, where.file)
    let code: string
    let ast: t.File
    try {
      code = readFileSync(abs, 'utf8')
      ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    } catch {
      lastErr = `cannot read or parse ${where.file}`
      continue
    }
    const el = elementAt(ast, where.line, where.col)
    if (!el || el.start == null || el.end == null) { lastErr = `no JSX element at ${loc} (stale stamp?)`; continue }
    if (!parentIsJsx(ast, el)) { lastErr = `${loc} is not a plain JSX child`; continue }
    const kids = el.children.filter((c) => !(c.type === 'JSXText' && c.value.trim() === ''))
    if (kids.length !== 1 || kids[0]!.type !== 'JSXText') { lastErr = `<${tagName(el)}> holds more than words`; continue }
    const words = kids[0] as t.JSXText
    if (words.start == null || words.end == null) { lastErr = 'no source positions'; continue }

    // the copy: same element, new words; a link's target is reset (it points nowhere yet)
    const edits: Array<{ start: number; end: number; text: string }> = []
    const lead = /^\s*/.exec(words.value)![0]
    const trail = /\s*$/.exec(words.value)![0]
    edits.push({ start: words.start, end: words.end, text: `${lead}${text}${trail}` })
    for (const a of el.openingElement.attributes) {
      if (a.type === 'JSXSpreadAttribute') { lastErr = `<${tagName(el)}> spreads props`; edits.length = 0; break }
      if (a.name.type !== 'JSXIdentifier') continue
      if (a.name.name === 'key' || a.name.name === 'id') {
        // a copied key/id would collide: drop it
        edits.push({ start: a.start! - 1, end: a.end!, text: '' })
      } else if (a.name.name === 'href' && a.value?.type === 'StringLiteral' && a.value.value !== '#') {
        edits.push({ start: a.value.start!, end: a.value.end!, text: '"#"' })
      }
    }
    if (edits.length === 0) continue
    edits.sort((x, y) => y.start - x.start)
    let copy = code.slice(el.start, el.end)
    for (const e of edits) copy = copy.slice(0, e.start - el.start) + e.text + copy.slice(e.end - el.start)

    // indentation: the template's own line
    const lineStart = code.lastIndexOf('\n', el.start - 1) + 1
    const indent = /^[ \t]*/.exec(code.slice(lineStart))![0]
    const ownLine = code.slice(lineStart, el.start).trim() === ''
    let out: string
    if (side === 'after') {
      out = ownLine
        ? code.slice(0, el.end) + `\n${indent}${copy}` + code.slice(el.end)
        : code.slice(0, el.end) + ` ${copy}` + code.slice(el.end)
    } else {
      out = ownLine
        ? code.slice(0, lineStart) + `${indent}${copy}\n` + code.slice(lineStart)
        : code.slice(0, el.start) + `${copy} ` + code.slice(el.start)
    }
    try {
      parse(out, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    } catch (err) {
      lastErr = `the copy does not parse: ${String(err)}`
      continue
    }
    writeFileSync(abs, out)
    const nb = (kids[0] as t.JSXText).value.trim()
    return {
      ok: true, file: where.file,
      change: `added <${tagName(el)}> "${text}" ${side === 'after' ? 'after' : 'before'} "${nb}"`,
      template: loc,
    }
  }
  return { ok: false, error: lastErr }
}

function tagName(el: t.JSXElement): string {
  const n = el.openingElement.name
  return n.type === 'JSXIdentifier' ? n.name : 'element'
}

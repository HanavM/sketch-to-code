/**
 * Painting one shape, deterministically.
 *
 * Canva mode could move and resize elements but never reach INSIDE generated
 * artwork: change the hair colour on a drawn face and the only route was
 * another model run. The image tools solve the same problem with segmentation
 * masks — click a region, recolour it, edits stack, nothing regenerates.
 *
 * Here it is cheaper than that, because the regions are not guesses. The dev
 * plugin stamps every JSX host element, so every <path>, <circle> and <rect>
 * on the page already carries its own file:line:col. A click resolves to an
 * AST node, and recolouring is an attribute edit — no masks, no inference, no
 * tokens.
 *
 * The interesting case is a shape painted by a gradient. Replacing the
 * gradient reference with a flat colour would throw away the shading that
 * makes the form read, so instead the gradient's STOPS are recoloured and
 * their opacities left alone: same lighting, new hue.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@babel/parser'
import _traverse, { type NodePath } from '@babel/traverse'
import type * as t from '@babel/types'

type TraverseFn = (
  ast: unknown,
  visitor: { JSXOpeningElement: (path: NodePath<t.JSXOpeningElement>) => void },
) => void
const traverse = ((_traverse as unknown as { default?: unknown }).default ?? _traverse) as TraverseFn

export type PaintProp = 'fill' | 'stroke'

export interface PaintRequest {
  /** 'src/components/X.tsx:12:7', from the element's own data-s2c stamp. */
  srcLoc: string
  prop: PaintProp
  /** '#rrggbb'. */
  value: string
}

export interface PaintResult {
  ok: boolean
  file?: string
  change?: string
  error?: string
}

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'polygon', 'polyline', 'line', 'g'])
const HEX = /^#[0-9a-fA-F]{3,8}$/

/** Attribute name as written in JSX: fill / stroke, plus the class forms. */
const attrOf = (el: t.JSXOpeningElement, name: string): t.JSXAttribute | undefined =>
  el.attributes.find(
    (a): a is t.JSXAttribute =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  )

export function paintShape(root: string, req: PaintRequest): PaintResult {
  if (!HEX.test(req.value)) return { ok: false, error: `'${req.value}' is not a colour` }
  const m = /^(.+):(\d+):(\d+)$/.exec(req.srcLoc)
  if (!m) return { ok: false, error: `bad srcLoc "${req.srcLoc}"` }
  const [, rel, lineS, colS] = m
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) return { ok: false, error: 'srcLoc escapes the app root' }

  let code: string
  try {
    code = readFileSync(file, 'utf8')
  } catch {
    return { ok: false, error: `cannot read ${rel}` }
  }
  let ast
  try {
    ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  } catch {
    return { ok: false, error: `cannot parse ${rel}` }
  }

  let found: t.JSXOpeningElement | null = null
  traverse(ast, {
    JSXOpeningElement(path) {
      const loc = path.node.loc
      if (loc && loc.start.line === Number(lineS) && loc.start.column + 1 === Number(colS)) {
        found = path.node
      }
    },
  })
  if (!found) return { ok: false, error: `no element at ${req.srcLoc} (stale stamp?)` }
  const el = found as t.JSXOpeningElement
  const tag = el.name.type === 'JSXIdentifier' ? el.name.name : ''
  if (!SHAPES.has(tag)) return { ok: false, error: `<${tag}> is not a shape` }

  const attr = attrOf(el, req.prop)

  // ── a gradient reference: recolour its stops instead of flattening it ──
  if (attr?.value?.type === 'StringLiteral') {
    const url = /^url\(#([\w-]+)\)$/.exec(attr.value.value.trim())
    if (url) return paintGradient(file, code, url[1]!, req.value, rel!, req.prop)
  }

  if (!attr) {
    // no attribute yet: add one after the tag name
    const name = el.name
    if (name.type !== 'JSXIdentifier' || name.end == null) {
      return { ok: false, error: 'unsupported element name' }
    }
    const next = `${code.slice(0, name.end)} ${req.prop}="${req.value}"${code.slice(name.end)}`
    writeFileSync(file, next)
    return { ok: true, file: rel, change: `${req.prop}: none → ${req.value}` }
  }

  if (attr.value?.type !== 'StringLiteral') {
    // fill={something} — a value the page computes, not a literal to swap
    return {
      ok: false,
      error: `that shape's ${req.prop} comes from an expression, not a literal — edit it in source`,
    }
  }
  const before = attr.value.value
  if (attr.value.start == null || attr.value.end == null) {
    return { ok: false, error: 'missing attribute location' }
  }
  if (before === req.value) return { ok: true, file: rel, change: 'no change (already that colour)' }
  const quote = code[attr.value.start] ?? '"'
  const next =
    code.slice(0, attr.value.start) + quote + req.value + quote + code.slice(attr.value.end)
  writeFileSync(file, next)
  return { ok: true, file: rel, change: `${req.prop}: ${before} → ${req.value}` }
}

/**
 * Recolour every stop of a gradient, keeping each stop's opacity.
 *
 * The opacities are what carry the shading — a lit face at 0.42 falling to
 * 0.16 in shadow. Replacing the colours and leaving those alone re-hues the
 * form without flattening it, which is what "paint this shape" should mean
 * when the shape is painted by a gradient.
 */
function paintGradient(
  file: string,
  code: string,
  id: string,
  value: string,
  rel: string,
  prop: PaintProp,
): PaintResult {
  const open = new RegExp(`<(linear|radial)Gradient\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i')
  const start = open.exec(code)
  if (!start) return { ok: false, error: `gradient #${id} is not defined in ${rel}` }
  const from = start.index + start[0].length
  const closeIdx = code.indexOf('</', from)
  const endIdx = closeIdx === -1 ? code.length : closeIdx
  const body = code.slice(from, endIdx)

  let stops = 0
  const painted = body.replace(
    /(\bstop-?[Cc]olor\s*=\s*["'{]?\s*)(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)/g,
    (_whole, lead: string) => {
      stops++
      return `${lead}${value}`
    },
  )
  if (stops === 0) return { ok: false, error: `gradient #${id} has no literal stop colours to paint` }

  writeFileSync(file, code.slice(0, from) + painted + code.slice(endIdx))
  return {
    ok: true,
    file: rel,
    // say what was actually done — the user clicked a shape, not a gradient
    change: `${prop}: recoloured ${String(stops)} gradient stop(s) to ${value} (shading kept)`,
  }
}

/**
 * n123: a big drawn panel built far below its drawn top is moved there in code, with no model round.
 *
 * Round 38 e3 (budget), n122 try 3: the Categories panel was built 124px under its drawn top. The big-panel check
 * (drift.ts bigBlockDrift) named it with the exact pixels, and the repair turn thought for 151 s, made no edit and
 * stalled; likeness 30.6 against 62.3 for the two runs that built it in place. The fix is known and mechanical: the
 * panel's element and how far it is off are both measured. So it is written directly, before anything is judged:
 * `position: relative; top: -dy` on the panel's own element, merged into its inline style.
 *
 * A relative offset moves only the panel (what is inside moves with it) and nothing else on the page reflows, so it
 * can never push another block off its drawn spot. It is only safe when the strip the panel moves up into is empty:
 * the repair brief bans a negative top because a model used it to slide a block over the heading above it. So it
 * refuses unless every element in that strip, across the panel's width, is the panel's own ancestor (a column,
 * the page) or its own content. It also refuses a component tag, an element rendered more than once, one already
 * positioned, offset or transformed, and a style that is not a plain object; those go to the repair turn as before.
 * Zero tokens.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from '@babel/parser'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { BIG_BLOCK_MIN_H, BIG_BLOCK_MIN_W, BIG_BLOCK_TOL_PX } from './drift.js'

type Box = { x: number; y: number; w: number; h: number }

export interface PanelLift {
  index: number
  srcLoc: string
  /** How far low the panel was built, px (positive). */
  dy: number
  drawn: number
  built: number
}

export interface PanelLiftPlan {
  lifts: PanelLift[]
  /** Big panels off by more than the tolerance that are left to the repair turn, with why. */
  refused: Array<{ index: number; reason: string }>
}

const contains = (a: Box, b: Box, slack = 2) =>
  a.x <= b.x + slack && a.y <= b.y + slack && a.x + a.w >= b.x + b.w - slack && a.y + a.h >= b.y + b.h - slack

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const insideBox = (a: Box, b: Box, slack: number) =>
  a.x >= b.x - slack && a.y >= b.y - slack && a.x + a.w <= b.x + b.w + slack && a.y + a.h <= b.y + b.h + slack

/** The element standing for a big drawn panel: its x and width as drawn, a plausible height, top nearest the drawn top. */
export function matchPanel(nodes: DomNode[], r: Box): DomNode | null {
  let best: DomNode | null = null
  let bestD = Infinity
  for (const n of nodes) {
    if (n.rect.w <= 0 || n.rect.h <= 0) continue
    if (Math.abs(n.rect.x - r.x) > Math.max(16, 0.1 * r.w)) continue
    if (Math.abs(n.rect.w - r.w) > Math.max(24, 0.2 * r.w)) continue
    if (n.rect.h < 0.5 * r.h - 4 || n.rect.h > 2.5 * r.h + 24) continue
    const d = Math.abs(n.rect.y - r.y)
    if (d > 160) continue
    // the outermost of nested look-alikes (a card and its padded inner div) wins a tie: that is the one that moves
    if (d < bestD - 1 || (Math.abs(d - bestD) <= 1 && best && contains(n.rect, best.rect))) { bestD = d; best = n }
  }
  return best
}

/** Big drawn panels built too low, and whether each can be moved up directly. */
export function planPanelLifts(
  after: DomSnapshot,
  placed: Array<{ index: number; region: Box }>,
): PanelLiftPlan {
  const out: PanelLiftPlan = { lifts: [], refused: [] }
  if (after.truncated || placed.length < 2) return out
  const vh = after.viewport.h
  const vw = after.viewport.w || 1280
  for (const p of placed) {
    const r = p.region
    if (r.h < BIG_BLOCK_MIN_H || r.w < BIG_BLOCK_MIN_W) continue
    if (r.h > 0.8 * vh && r.y < 40) continue
    // a region inside a bigger drawn one is that panel's content, moved with it (same rule as bigBlockDrift)
    if (placed.some((q) => q !== p && q.region.w * q.region.h > r.w * r.h && !(q.region.h > 0.8 * vh && q.region.y < 40) && q.region.w < 0.9 * vw && insideBox(r, q.region, 8))) continue
    const n = matchPanel(after.nodes, r)
    if (!n) continue
    const dy = Math.round(n.rect.y - r.y)
    if (Math.abs(dy) <= BIG_BLOCK_TOL_PX) continue
    const refuse = (reason: string) => out.refused.push({ index: p.index, reason })
    if (dy < 0) { refuse(`built ${-dy}px high: moving a panel down is left to the repair`); continue }
    if (!n.srcLoc) { refuse('the panel has no source stamp'); continue }
    if (after.nodes.filter((m) => m.srcLoc === n.srcLoc).length > 1) { refuse('the panel element renders more than once'); continue }
    if (n.style.position && n.style.position !== 'static') { refuse(`the panel is already position: ${n.style.position}`); continue }
    // the strip it moves up into, across its width, holds nothing but its own columns and page
    const strip: Box = { x: n.rect.x + 1, y: r.y, w: Math.max(0, n.rect.w - 2), h: dy }
    const blocker = after.nodes.find((m) =>
      m !== n && m.rect.w > 0 && m.rect.h > 0 && overlaps(m.rect, strip) &&
      !contains(m.rect, n.rect) && !contains(n.rect, m.rect))
    if (blocker) {
      refuse(`something is in the way above it (${blocker.tag}${blocker.text ? ` "${blocker.text.slice(0, 24)}"` : ''} at y ${Math.round(blocker.rect.y)})`)
      continue
    }
    out.lifts.push({ index: p.index, srcLoc: n.srcLoc, dy, drawn: Math.round(r.y), built: Math.round(n.rect.y) })
  }
  return out
}

interface AstNode { type: string; start?: number | null; end?: number | null; loc?: { start: { line: number; column: number } } | null; [k: string]: unknown }

function findOpening(ast: AstNode, line: number, col: number): AstNode | null {
  let found: AstNode | null = null
  const walk = (v: unknown): void => {
    if (found || !v || typeof v !== 'object') return
    if (Array.isArray(v)) { for (const c of v) walk(c); return }
    const node = v as AstNode
    if (node.type === 'JSXOpeningElement' && node.loc && node.loc.start.line === line && node.loc.start.column + 1 === col) { found = node; return }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments') continue
      const c = node[k]
      if (c && typeof c === 'object') walk(c)
    }
  }
  walk(ast)
  return found
}

const OFFSET_KEYS = ['position', 'top', 'bottom', 'transform', 'translate', 'inset', 'insetBlock', 'insetBlockStart']
const OFFSET_CLASS = /(^|:)(-?top-|-?bottom-|inset-|-?translate-y-|relative$|absolute$|fixed$|sticky$|transform$|rotate-|-?rotate-)/

/** Write `position: relative; top: -dy px` on the panel's own element. */
export function liftPanel(root: string, lift: PanelLift): { ok: boolean; file?: string; change?: string; error?: string } {
  const m = /^(.+):(\d+):(\d+)$/.exec(lift.srcLoc)
  if (!m) return { ok: false, error: `bad srcLoc "${lift.srcLoc}"` }
  const [, rel, lineS, colS] = m
  const file = resolve(root, rel!)
  if (!file.startsWith(resolve(root))) return { ok: false, error: 'srcLoc escapes root' }
  let code: string
  try { code = readFileSync(file, 'utf8') } catch { return { ok: false, error: `cannot read ${rel}` } }
  let ast: AstNode
  try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) as unknown as AstNode } catch { return { ok: false, error: `cannot parse ${rel}` } }
  const opening = findOpening(ast, Number(lineS), Number(colS))
  if (!opening) return { ok: false, error: `no JSX element at ${lift.srcLoc} (stale stamp?)` }
  const name = opening.name as AstNode
  if (name.type !== 'JSXIdentifier' || !/^[a-z]/.test(String(name.name)) || name.end == null) return { ok: false, error: 'a component, not an HTML element' }
  const attrs = opening.attributes as AstNode[]
  if (attrs.some((a) => a.type === 'JSXSpreadAttribute')) return { ok: false, error: 'spread props may set its style' }
  const attr = (k: string) => attrs.find((a) => a.type === 'JSXAttribute' && (a.name as AstNode).name === k)
  const cls = attr('className')?.value as AstNode | null | undefined
  if (cls && cls.type === 'StringLiteral' && String(cls.value).split(/\s+/).some((c) => OFFSET_CLASS.test(c))) {
    return { ok: false, error: 'its classes already position or offset it' }
  }
  const top = `${-lift.dy}`
  const change = `position: relative; top: -${lift.dy}px (built at ${lift.built}px, drawn at ${lift.drawn}px)`
  const write = (next: string) => {
    try { parse(next, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) } catch (e) { return { ok: false, error: `the edit would not parse (${e instanceof Error ? e.message : String(e)})` } }
    writeFileSync(file, next)
    return { ok: true, file: rel, change }
  }
  const style = attr('style')
  if (!style) return write(code.slice(0, name.end) + ` style={{ position: 'relative', top: ${top} }}` + code.slice(name.end))
  const cont = style.value as AstNode | null
  const obj = cont?.type === 'JSXExpressionContainer' ? (cont.expression as AstNode) : null
  if (!obj || obj.type !== 'ObjectExpression' || obj.start == null || obj.end == null) return { ok: false, error: 'style is not a plain object' }
  const props = obj.properties as AstNode[]
  if (props.some((p) => p.type !== 'ObjectProperty')) return { ok: false, error: 'style has a spread' }
  const keyOf = (p: AstNode) => { const k = p.key as AstNode; return k.type === 'Identifier' ? String(k.name) : k.type === 'StringLiteral' ? String(k.value) : '' }
  if (props.some((p) => OFFSET_KEYS.includes(keyOf(p)))) return { ok: false, error: 'its style already positions or offsets it' }
  const last = props[props.length - 1]
  const next = last && last.end != null
    ? code.slice(0, last.end) + `, position: 'relative', top: ${top}` + code.slice(last.end)
    : code.slice(0, obj.start) + `{ position: 'relative', top: ${top} }` + code.slice(obj.end)
  return write(next)
}

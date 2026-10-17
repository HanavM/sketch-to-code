/**
 * What's drawn inside the screen box becomes the new screen's content (s2c-040).
 *
 * Draw a link (navigate.ts) reads an arrow from a button to a box with a name
 * in it as "clicking this opens a screen called that". People don't draw an
 * empty box, though: they sketch what the screen should have in it, a form,
 * three cards, a list. Before this, that ink went to codegen as an ordinary
 * `add` with a place on the page the user was drawing on, so the form landed
 * on the HOME page, beside the button, which is the opposite of what the
 * drawing says.
 *
 * So, after the navigate engine has written the screen file, every add whose
 * ink lies inside the screen's box is retargeted into that file: its
 * destination becomes the screen's `<main>`, and its instruction says so in
 * words the codegen model can't misread. Deterministic, like the rest of the
 * gesture: which box, and what is inside it, is geometry, not judgement.
 *
 * Which strokes are the box: of the strokes the navigate action cites
 * (`strokeIds`, kept by grounding), the largest box they draw: one stroke
 * that closes on itself, or (s2c-042) up to four strokes that together
 * outline a rectangle, since a box drawn fast is two Ls or four sides. A
 * written name is small and loses on size; the arrow neither closes nor
 * lies on an outline. If no box is found, nothing is retargeted: an add the
 * box can't be found for stays where it was drawn, which is the old
 * behaviour, not a new guess.
 *
 * Inside means most of the add's ink is inside the box (80% of its area), so
 * a sketch that pokes a little over the edge still counts and one drawn next
 * to the box does not.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import type { BBox, Stroke } from '@s2c/ink'
import type { GroundedAction } from './intent2.js'

/** A navigate the engine carried out, as run2 records it. */
export interface AppliedScreen {
  /** Index of the navigate action. */
  index: number
  /** The screen's file, repo-relative (navigate.ts `screenAt`). */
  file: string
  /** '#/reports' */
  route: string
  /** The screen's name as its heading shows it. */
  title: string
}

export interface Retarget {
  /** The add that moved. */
  index: number
  /** The navigate whose box it was drawn in. */
  navIndex: number
  file: string
}

const bboxOf = (pts: Array<{ x: number; y: number }>): BBox => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** A stroke that ends near where it started, relative to its own size. */
function closes(s: Stroke): boolean {
  if (s.points.length < 4) return false
  const b = bboxOf(s.points)
  const size = Math.max(b.w, b.h)
  if (size < 30 || Math.min(b.w, b.h) < 20) return false
  const a = s.points[0]!
  const z = s.points[s.points.length - 1]!
  return Math.hypot(a.x - z.x, a.y - z.y) <= 0.25 * size
}

type Pt = { x: number; y: number }

/** Points along the stroke no more than `step` apart, at most `max` of them. */
function trace(pts: Pt[], step = 6, max = 96): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!
    out.push(a)
    const b = pts[i + 1]
    if (!b) break
    const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / step)
    for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n })
  }
  if (out.length <= max) return out
  return Array.from({ length: max }, (_, i) => out[Math.round((i * (out.length - 1)) / (max - 1))]!)
}

/** Distance from p to the outline of b (not its area). */
function toOutline(p: Pt, b: BBox): number {
  const x1 = b.x + b.w; const y1 = b.y + b.h
  const dx = Math.max(b.x - p.x, 0, p.x - x1)
  const dy = Math.max(b.y - p.y, 0, p.y - y1)
  if (dx > 0 || dy > 0) return Math.hypot(dx, dy)
  return Math.min(p.x - b.x, x1 - p.x, p.y - b.y, y1 - p.y)
}

/** `n` points evenly spaced along each side of b, side by side (top, right, bottom, left). */
function sides(b: BBox, n = 20): Pt[][] {
  const at = (i: number) => (i + 0.5) / n
  return [
    Array.from({ length: n }, (_, i) => ({ x: b.x + b.w * at(i), y: b.y })),
    Array.from({ length: n }, (_, i) => ({ x: b.x + b.w, y: b.y + b.h * at(i) })),
    Array.from({ length: n }, (_, i) => ({ x: b.x + b.w * at(i), y: b.y + b.h })),
    Array.from({ length: n }, (_, i) => ({ x: b.x, y: b.y + b.h * at(i) })),
  ]
}

/**
 * The strokes, taken together, draw a rectangle (s2c-042): nearly all their
 * ink lies on the outline of their joint bounding box, and every side of that
 * outline is mostly inked. Covers a box drawn as two Ls, as four separate
 * sides, or in one stroke that overshoots its start. An arrow, or a sketch
 * inside the box, puts ink off the outline, so it never joins one; a bracket
 * open on one side leaves that side bare, and a name written just under the
 * bare side covers too little of it to close it.
 */
function drawsRect(traces: Pt[][]): BBox | null {
  const ink = traces.flat()
  if (ink.length < 4) return null
  const b = bboxOf(ink)
  if (Math.max(b.w, b.h) < 30 || Math.min(b.w, b.h) < 20) return null
  // a hand-drawn side wobbles; allow a tenth of the short side, within reason
  const tol = Math.min(24, Math.max(6, 0.1 * Math.min(b.w, b.h)))
  const onEdge = ink.filter((p) => toOutline(p, b) <= tol).length / ink.length
  if (onEdge < 0.85) return null
  const inked = (q: Pt) => ink.some((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol)
  const shares = sides(b).map((side) => side.filter(inked).length / side.length)
  const all = shares.reduce((a, x) => a + x, 0) / shares.length
  return all >= 0.85 && shares.every((x) => x >= 0.6) ? b : null
}

/** At most this many cited strokes are tried in combination (the largest). */
const MAX_TRIED = 10
/** A box is drawn in at most this many strokes. */
const MAX_SIDES = 4

/**
 * The box a navigate's arrow points at: the largest box its cited strokes
 * draw, either one stroke that closes on itself (any shape) or up to four
 * strokes that together outline a rectangle. Fewer strokes win a tie.
 */
export function screenBox(nav: GroundedAction, strokes: Stroke[]): BBox | null {
  const ids = new Set([...(nav.strokeIds ?? []), ...(nav.svgPaths ?? []).map((p) => p.strokeId)])
  const cited = strokes.filter((s) => ids.has(s.id) && s.points.length >= 2)
  let best: BBox | null = null
  const offer = (b: BBox | null) => { if (b && (!best || b.w * b.h > best.w * best.h)) best = b }
  for (const s of cited) if (closes(s)) offer(bboxOf(s.points))
  const tried = cited
    .map((s) => { const b = bboxOf(s.points); return { t: trace(s.points), size: Math.hypot(b.w, b.h) } })
    .sort((a, b) => b.size - a.size)
    .slice(0, MAX_TRIED)
    .map((c) => c.t)
  const pick = (from: number, chosen: Pt[][]) => {
    if (chosen.length) offer(drawsRect(chosen))
    if (chosen.length === MAX_SIDES) return
    for (let i = from; i < tried.length; i++) pick(i + 1, [...chosen, tried[i]!])
  }
  pick(0, [])
  return best
}

/** Share of `r`'s area that lies inside `box`. A zero-area region counts by its centre. */
export function insideShare(r: BBox, box: BBox): number {
  const ix = Math.max(0, Math.min(r.x + r.w, box.x + box.w) - Math.max(r.x, box.x))
  const iy = Math.max(0, Math.min(r.y + r.h, box.y + box.h) - Math.max(r.y, box.y))
  const area = r.w * r.h
  if (area <= 0) {
    const cx = r.x + r.w / 2; const cy = r.y + r.h / 2
    return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h ? 1 : 0
  }
  return (ix * iy) / area
}

/** The `<main>` navigate.ts writes, as a data-s2c stamp (`file:line:col`, col 1-based). */
export function screenMainStamp(root: string, file: string): string | null {
  let code: string
  try { code = readFileSync(join(root, file), 'utf8') } catch { return null }
  let ast
  try { ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] }) } catch { return null }
  // the first <main> in the file; a screen edited into another shape has none
  // and is addressed by file alone
  const seen: unknown[] = [ast.program]
  while (seen.length) {
    const n = seen.shift() as Record<string, unknown> | null
    if (!n || typeof n !== 'object') continue
    if (n.type === 'JSXOpeningElement') {
      const name = n.name as { type: string; name?: string }
      const loc = n.loc as { start: { line: number; column: number } } | undefined
      if (name.type === 'JSXIdentifier' && name.name === 'main' && loc) return `${file}:${loc.start.line}:${loc.start.column + 1}`
    }
    for (const [k, v] of Object.entries(n)) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue
      if (Array.isArray(v)) seen.push(...v)
      else if (v && typeof v === 'object') seen.push(v)
    }
  }
  return null
}

/**
 * Point every add drawn inside a screen's box at that screen. Mutates the
 * actions in place (run2 hands the same objects to codegen and verification)
 * and returns what moved.
 */
export function retargetIntoScreens(
  root: string,
  actions: GroundedAction[],
  strokes: Stroke[],
  applied: AppliedScreen[],
  /** Actions already carried out by an engine: never retargeted. */
  handled: Set<number>,
): Retarget[] {
  const out: Retarget[] = []
  for (const s of applied) {
    const nav = actions[s.index]
    if (!nav || nav.kind !== 'navigate') continue
    const box = screenBox(nav, strokes)
    if (!box) continue
    const navIds = new Set([...(nav.strokeIds ?? []), ...(nav.svgPaths ?? []).map((p) => p.strokeId), ...(nav.textMarks ?? [])])
    const stamp = screenMainStamp(root, s.file)
    for (const [i, a] of actions.entries()) {
      if (handled.has(i) || i === s.index || a.onScreen) continue
      if (a.kind !== 'add' && a.kind !== 'design') continue
      if (!a.region || insideShare(a.region, box) < 0.8) continue
      // the box itself, cited twice, is not something drawn inside it
      const own = [...(a.svgPaths ?? []).map((p) => p.strokeId), ...(a.textMarks ?? [])]
      if (own.length && own.every((id) => navIds.has(id))) continue
      a.onScreen = { name: s.title, route: s.route, file: s.file, navIndex: s.index }
      a.dest = {
        domId: '', srcLoc: stamp, tag: 'main', text: '', subtreeText: s.title, classes: [],
        rect: { ...box },
      }
      a.position = 'into'
      a.instruction =
        `ON THE "${s.title}" SCREEN, not the page it was drawn on: build this inside the <main> of ${s.file}, ` +
        `below its heading and the ← Back button (keep both). It is drawn inside the box the arrow points at, ` +
        `which stands for that screen. ${a.instruction}`
      out.push({ index: i, navIndex: s.index, file: s.file })
    }
  }
  return out
}

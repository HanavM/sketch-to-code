/**
 * The bare ring: ask instead of guessing (s2c-020).
 *
 * docs/visual-language.md conflict 6: a ring or box around an existing element
 * means "change this", and nothing says how. No pen colour (row 7 carries the
 * value in the ink) and no words (row 8). Sent to the model, it is an empty
 * command and the model invents an edit, paid for in tokens and then in an
 * Undo. Asked instead, it costs nothing, and the user's one word is the most
 * exact input the pipeline can get.
 *
 * Deliberately narrow, because a question nobody needed is friction:
 *   - gesture reading only (a box in design mode is new UI);
 *   - not one note anywhere (any words, on any anchor, are an answer);
 *   - EVERY stroke is a closed ring/box in the default ink (a scribble, an
 *     arrow, a strike or a coloured stroke anywhere means the sketch already
 *     says something, so the model gets it);
 *   - and every ring encloses an existing element. An empty box in empty space
 *     (r15: one more tile in the list's empty slot) is "add here", not a
 *     question.
 * A partial box (r05's three sides) is open, so it never asks: that is a frame
 * for new UI, the opposite of a bare ring.
 *
 * Pure: main.ts owns the state, the snapshot and the DOM.
 */
import { classifyStroke } from '@s2c/ink/classify'
import { containedElements } from '@s2c/dom'
import type { DomNode, DomSnapshot } from '@s2c/dom'

export interface RingInput {
  id: string
  points: Array<{ x: number; y: number; t: number }>
  /** Present = a chosen pen colour, which is itself the instruction. */
  color?: string
}

export interface BareRing {
  strokeIds: string[]
  /** One per ring: the element the question names. */
  targets: DomNode[]
  /** How the question names each target ('"Get started"', 'this card'). */
  names: string[]
}

/** Single-stroke shapes that enclose something. Diamond and triangle are in
 *  because the classifier calls a hurried box that runs past its start a
 *  diamond (0.54 on the bench's rbox close:'overlap'); what matters here is
 *  that it encloses, not which closed shape it is. */
const RING_KINDS = new Set(['rect', 'rounded-rect', 'ellipse', 'circle', 'diamond', 'triangle'])

/** An enclosed element smaller than this share of the ring is a glyph inside
 *  a loose loop, not what was ringed. */
const MIN_TARGET_SHARE = 0.12
/** Coverage of the element by the ring's box (dom's containedElements). */
const COVER = 0.8
/** Ink lands a few px inside the edge of what it rings. */
const PAD = 6

const area = (b: { w: number; h: number }) => Math.max(0, b.w) * Math.max(0, b.h)

function bbox(points: RingInput['points']) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of points) {
    x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * How far the stroke is from closing: the end to the nearest point of the
 * stroke's first stretch, or the start to its last stretch. A ring that runs
 * past its start (r03's 1.1 turns) scores ~0 though its endpoints are apart.
 */
export function closingGap(points: RingInput['points']): number {
  const n = points.length
  const k = Math.max(1, Math.floor(n * 0.3))
  const near = (p: { x: number; y: number }, from: number, to: number) => {
    let best = Infinity
    for (let i = from; i < to; i++) best = Math.min(best, Math.hypot(points[i]!.x - p.x, points[i]!.y - p.y))
    return best
  }
  return Math.min(near(points[n - 1]!, 0, k), near(points[0]!, n - k, n))
}

/** Is this one stroke a closed ring or box (by the ink package's own reader)? */
export function isRing(stroke: RingInput): boolean {
  if (stroke.points.length < 8) return false
  // The ink classifier calls a long thin U closed (r05's three-sided box: the
  // missing side is short next to the path). The open side is the point: it is
  // a frame for something new, so the gap is judged against the ring's own size.
  const b = bbox(stroke.points)
  if (closingGap(stroke.points) > Math.max(24, 0.4 * Math.min(b.w, b.h))) return false
  if (closedShape(stroke.id, stroke.points)) return true
  // A ring round a heading or a line of text is long and flat (5:1 and more),
  // and the classifier's hull ratios are tuned for round-ish shapes: it calls
  // that ring "ink". Squash the box square and ask again; an ellipse becomes a
  // circle and a box a square, while a scribble or a strike stays what it is.
  // (s2c-050: found when the ring-recolour reading missed every heading.)
  const long = Math.max(b.w, b.h)
  const short = Math.min(b.w, b.h)
  if (short <= 0 || long / short < 2.5) return false
  const sx = b.w > b.h ? short / long : 1
  const sy = b.h > b.w ? short / long : 1
  return closedShape(stroke.id, stroke.points.map((p) => ({ ...p, x: b.x + (p.x - b.x) * sx, y: b.y + (p.y - b.y) * sy })))
}

function closedShape(id: string, points: RingInput['points']): boolean {
  const { candidates } = classifyStroke({ id, points })
  const top = [...candidates].sort((a, b) => b.confidence - a.confidence)[0]
  return top != null && RING_KINDS.has(top.kind) && top.confidence >= 0.5
}

/** The element a ring is around, or null when it rings empty space. */
export function ringTarget(stroke: RingInput, snap: DomSnapshot): DomNode | null {
  const b = bbox(stroke.points)
  const box = { x: b.x - PAD, y: b.y - PAD, w: b.w + 2 * PAD, h: b.h + 2 * PAD }
  const view = area(snap.viewport)
  const inside = containedElements(snap, box, COVER).filter((n) =>
    area(n.rect) >= MIN_TARGET_SHARE * area(b) &&
    // the page wrapper is never what someone ringed
    (view === 0 || area(n.rect) < 0.9 * view))
  if (inside.length === 0) return null
  // the biggest enclosed thing is what was ringed: the button, not its label
  return inside.reduce((a, c) => (area(c.rect) > area(a.rect) ? c : a))
}

/**
 * The sketch is ONLY bare rings around existing things, with no words: ask.
 * Returns null whenever the sketch says something on its own.
 */
export function bareRing(
  strokes: RingInput[],
  noteCount: number,
  snap: DomSnapshot,
  mode: 'gesture' | 'design' | 'screenshot',
): BareRing | null {
  if (mode !== 'gesture' || noteCount > 0 || strokes.length === 0) return null
  const targets: DomNode[] = []
  for (const s of strokes) {
    if (s.color) return null
    if (!isRing(s)) return null
    const t = ringTarget(s, snap)
    if (!t) return null
    targets.push(t)
  }
  return {
    strokeIds: strokes.map((s) => s.id),
    targets,
    names: targets.map((t) => targetName(t, firstText(snap, t))),
  }
}

/** The first text inside a node, in document order (a card's heading). */
export function firstText(snap: DomSnapshot, node: DomNode): string | undefined {
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const inside = (n: DomNode) => {
    for (let p = n.parent; p != null; p = byId.get(p)?.parent ?? null) if (p === node.id) return true
    return false
  }
  return snap.nodes.find((n) => n.text.trim() !== '' && inside(n))?.text
}

/** What to call a target in a sentence a non-coder reads. */
export function targetName(n: DomNode, subtreeText?: string): string {
  // an inline child between two runs of the text is marked, not closed up
  // (s2c-046): "Edit … and save to test", not "Edit and save to test"
  const own = n.text && n.textRuns && n.textRuns.length > 1 ? n.textRuns.join(' … ') : n.text
  const text = (own || subtreeText || '').trim().replace(/\s+/g, ' ')
  if (text) return `"${text.length > 32 ? `${text.slice(0, 31)}…` : text}"`
  const kind: Record<string, string> = {
    button: 'button', a: 'link', img: 'image', input: 'field', textarea: 'field',
    nav: 'menu', header: 'header', footer: 'footer', form: 'form', article: 'card',
    section: 'section', li: 'item', h1: 'heading', h2: 'heading', h3: 'heading', p: 'text',
  }
  return `this ${kind[n.tag] ?? 'part'}`
}

/** The question. One line: what was ringed, and the two ways to answer. */
export function askSentence(names: string[]): string {
  const what = names.length === 1 ? names[0]! : `these ${String(names.length)} things`
  return `What should change about ${what}? Type a word (bigger, red, remove…) or redraw it ` +
    'in a pen colour (Alt+P). ▶ Run again sends it as it is.'
}

/** Same strokes, same (zero) notes = the user already saw the question. */
export function askKey(strokeIds: string[]): string {
  return strokeIds.join(',')
}

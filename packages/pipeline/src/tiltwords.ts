/**
 * Words drawn inside a box drawn turned sit on their drawn lines, in the box's own frame (n61).
 *
 * Round 33 c3 (gig ticket, n57-n59): the ticket is drawn turned about 6 degrees and built turned (n31), with
 * the heading, the date and the stub words each typed on a line drawn inside it. The lines run slanted with
 * the ticket, so they were neither level lines (textplace.ts) nor checked at all: the build put the words by
 * eye and they landed 20-40px lower than drawn every try. A person who writes on the lines of a turned card
 * means the words sit on those lines as the card turns. So each line inside a turned box is turned back
 * into the box's own frame (its top-left corner, before turning), codegen is told where the letters sit
 * there (the baseline on the line, the first letter where the line starts), and the page is checked the same
 * way: the built words are turned back about the built box and their first line's baseline must be near
 * the drawn line. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { angleOf } from './tilt.js'

type P = { x: number; y: number }
type Tilt = NonNullable<ShapeMark['tilt']>
interface NodeLike { id: string; tag: string; rect: BBox; text?: string; textBox?: BBox; style: { transform?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
type ActionLike = { shapeMarks?: ShapeMark[]; textSize?: Array<{ lines: number; strokes: string[] }> }

const r = (v: number) => Math.round(v)
const rad = (deg: number) => (deg * Math.PI) / 180

/** A page point in a turned box's own frame: x, y from its top-left corner before turning. */
export function toLocal(p: P, t: { deg: number; w: number; h: number; cx: number; cy: number }): P {
  const c = Math.cos(rad(t.deg)), s = Math.sin(rad(t.deg))
  const dx = p.x - t.cx, dy = p.y - t.cy
  return { x: dx * c + dy * s + t.w / 2, y: -dx * s + dy * c + t.h / 2 }
}

/** The words of a note: the part before the first comma ("The Night Owls, big bold black" -> "The Night Owls"). */
export const copyOf = (note: string): string => (note.includes(',') ? note.slice(0, note.indexOf(',')) : note).trim()

export interface TiltLine {
  strokeId?: string
  words?: string        // the words typed on it; none for a bare line (the next line of a stacked heading)
  x0: number; x1: number; y: number   // in the box's own frame
  lines: number         // how many drawn lines the words take (a stacked heading), 1 otherwise
  first: boolean        // the first (top) line of its words
}

export interface TiltWords { box: ShapeMark; tilt: Tilt; lines: TiltLine[] }

const isLine = (m: ShapeMark) => m.shape === 'line' && !m.edge && !!m.from && !!m.to
const inside = (l: P, t: Tilt) => l.x >= 4 && l.x <= t.w - 4 && l.y >= 4 && l.y <= t.h - 4

/** For each box drawn turned, the lines drawn inside it, in its own frame (top to bottom). */
export function tiltWordsOf(actions: ActionLike[]): TiltWords[] {
  const all = actions.flatMap((a) => a.shapeMarks ?? [])
  const stacks = actions.flatMap((a) => a.textSize ?? []).filter((s) => s.lines >= 2)
  const out: TiltWords[] = []
  for (const box of all) {
    const t = box.tilt
    if (!t || t.weak || box.shape !== 'box') continue
    const lines: TiltLine[] = []
    for (const m of all) {
      if (m === box || !isLine(m)) continue
      const a = toLocal(m.from!, t), b = toLocal(m.to!, t)
      // a divider across the box (upright in its frame) is no text line
      if (Math.abs(a.y - b.y) > Math.max(10, Math.abs(a.x - b.x) * 0.2)) continue
      if (!inside(a, t) || !inside(b, t)) continue
      const words = m.words ?? m.carries
      const stack = stacks.find((s) => m.strokeId && s.strokes.includes(m.strokeId))
      lines.push({
        ...(m.strokeId ? { strokeId: m.strokeId } : {}),
        ...(words ? { words } : {}),
        x0: r(Math.min(a.x, b.x)), x1: r(Math.max(a.x, b.x)), y: r((a.y + b.y) / 2),
        lines: stack?.lines ?? 1, first: true,
      })
    }
    if (!lines.some((l) => l.words)) continue
    lines.sort((p, q) => p.y - q.y)
    // a bare line right under a line with words is that heading's next line (n44); it is not its own words
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!
      if (l.words) continue
      const above = lines.slice(0, i).reverse().find((o) => o.words && Math.min(o.x1, l.x1) - Math.max(o.x0, l.x0) > 0.5 * Math.min(o.x1 - o.x0, l.x1 - l.x0))
      if (above && l.y - above.y <= 110) {
        l.first = false
        if (above.lines < 2) above.lines = 2
      }
    }
    out.push({ box, tilt: t, lines })
  }
  return out
}

export function tiltWordsBrief(actions: ActionLike[]): string {
  const sets = tiltWordsOf(actions)
  const out: string[] = []
  for (const { box, tilt: t, lines } of sets) {
    const rows: string[] = []
    for (const l of lines) {
      if (l.words) {
        rows.push(`  - "${copyOf(l.words)}" (note: "${l.words}"): its letters SIT ON the line at y ${l.y} from the box's top edge ` +
          `(the baseline there, the letters above it), the first letter ${l.x0}px in from the box's left edge` +
          `${l.lines >= 2 ? `; it is set on ${l.lines} drawn lines, this is the first` : ''}.`)
      } else if (!l.first) {
        rows.push(`  - the next line of the words above sits on y ${l.y} (from x ${l.x0}): break the words there, at that line pitch.`)
      }
    }
    if (!rows.length) continue
    out.push(`- the box drawn turned at (${box.box.x},${box.box.y}) ${box.box.w}x${box.box.h} (one element ${t.w}x${t.h}, rotate(${Math.round(t.deg * 10) / 10}deg)) ` +
      `has words drawn on lines inside it. Measured in the box's OWN frame (from its top-left corner before turning, x across its width, y down its height):\n${rows.join('\n')}\n` +
      `  Place them inside the turned element in its own coordinates (e.g. the element position: relative; each block position: absolute with left = the x above ` +
      `and top = the line's y minus about 0.8 x its font-size, or the matching padding), never by page coordinates and never centred in the box by default: ` +
      `the turn carries them onto the drawn lines.`)
  }
  return out.length
    ? `WORDS ON LINES INSIDE A TURNED BOX (deterministic, the lines turned back into the box's own frame; checked on the page):\n${out.join('\n')}\n\n`
    : ''
}

const norm = (s: string) => s.toLowerCase().replace(/[“”"'‘’.,!?:;·•|–—-]/g, ' ').replace(/\s+/g, '')

/** The built element standing for the turned box: about its size, centred near it, turned. */
function builtBox(t: Tilt, aabb: BBox, after: Snap): { cx: number; cy: number; deg: number } | null {
  let best: { n: NodeLike; d: number } | null = null
  for (const n of after.nodes) {
    const rr = n.rect
    if (Math.abs(rr.w - aabb.w) > aabb.w * 0.35 || Math.abs(rr.h - aabb.h) > aabb.h * 0.4) continue
    const deg = angleOf(n.style.transform)
    if (Math.abs(deg) < 0.5) continue
    const d = Math.hypot(rr.x + rr.w / 2 - t.cx, rr.y + rr.h / 2 - t.cy)
    if (d > 160) continue
    if (!best || d < best.d) best = { n, d }
  }
  if (!best) return null
  const rr = best.n.rect
  return { cx: rr.x + rr.w / 2, cy: rr.y + rr.h / 2, deg: angleOf(best.n.style.transform) }
}

/** An upright box's own width and height from the upright bounds it takes when turned by deg. */
export function unturn(W: number, H: number, deg: number): { w: number; h: number } {
  const c = Math.abs(Math.cos(rad(deg))), s = Math.abs(Math.sin(rad(deg)))
  const k = c * c - s * s
  if (k < 0.2) return { w: W, h: H }
  return { w: Math.max(1, (W * c - H * s) / k), h: Math.max(1, (H * c - W * s) / k) }
}

export function verifyTiltWords(actions: ActionLike[], after: Snap): { satisfied: boolean; unverifiable?: boolean; reason: string } {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const sets = tiltWordsOf(actions)
  if (!sets.length) return { satisfied: true, unverifiable: true, reason: 'no words on lines in a turned box' }
  const faults: string[] = []
  let judged = 0
  for (const { box, tilt: t, lines } of sets) {
    const built = builtBox(t, box.box, after)
    if (!built) continue
    const frame = { deg: built.deg, w: t.w, h: t.h, cx: built.cx, cy: built.cy }
    for (const l of lines) {
      if (!l.words) continue
      const want = norm(copyOf(l.words))
      if (want.length < 2) continue
      const hits = after.nodes.filter((n) => n.text && n.textBox && norm(n.text).includes(want))
        // the tightest element holding the words (not the whole ticket)
        .sort((p, q) => p.textBox!.w * p.textBox!.h - q.textBox!.w * q.textBox!.h)
      const n = hits[0]
      if (!n) continue
      const tb = n.textBox!
      const c = toLocal({ x: tb.x + tb.w / 2, y: tb.y + tb.h / 2 }, frame)
      const own = unturn(tb.w, tb.h, built.deg)
      const top = c.y - own.h / 2, left = c.x - own.w / 2
      const L = own.h / Math.max(1, l.lines)
      const baseline = top + 0.8 * L
      judged++
      const dy = baseline - l.y
      const slackY = Math.max(12, 0.45 * L)
      const what = `"${copyOf(l.words)}" (drawn on the line at y ${l.y} in the turned box's own frame)`
      if (Math.abs(dy) > slackY) {
        faults.push(`${what} sits with its ${l.lines >= 2 ? 'first line\'s ' : ''}letters at y ${r(baseline)} in the box's frame, ` +
          `${r(Math.abs(dy))}px ${dy > 0 ? 'LOWER' : 'HIGHER'} than drawn: move it ${dy > 0 ? 'up' : 'down'} by about ${r(Math.abs(dy))}px inside the turned box ` +
          `(its top or padding in the box's own coordinates); keep the turn, the size and everything else`)
      } else if (left - l.x0 > Math.max(28, 0.1 * t.w)) {
        faults.push(`${what} starts ${r(left - l.x0)}px right of where its line starts (x ${l.x0} in the box's frame): left-align it so its first letter starts there; change nothing else`)
      }
    }
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no words on lines in a turned box were built' }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${judged} line${judged > 1 ? 's' : ''} of words on their drawn lines inside the turned box` }
}

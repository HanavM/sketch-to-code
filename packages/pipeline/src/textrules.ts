/**
 * A line drawn for words is those words, never a rule on the page (n59).
 *
 * Round 33 c3 (gig ticket, n57): "Fri 12 Dec · Doors 8pm · The Grain Hall, grey" was typed on a drawn line,
 * and the build put the words there AND drew the line under them as a visible rule; the lines under ADMIT
 * and ONE on the stub came back as rules too. The brief lets a level line be a divider or an underline, so a
 * line with words typed on it was sometimes both. Here every drawn line carrying copy (its own note has words
 * that are not only about the look, and not "dashed" / "divider") is checked on the page: nothing near the
 * line, about its length, may paint a thin rule (an hr, a 1-4px tall filled bar, or a bottom border under
 * the words). A rule there is a failure the repair round can act on. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import { copyWords } from './linespan.js'

interface MarkLike { strokeId?: string; shape: string; box: BBox; from?: { x: number; y: number }; to?: { x: number; y: number }; edge?: true; words?: string; carries?: string }
interface NodeLike { id: string; tag: string; rect: BBox; text?: string; parent?: string | null; style?: { backgroundColor?: string; border?: string; borderBottom?: string; transform?: string; textDecoration?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface RuleVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

/** A note that asks for a rule, not words: "dashed", "divider", "thin line". */
const RULE_NOTE = /\b(dashed|dotted|rule|divider|separator|line|border|perforat\w*|tear|stripe|underline|underlined)\b/i

/** The words a line stands for, or null when it is a rule, an edge, or has no note of its own. */
export function lineCopy(m: MarkLike): string | null {
  if (m.shape !== 'line' || m.edge || !m.from || !m.to) return null
  const w = m.words ?? m.carries
  if (!w) return null
  if (RULE_NOTE.test(w)) return null
  return copyWords(w).length ? w : null
}

function distToSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const L = dx * dx + dy * dy
  const t = L ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L)) : 0
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)
}

/** Turn (deg) an element and its ancestors apply, from computed matrix() transforms. */
function turnOf(n: NodeLike, byId: Map<string, NodeLike>): number {
  let deg = 0
  for (let m: NodeLike | undefined = n, k = 0; m && k < 64; m = m.parent ? byId.get(m.parent) : undefined, k++) {
    const t = /matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)/.exec(m.style?.transform ?? '')
    if (t) deg += (Math.atan2(Number(t[2]), Number(t[1])) * 180) / Math.PI
  }
  return deg
}

const paints = (css: string | undefined) => {
  if (!css) return false
  if (/^transparent$/i.test(css)) return false
  const a = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(css)
  return !a || Number(a[1]) > 0.15
}

export function verifyTextLinesNotRules(marks: readonly MarkLike[], after: Snap, skip: ReadonlySet<string> = new Set()): RuleVerdict {
  // n62: a link drawn on a coloured line is meant to be underlined (linkline.ts)
  const lines = marks.filter((m) => lineCopy(m) !== null && !(m.strokeId && skip.has(m.strokeId)))
  if (!lines.length) return { satisfied: true, unverifiable: true, reason: 'no drawn lines carrying words' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const faults: string[] = []
  for (const m of lines) {
    const a = m.from!, z = m.to!
    const span = Math.abs(z.x - a.x)
    for (const n of after.nodes) {
      const r = n.rect
      const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }
      if (r.w < span * 0.4 || r.w > span * 1.6 + 40) continue
      let kind: string | null = null
      const empty = !(n.text ?? '').trim()
      if (empty) {
        // its own thickness: a turned bar's upright bounds grow by its width times the turn
        const turn = Math.abs(turnOf(n, byId)) * Math.PI / 180
        const own = r.h - r.w * Math.tan(Math.min(turn, 0.6))
        const thin = own <= 4.5
        if (n.tag === 'hr') kind = 'a rule (<hr>)'
        else if (thin && (paints(n.style?.backgroundColor) || !!n.style?.border || !!n.style?.borderBottom)) kind = 'a thin bar'
        if (kind && distToSeg(c, a, z) > 18) kind = null
      } else if (n.style?.borderBottom && distToSeg({ x: c.x, y: r.y + r.h }, a, z) <= 22) {
        kind = 'an underline (bottom border) under the words'
      } else if (/underline/.test(n.style?.textDecoration ?? '') && distToSeg({ x: c.x, y: r.y + r.h }, a, z) <= 22) {
        // n135: a heading on a drawn line came out as an underlined link (text-decoration), which this never saw
        kind = 'an underline (text-decoration) under the words'
      }
      if (!kind) continue
      faults.push(`the line drawn from (${String(Math.round(a.x))},${String(Math.round(a.y))}) to (${String(Math.round(z.x))},${String(Math.round(z.y))}) stands for the words "${lineCopy(m)!}" ` +
        `but a <${n.tag}> ${String(Math.round(r.w))}px wide at (${String(Math.round(r.x))},${String(Math.round(r.y))}) paints ${kind} along it: ` +
        `the drawn line only says where those words sit; remove that rule${kind.startsWith('an underline') ? ' (no bottom border, text-decoration none; a heading, not a link)' : ''} and keep the words`)
      break
    }
  }
  return faults.length
    ? { satisfied: false, reason: faults.join('; ') }
    : { satisfied: true, reason: `${String(lines.length)} line${lines.length > 1 ? 's' : ''} drawn for words built as words, no rules` }
}

/**
 * A part drawn once, in the first of a set, is a part every member has (n112).
 *
 * Round 38 e4 (job board, n108/n111): five same-size job cards drawn one under another, a small green box typed
 * "Apply" drawn inside the FIRST card only. Every build put Apply on card 1 alone. Round 38 e2 (contacts): a list
 * panel typed with ten "name company" rows and a small ring drawn at the top left of the panel (the first row's
 * avatar). The build turned the ring into a search icon; no row got an avatar. A person draws a repeated part once,
 * in the first member, and means every member has it.
 *
 * Here, from the drawing alone:
 * - SET: three or more like-sized boxes lined up (a column or a row), one not inside another. A small box or ring
 *   inside the first member, with nothing like it at the same spot in any other member, is built in every member
 *   at the same offset, same size, same label.
 * - LIST: a big box with a note typed in it that lists three or more rows (split by ";"), and a small ring or box
 *   with no words of its own in its top left: the first row's leading part (an avatar, an icon, a checkbox),
 *   built at the start of every row.
 * Not when the part's note says it is one of a kind (only, featured, popular, selected, current...).
 * Told to codegen and checked on the page. Zero tokens.
 */
import type { BBox } from '@s2c/ink'
import type { ShapeMark } from './shapemark.js'
import { checklistOf } from './checklist.js'

export interface DrawnOnce {
  kind: 'set' | 'list'
  part: ShapeMark
  /** set: the members in order (first holds the part); list: the one box holding the rows. */
  members: ShapeMark[]
  /** set: the part's offset from its member's top left. */
  dx: number
  dy: number
  label: string | null
  /** list: how many rows the note gives. */
  rows?: number
  axis?: 'column' | 'row'
}

const r1 = (v: number) => Math.round(v)
const ratio = (a: number, b: number) => Math.max(a, b) / Math.max(1, Math.min(a, b))
const centre = (b: BBox) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
const within = (b: BBox, p: { x: number; y: number }, pad = 2) => p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad
const holds = (a: BBox, b: BBox) => b.x >= a.x - 2 && b.y >= a.y - 2 && b.x + b.w <= a.x + a.w + 2 && b.y + b.h <= a.y + a.h + 2
const closed = (m: ShapeMark) => (m.shape === 'box' || m.shape === 'ellipse') && !m.glyph && !m.tilt && !m.area && !m.outline

/** Words that make a part one of a kind: never repeated. */
const ONE_OFF = /\b(only|featured|popular|selected|active|current|best|recommended|highlight(?:ed)?|chosen|winner|top pick|sale|limited)\b/i

/** Rows a note lists: "Amara Okafor Northwind; Ben Hollis Acme Co; ..." → 10. Null unless three or more. */
export function listedRows(text: string): number | null {
  const parts = text.split(';').map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s))
  return parts.length >= 3 ? parts.length : null
}

/** Sets of 3+ like-sized boxes lined up one under another (or side by side), none inside another. */
function sets(marks: ShapeMark[]): Array<{ members: ShapeMark[]; axis: 'column' | 'row' }> {
  const big = marks.filter((m) => m.shape === 'box' && closed(m) && m.box.w >= 80 && m.box.h >= 40)
  const out: Array<{ members: ShapeMark[]; axis: 'column' | 'row' }> = []
  const used = new Set<string>()
  for (const axis of ['column', 'row'] as const) {
    for (const a of big) {
      if (used.has(a.strokeId)) continue
      const like = big.filter((b) => !used.has(b.strokeId) && ratio(a.box.w, b.box.w) <= 1.15 && ratio(a.box.h, b.box.h) <= 1.2 &&
        (axis === 'column' ? Math.abs(a.box.x - b.box.x) <= 20 : Math.abs(a.box.y - b.box.y) <= 20))
      if (like.length < 3) continue
      if (like.some((x) => like.some((y) => x !== y && holds(x.box, y.box)))) continue
      like.sort((x, y) => axis === 'column' ? x.box.y - y.box.y : x.box.x - y.box.x)
      // members follow one another without big holes (a set, not two far-off boxes of one size)
      const pitch = like.slice(1).map((m, i) => axis === 'column' ? m.box.y - like[i]!.box.y : m.box.x - like[i]!.box.x)
      if (Math.max(...pitch) > Math.min(...pitch) * 1.6 + 8) continue
      for (const m of like) used.add(m.strokeId)
      out.push({ members: like, axis })
    }
  }
  return out
}

/** Find the parts drawn only in the first member of a set, and the leading part of a typed list's first row. */
export function partsDrawnOnce(marks: ShapeMark[]): DrawnOnce[] {
  const out: DrawnOnce[] = []
  const small = marks.filter((m) => closed(m))
  const taken = new Set<string>()
  for (const { members, axis } of sets(marks)) {
    const ids = new Set(members.map((m) => m.strokeId))
    const first = members[0]!
    const fa = first.box.w * first.box.h
    for (const p of small) {
      if (ids.has(p.strokeId) || taken.has(p.strokeId)) continue
      if (p.box.w * p.box.h > fa * 0.35) continue
      const c = centre(p.box)
      const holders = members.filter((m) => within(m.box, c))
      if (holders.length !== 1 || holders[0] !== first) continue
      if (p.own && ONE_OFF.test(p.own)) continue
      const dx = p.box.x - first.box.x, dy = p.box.y - first.box.y
      const tol = Math.max(16, p.box.w * 0.3, p.box.h * 0.3)
      // anything like it at the same spot in another member: the set already repeats it (or it is a one-off pattern)
      const elsewhere = members.slice(1).some((m) => small.some((q) => q !== p && !ids.has(q.strokeId) &&
        Math.abs(q.box.x - m.box.x - dx) <= tol && Math.abs(q.box.y - m.box.y - dy) <= tol &&
        ratio(q.box.w, p.box.w) <= 1.8 && ratio(q.box.h, p.box.h) <= 1.8))
      if (elsewhere) continue
      taken.add(p.strokeId)
      out.push({ kind: 'set', part: p, members, dx: r1(dx), dy: r1(dy), label: p.own ?? null, axis })
    }
  }
  // a big box with a typed list of rows and a lone small mark in its top left
  for (const h of marks) {
    if (h.shape !== 'box' || !closed(h) || h.box.w < 200 || h.box.h < 150) continue
    const rows = Math.max(0, ...(h.typed ?? []).map((t) => checklistOf(t.text) ? 0 : listedRows(t.text) ?? 0))
    if (!rows) continue
    const rowH = h.box.h / rows
    for (const p of small) {
      if (p === h || taken.has(p.strokeId) || p.own) continue
      if (!holds(h.box, p.box) || p.box.w > h.box.w * 0.2 || p.box.h > Math.max(60, rowH * 1.6)) continue
      // in the first row's band and the box's left third: the first row's leading part
      if (p.box.y - h.box.y > Math.max(rowH * 1.5, 70) || p.box.x - h.box.x > h.box.w / 3) continue
      // another small mark like it lower down the box means the rows were drawn: not a lone first-row part
      if (small.some((q) => q !== p && q !== h && holds(h.box, q.box) && q.shape === p.shape && ratio(q.box.w, p.box.w) <= 1.5 &&
        Math.abs(q.box.x - p.box.x) <= 20 && q.box.y > p.box.y + p.box.h)) continue
      taken.add(p.strokeId)
      out.push({ kind: 'list', part: p, members: [h], dx: r1(p.box.x - h.box.x), dy: r1(p.box.y - h.box.y), label: null, rows })
    }
  }
  return out
}

const what = (m: ShapeMark) => `${m.shape === 'ellipse' ? 'ring' : 'box'} at (${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}`

export function drawnOnceBrief(actions: Array<{ shapeMarks?: ShapeMark[]; onScreen?: unknown }>): string {
  const found = partsDrawnOnce(actions.flatMap((a) => a.onScreen ? [] : a.shapeMarks ?? []))
  if (!found.length) return ''
  const lines = found.map((d) => d.kind === 'set'
    ? `- The small ${what(d.part)}${d.label ? ` (typed "${d.label}")` : ''} is drawn only inside the FIRST of ${d.members.length} like-sized boxes ` +
      `${d.axis === 'row' ? 'side by side' : 'one under another'} (${d.members.map((m) => `(${m.box.x},${m.box.y}) ${m.box.w}x${m.box.h}`).join('; ')}). ` +
      `A person draws a part every member has once, in the first. Build it in EVERY one of the ${d.members.length}: the same element ` +
      `${d.label ? `with the same label "${d.label}" ` : ''}at the same spot in each (${d.dx}px from its left edge, ${d.dy}px from its top), ` +
      `the same size, colour and style. Never only in the first; each member keeps its own other words.`
    : `- The small ${what(d.part)} with no words of its own sits at the top left of the box at (${d.members[0]!.box.x},${d.members[0]!.box.y}) ` +
      `${d.members[0]!.box.w}x${d.members[0]!.box.h}, whose note lists ${d.rows} rows: it is the FIRST ROW's leading part (an avatar circle or icon, ` +
      `in its drawn shape and colour), and EVERY one of the ${d.rows} rows starts with the same part, about ${d.part.box.w}x${d.part.box.h}, left of the row's words. ` +
      `It is not a search icon, a header or a separate row.`)
  return `PARTS DRAWN ONCE (deterministic, from the drawing; checked on the page):\n${lines.join('\n')}\n\n`
}

interface NodeLike { id: string; tag?: string; text?: string; rect: BBox; textBox?: BBox }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface DrawnOnceVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Is a part like d.part built at (x, y) (its top left), as an element of about its size (or its label's text)? */
function builtAt(d: DrawnOnce, nodes: NodeLike[], x: number, y: number): boolean {
  const p = d.part.box
  const want = { x: x + p.w / 2, y: y + p.h / 2 }
  const tx = Math.max(28, p.w * 0.6), ty = Math.max(18, p.h * 0.7)
  return nodes.some((n) => {
    const b = n.rect
    if (b.w <= 0 || b.h <= 0) return false
    const c = centre(b)
    if (Math.abs(c.x - want.x) > tx || Math.abs(c.y - want.y) > ty) return false
    if (d.label) return norm(n.text ?? '').includes(norm(d.label)) && b.w <= p.w * 3 && b.h <= p.h * 3
    return ratio(b.w, p.w) <= 2.2 && ratio(b.h, p.h) <= 2.2
  })
}

export function verifyDrawnOnce(marks: ShapeMark[], after: Snap): DrawnOnceVerdict {
  const found = partsDrawnOnce(marks)
  if (!found.length) return { satisfied: true, unverifiable: true, reason: 'no parts drawn once in a set' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const d of found) {
    if (d.kind === 'set') {
      const miss = d.members.filter((m) => !builtAt(d, after.nodes, m.box.x + d.dx, m.box.y + d.dy))
      if (miss.length) faults.push(`the ${d.label ? `"${d.label}" ` : ''}part drawn in the first of ${d.members.length} like boxes is missing from ${miss.length} of them ` +
        `(${miss.map((m) => `the box at (${m.box.x},${m.box.y})`).join(', ')}): build the same ${d.label ? `"${d.label}" ` : ''}element in each, ${d.dx}px from its left and ${d.dy}px from its top, the same size and look, changing nothing else`)
    } else {
      // rows: elements about the part's size, lined up in a column near the part's x, inside the box
      const h = d.members[0]!.box, p = d.part.box
      const col = after.nodes.filter((n) => n.rect.w > 0 && within(h, centre(n.rect), 4) && Math.abs(centre(n.rect).x - (p.x + p.w / 2)) <= Math.max(30, p.w) &&
        ratio(n.rect.w, p.w) <= 2 && ratio(n.rect.h, p.h) <= 2 && !(n.text ?? '').trim())
      const ys = [...new Set(col.map((n) => r1(centre(n.rect).y / 8)))]
      const need = Math.max(3, Math.ceil(d.rows! * 0.8))
      if (ys.length < need) faults.push(`the ${d.part.shape === 'ellipse' ? 'ring' : 'box'} drawn at the start of the first row is the leading part of every one of the ${d.rows} rows, but only ${ys.length} row${ys.length === 1 ? ' has' : 's have'} one: ` +
        `start each row with the same ${d.part.shape === 'ellipse' ? 'circle' : 'square'} about ${p.w}x${p.h}, left of its words, changing nothing else`)
    }
  }
  return faults.length ? { satisfied: false, reason: faults.join('; ') } : { satisfied: true, reason: `${found.length} part${found.length > 1 ? 's' : ''} drawn once built on every member` }
}

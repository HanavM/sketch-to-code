/**
 * Where, inside a row or a column, a drawn insert goes (s2c-055).
 *
 * A caret under the gap between "Features" and "Pricing" says WHERE the new
 * link goes, and nothing downstream carried that. The reading names the
 * container ("add a link to the nav, into it") and the strokes' bounding box;
 * codegen got a box 18 px wide and a container, and both times it ran it put
 * "Blog" at the end of the nav. Verification only asked whether something new
 * appeared within ~120 px of the mark, which the end of a short nav is, so the
 * bar said "Done" about an insert in the wrong place (s2c-013, r14).
 *
 * The slot is computed here from geometry, never asked of the model: the
 * container whose children run along one axis, and the two consecutive
 * children the mark sits between. Codegen is told the two neighbours by source
 * location, and verification checks that what was added really landed between
 * them on the page.
 *
 * s2c-059: a grid that wraps onto several rows is searched row by row (the
 * mark must sit inside one row's band; the strip between two rows is no
 * slot), and the tick compares reading order (rows top to bottom, then left
 * to right), not x: a tile inserted mid-row pushes the last one onto the next
 * row, and comparing x called that correct insert wrong.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'

type Box = { x: number; y: number; w: number; h: number }

export interface SlotNeighbour {
  domId: string
  srcLoc: string | null
  tag: string
  /** Own + descendant text, how the user knows it on the screen. */
  text: string
  rect: Box
}

export interface InsertSlot {
  /** row: children left to right; column: top to bottom; grid: rows of a
   *  wrapping grid, the slot is between two tiles of one row. */
  axis: 'row' | 'column' | 'grid'
  container: { domId: string; srcLoc: string | null; tag: string }
  /** The child the new element goes right AFTER (in reading order). */
  after: SlotNeighbour
  /** The child the new element goes right BEFORE. */
  before: SlotNeighbour
}

const childrenMap = (snap: DomSnapshot): Map<string, DomNode[]> => {
  const m = new Map<string, DomNode[]>()
  for (const n of snap.nodes) {
    if (!n.parent) continue
    const list = m.get(n.parent) ?? []
    list.push(n)
    m.set(n.parent, list)
  }
  return m
}

const textOf = (n: DomNode, kids: Map<string, DomNode[]>): string => {
  let out = n.text
  const stack = [...(kids.get(n.id) ?? [])].reverse()
  while (stack.length && out.length < 60) {
    const c = stack.pop()!
    if (c.text) out += (out ? ' ' : '') + c.text
    stack.push(...[...(kids.get(c.id) ?? [])].reverse())
  }
  return out.slice(0, 60)
}

const inFlow = (n: DomNode) =>
  n.rect.w > 0 && n.rect.h > 0 && n.style.position !== 'absolute' && n.style.position !== 'fixed'

/** Children laid out along one axis without overlapping on it, or null. */
function axisOf(children: DomNode[]): 'row' | 'column' | null {
  if (children.length < 2) return null
  const runs = (key: 'x' | 'y', size: 'w' | 'h') => {
    const s = [...children].sort((a, b) => a.rect[key] - b.rect[key])
    for (let i = 1; i < s.length; i++) {
      if (s[i]!.rect[key] < s[i - 1]!.rect[key] + s[i - 1]!.rect[size] - 1) return false
    }
    return true
  }
  // a row also shares a band: every child overlaps the first vertically
  const shareBand = (key: 'x' | 'y', size: 'w' | 'h') => {
    const f = children[0]!
    return children.every((c) => c.rect[key] < f.rect[key] + f.rect[size] && f.rect[key] < c.rect[key] + c.rect[size])
  }
  if (runs('x', 'w') && shareBand('y', 'h')) return 'row'
  if (runs('y', 'h') && shareBand('x', 'w')) return 'column'
  return null
}

/** Children in reading order: rows (by shared vertical band) top to bottom,
 *  each left to right. A column is one child per row; a row is one row. */
function readingRows(children: DomNode[]): DomNode[][] {
  const rows: DomNode[][] = []
  for (const c of [...children].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)) {
    const row = rows[rows.length - 1]
    const f = row?.[0]
    if (f && c.rect.y < f.rect.y + f.rect.h && f.rect.y < c.rect.y + c.rect.h) row!.push(c)
    else rows.push([c])
  }
  for (const r of rows) r.sort((a, b) => a.rect.x - b.rect.x)
  return rows
}

const readingOrder = (children: DomNode[]) => readingRows(children).flat()

/** The rows of a wrapping grid (two or more rows, the first with two or more
 *  tiles, each row a clean row, rows not overlapping), or null. */
function gridRows(children: DomNode[]): DomNode[][] | null {
  if (children.length < 3) return null
  const rows = readingRows(children)
  if (rows.length < 2 || rows[0]!.length < 2) return null
  for (const r of rows) if (r.length > 1 && axisOf(r) !== 'row') return null
  for (let i = 1; i < rows.length; i++) {
    const top = Math.min(...rows[i]!.map((k) => k.rect.y))
    if (rows[i - 1]!.some((k) => k.rect.y + k.rect.h > top + 1)) return null
  }
  return rows
}

const isWithin = (snap: Map<string, DomNode>, n: DomNode, rootId: string): boolean => {
  let cur: DomNode | undefined = n
  while (cur) {
    if (cur.id === rootId) return true
    cur = cur.parent ? snap.get(cur.parent) : undefined
  }
  return false
}

/**
 * The gap a drawn insert mark sits in, or undefined when it sits in no gap
 * (on top of a child, outside every row/column, or in a container with fewer
 * than two children, where "at the end" and "here" are the same thing).
 *
 * `dest`, when the reading named one, limits the search to that element and
 * what is inside it (the reading's container may be the nav while the row is
 * the link group inside it).
 */
export function findInsertSlot(snap: DomSnapshot, region: Box, destId?: string): InsertSlot | undefined {
  if (snap.truncated) return undefined
  const byId = new Map(snap.nodes.map((n) => [n.id, n]))
  const kids = childrenMap(snap)
  const cx = region.x + region.w / 2
  const cy = region.y + region.h / 2
  let best: { slot: InsertSlot; area: number } | undefined
  const n = (x: DomNode): SlotNeighbour => ({
    domId: x.id, srcLoc: x.srcLoc, tag: x.tag, text: textOf(x, kids), rect: x.rect,
  })
  /** The two consecutive children of `line` the mark's centre sits between.
   *  pad < 0: the mark's centre must be inside the band (grid rows). */
  const gapIn = (axis: 'row' | 'column', line: DomNode[], pad: number) => {
    const [along, size, across, acrossSize] = axis === 'row'
      ? (['x', 'w', 'y', 'h'] as const)
      : (['y', 'h', 'x', 'w'] as const)
    const centre = axis === 'row' ? cx : cy
    const lo = Math.min(...line.map((k) => k.rect[across]))
    const hi = Math.max(...line.map((k) => k.rect[across] + k.rect[acrossSize]))
    if (pad >= 0) {
      if (region[across] + region[acrossSize] < lo - pad || region[across] > hi + pad) return undefined
    } else {
      const mid = axis === 'row' ? cy : cx
      if (mid < lo || mid > hi) return undefined
    }
    const sorted = [...line].sort((a, b) => a.rect[along] - b.rect[along])
    for (let i = 0; i + 1 < sorted.length; i++) {
      const a = sorted[i]!
      const b = sorted[i + 1]!
      const gapLo = a.rect[along] + a.rect[size]
      const gapHi = b.rect[along]
      // the centre of the mark in the gap (a few px either way: a hurried caret)
      const slack = 4
      if (centre < gapLo - slack || centre > gapHi + slack) continue
      // and most of the mark not on either neighbour: a box drawn over a link
      // is about the link, not about the space next to it
      const markLen = Math.max(1, region[size])
      const overA = Math.max(0, gapLo - region[along])
      const overB = Math.max(0, region[along] + region[size] - gapHi)
      if (Math.min(overA, markLen) > markLen * 0.5 || Math.min(overB, markLen) > markLen * 0.5) continue
      return { after: n(a), before: n(b) }
    }
    return undefined
  }
  for (const c of snap.nodes) {
    if (destId && !isWithin(byId, c, destId)) continue
    const children = (kids.get(c.id) ?? []).filter(inFlow)
    const axis = axisOf(children)
    // the runs of children to look for a gap in: the one row/column, or each
    // row of a wrapping grid (s2c-059)
    let lines: { axis: 'row' | 'column'; kids: DomNode[]; pad: number }[]
    let slotAxis: InsertSlot['axis']
    if (axis) {
      // across the axis the mark must touch the row's band, with a little room:
      // a caret is drawn UNDER the line it inserts into, its apex at the text
      const acrossSize = axis === 'row' ? 'h' : 'w'
      lines = [{ axis, kids: children, pad: Math.max(12, c.rect[acrossSize] * 0.5) }]
      slotAxis = axis
    } else {
      const rows = gridRows(children)
      if (!rows) continue
      // in a grid the strip between two rows belongs to neither: no room
      lines = rows.filter((r) => r.length > 1).map((r) => ({ axis: 'row' as const, kids: r, pad: -0.5 }))
      slotAxis = 'grid'
    }
    for (const line of lines) {
      const slot = gapIn(line.axis, line.kids, line.pad)
      if (!slot) continue
      const area = c.rect.w * c.rect.h
      if (!best || area < best.area) {
        best = { slot: { axis: slotAxis, container: { domId: c.id, srcLoc: c.srcLoc, tag: c.tag }, ...slot }, area }
      }
      break
    }
  }
  return best?.slot
}

export interface SlotVerdict {
  satisfied: boolean
  /** Neither neighbour could be found afterwards: nothing to measure against. */
  unverifiable?: boolean
  reason: string
}

const quote = (s: string) => `"${s.length > 30 ? `${s.slice(0, 29)}…` : s}"`

/**
 * Did what was added land between the two neighbours?
 *
 * Found by text, not id: ids are per snapshot. The new things are the
 * container's children (the parent the two neighbours share afterwards) that
 * were not among its children before, compared by tag + text as a multiset,
 * so a new link that looks exactly like its siblings still counts as new.
 */
export function verifyInsertSlot(slot: InsertSlot, before: DomSnapshot, after: DomSnapshot): SlotVerdict {
  const kidsA = childrenMap(after)
  const kidsB = childrenMap(before)
  const keyA = (n: DomNode) => `${n.tag}|${textOf(n, kidsA)}`
  const keyB = (n: DomNode) => `${n.tag}|${textOf(n, kidsB)}`
  const find = (nb: SlotNeighbour) =>
    after.nodes.filter((n) => n.tag === nb.tag && textOf(n, kidsA) === nb.text)
  const as = find(slot.after)
  const bs = find(slot.before)
  // the pair that still shares a parent (a page can repeat a word elsewhere)
  let pair: [DomNode, DomNode] | undefined
  for (const a of as) for (const b of bs) if (!pair && a.parent && a.parent === b.parent) pair = [a, b]
  if (!pair) {
    return { satisfied: true, unverifiable: true, reason: `${quote(slot.after.text)} and ${quote(slot.before.text)} are no longer side by side, so where the new item went can't be checked` }
  }
  const [a, b] = pair
  const oldKids = kidsB.get(slot.container.domId) ?? []
  const remaining = new Map<string, number>()
  for (const k of oldKids) remaining.set(keyB(k), (remaining.get(keyB(k)) ?? 0) + 1)
  const siblings = (kidsA.get(a.parent!) ?? []).filter(inFlow)
  const fresh: DomNode[] = []
  for (const s of siblings) {
    const k = keyA(s)
    const c = remaining.get(k) ?? 0
    if (c > 0) remaining.set(k, c - 1)
    else fresh.push(s)
  }
  if (fresh.length === 0) {
    return { satisfied: false, reason: `nothing new appeared between ${quote(slot.after.text)} and ${quote(slot.before.text)}` }
  }
  // reading order, not x or y alone: in a wrapping grid a tile inserted
  // mid-row pushes the next one onto the row below (s2c-059)
  const order = readingOrder(siblings)
  const ia = order.indexOf(a)
  const ib = order.indexOf(b)
  const lo = Math.min(ia, ib)
  const hi = Math.max(ia, ib)
  const between = fresh.find((f) => order.indexOf(f) > lo && order.indexOf(f) < hi)
  const name = (f: DomNode) => {
    const t = textOf(f, kidsA)
    return t ? quote(t) : `new <${f.tag}>`
  }
  if (between) {
    return { satisfied: true, reason: `the new ${name(between)} is between ${quote(slot.after.text)} and ${quote(slot.before.text)}` }
  }
  const f = fresh[0]!
  // say where it went instead, in terms of what it now sits next to
  const at = order.indexOf(f)
  const prev = at > 0 ? order[at - 1] : undefined
  const next = at < order.length - 1 ? order[at + 1] : undefined
  const where = prev
    ? `after ${quote(textOf(prev, kidsA))}`
    : next ? `before ${quote(textOf(next, kidsA))}` : 'somewhere else'
  return {
    satisfied: false,
    reason: `the new ${name(f)} went ${where}, not between ${quote(slot.after.text)} and ${quote(slot.before.text)} where it was drawn`,
  }
}

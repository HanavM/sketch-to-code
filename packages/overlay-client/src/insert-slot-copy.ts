/**
 * The gap a caret sits in: a copy of the pipeline's findInsertSlot
 * (packages/pipeline/src/insert-slot.ts, s2c-055/059), for the pending
 * preview at pen lift. Copied, not imported: the overlay bundle can't take
 * the pipeline package. tests/preview.test.ts holds the two together on the
 * same snapshots, so the preview marks the gap the run will insert into.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'

type Box = { x: number; y: number; w: number; h: number }

export interface SlotNeighbour {
  domId: string
  srcLoc: string | null
  tag: string
  text: string
  rect: Box
}

export interface InsertSlot {
  axis: 'row' | 'column' | 'grid'
  container: { domId: string; srcLoc: string | null; tag: string }
  after: SlotNeighbour
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

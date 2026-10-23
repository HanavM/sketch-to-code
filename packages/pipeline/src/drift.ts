import type { DomNode, DomSnapshot } from '@s2c/dom'

/**
 * A page built from a drawing keeps its blocks at their drawn heights.
 *
 * The placement check passes a block anywhere within ~120px of where it was
 * drawn, so a build that adds its own padding, a taller header and wider row
 * gaps passes every action while each block lands 10-40px lower than the one
 * before it (round 7 e1 kanban: column heads +13px, lane rule +17px, first
 * cards +41px, the second lane +42px; likeness 36% with everything present).
 * The codegen contract already asks for tops within ~16px of region.y; this
 * check measures it and, when blocks drift, names each one with its built
 * and drawn top so a repair turn can take the extra space out.
 *
 * Only for whole-page builds (6+ placed add/design actions). Each drawn block
 * is matched to the new element of about its x and width (and a plausible
 * height) whose top is nearest its drawn top: a conservative match, it can
 * only under-report. Thin text-line regions compare centres, since a line box
 * is taller than the squiggle drawn for it. Zero tokens.
 */
type Box = { x: number; y: number; w: number; h: number }

export interface DriftVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
  offsets: Array<{ index: number; drawn: number; built: number; dy: number }>
}

export const DRIFT_TOLERANCE_PX = 16

const styleKey = (n: DomNode): string => JSON.stringify([n.tag, n.text, n.classes, n.style])

function freshNodes(before: DomSnapshot, after: DomSnapshot): DomNode[] {
  const count = new Map<string, number>()
  for (const n of before.nodes) count.set(styleKey(n), (count.get(styleKey(n)) ?? 0) + 1)
  const out: DomNode[] = []
  for (const n of after.nodes) {
    const k = styleKey(n)
    const c = count.get(k) ?? 0
    if (c > 0) count.set(k, c - 1)
    else out.push(n)
  }
  return out
}

/** Built top (or, for a thin text line, centre) of the element standing for a drawn block, or null. */
export function matchTop(fresh: DomNode[], r: Box, quote?: string | null): { y: number; drawn: number } | null {
  const thin = r.h < 24
  const drawn = thin ? r.y + r.h / 2 : r.y
  let best: DomNode | null = null
  let bestD = Infinity
  // a block whose words quote its copy is matched by that copy first: matching by size alone picked a neighbour
  // near the drawn top (round 7 e4: the size row matched a wrapper 7px off while it sat 91px low, and the blocks
  // then read as off both ways, so the drift went unreported)
  const q = (quote ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (q.length >= 2) {
    for (const n of fresh) {
      if (n.rect.w <= 0 || n.rect.h <= 0 || !n.text) continue
      if (!n.text.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(q.slice(0, 24))) continue
      if (n.rect.x < r.x - Math.max(16, 0.1 * r.w) || n.rect.x > r.x + r.w) continue
      const c = thin || n.rect.h < 24
      const d = Math.abs((c ? n.rect.y + n.rect.h / 2 : n.rect.y) - (c ? r.y + r.h / 2 : r.y))
      if (d > 160) continue
      if (d < bestD) { bestD = d; best = n }
    }
    if (best) {
      const c = thin || best.rect.h < 24
      return { y: c ? best.rect.y + best.rect.h / 2 : best.rect.y, drawn: c ? r.y + r.h / 2 : r.y }
    }
  }
  for (const n of fresh) {
    if (n.rect.w <= 0 || n.rect.h <= 0) continue
    if (Math.abs(n.rect.x - r.x) > Math.max(16, 0.1 * r.w)) continue
    if (Math.abs(n.rect.w - r.w) > Math.max(24, 0.2 * r.w)) continue
    if (n.rect.h < 0.5 * r.h - 4 || n.rect.h > 2.5 * r.h + 24) continue
    const y = thin ? n.rect.y + n.rect.h / 2 : n.rect.y
    const d = Math.abs(y - drawn)
    if (d > 160) continue
    if (d < bestD) { bestD = d; best = n }
  }
  if (!best) return null
  return { y: thin ? best.rect.y + best.rect.h / 2 : best.rect.y, drawn }
}

export const SHIFT_MIN_PX = 6
export const SHIFT_MEDIAN_PX = 8

/**
 * A whole block of the page moved the same way by a little under the drift tolerance (round 7 e1 n112 run 1: every
 * block under the top bar ~12-15px low, each inside 16px, so no repair ran and likeness fell 77 to 48%). Blocks at the
 * very top (y < 40, a top bar) are anchored and do not count. Fires only when 6+ blocks below it can be matched, two thirds of
 * them are off the same way by SHIFT_MIN_PX or more (n113 run: heads +6, cards 8-11px low, likeness 72 vs 77), and their median offset is SHIFT_MEDIAN_PX or more: a page built
 * in place scatters its offsets around zero, a shifted one does not.
 */
export function uniformShift(offsets: DriftVerdict['offsets']): string | null {
  const body = offsets.filter((o) => o.drawn >= 40)
  if (body.length < 6) return null
  const low = body.filter((o) => o.dy >= SHIFT_MIN_PX)
  const high = body.filter((o) => o.dy <= -SHIFT_MIN_PX)
  const same = low.length >= high.length ? low : high
  if (same.length * 3 < body.length * 2) return null
  const dys = body.map((o) => o.dy).sort((a, b) => a - b)
  const med = dys[Math.floor(dys.length / 2)] ?? 0
  if (Math.abs(med) < SHIFT_MEDIAN_PX) return null
  const way = med > 0 ? 'lower' : 'higher'
  const first = [...same].sort((a, b) => a.drawn - b.drawn)[0]
  if (!first) return null
  const list = [...same].sort((a, b) => a.drawn - b.drawn).slice(0, 6)
    .map((o) => `action ${o.index} top at ${o.built}px, drawn at ${o.drawn}px`)
  return (
    `${same.length} of ${body.length} blocks below the top all sit about ${Math.abs(med)}px ${way} than drawn, the same way: ` +
    `${list.join('; ')}. The whole page from action ${first.index} down is shifted by one extra (or missing) space above it ` +
    `(a taller bar, page padding, a margin under the header). Find that one space above action ${first.index} and ` +
    `${med > 0 ? 'take it out' : 'add it back'} so its top lands at ${first.drawn}px; everything under it moves with it. ` +
    `Change only that one spacing; never use a negative margin, negative top or absolute position. ` +
    `Do not change widths, colours or copy.`
  )
}

export function verifyPageDrift(
  before: DomSnapshot,
  after: DomSnapshot,
  placed: Array<{ index: number; region: Box; quote?: string | null }>,
): DriftVerdict {
  if (placed.length < 6) return { satisfied: true, unverifiable: true, reason: 'not a whole-page build', offsets: [] }
  if (before.truncated || after.truncated) {
    return { satisfied: true, unverifiable: true, reason: 'snapshot truncated', offsets: [] }
  }
  const fresh = freshNodes(before, after)
  const offsets: DriftVerdict['offsets'] = []
  for (const p of placed) {
    // full-page backdrops and very tall blocks are anchored at the page top anyway
    if (p.region.h > 0.8 * after.viewport.h && p.region.y < 40) continue
    const m = matchTop(fresh, p.region, p.quote)
    if (m) offsets.push({ index: p.index, drawn: Math.round(m.drawn), built: Math.round(m.y), dy: Math.round(m.y - m.drawn) })
  }
  if (offsets.length < 4) {
    return { satisfied: true, unverifiable: true, reason: `only ${offsets.length} blocks could be matched to their drawing`, offsets }
  }
  const off = offsets.filter((o) => Math.abs(o.dy) > DRIFT_TOLERANCE_PX)
  if (off.length < Math.max(3, Math.ceil(0.25 * offsets.length))) {
    const shift = uniformShift(offsets)
    if (shift) return { satisfied: false, reason: shift, offsets }
    return { satisfied: true, reason: `${offsets.length - off.length} of ${offsets.length} blocks within ${DRIFT_TOLERANCE_PX}px of their drawn top`, offsets }
  }
  const low = off.filter((o) => o.dy > 0).length
  // real drift runs one way and compounds down the page; blocks off in both directions are far more often a wrong
  // match than a wrong layout, and a repair turn chasing them cost round 7 e4 its 10-minute run (both n99 runs)
  if (low < off.length * 0.7 && low > off.length * 0.3) {
    return { satisfied: true, unverifiable: true, reason: `${off.length} blocks off in both directions: likely mismatched, not drift`, offsets }
  }
  const way = low >= off.length * 0.7 ? 'lower than drawn' : 'higher than drawn'
  const list = [...off].sort((a, b) => a.drawn - b.drawn).slice(0, 8)
    .map((o) => `action ${o.index} top at ${o.built}px, drawn at ${o.drawn}px (${Math.abs(o.dy)}px ${o.dy > 0 ? 'low' : 'high'})`)
  return {
    satisfied: false,
    reason:
      `${off.length} of ${offsets.length} blocks sit ${way}: ${list.join('; ')}. ` +
      `Take out the extra vertical space the drawing does not have (page/body padding, a taller bar, bigger margins or ` +
      `gaps between rows, line-height on thin lines) so each block's top lands within ${DRIFT_TOLERANCE_PX}px of its drawn y; ` +
      `fix it at the first block that is off, since every block under it moves with it. Remove space; never pull a block up with a ` +
        `negative margin, negative top or absolute position, which slides it over the heading or label above it. ` +
        `Do not change widths, colours or copy.`,
    offsets,
  }
}

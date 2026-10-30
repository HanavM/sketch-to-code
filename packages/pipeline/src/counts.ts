/**
 * Numbers the user typed are exact: "5 teams" is five, "24 numbered rows" is 24.
 *
 * Goal 2026-10-27, node n8. Hand-sketching the data grid (round 5 e5) with the
 * notes "spreadsheet grid A-H, 24 numbered rows" and "5 teams with budgets",
 * the build filled all 24 rows with invented teams. A person who types a count
 * means it, and a count of content inside a count of slots ("5 teams" in "24
 * rows") means the rest of the slots are there and EMPTY. Typing more words
 * ("only 5 filled, rows 6 to 24 blank") would fix that page and teach nothing,
 * so the count is read here, said to codegen as a rule, and checked on the
 * built page: a repeated group with exactly that many members, or with exactly
 * that many filled.
 */
import type { DomSnapshot, DomNode } from '@s2c/dom'
import { calendarOf } from './calendar.js'
import { buttonLabel } from './buttonlabel.js'

export interface CountClaim {
  n: number
  /** The plural noun as typed: "teams", "rows". */
  noun: string
  /** The words it came from, for messages. */
  quote: string
  /** A slot word (rows, cards, tabs...): the number of things, filled or not. */
  slots: boolean
}

const WORDS: Record<string, number> = {
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
}
// words for the container, not the content: "24 rows" are rows whether filled or not
const SLOT = /^(rows|columns|cols|cells|slots|lines|cards|tiles|boxes|items|tabs|steps|dots|seats|bars|blocks|panels|sections|columns?)$/
// plurals that are not things on the page
const NOT_THINGS = /^(px|pixels|pts|points|percent|times|minutes|seconds|hours|days|weeks|months|years|words|letters|strokes|ems|rems|colors|colours|shades)$/

export function countClaims(texts: readonly string[]): CountClaim[] {
  const out: CountClaim[] = []
  const seen = new Set<string>()
  const re = /(^|[^\w$#.,:/-])(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+((?:[a-z][a-z-]*\s+){0,2}?)([a-z]{3,}s)\b/gi
  for (const t of texts) {
    // n113: a calendar's day numbers ("12 and 16 magenta circles") and a button label ("Reserve · 4 nights") are not counts
    if (calendarOf(t) || buttonLabel(t)) continue
    for (const m of t.matchAll(re)) {
      const raw = m[2]!.toLowerCase()
      const n = /^\d/.test(raw) ? Number(raw) : WORDS[raw]!
      const noun = m[4]!.toLowerCase()
      if (!n || n < 2 || n > 60 || NOT_THINGS.test(noun)) continue
      // "with 3 colours", "over 5 years": not a count of page things
      const key = `${n} ${noun}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ n, noun, quote: `${m[2]} ${m[3] ?? ''}${m[4]}`.replace(/\s+/g, ' '), slots: SLOT.test(noun) })
    }
  }
  return out
}

/** The rule handed to codegen, or '' when nothing was counted. */
export function countsBrief(claims: CountClaim[]): string {
  if (!claims.length) return ''
  const lines = claims.map((c) => `- "${c.quote}": exactly ${c.n} ${c.noun}, no more, no fewer`)
  const slots = claims.filter((c) => c.slots)
  const content = claims.filter((c) => !c.slots)
  const nested = slots.flatMap((s) => content.filter((c) => c.n < s.n).map((c) => ({ s, c })))
  return `COUNTS THE USER TYPED (exact; never pad a list, grid or table with invented extra entries):\n${lines.join('\n')}\n` +
    (nested.length
      ? nested.map(({ s, c }) => `- ${c.n} ${c.noun} inside ${s.n} ${s.noun}: build all ${s.n} ${s.noun}; fill the first ${c.n} with ${c.noun}, and leave the other ${s.n - c.n} ${s.noun} EMPTY (blank cells, only their row number or outline).\n`).join('')
      : '') + '\n'
}

export interface CountVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
}

interface Group { parent: string; members: DomNode[]; filled: number }

/** Sibling runs of the same tag and about the same height: rows, cards, tabs. */
function groups(snap: DomSnapshot): Group[] {
  const kids = new Map<string, DomNode[]>()
  for (const n of snap.nodes) {
    if (!n.parent || n.rect.w <= 0 || n.rect.h <= 0) continue
    const k = kids.get(n.parent) ?? []
    k.push(n)
    kids.set(n.parent, k)
  }
  const below = new Map<string, DomNode[]>()
  const desc = (id: string): DomNode[] => {
    const hit = below.get(id)
    if (hit) return hit
    const out: DomNode[] = []
    for (const k of kids.get(id) ?? []) out.push(k, ...desc(k.id))
    below.set(id, out)
    return out
  }
  const out: Group[] = []
  for (const [parent, ks] of kids) {
    const byTag = new Map<string, DomNode[]>()
    for (const k of ks) byTag.set(k.tag, [...(byTag.get(k.tag) ?? []), k])
    for (const members of byTag.values()) {
      if (members.length < 2) continue
      const hs = members.map((m) => m.rect.h).sort((a, b) => a - b)
      const med = hs[hs.length >> 1]!
      const same = members.filter((m) => Math.abs(m.rect.h - med) <= Math.max(6, med * 0.5))
      if (same.length < 2) continue
      // filled: some text besides the member's own position number ("1".."24")
      const filled = same.filter((m, i) => [m, ...desc(m.id)].some((d) => {
        const t = d.text.trim()
        return t && t !== String(i + 1) && t !== String(i)
      })).length
      out.push({ parent, members: same, filled })
    }
  }
  return out
}

export function verifyCounts(claims: CountClaim[], after: DomSnapshot): CountVerdict {
  if (!claims.length) return { satisfied: true, unverifiable: true, reason: 'no counts typed' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const gs = groups(after)
  const misses: string[] = []
  let judged = 0
  for (const c of claims) {
    const exact = gs.some((g) => g.members.length === c.n || (!c.slots && g.filled === c.n))
    if (exact) { judged++; continue }
    // only a group clearly bigger than the count is evidence of padding;
    // nothing near the count at all may simply be a different structure
    const over = gs
      .filter((g) => (c.slots ? g.members.length : g.filled) > c.n && (c.slots ? g.members.length : g.filled) <= c.n * 6 + 6)
      .sort((a, b) => b.members.length - a.members.length)[0]
    if (!over) continue
    judged++
    const got = c.slots ? over.members.length : over.filled
    misses.push(`you typed "${c.quote}" but the page shows ${got} ${c.slots ? '' : 'filled '}${over.members[0]!.tag} rows/items in one group; ` +
      (c.slots ? `build exactly ${c.n}` : `fill exactly ${c.n} with ${c.noun} and leave the rest empty (no invented entries)`))
  }
  if (!judged) return { satisfied: true, unverifiable: true, reason: 'no group to count' }
  return misses.length
    ? { satisfied: false, reason: misses.join('; ') }
    : { satisfied: true, reason: `typed counts match (${claims.map((c) => c.quote).join(', ')})` }
}

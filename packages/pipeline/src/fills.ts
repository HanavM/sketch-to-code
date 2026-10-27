import type { DomNode, DomSnapshot } from '@s2c/dom'
import { deltaE, hexOf, parseCssColor, type Rgb } from './palette.js'

/**
 * Did the fills the user's words gave as exact hex reach the page?
 *
 * Round 7 e5 (n106-n108): the note said a pale grey (#f3f4f6) header row with
 * bg-[#f3f4f6] on every header cell; three builds in a row painted it white,
 * the interpreter's instruction paraphrased the tint away, and nothing
 * checked, so no repair turn ever asked for it. A typed hex is an exact
 * request and the built page's computed colours are observable, so this
 * measures it. Zero tokens.
 *
 * Two claims, both read from the words themselves:
 * - a header row fill: "(#hex) header row" or "bg-[#hex] on every header cell":
 *   every <th> in the action's region must paint that colour (itself or its row);
 * - a filled thing holding quoted copy: "dark blue (#1e3a8a) bulk-action bar,
 *   ... with "3 selected"": the element carrying that copy must sit on that fill
 *   (its own background or the nearest painted ancestor's).
 * A claim whose element can't be found is not judged (missing copy is another
 * check's failure); a gradient on the way up makes it unjudgeable too.
 */
export type FillClaim =
  | { kind: 'header'; hex: string }
  | { kind: 'quoted'; hex: string; noun: string; copy: string }
  | { kind: 'page'; hex: string }

const HEX = '#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3}\\b'
const HEADER_A = new RegExp(`\\((${HEX})\\)\\s+(?:[\\w-]+\\s+){0,2}?header row`, 'gi')
const HEADER_B = new RegExp(`bg-\\[(${HEX})\\] on every header cell`, 'gi')
const NOUNS = 'button|pill|badge|bar|tag|chip|band|banner|ribbon|card|panel|tile|sticker|label'
const QUOTED = new RegExp(
  `\\((${HEX})\\)\\s+(?:[\\w-]+\\s+){0,3}?(${NOUNS})\\b([^"“”;()]{0,80}?)["“]([^"”]{2,})["”]`,
  'gi',
)
// the copy first: "VARIABLE" ... heavy cream on a red-orange (#ff4f1f) band
const QUOTED_ON = new RegExp(
  `["“]([^"”]{2,})["”]([^"“”;()]{0,60}?)\\bon an? (?:[\\w-]+\\s+){0,3}?\\((${HEX})\\)\\s+(${NOUNS})\\b`,
  'gi',
)
// "whole page: pale grey (#f9fafb, plainly not white) page" / "black (#0a0a0a) page"
const PAGE = new RegExp(`whole page:[^;()]{0,40}?\\((${HEX})[^)]*\\)\\s*page\\b(?!\\s+with)`, 'gi')

const norm = (h: string) => hexOf(parseCssColor(h)!)

export function fillClaims(text: string): FillClaim[] {
  const out: FillClaim[] = []
  const seen = new Set<string>()
  const push = (c: FillClaim) => {
    const k = JSON.stringify(c)
    if (!seen.has(k)) { seen.add(k); out.push(c) }
  }
  for (const re of [HEADER_A, HEADER_B]) {
    for (const m of text.matchAll(re)) push({ kind: 'header', hex: norm(m[1]!) })
  }
  for (const m of text.matchAll(QUOTED)) {
    // "a white (#fff) card containing a dark (#111) button "Buy"": the copy belongs to the nearer fill
    if (/#[0-9a-f]{3,6}\b/i.test(m[3]!)) continue
    // "card 1200px wide ... header row ... "Name"": the quote is a table cell, not the card's own words
    if (/\b(?:header|row|column|table|list|grid)\b/i.test(m[3]!)) continue
    // "cream (#f3ead8) label text reading "ORDER"": the hex is the words' ink, not a fill (round 30 c5: the repair
    // turn painted a near-black button cream, so its cream words vanished)
    if (/^\s*(?:text|type|lettering|letters|words|copy|ink|font)\b/i.test(m[3]!)) continue
    push({ kind: 'quoted', hex: norm(m[1]!), noun: m[2]!.toLowerCase(), copy: m[4]!.trim() })
  }
  for (const m of text.matchAll(QUOTED_ON)) {
    if (/#[0-9a-f]{3,6}\b/i.test(m[2]!)) continue
    push({ kind: 'quoted', hex: norm(m[3]!), noun: m[4]!.toLowerCase(), copy: m[1]!.trim() })
  }
  for (const m of text.matchAll(PAGE)) push({ kind: 'page', hex: norm(m[1]!) })
  return out
}

type Box = { x: number; y: number; w: number; h: number }

/** The colour an element sits on: its own fill or the nearest painted ancestor's. null = unjudgeable. */
function paintedUnder(n: DomNode, byId: Map<string, DomNode>): Rgb | 'gradient' | null {
  let cur: DomNode | undefined = n
  for (let depth = 0; cur && depth < 8; depth++) {
    if (cur.style.backgroundImage) return 'gradient'
    const c = parseCssColor(cur.style.backgroundColor)
    if (c) return c
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return { r: 255, g: 255, b: 255 }
}

const WHITE: Rgb = { r: 255, g: 255, b: 255 }
/** How far off still counts as the asked fill: tight for a pale tint (white is ~4 away from #f3f4f6). */
function tolerance(want: Rgb): number {
  return Math.min(10, Math.max(1.5, 0.45 * deltaE(want, WHITE)))
}

const inside = (n: DomNode, r: Box, pad = 40) => {
  const cx = n.rect.x + n.rect.w / 2
  const cy = n.rect.y + n.rect.h / 2
  return cx >= r.x - pad && cx <= r.x + r.w + pad && cy >= r.y - pad && cy <= r.y + r.h + pad
}

export interface FillVerdict {
  satisfied: boolean
  unverifiable?: boolean
  reason: string
  checked: Array<{ claim: FillClaim; got: string; ok: boolean }>
}

export function verifyFills(after: DomSnapshot, claims: FillClaim[], region?: Box): FillVerdict {
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const pool = after.nodes.filter((n) => n.rect.w > 0 && n.rect.h > 0 && (!region || inside(n, region)))
  const checked: FillVerdict['checked'] = []
  const faults: string[] = []
  for (const claim of claims) {
    const want = parseCssColor(claim.hex)!
    const tol = tolerance(want)
    if (claim.kind === 'page') {
      // the deepest element spanning the page: what shows behind every block
      const vw = after.viewport.w
      const spans = after.nodes
        .filter((n) => n.rect.x <= 8 && n.rect.w >= 0.95 * vw && n.rect.h >= 0.8 * after.viewport.h)
        // a modal's scrim spans the page too, over it: the page is what sits in the flow
        .filter((n) => n.style.position !== 'fixed' && n.style.position !== 'absolute')
        .sort((a, b) => b.depth - a.depth)
      const n = spans[0]
      if (!n) continue
      const g = paintedUnder(n, byId)
      if (g === 'gradient' || g === null) continue
      const ok = deltaE(g, want) <= tol
      checked.push({ claim, got: hexOf(g), ok })
      if (!ok) {
        faults.push(
          `the page behind the blocks is ${hexOf(g)}, but the words ask for a ${claim.hex} page: set bg-[${claim.hex}] on the ` +
            `outermost page wrapper (min-h-screen, full width); change nothing else`,
        )
      }
      continue
    }
    if (claim.kind === 'header') {
      const ths = pool.filter((n) => n.tag === 'th')
      if (!ths.length) continue
      const got = ths.map((n) => paintedUnder(n, byId))
      if (got.some((g) => g === 'gradient' || g === null)) continue
      const off = (got as Rgb[]).filter((g) => deltaE(g, want) > tol)
      const ok = off.length <= ths.length * 0.25
      const shown = hexOf((off[0] ?? got[0]) as Rgb)
      checked.push({ claim, got: shown, ok })
      if (!ok) {
        faults.push(
          `the table's header cells paint ${shown}, but the words ask for a ${claim.hex} header row: put bg-[${claim.hex}] ` +
            `on every <th> (or the header <tr>), visibly tinted against the card; change nothing else`,
        )
      }
      continue
    }
    const q = claim.copy.replace(/\s+/g, ' ').toLowerCase().slice(0, 24)
    const holder = pool
      .filter((n) => n.text && n.text.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(q))
      .sort((a, b) => a.rect.w * a.rect.h - b.rect.w * b.rect.h)[0]
    if (!holder) continue
    const g = paintedUnder(holder, byId)
    if (g === 'gradient' || g === null) continue
    const ok = deltaE(g, want) <= tol
    checked.push({ claim, got: hexOf(g), ok })
    if (!ok) {
      faults.push(
        `"${claim.copy}" sits on ${hexOf(g)}, but the words ask for a ${claim.hex} ${claim.noun}: give that ${claim.noun} ` +
          `bg-[${claim.hex}] exactly; change nothing else`,
      )
    }
  }
  if (!checked.length) return { satisfied: true, unverifiable: true, reason: 'no typed fill could be matched to the page', checked }
  return {
    satisfied: faults.length === 0,
    reason: faults.length ? faults.join('; ') : `${checked.length} typed fill${checked.length > 1 ? 's' : ''} on the page`,
    checked,
  }
}

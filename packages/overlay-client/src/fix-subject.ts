/**
 * n39: a fix note that names a part only as a place ("one line, below heading") is not
 * about that part.
 *
 * Round 32 c2 (n37, try 1): the note "one line, below heading" was typed at the bottom
 * edge of the built heading, meaning the subtitle under it. Alt+N picked the element under
 * the pointer, the heading, and the fix put the heading on one line and ran it under the
 * big disc. On try 2 the same note landed on the subtitle only because the heading was
 * built a little smaller. Which part a fix changed was luck.
 *
 * Rule: when the words say where something goes relative to a named part ("below the
 * heading", "under the title", "next to the button"), and the point landed on that named
 * part, the note is about the nearest OTHER part instead. The chip's outline and status
 * line show the new pick at once, so a wrong one is still seen and dragged.
 */

export type Role = 'heading' | 'button' | 'nav' | 'logo' | 'image' | 'subtitle' | 'card'

const ROLE_WORDS: [RegExp, Role][] = [
  [/^(heading|headline|title|h1)$/, 'heading'],
  [/^(button|cta|btn)$/, 'button'],
  [/^(nav|navigation|menu|links)$/, 'nav'],
  [/^(logo|wordmark|brand)$/, 'logo'],
  [/^(image|picture|photo|disc|circle|ring|emblem)$/, 'image'],
  [/^(subtitle|subheading|tagline|blurb)$/, 'subtitle'],
  [/^(card|panel)$/, 'card'],
]

const REL = '(below|under|underneath|beneath|above|over|next to|beside|after|before|left of|right of|to the left of|to the right of)'

/** The part a note places something against, or null when it names none. */
export function placedAgainst(text: string): { rel: string; role: Role } | null {
  const m = new RegExp(`\\b${REL}\\s+(?:the\\s+|that\\s+|this\\s+)?(?:big\\s+|main\\s+)?([a-z0-9]+)`, 'i').exec(text)
  if (!m) return null
  const word = m[2]!.toLowerCase()
  for (const [re, role] of ROLE_WORDS) if (re.test(word)) return { rel: m[1]!.toLowerCase(), role }
  return null
}

/** What a built element looks like, enough to say whether it is the named part. */
export interface PartInfo {
  tag: string // lower case
  fontPx: number
  inNav: boolean
  isButtonish: boolean
  isImageish: boolean
}

export function isRole(p: PartInfo, role: Role): boolean {
  switch (role) {
    case 'heading': return /^h[1-3]$/.test(p.tag) || p.fontPx >= 32
    case 'button': return p.isButtonish
    case 'nav': return p.tag === 'nav' || p.inNav
    case 'image': return p.isImageish
    case 'subtitle': return p.tag === 'p' && p.fontPx < 32
    // a logo or a card is too loose to tell from the element alone: keep the pointer's pick
    case 'logo': case 'card': return false
  }
}

export interface Box { x: number; y: number; w: number; h: number }

/** Distance from a point to a box (0 inside). */
export function boxDist(b: Box, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w))
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h))
  return Math.hypot(dx, dy)
}

/**
 * Of the candidate parts (already stripped of the named part, its ancestors and its
 * descendants), the one the note is about: nearest to the point, within reach, and on the
 * side the words point to when they say one ("below heading" typed on the heading's lower
 * edge means a part under it, never the nav above). Null keeps the pointer's pick.
 */
export function pickOther<T extends { box: Box }>(
  cands: T[], at: { x: number; y: number }, rel: string, named: Box, reach = 90,
): T | null {
  const side = (c: Box): boolean => {
    const cy = c.y + c.h / 2, cx = c.x + c.w / 2
    const ny = named.y + named.h / 2, nx = named.x + named.w / 2
    // "below the heading" names the heading as the reference: the subject sits below it
    if (/below|under|beneath|after/.test(rel)) return cy > ny
    if (/above|over|before/.test(rel)) return cy < ny
    if (/left/.test(rel)) return cx < nx
    if (/right/.test(rel)) return cx > nx
    return true
  }
  let best: T | null = null, bd = Infinity
  for (const c of cands) {
    if (c.box.w < 4 || c.box.h < 4 || !side(c.box)) continue
    const d = boxDist(c.box, at.x, at.y)
    if (d <= reach && d < bd) { bd = d; best = c }
  }
  return best
}

/**
 * n43: what a built part already looks like, enough to tell whether a fix note asks for
 * something it already is.
 */
export interface PartLook {
  lines: number // rendered text lines
  weight: number // font-weight
  centred: boolean // text centred, or the box centred in its parent
  upper: boolean // shows in capitals
  italic: boolean
}

const NUM: Record<string, number> = { one: 1, single: 1, '1': 1, two: 2, '2': 2, three: 3, '3': 3, four: 4, '4': 4 }

/**
 * n43: a fix note that asks only for what the part already is ("one line, below heading" on
 * a subtitle that is already one line) has nothing to change. Round 32 c2 (n41 try 3): the
 * first build already had the subtitle on one line, and the fix still ran a paid round to
 * "change" it. Returns the plain reason ("already one line") when every clause of the note
 * is either a place ("below heading", "here") or a look the part already has; null when any
 * clause asks for something else, or is not understood (then the fix runs as before).
 */
export function alreadySo(text: string, look: PartLook): string | null {
  const clauses = text.toLowerCase().replace(/[.!]+$/, '').split(/\s*(?:,|;|\band\b|\+)\s*/).map((c) => c.trim()).filter(Boolean)
  if (clauses.length === 0) return null
  const have: string[] = []
  for (let c of clauses) {
    // a place, not a change: "below heading", "here", "this"
    if (placedAgainst(c) && new RegExp(`^${REL}\\b`).test(c)) continue
    if (/^(here|this|this one|that one|it)$/.test(c)) continue
    c = c.replace(/^(make it|keep it|should be|put it|keep|make|on|in|all on|fit on)\s+/, '').replace(/^(it'?s|is)\s+/, '')
    let m: RegExpExecArray | null
    if ((m = /^(one|single|1|two|2|three|3|four|4)[ -]lines?$/.exec(c)) || (m = /^(?:on\s+)?(one|single|1) ?row$/.exec(c))) {
      const n = NUM[m[1]!]!
      if (look.lines !== n) return null
      have.push(n === 1 ? 'one line' : `${String(n)} lines`); continue
    }
    if (/^(bold|bolder|heavy)$/.test(c)) { if (look.weight < 600) return null; have.push('bold'); continue }
    if (/^(not bold|regular weight|regular|light|thin)$/.test(c)) { if (look.weight >= 600) return null; have.push('not bold'); continue }
    if (/^(centred|centered|center|centre|in the middle|middle)$/.test(c)) { if (!look.centred) return null; have.push('centred'); continue }
    if (/^(uppercase|upper case|all caps|caps|capitals)$/.test(c)) { if (!look.upper) return null; have.push('in capitals'); continue }
    if (/^(italic|italics|slanted)$/.test(c)) { if (!look.italic) return null; have.push('italic'); continue }
    return null
  }
  return have.length ? `already ${have.join(', ')}` : null
}

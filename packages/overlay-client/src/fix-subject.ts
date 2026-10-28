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

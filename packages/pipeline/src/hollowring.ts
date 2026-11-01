/**
 * A ring noted as an arc, a track or progress is a HOLLOW ring, never a solid disc (n129).
 *
 * Round 39 e2 (smart home thermostat, "22° Heating, orange arc over grey track") and e3 (focus timer, "17:30 huge,
 * Session 2 of 4; red arc 3/4 on pink track"), 2 of 2: a ring drawn in a coloured pen with no tap was told "the ring
 * is filled with <pen colour>", so both came out as a big solid disc with the words on it; a 2-word fix "hollow
 * ring" made each right. A person who draws a ring in a coloured pen and calls it an arc, a track, a gauge or
 * progress has drawn the LINE of a ring, not a coloured-in disc: the pen colour is the arc, the inside is the
 * surface under it, and the words sit in the hole.
 *
 * Here, from the ring's own notes (typed on it, or bound to it): the ring is flagged hollow, its thickness is set
 * from its size (about 6% of the diameter, 8 to 28px), the share (3/4, 75%, 22 of 30) and the track colour are
 * read when typed. Zero tokens.
 */

/** Words that make a drawn ring a line, not a disc. */
export const RING_LINE = /\b(arcs?|track|progress|gauge|dial|hollow|ring|donut|doughnut|meter|countdown|outline|outlined)\b/i
/** Words that ask for the disc itself. */
const DISC = /\b(solid|filled|disc|disk|dot|blob|ball|avatar|button|badge|glow|glowing|sun|planet)\b/i

/**
 * n184: a pen with a clear hue (orange, yellow, teal), not a near-neutral writing pen (black, grey, white). A ring drawn
 * in one, with no tap, is a flat disc in that colour, even inside a depicted group (holds on a climbing wall).
 */
export function colouredPen(color: string | null | undefined): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(color ?? '')
  if (!m) return false
  const v = parseInt(m[1]!, 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
  return Math.max(r, g, b) - Math.min(r, g, b) >= 60
}

export function ringNoted(texts: readonly string[]): boolean {
  return texts.some((t) => RING_LINE.test(t) && !DISC.test(t.replace(/\bfilled\s+(?:arc|part|share)\b/gi, '')))
}

/** The arc's thickness for a ring this many px across. */
export function ringThickness(d: number): number {
  return Math.max(8, Math.min(28, Math.round(d * 0.06)))
}

/** The share of the ring the arc covers, when typed ("3/4", "75%", "22 of 30", "three quarters"), 0..1. */
export function ringShare(texts: readonly string[]): number | null {
  for (const raw of texts) {
    const t = raw.toLowerCase()
    if (!RING_LINE.test(t)) continue
    const words: Record<string, number> = { 'three quarters': 0.75, 'three-quarters': 0.75, half: 0.5, 'a quarter': 0.25, 'one quarter': 0.25, 'two thirds': 2 / 3, 'a third': 1 / 3 }
    // a fraction or percent next to the arc word wins over a time or a count elsewhere in the note
    const near = /\b(?:arcs?|progress|gauge|dial|ring)\b[^,;.]{0,24}/.exec(t)?.[0] ?? t
    for (const s of [near, t]) {
      const f = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b(?!\s*(?:am|pm|:))/.exec(s)
      if (f && Number(f[2]) > 0 && Number(f[1]) <= Number(f[2]) && !/session|of \d|step/.test(s.slice(Math.max(0, f.index - 10), f.index))) return Number(f[1]) / Number(f[2])
      const p = /\b(\d{1,3})\s*%/.exec(s)
      if (p && Number(p[1]) <= 100) return Number(p[1]) / 100
      for (const [w, v] of Object.entries(words)) if (s.includes(w)) return v
    }
  }
  return null
}

/** "orange arc over grey track" → "grey"; null when no track colour is typed. */
export function trackColour(texts: readonly string[]): string | null {
  for (const t of texts) {
    const m = /\b([a-z-]+)\s+track\b/i.exec(t)
    if (m && !/^(the|a|an|on|over|of|thin|thick)$/i.test(m[1]!)) return m[1]!.toLowerCase()
  }
  return null
}

/**
 * n204: a big ring drawn in a NEUTRAL pen (black, grey, white: a writing pen, not a hue) with no tap is an OUTLINE RING:
 * the drawn line, round, nothing inside it. Round 45 c4 (bike repair): two black rings for a bike's wheels, untapped,
 * built as black discs with yellow spokes, clipped flat at the top and bottom; a fix note "thick black outline rings
 * only, no fill or spokes" made rings but clipped their sides. Round 45 e3 (audio mixer): grey knob rings came out
 * filled discs. A tap is how this tool fills a mark, so an untapped neutral ring is its line. Not when its own note
 * asks for a disc, a picture or a dot (an avatar drawn as a circle stays a picture).
 */
const RING_DISC = /\b(solid|filled|fill|disc|disk|dot|blob|ball|avatar|photo|picture|image|portrait|logo|sun|planet|moon|glow|glowing|button)\b/i
export function neutralPen(color: string | null | undefined): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(color ?? '')
  if (!m) return false
  const v = parseInt(m[1]!, 16), r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255
  return Math.max(r, g, b) - Math.min(r, g, b) <= 28
}
export function outlineRingPen(color: string | null | undefined, box: { w: number; h: number }, own: readonly string[] = []): boolean {
  if (!neutralPen(color) || box.w < 44 || box.h < 44) return false
  const ar = box.w / box.h
  if (ar < 0.6 || ar > 1.67) return false
  // "no fill or spokes", "without a fill" say what it is NOT
  return !own.some((t) => RING_DISC.test(t.replace(/\b(?:no|without|never|not)\s+(?:an?\s+)?\w+(?:\s+(?:or|and|nor)\s+\w+)*/gi, '')))
}
/** The outline ring's line: about 6% of its size, 3 to 24px. */
export function outlineRingThickness(d: number): number {
  return Math.max(3, Math.min(24, Math.round(d * 0.06)))
}

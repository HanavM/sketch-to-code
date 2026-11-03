/**
 * Taps lined up inside a mark are small dots there, never a fill of it (n215).
 *
 * Round 46 e2 team roster (n211): a table box, two ruled lines, and a green, an amber and a grey tap down the status
 * column. Read as fills, the first row went bright green and the rest of the table grey, and a fix note was needed.
 * The reading of which taps are dots lives with the fills (`tapDots`, ink), so the overlay stops painting the box the
 * moment the third tap lands. Here: told to the build, and checked on the page. Zero tokens.
 */
import type { TapDot } from '@s2c/ink'
import { parseCssColor, deltaE } from './palette.js'

interface NodeLike { rect: { x: number; y: number; w: number; h: number }; text?: string; style?: { backgroundColor?: string; color?: string } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface TapDotVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

const r = Math.round
/** How far from the tap a dot may sit (a rough hand; its row may have moved a little). */
export const TAP_DOT_TOL_PX = 34
/** Biggest element that still counts as a dot, px. */
const DOT_MAX_PX = 20
/** Colour match for a dot against its tap (a hand-picked pen, same family). */
const DOT_DELTA_E = 14
/** A block this big painted the tap's colour means the tap was read as a fill. */
const BIG_W = 160, BIG_H = 60
/** n269: a dot on the bare page: a white star beside a big white panel is fine; only a block as big as the page is the tap read as a fill. */
const PAGE_W = 1000, PAGE_H = 500

export function tapDotsBrief(dots: readonly TapDot[]): string {
  if (!dots.length) return ''
  const line = (ds: readonly TapDot[]) => ds.map((d) => `${d.color} at (${String(d.at.x)},${String(d.at.y)})`).join('; ')
  const onPage = dots.filter((d) => d.page), inMarks = dots.filter((d) => !d.page)
  // n269: taps scattered on the bare page: stars, confetti, specks. Each where it landed; never the page's colour.
  const pageBrief = onPage.length
    ? `SMALL DOTS ON THE PAGE FROM TAPS (several taps of one colour scattered on the bare page; deterministic; checked on the page): ${line(onPage)}.\n` +
      `Each is one small round dot (about 4 to 8px, its own absolutely placed div with a background colour, not an svg or a box-shadow) in exactly that colour, centred on exactly that spot; add no others and move none. ` +
      `These taps never colour the page, no fade or gradient comes from them. A note such as "white dots are stars" names these same dots: it adds no more.\n\n`
    : ''
  if (!inMarks.length) return pageBrief
  const list = line(inMarks)
  return pageBrief + `SMALL DOTS FROM TAPS (taps in a straight line inside a drawn box; deterministic; checked on the page): ${list}.\n` +
    `Each is one small round dot (about 8 to 10px, its own element) in exactly that colour, centred on that spot, with no words in it. ` +
    `These taps never colour the box, a row or a band round them: nothing large on the page takes these colours. ` +
    `When the rows of this box repeat, every row has a dot in this column (or row); a row with no tap takes the colour of a tapped row showing the same word. ` +
    `A word typed for the row at this spot stays printed right after its dot, in the dot's colour.\n\n`
}

const painted = (n: NodeLike, hex: string, limit: number): boolean => {
  const c = n.style?.backgroundColor, want = parseCssColor(hex), got = c ? parseCssColor(c) : null
  return !!want && !!got && deltaE(want, got) <= limit
}

export function verifyTapDots(dots: readonly TapDot[] | undefined, after: Snap): TapDotVerdict {
  if (!dots?.length) return { satisfied: true, unverifiable: true, reason: 'no taps read as dots' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const faults: string[] = []
  for (const d of dots) {
    const near = after.nodes.some((n) => n.rect.w >= 4 && n.rect.w <= DOT_MAX_PX && n.rect.h >= 4 && n.rect.h <= DOT_MAX_PX && painted(n, d.color, DOT_DELTA_E) &&
      Math.hypot(n.rect.x + n.rect.w / 2 - d.at.x, n.rect.y + n.rect.h / 2 - d.at.y) <= TAP_DOT_TOL_PX)
    if (!near) faults.push(`a small ${d.color} dot (about 8 to 10px) belongs at (${String(d.at.x)},${String(d.at.y)})`)
    const big = after.nodes.find((n) => n.rect.w >= (d.page ? PAGE_W : BIG_W) && n.rect.h >= (d.page ? PAGE_H : BIG_H) && painted(n, d.color, 6))
    if (big) faults.push(`the block at (${String(r(big.rect.x))},${String(r(big.rect.y))}) ${String(r(big.rect.w))}x${String(r(big.rect.h))} is painted ${d.color}: that tap is a small dot only, so give the block back its own colour`)
  }
  return faults.length
    ? { satisfied: false, reason: `${[...new Set(faults)].slice(0, 8).join('; ')}; change nothing else` }
    : { satisfied: true, reason: `${String(dots.length)} taps are small dots, nothing painted round them` }
}

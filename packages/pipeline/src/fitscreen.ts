/**
 * A page sketched inside the screen stays inside it (n247).
 *
 * Round 48 e5 (wifi, n244 try 2): everything was drawn inside the 900px screen and every box was built within 5px of
 * where it was drawn, but the page wrapper kept 40px of padding under the last button, so the document was 918px tall.
 * The page could scroll by 18px, came back from a reload scrolled to its end, and every part sat higher than drawn. No
 * check looked at the height of the page, so all of them passed. About one in seven recent builds ran a little past.
 *
 * Told before the build, checked after it (the snapshot now carries the document's height), and the failure says which
 * of the two faults it is: empty room under the content (cut it) or one part running a little off the bottom. A page
 * drawn past the screen, a note that asks for a long page, or a count that reaches past the screen is never held to it,
 * and neither is a long overrun of real content, which the placement checks already name part by part. Zero tokens.
 */

interface PointLike { x: number; y: number }
interface StrokeLike { points: readonly PointLike[] }
interface PlanLike { axis: 'x' | 'y'; n: number; gap: number; mark: { y: number; h: number } }
interface NodeLike {
  id: string; tag: string; srcLoc: string | null; text: string; parent: string | null
  rect: { x: number; y: number; w: number; h: number }
  style: { position: string }
}
interface Snap {
  nodes: readonly NodeLike[]
  viewport: { w: number; h: number }
  doc?: { w: number; h: number }
}
export interface FitVerdict { satisfied: boolean; unverifiable?: boolean; reason: string; over?: number }

/** Within this the page does not really scroll (sub-pixel rounding, a stray hairline). */
const SLACK = 2
/** A stroke may run this far off the bottom edge and still be a drawing of the screen. */
const DRAWN_SLACK = 4
/** Real content further past than this is a long overrun: the placement checks name its parts. */
const SHORT_OVERRUN = 80
const LONG_PAGE = /\b(scroll\w*|long page|tall page|keeps? going|below the fold|more below|infinite|endless)\b/i

const bottomOf = (strokes: readonly StrokeLike[]): number | null => {
  let b: number | null = null
  for (const s of strokes) for (const p of s.points) if (b === null || p.y > b) b = p.y
  return b
}

/** The bottom of the drawing when it should fit one screen; null when the page may run on. */
export function screenFit(
  strokes: readonly StrokeLike[], notes: readonly string[], vp: { h: number }, plans: readonly PlanLike[] = [],
): { drawnBottom: number } | null {
  const b = bottomOf(strokes)
  if (b === null || b > vp.h + DRAWN_SLACK) return null
  if (notes.some((n) => LONG_PAGE.test(n))) return null
  for (const p of plans) if (p.axis === 'y' && p.mark.y + p.n * p.mark.h + (p.n - 1) * p.gap > vp.h + DRAWN_SLACK) return null
  return { drawnBottom: b }
}

export function fitScreenBrief(fit: { drawnBottom: number } | null, vp: { w: number; h: number }): string {
  if (!fit) return ''
  return (
    `ONE SCREEN: everything drawn ends at y ${Math.round(fit.drawnBottom)}, inside the ${vp.w}x${vp.h} screen, so the finished page does not ` +
    `scroll: the document is exactly ${vp.h}px tall. Page wrappers and full-height side panels are ${vp.h}px (min-h-screen / h-screen, ` +
    `box-sizing: border-box), and page padding goes on the top and sides only: no bottom padding or margin that pushes the page past ${vp.h}px ` +
    `(a p-10 wrapper with its last block near the bottom runs past). Do not add a footer or rows the drawing does not have.\n\n`
  )
}

const isAncestor = (nodes: Map<string, NodeLike>, a: NodeLike, of: NodeLike): boolean => {
  for (let p = of.parent; p; p = nodes.get(p)?.parent ?? null) if (p === a.id) return true
  return false
}

const nameOf = (n: NodeLike) => `<${n.tag}>${n.text ? ` "${n.text.slice(0, 30)}"` : ''}${n.srcLoc ? ` (${n.srcLoc})` : ''}`

export function verifyFitsScreen(fit: { drawnBottom: number } | null, before: Snap, after: Snap): FitVerdict {
  if (!fit) return { satisfied: true, unverifiable: true, reason: 'the page may run past the screen' }
  const h = after.doc?.h
  if (h == null) return { satisfied: true, unverifiable: true, reason: 'this host does not report the page height' }
  const vh = after.viewport.h
  // a page that already ran past before this run: a fix elsewhere on it is not asked to shorten it
  if (before.doc && before.doc.h > before.viewport.h + SLACK) return { satisfied: true, unverifiable: true, reason: 'the page ran past the screen before this run' }
  const over = Math.round(h - vh)
  if (over <= SLACK) return { satisfied: true, reason: `the page fits the ${vh}px screen`, over: Math.max(0, over) }

  // what really ends lowest: not the wrappers that only stretch to the page's end
  const flow = after.nodes.filter((n) => n.style.position !== 'fixed' && n.rect.w > 0 && n.rect.h > 0)
  const byId = new Map(flow.map((n) => [n.id, n]))
  const wrappers = new Set<string>()
  for (const a of flow) {
    if (flow.some((c) => c !== a && isAncestor(byId, a, c))) { if (!a.text) wrappers.add(a.id) }
  }
  const stretched = (n: NodeLike) => n.rect.y + n.rect.h >= h - 1 && n.rect.h >= vh * 0.5 && !n.text
  const content = flow.filter((n) => !wrappers.has(n.id) && !stretched(n))
  if (!content.length) return { satisfied: true, unverifiable: true, reason: 'nothing to measure on the page' }
  const lowest = content.reduce((a, b) => (b.rect.y + b.rect.h > a.rect.y + a.rect.h ? b : a))
  const end = Math.round(lowest.rect.y + lowest.rect.h)
  const stretchers = flow.filter((n) => n.rect.y + n.rect.h >= h - 1 && n.parent !== null).slice(0, 3).map(nameOf)

  if (end > vh + SLACK) {
    if (over > SHORT_OVERRUN) return { satisfied: true, unverifiable: true, reason: `real content runs ${over}px past the screen: left to the placement checks`, over }
    return {
      satisfied: false, over,
      reason: `the page is ${Math.round(h)}px tall, ${over}px past the ${vh}px screen, though everything drawn ends at y ${Math.round(fit.drawnBottom)}: ` +
        `${nameOf(lowest)} ends at y ${end}. Bring it up inside the screen by taking the height out of the space above it (padding, gaps, a line-height), ` +
        `keeping the drawn boxes at their sizes, so the document is exactly ${vh}px tall`,
    }
  }
  return {
    satisfied: false, over,
    reason: `the page is ${Math.round(h)}px tall, ${over}px past the ${vh}px screen, though everything drawn ends at y ${Math.round(fit.drawnBottom)} and the content ends at y ${end}: ` +
      `the ${Math.round(h) - end}px under ${nameOf(lowest)} is empty room from bottom padding or margin${stretchers.length ? ` on ${stretchers.join(', ')}` : ''}. ` +
      `Remove that bottom padding or margin and give the wrappers height ${vh}px (box-sizing: border-box), moving nothing, so the document is exactly ${vh}px tall`,
  }
}

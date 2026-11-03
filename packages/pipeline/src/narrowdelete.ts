import type { DomNode, DomSnapshot } from '@s2c/dom'

/**
 * n200: a delete fix removes only the smallest thing it names, never its whole card.
 *
 * Round 45 e1 (car rental): the first build painted a huge grey "500" behind the Fiat card. The fix note
 * "delete the huge grey 500", typed on it, was read as a delete of the card's div, and the whole first card
 * went. The words of a delete note say WHAT goes: when they name text ("500") and a smaller element on the
 * target shows exactly that text, the delete is that element, not the box around it.
 *
 * Only exact text matches narrow (an element whose own text is just the named words), so "delete this
 * card" or "remove the Fiat card" (no element reads exactly "fiat card") keep the model's target.
 */

/** Words that say how to delete or how the thing looks, never what it reads. */
const NOT_CONTENT = new Set((
  'delete remove drop erase lose kill hide clear cut take out get rid of rid ' +
  'the a an this that these those it its them all any every only just please ' +
  'huge giant big large massive enormous oversized small tiny little faint faded pale light dark ' +
  'grey gray white black red orange yellow green blue teal purple pink brown navy ' +
  'background backdrop watermark behind under over on in at of from here there ' +
  'text word words number numbers digit digits letter letters label thing things one ones ' +
  'stray extra weird random duplicate copy decoration decorative graphic and with'
).split(/\s+/))

const DELETE_WORDS = /\b(delete|remove|erase|drop|get rid of|take out|clear)\b/i

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}$%.]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

/** The words of a delete note that name what it reads ("500" from "delete the huge grey 500"). */
export function namedWords(text: string): string[] {
  if (!DELETE_WORDS.test(text)) return []
  // quoted words win outright
  const quoted = [...text.matchAll(/["“'‘]([^"”'’]{1,40})["”'’]/g)].map((m) => norm(m[1]!)).filter(Boolean)
  if (quoted.length) return quoted.flatMap((q) => q.split(' '))
  return norm(text).split(' ').filter((w) => w && !NOT_CONTENT.has(w.replace(/[.$%]/g, '') || w))
}

const area = (r: DomNode['rect']): number => Math.max(0, r.w) * Math.max(0, r.h)
const overlap = (a: DomNode['rect'], b: DomNode['rect']): number => {
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return ix > 0 && iy > 0 ? ix * iy : 0
}
const inside = (p: { x: number; y: number }, r: DomNode['rect'], pad = 4): boolean =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

export interface NarrowedDelete {
  /** The element that goes instead of the model's target. */
  node: DomNode
  /** What the plan says will go. */
  why: string
}

/**
 * For one delete target: the smaller element on it that the delete words name exactly, or null to keep the
 * target. `notes` are the typed notes of this fix (text and where typed); `instruction` the model's words.
 */
export function narrowDelete(
  snap: DomSnapshot,
  targetId: string,
  instruction: string,
  notes: ReadonlyArray<{ text: string; at?: { x: number; y: number } }>,
): NarrowedDelete | null {
  const target = snap.nodes.find((n) => n.id === targetId)
  if (!target) return null
  // the typed words outrank the model's paraphrase; a note counts when it is a delete note typed on the target
  const own = notes.filter((n) => DELETE_WORDS.test(n.text) && (!n.at || inside(n.at, target.rect, 24)))
  const sources = own.length ? own.map((n) => n.text) : [instruction]
  const words = [...new Set(sources.flatMap(namedWords))]
  if (!words.length) return null
  const wordSet = new Set(words)
  const matches = (n: DomNode): boolean => {
    const t = norm(n.text)
    if (!t) return false
    const toks = t.split(' ')
    return toks.length <= 4 && toks.every((w) => wordSet.has(w))
  }
  if (matches(target)) return null // the target already is the named thing
  const ancestors = new Set<string>()
  {
    const byId = new Map(snap.nodes.map((n) => [n.id, n]))
    let p = target.parent ? byId.get(target.parent) : undefined
    while (p) { ancestors.add(p.id); p = p.parent ? byId.get(p.parent) : undefined }
  }
  const tArea = area(target.rect)
  const cands = snap.nodes.filter((n) =>
    n.id !== target.id && !ancestors.has(n.id) && matches(n) && area(n.rect) > 0 && area(n.rect) < tArea &&
    overlap(n.rect, target.rect) >= 0.5 * area(n.rect),
  )
  if (!cands.length) return null
  const at = own.find((n) => n.at)?.at
  const under = at ? cands.filter((n) => inside(at, n.rect)) : []
  const pool = under.length ? under : cands
  // "huge 500" names the big one; otherwise the one the note sits on, else the smallest
  const big = sources.some((s) => /\b(huge|giant|big|large|massive|enormous|oversized)\b/i.test(s))
  const sorted = [...pool].sort((a, b) => big ? area(b.rect) - area(a.rect) : area(a.rect) - area(b.rect))
  const node = sorted[0]!
  return { node, why: `only the "${node.text.slice(0, 30)}" the note names, not the whole <${target.tag}> around it` }
}

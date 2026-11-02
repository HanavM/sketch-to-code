/**
 * A fix note after a build is checked on the page like a build (n37).
 *
 * Round 32 (hand, n35): three of four fix notes typed on a built page made it
 * worse, and nothing noticed. "two lines: NORTH / LIGHTS" broke the heading
 * down onto the date line; "one line, below heading" moved the subtitle UP
 * into the heading; "no panel behind bars; pink at top" painted the panel
 * pink instead of taking it away. A fix run had no drawn marks, so none of the
 * build checks applied to it: whatever the quick edit did was kept.
 *
 * So a run on a page that is already built is held to three things, all
 * measured from the page before the run and the page after it (zero tokens):
 *
 *  1. Words that were apart stay apart. Two pieces of text that did not touch
 *     before the fix and overlap after it are a failure, named by their words.
 *  2. "no panel / no background / no card" means the thing the note sits on
 *     stops painting a fill (or a frame or a shadow) — not that it changes colour.
 *  3. A note that names parts ("bars", "cards", "links") on a wrapper is about
 *     those parts: codegen is told to change them, not the wrapper's own look.
 *
 *  4. (n102) Copy is kept. A piece of the user's copy that was on the page
 *     before the fix is never emptied (gone, with nothing written in its
 *     place), and never copied into another member of a set (a name pasted
 *     into the preview line under it). A note about a set ("chat bubbles:",
 *     "each row:") reaches every member, each keeping its own words.
 *
 * And a fix that still breaks rule 1, 2 or 4 after its repair rounds is put back:
 * the page goes back to exactly how it was before the note, and the run says so.
 */
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { GroundedAction } from './intent2.js'
import { deltaE, hexOf, parseCssColor } from './palette.js'

type Box = { x: number; y: number; w: number; h: number }

/** A page counts as already built when it shows a few pieces of the user's own copy. */
export function isBuiltPage(snap: DomSnapshot): boolean {
  return snap.nodes.filter((n) => n.srcLoc && words(n).length >= 2 && n.rect.w > 0 && n.rect.h > 0).length >= 3
}

const words = (n: DomNode): string => (n.text ?? '').replace(/\s+/g, ' ').trim()
const boxOf = (n: DomNode): Box => n.textBox ?? n.rect

function inter(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

function isAncestor(snap: Map<string, DomNode>, a: DomNode, b: DomNode): boolean {
  for (let p = b.parent; p; p = snap.get(p)?.parent ?? null) if (p === a.id) return true
  return false
}

/** Text pieces worth checking: visible own copy, de-duplicated by words (first one wins). */
function texts(snap: DomSnapshot): Array<{ key: string; node: DomNode; box: Box }> {
  const seen = new Set<string>()
  const out: Array<{ key: string; node: DomNode; box: Box }> = []
  for (const n of snap.nodes) {
    const key = words(n)
    if (key.length < 2 || seen.has(key)) continue
    const b = boxOf(n)
    if (b.w < 2 || b.h < 4) continue
    if (n.style.opacity && Number(n.style.opacity) < 0.15) continue
    seen.add(key)
    out.push({ key, node: n, box: b })
  }
  return out
}

/** How much two text boxes overlap, as a share of the smaller one. */
function overlapShare(a: Box, b: Box): number {
  const i = inter(a, b)
  return i ? i / Math.max(1, Math.min(a.w * a.h, b.w * b.h)) : 0
}

export interface NewOverlap { a: string; b: string; share: number }

/** Pairs of words that were apart before the run and overlap after it (rule 1). */
export function newTextOverlaps(before: DomSnapshot, after: DomSnapshot, min = 0.25): NewOverlap[] {
  const was = new Map(texts(before).map((t) => [t.key, t]))
  const now = texts(after).filter((t) => was.has(t.key))
  const byId = new Map(after.nodes.map((n) => [n.id, n]))
  const out: NewOverlap[] = []
  for (let i = 0; i < now.length; i++) {
    for (let j = i + 1; j < now.length; j++) {
      const A = now[i]!, B = now[j]!
      if (isAncestor(byId, A.node, B.node) || isAncestor(byId, B.node, A.node)) continue
      const share = overlapShare(A.box, B.box)
      if (share < min) continue
      const a0 = was.get(A.key)!, b0 = was.get(B.key)!
      if (overlapShare(a0.box, b0.box) >= min / 2) continue // they already touched: not this fix
      out.push({ a: A.key, b: B.key, share: Math.round(share * 100) / 100 })
    }
  }
  // r32 c2 (n37 replay): a heading set on one line ran under the big drawn disc beside it. Painted
  // shapes with no words of their own count too: words that were clear of one must stay clear.
  const area = after.viewport.w * after.viewport.h
  const shapes = after.nodes.filter((n) => !words(n) && paints(n) && n.rect.w >= 24 && n.rect.h >= 24 && n.rect.w * n.rect.h < area * 0.4)
  for (const T of now) {
    for (const S of shapes) {
      if (isAncestor(byId, S, T.node) || isAncestor(byId, T.node, S)) continue
      const share = inter(T.box, S.rect) / Math.max(1, T.box.w * T.box.h)
      if (share < min) continue
      if (inter(was.get(T.key)!.box, S.rect) / Math.max(1, T.box.w * T.box.h) >= min / 2) continue
      out.push({ a: T.key, b: `the ${S.tag} shape at ${Math.round(S.rect.x)},${Math.round(S.rect.y)}`, share: Math.round(share * 100) / 100 })
    }
  }
  return out.sort((x, y) => y.share - x.share).slice(0, 6)
}

const NO_FILL = /\b(?:no|without|remove(?: the)?|drop(?: the)?|lose(?: the)?|take away(?: the)?)\s+(?:the\s+)?(?:grey\s+|gray\s+|white\s+|dark\s+)?(panel|background|bg|card|box|frame|backdrop|container|fill)\b/i

/** Does the element paint something behind its contents? */
export function paints(n: DomNode): boolean {
  const bg = parseCssColor(n.style.backgroundColor)
  const alpha = /rgba?\([^)]*,\s*([\d.]+)\s*\)$/.exec(n.style.backgroundColor ?? '')
  const a = n.style.backgroundColor?.startsWith('rgba') && alpha ? Number(alpha[1]) : bg ? 1 : 0
  return a > 0.05 || !!n.style.backgroundImage || !!n.style.border || !!n.style.boxShadow
}

function nearest(after: DomSnapshot, r: Box): DomNode | null {
  let best: DomNode | null = null, bestS = 0
  for (const n of after.nodes) {
    const i = inter(n.rect, r)
    if (!i) continue
    const s = i / (n.rect.w * n.rect.h + r.w * r.h - i)
    if (s > bestS) { bestS = s; best = n }
  }
  return bestS >= 0.6 ? best : null
}

export interface NoFillMiss { action: number; what: string; target: string }

/** "no panel" on a target that still paints a fill, frame or shadow after the run (rule 2). */
export function noFillMisses(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot): NoFillMiss[] {
  const out: NoFillMiss[] = []
  const was = new Map(before.nodes.map((n) => [n.id, n]))
  for (const [i, a] of actions.entries()) {
    const said = [a.instruction, ...(a.notes ?? [])].join(' ')
    const m = NO_FILL.exec((a.notes ?? []).join(' ') || said)
    if (!m) continue
    for (const t of a.targets) {
      const b = was.get(t.domId)
      if (!b || !paints(b)) continue // it painted nothing to take away
      const now = nearest(after, t.rect)
      if (now && paints(now)) out.push({ action: i, what: (m[1] ?? 'panel').toLowerCase(), target: (t.subtreeText || t.tag).slice(0, 40) })
    }
  }
  return out
}

const PARTS = /\b(bars|cards|rows|items|links|icons|buttons|tiles|columns|lines|dots|labels|tabs|chips|pills|avatars|images|photos|names|bubbles|steps)\b/i

/** Rule 3: a note naming parts, typed on a wrapper, is about the parts. */
export function fixBrief(actions: readonly GroundedAction[], before: DomSnapshot): string {
  if (!isBuiltPage(before)) return ''
  const lines: string[] = []
  const kept = keptColours(before)
  for (const [i, a] of actions.entries()) {
    if (a.kind !== 'modify' || !a.targets.length) continue
    const note = (a.notes ?? []).join(' ')
    const parts = PARTS.exec(note)?.[1]
    const nofill = NO_FILL.exec(note)?.[1]
    if (parts) lines.push(`- action ${i}: the note names the ${parts.toLowerCase()} inside ${a.targets[0]?.tag ?? 'it'}. Change the ${parts.toLowerCase()} themselves (their colour, size, place); leave the wrapper's own background, border and size as they are unless the note names the wrapper.`)
    if (note && isSetNote(note)) lines.push(`- action ${i}: "${note.slice(0, 60)}" is about EVERY one of that set on the page, not just the one it sits on. Apply it to each member. Each member keeps exactly its own words: never empty a member, never move or copy one member's words (a name, a time, a title) into another member or into another line of the same member.`)
    if (nofill) lines.push(`- action ${i}: "no ${nofill.toLowerCase()}" means the element it sits on stops painting: transparent background, no gradient, no border, no shadow. Do not recolour it.`)
  }
  return (
    `THIS IS A FIX ON A BUILT PAGE. Change only what the notes ask. Every other piece of text stays where it is; ` +
    `two pieces of text that do not touch now must not touch after your edit (it will be measured, and an edit ` +
    `that makes words run into each other is put back). Every piece of copy on the page keeps its words: never empty ` +
    `a piece of text, and never copy words from one place into another (it is measured, and put back).\n` +
    (lines.length ? lines.join('\n') + '\n' : '') +
    // n190: name the colours that stay, so a note about one part never repaints another (r44 e5, e3)
    (kept.length ? `Colours not named in the notes stay exactly as they are (measured; a colour changed that no note names is put back). The page's colours now: ${kept.join('; ')}.\n` : '') + '\n'
  )
}


// ---------------------------------------------------------------- n102: copy is kept

/** A note that asks for words to go away or be rewritten: emptied copy is then what was asked. */
const DROPS_COPY = /\b(?:remove|delete|drop|hide|take out|cut|clear|empty|no (?:text|words|copy|label|caption|title|subtitle|preview|name|time)s?|without (?:the )?(?:text|words|copy|label|caption|title|subtitle|preview|name|time)s?)\b/i

/** n165: element kinds a note asks to go: "no button", "not a badge", "remove the banner", "no buttons here". */
const KINDS: Record<string, readonly string[]> = {
  button: ['button'], buttons: ['button'], badge: [], badges: [], chip: [], chips: [], tag: [], tags: [], banner: [], toolbar: [],
  link: ['a'], links: ['a'], icon: ['svg', 'i'], icons: ['svg', 'i'], tab: [], tabs: [], pill: [], pills: [], menu: ['nav'], dropdown: ['select'],
}
const DROPS_KIND = /\b(?:no|not an?|remove(?: the)?|delete(?: the)?|drop(?: the)?|without(?: the| a)?|get rid of(?: the)?)\s+(button|badge|chip|tag|banner|toolbar|link|icon|tab|pill|menu|dropdown)s?\b/gi

export function dropsKinds(said: string): string[] {
  const out = new Set<string>()
  for (const m of said.matchAll(DROPS_KIND)) out.add(m[1]!.toLowerCase())
  return [...out]
}

/** The node, or one of its first four ancestors, is that kind of element (by tag, or by a class naming it). */
function isKind(n: DomNode, byId: Map<string, DomNode>, kinds: readonly string[]): boolean {
  let x: DomNode | undefined = n
  for (let i = 0; x && i < 5; i++, x = x.parent ? byId.get(x.parent) : undefined) {
    for (const k of kinds) {
      if ((KINDS[k] ?? []).includes(x.tag.toLowerCase())) return true
      if (x.classes.some((c) => c.toLowerCase().includes(k))) return true
    }
  }
  return false
}

/** Own copy worth guarding: visible text with a source stamp and some letters in it. */
function copyNodes(snap: DomSnapshot): Array<{ key: string; node: DomNode; box: Box }> {
  const out: Array<{ key: string; node: DomNode; box: Box }> = []
  for (const n of snap.nodes) {
    const key = words(n)
    if (!n.srcLoc || key.length < 4 || !/\p{L}{2,}/u.test(key)) continue
    const b = boxOf(n)
    if (b.w < 2 || b.h < 4) continue
    if (n.style.opacity && Number(n.style.opacity) < 0.15) continue
    out.push({ key, node: n, box: b })
  }
  return out
}

const norm = (s: string): string => s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()

export interface LostCopy { text: string }
export interface CopiedCopy { text: string; was: number; now: number }

const wordsOf = (s: string): string[] => s.split(/[^\p{L}\p{N}$%]+/u).filter((w) => w.length > 0)

/** At least four words, and at least 70% of them now read in pieces of text that were not on the page before. */
function splitUp(text: string, freshWords: ReadonlySet<string>): boolean {
  const ws = [...new Set(wordsOf(text))]
  if (ws.length < 4) return false
  return ws.filter((w) => freshWords.has(w)).length / ws.length >= 0.7
}

/**
 * Rule 4a: copy that was on the page and is gone after the fix, with nothing written where it sat
 * (r37 e4: "chat bubbles: message text only" emptied both grey bubbles). Copy rewritten in place is
 * fine: something else now reads there. A note that asks for words to go is exempt.
 */
export function lostCopy(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot, runNotes: readonly string[] = []): LostCopy[] {
  // n190: a note typed on the whole sketch is a run note, not an action's: "delete texts 4 grey squares" (r44 e3)
  // was put back as "emptied copy" because only action notes were read
  const said = [...actions.flatMap((a) => [...(a.notes ?? [])]), ...runNotes].join(' ')
  if (DROPS_COPY.test(said)) return []
  // n165: a note that asks for a kind of element to go ("no button: ...") is answered by emptying it
  const gone = dropsKinds(said)
  const byId = new Map(before.nodes.map((n) => [n.id, n]))
  const targets = actions.flatMap((a) => (a.targets ?? []).map((t) => t.rect)).filter(Boolean) as Box[]
  const now = copyNodes(after)
  const all = norm(now.map((t) => t.key).join(' \u0001 '))
  const had = new Set(copyNodes(before).map((t) => norm(t.key)))
  const freshWords = new Set(now.filter((t) => !had.has(norm(t.key))).flatMap((t) => wordsOf(norm(t.key))))
  const out: LostCopy[] = []
  const seen = new Set<string>()
  for (const t of copyNodes(before)) {
    const k = norm(t.key)
    if (seen.has(k) || all.includes(k)) continue
    seen.add(k)
    // something else now reads where it sat: rewritten, not emptied
    const area = Math.max(1, t.box.w * t.box.h)
    if (now.some((u) => inter(u.box, t.box) / Math.min(area, Math.max(1, u.box.w * u.box.h)) >= 0.5)) continue
    // n213: split up, not emptied: "3 tiles, one per stat" took one long line apart into three tiles (r46 c4)
    if (splitUp(k, freshWords)) continue
    if (gone.length && (isKind(t.node, byId, gone) || targets.some((b) => inter(b, t.box) >= 0.5 * area))) continue
    out.push({ text: t.key })
  }
  return out.slice(0, 6)
}

/**
 * Rule 4b: a piece of copy that now shows in more places than before, when the fix note never typed it
 * (r37 e4: "each row: name, small grey preview under" put each name into its own preview line).
 */
export function copiedCopy(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot, runNotes: readonly string[] = []): CopiedCopy[] {
  const said = norm([...actions.flatMap((a) => [...(a.notes ?? [])]), ...runNotes].join(' '))
  if (/\b(?:add|more|another|copy|repeat|duplicate|same as|like this|again)\b/.test(said)) return []
  const was = copyNodes(before), now = copyNodes(after)
  const count = (list: typeof was, k: string): number => list.filter((u) => norm(u.key).includes(k)).length
  const out: CopiedCopy[] = []
  const seen = new Set<string>()
  for (const t of was) {
    const k = norm(t.key)
    if (seen.has(k) || k.length < 4 || said.includes(k)) continue
    seen.add(k)
    const a = count(was, k), b = count(now, k)
    if (b > a) out.push({ text: t.key, was: a, now: b })
  }
  return out.slice(0, 6)
}

/** A note about a whole set: "chat bubbles:", "each row:", "every card", "all events". */
const SET_NOTE = /^\s*(?:(?:each|every|all(?: the)?)\s+[a-z]+|[a-z]+\s+(?:bubbles|rows|cards|events|items|messages|tiles|chips|pills|links|tabs|steps|names)|bubbles|rows|cards|events|items|messages)\s*:/i

export function isSetNote(note: string): boolean { return SET_NOTE.test(note) }

export interface FixVerdict { overlaps: NewOverlap[]; noFill: NoFillMiss[]; lost?: LostCopy[]; copied?: CopiedCopy[]; recoloured?: Recolour[]; unchanged?: boolean; failures: string[] }

/** Both measured rules, as repair-ready failure lines. Empty when the page was not built before the run. */
export function verifyFix(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot, runNotes: readonly string[] = []): FixVerdict {
  if (!isBuiltPage(before)) return { overlaps: [], noFill: [], failures: [] }
  // n190: a fix that moved nothing says so (r44 e3: one icon file edited, every check satisfied, page the same)
  const said = [...actions.flatMap((a) => a.notes ?? []), ...runNotes].join(' ').trim()
  if (said && pageUnchanged(before, after)) {
    return { overlaps: [], noFill: [], unchanged: true, failures: [
      `page (fix check): this fix changed nothing visible on the page; the note asked: "${said.slice(0, 90)}". Make the change it asks for so it shows on the page, or leave the page as it is if it already shows it.`,
    ] }
  }
  const recoloured = unaskedRecolours(actions, before, after, runNotes)
  const overlaps = newTextOverlaps(before, after)
  const noFill = noFillMisses(actions, before, after)
  const lost = lostCopy(actions, before, after, runNotes)
  const copied = copiedCopy(actions, before, after, runNotes)
  const failures = [
    ...overlaps.map((o) => `page (fix check): "${o.a.slice(0, 40)}" now runs into "${o.b.slice(0, 40)}" (${Math.round(o.share * 100)}% of the smaller one covered); before this fix they were apart. Keep the change the note asked for, and size or place it so they do not touch.`),
    ...noFill.map((m) => `action ${m.action} (fix check): the note says no ${m.what}, but the element behind "${m.target}" still paints a background, border or shadow. Make it transparent with no border or shadow; do not recolour it.`),
    ...lost.map((l) => `page (fix check): "${l.text.slice(0, 50)}" was on the page before this fix and is now gone, with nothing in its place. Put its words back exactly where they were; change only what the note asked.`),
    ...copied.map((c) => `page (fix check): "${c.text.slice(0, 50)}" now shows ${c.now} times (it showed ${c.was} before) and the note never typed it. Take the extra copies out: each piece of text keeps only its own words.`),
    ...recoloured.map((r) => `page (fix check): the ${r.prop === 'text' ? 'text colour' : r.prop === 'stroke' ? 'line colour' : 'fill'} of ${r.what} changed from ${r.was} to ${r.now}, and no fix note names it. Put its colour back to ${r.was}; change only what the note names.`),
  ]
  return { overlaps, noFill, lost, copied, recoloured, failures }
}


// ---------------------------------------------------------------- n190: a fix changes only what it names

/**
 * Round 44 (n188): a fix typed on the whole sketch changed things it never named. "grey track to right edge"
 * (the progress bar) also turned r44 e5's orange arrival line black; "4 grey squares under it" (a tool column)
 * greyed r44 e3's four coloured thumbnails. And a fix that moved nothing at all ("thumbnails back to pen
 * colours ...") still reported its checks satisfied. Both are measured here from the page before and after.
 */

const COLOUR_FAMILIES: Array<[string, RegExp]> = [
  ['grey', /\b(?:gr[ae]y|silver|slate|muted|neutral)\b/i],
  ['black', /\b(?:black|dark|charcoal|ink|near-black)\b/i],
  ['white', /\b(?:white|light|pale|off-white|cream)\b/i],
  ['red', /\b(?:red|crimson|scarlet|maroon|coral)\b/i],
  ['orange', /\b(?:orange|amber|rust|tangerine|peach)\b/i],
  ['yellow', /\b(?:yellow|gold|golden|mustard|lemon)\b/i],
  ['green', /\b(?:green|lime|mint|olive|emerald|sage|forest)\b/i],
  ['teal', /\b(?:teal|cyan|aqua|turquoise)\b/i],
  ['blue', /\b(?:blue|navy|indigo|sky|azure|cobalt)\b/i],
  ['purple', /\b(?:purple|violet|lilac|lavender|plum|magenta)\b/i],
  ['pink', /\b(?:pink|rose|blush|fuchsia)\b/i],
  ['brown', /\b(?:brown|tan|beige|wood|chocolate|coffee)\b/i],
]

/** A rough colour family a person would name ("grey", "orange") for an rgb value. */
export function colourFamily(c: { r: number; g: number; b: number }): string {
  const r = c.r / 255, g = c.g / 255, b = c.b / 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  if (l > 0.93) return 'white'
  if (l < 0.12) return 'black'
  if (sat < 0.15) return l < 0.3 ? 'black' : l > 0.88 ? 'white' : 'grey'
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  if (h < 15 || h >= 345) return l > 0.75 ? 'pink' : 'red'
  if (h < 40) return l < 0.4 ? 'brown' : 'orange'
  if (h < 65) return 'yellow'
  if (h < 160) return 'green'
  if (h < 195) return 'teal'
  if (h < 255) return 'blue'
  if (h < 300) return 'purple'
  return 'pink'
}

/** Colour families a note names. */
export function namedFamilies(note: string): Set<string> {
  const out = new Set<string>()
  for (const [f, re] of COLOUR_FAMILIES) if (re.test(note)) out.add(f)
  for (const m of note.matchAll(/#[0-9a-f]{3,6}\b/gi)) { const c = parseCssColor(m[0]); if (c) out.add(colourFamily(c)) }
  return out
}

/** The note is about every colour on the page ("all text white", "whole page darker", "new palette"). */
const WHOLE_LOOK = /\b(?:all|every|everything|whole page|entire page|theme|palette|colou?rs|dark mode|light mode|invert)\b/i

function visible(n: DomNode): boolean {
  return n.rect.w >= 2 && n.rect.h >= 2 && !(n.style.opacity && Number(n.style.opacity) < 0.15)
}

const r4 = (v: number): number => Math.round(v / 3)
function signature(n: DomNode): string {
  const s = n.style
  return [n.tag, r4(n.rect.x), r4(n.rect.y), r4(n.rect.w), r4(n.rect.h), words(n), s.backgroundColor, words(n) ? s.color : '',
    s.backgroundImage ?? '', s.border ?? '', s.borderBottom ?? '', s.boxShadow ?? '', s.opacity ?? '', s.transform ?? '',
    s.fontSize, s.fontWeight, s.borderRadius, s.clipPath ?? '', s.filter ?? '', s.textStroke ?? '', s.svgStroke ?? '', s.svgFill ?? ''].join('|')
}

/** Nothing a person could see changed between the two pages (same elements, places, words and looks). */
export function pageUnchanged(before: DomSnapshot, after: DomSnapshot): boolean {
  const a = before.nodes.filter(visible).map(signature).sort()
  const b = after.nodes.filter(visible).map(signature).sort()
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export interface Recolour { what: string; prop: 'background' | 'text' | 'stroke' | 'fill'; was: string; now: string }

/** The same element before and after: same tag and words, and (nearly) the same box. */
function matchNode(n: DomNode, pool: readonly DomNode[]): DomNode | null {
  let best: DomNode | null = null, bestD = Infinity
  for (const m of pool) {
    if (m.tag !== n.tag || words(m) !== words(n)) continue
    const d = Math.abs(m.rect.x - n.rect.x) + Math.abs(m.rect.y - n.rect.y) + Math.abs(m.rect.w - n.rect.w) + Math.abs(m.rect.h - n.rect.h)
    if (d < bestD) { bestD = d; best = m }
  }
  if (best && bestD <= 12) return best
  // n190: an svg shape a fix lengthened (r44 e5's route run off to the right edge) is still the same shape
  if (/^(?:path|line|polyline|polygon)$/i.test(n.tag)) {
    const near = pool.filter((m) => m.tag === n.tag && inter(m.rect, n.rect) >= 0.6 * Math.max(1, n.rect.w * n.rect.h))
    if (near.length === 1) return near[0]!
  }
  return null
}

const solid = (css: string | undefined): { r: number; g: number; b: number } | null => {
  if (!css || /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/.test(css) || css === 'transparent') return null
  return parseCssColor(css)
}

/**
 * Elements whose fill or text colour changed in a fix that never asked for it: outside every mark the fix
 * notes sit on, and (for a note on the whole page) changed to a colour the notes never name.
 */
export function unaskedRecolours(actions: readonly GroundedAction[], before: DomSnapshot, after: DomSnapshot, runNotes: readonly string[] = []): Recolour[] {
  const said = [...actions.flatMap((a) => [a.instruction, ...(a.notes ?? [])]), ...runNotes].join(' ')
  if (WHOLE_LOOK.test([...actions.flatMap((a) => a.notes ?? []), ...runNotes].join(' '))) return []
  const named = namedFamilies(said)
  const area = before.viewport.w * before.viewport.h
  const targets = actions.flatMap((a) => (a.targets ?? []).map((t) => t.rect)).filter((r): r is Box => !!r && r.w * r.h < area * 0.5)
  const saidLow = said.toLowerCase()
  const pool = after.nodes.filter(visible)
  const out: Recolour[] = []
  const seen = new Set<string>()
  for (const n of before.nodes) {
    if (!visible(n) || n.rect.w * n.rect.h >= area * 0.5) continue
    const m = matchNode(n, pool)
    if (!m) continue
    const w = words(n)
    const paint = (x: DomNode, prop: Recolour['prop']): string | undefined =>
      prop === 'background' ? x.style.backgroundColor : prop === 'text' ? x.style.color : prop === 'stroke' ? x.style.svgStroke : x.style.svgFill
    for (const prop of ['background', 'text', 'stroke', 'fill'] as const) {
      if (prop === 'text' && !w) continue
      const a = solid(paint(n, prop))
      const b = solid(paint(m, prop))
      if (!a || !b || deltaE(a, b) < 12) continue
      const fam = colourFamily(b)
      // inside or over a mark a fix note sits on: that is what the note is about
      if (targets.some((t) => inter(t, n.rect) >= 0.5 * Math.min(n.rect.w * n.rect.h, t.w * t.h))) continue
      // the note names its words ("Call button blue")
      if (w && w.length >= 3 && saidLow.includes(w.toLowerCase().slice(0, 24))) continue
      // a whole-sketch note naming the colour it now has could be about it; anything else is unasked
      if (!targets.length && named.has(fam) && !named.has(colourFamily(a))) {
        // named colour, but the element already had a strong colour of its own the note never names: still unasked
        const own = colourFamily(a)
        if (['grey', 'black', 'white'].includes(own)) continue
      }
      const what = w ? `"${w.slice(0, 30)}"` : `the ${n.tag === 'path' || n.tag === 'line' ? `drawn ${n.tag}` : n.tag} at ${Math.round(n.rect.x)},${Math.round(n.rect.y)} (${Math.round(n.rect.w)}x${Math.round(n.rect.h)})`
      const key = `${what}|${prop}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ what, prop, was: hexOf(a), now: hexOf(b) })
    }
  }
  return out.slice(0, 6)
}

/** The page's own strong colours, so a fix brief can say: keep these unless the note names them. */
export function keptColours(before: DomSnapshot, max = 8): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const n of before.nodes) {
    if (!visible(n)) continue
    const w = words(n)
    for (const [prop, css] of [['fill', n.style.backgroundColor ?? n.style.svgFill], ['text', w ? n.style.color : ''], ['line', n.style.svgStroke], ['fill', n.style.svgFill]] as const) {
      const c = solid(css)
      if (!c) continue
      const fam = colourFamily(c)
      if (['grey', 'black', 'white'].includes(fam)) continue
      const hex = hexOf(c)
      const what = w ? `"${w.slice(0, 24)}"` : `${n.tag} ${Math.round(n.rect.w)}x${Math.round(n.rect.h)} at ${Math.round(n.rect.x)},${Math.round(n.rect.y)}`
      const key = `${hex}|${prop}|${w ? w : ''}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(`${prop} ${hex} (${fam}) on ${what}`)
      if (out.length >= max) return out
    }
  }
  return out
}

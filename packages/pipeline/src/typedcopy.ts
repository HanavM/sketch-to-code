/**
 * Typed values stay as typed, and a note's directions never show on the page (n73).
 *
 * Round 34 e2 (departures, n66/n71): "14:32, big bold white" was typed in the header's corner. Every build
 * made it a live clock (it showed the real time), so the page never matched the picture and the person had no
 * way to say "just the text".
 *
 * Round 34 e3 (habits, n66/n71): "Read 20 pages, bold; done M T W F" was typed on each habit card. The build
 * put the title in bold, then printed the whole raw note under it as a grey subtitle: the look word and the
 * direction after the semicolon ("done M T W F": which days are ticked) became copy.
 *
 * Here:
 * - a time typed in a note (14:32, 9:05 pm) is static text: the build is told to show exactly that and never
 *   a live clock or timer; the page is checked to show it;
 * - a note is split into its copy (before a trailing look tail, before the first semicolon) and its directions
 *   (the look tail, anything after a semicolon); the build is told only the copy is text, and the page is
 *   checked that no direction, and no raw note with its look words, is shown as text.
 * Zero tokens.
 */

interface NodeLike { id: string; text?: string; textBox?: unknown }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
import { progressOf } from './progress.js'
export interface CopyVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

/** Words that describe how copy looks (a trailing ", big bold yellow" tail), not the copy itself. */
const LOOK = /^(big|bigger|huge|giant|large|small|smaller|tiny|little|grey|gray|light|dark|bold|bolder|regular|italic|caps|uppercase|lowercase|spaced|muted|faint|thin|thick|normal|size|text|and|centred|centered|left|right|underlined|outlined|serif|sans|mono|white|black|red|orange|yellow|lime|green|teal|cyan|blue|navy|indigo|purple|violet|pink|magenta|brown|beige|cream|gold|silver|pale|bright|deep|soft|pill|chip|badge|button|link|label|heading|title|subtitle|headline)$/i

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()

export interface NoteParts {
  copy: string
  look: string | null
  directions: string[]
  /** n104: a trailing position word on the copy ("Mia · 2:14 pm above"): where the label goes, never copy. */
  place?: string | null
  /** n104: later parts after a semicolon that are sentences ("...; Copy is final. Can someone check?"): copy too. */
  more?: string[]
}

/** Words that say where a label goes relative to its item (n104). */
const PLACE = /^(above|below|under|underneath|beneath|over|atop|overhead|on|top|beside|alongside|next|to|it|the)$/i
const PLACE_CORE = /^(above|below|under|underneath|beneath|over|atop|overhead|top|beside|alongside)$/i
/** First words of a semicolon part that make it a direction (state, kind of item, how to show), not copy (n73, n104). */
const DIRECTIVE = /^(done|ticked|checked|unchecked|active|selected|current|on|off|open|closed|highlighted|disabled|enabled|image|picture|photo|icon|avatar|in|with|as|make|put|show|use|no|all|each|every|only|hide|set|keep|starred|pinned|unread|read|today)$/i

/** A part after a semicolon that reads as a sentence of copy: four or more words, and it ends like a sentence or starts with a capital that is not a direction word. */
function isSentence(part: string): boolean {
  const words = part.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (words.length < 4) return false
  const first = (words[0] ?? '').replace(/[^\p{L}]/gu, '')
  if (DIRECTIVE.test(first)) return false
  return /[.?!…]["'”’)]?$/.test(part.trim()) || /^\p{Lu}/u.test(first)
}

/** Split a trailing run of position words (with look words among them) off the copy: "Mia · 2:14 pm small above" -> place "above", look "small". */
function placeTail(copy: string, labelled: boolean): { copy: string; place: string | null; look: string | null } {
  const toks = copy.split(/\s+/)
  let i = toks.length
  while (i > 0) {
    const w = toks[i - 1]!.replace(/[^\p{L}]/gu, '')
    if (w && (PLACE.test(w) || LOOK.test(w))) i--
    else break
  }
  const tail = toks.slice(i)
  const clean = tail.map((w) => w.replace(/[^\p{L}]/gu, ''))
  if (!clean.some((w) => PLACE_CORE.test(w))) return { copy, place: null, look: null }
  const rest = toks.slice(0, i).join(' ').replace(/[,·:\-–—]\s*$/, '').trim()
  // only a label: another part follows (label; message) or the rest has a time, number or separator; at least two tokens stay
  if (!rest || rest.split(/\s+/).length < 2 || !(labelled || /[\d·|/]/.test(rest))) return { copy, place: null, look: null }
  const place = tail.filter((_, k) => PLACE.test(clean[k]!)).join(' ')
  const look = tail.filter((_, k) => !PLACE.test(clean[k]!)).join(' ')
  return { copy: rest, place, look: look || null }
}

/** Split a note into its copy, a trailing look tail and any directions after semicolons. */
export function noteParts(note: string): NoteParts {
  const [head = '', ...rest] = note.split(';')
  const parts = rest.map((d) => d.trim()).filter((d) => d.length >= 2)
  const more = parts.filter(isSentence)
  const directions = parts.filter((d) => !isSentence(d))
  let copy = head.trim()
  let look: string | null = null
  const i = copy.lastIndexOf(',')
  if (i > 0) {
    const tail = copy.slice(i + 1).trim()
    const words = tail.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean)
    if (words.length && words.every((w) => LOOK.test(w))) { look = tail; copy = copy.slice(0, i).trim() }
  }
  const pt = placeTail(copy, more.length > 0)
  if (pt.place) { copy = pt.copy; look = [pt.look, look].filter(Boolean).join(', ') || null }
  return { copy, look, directions, ...(pt.place ? { place: pt.place } : {}), ...(more.length ? { more } : {}) }
}

const TIME = /(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)(?![\d:])/gi

/** Times typed in the notes' copy (14:32, 9:05 pm). */
export function typedTimes(notes: readonly string[]): string[] {
  const out = new Set<string>()
  for (const n of notes) { const p = noteParts(n); for (const c of [p.copy, ...(p.more ?? [])]) for (const m of c.matchAll(TIME)) out.add(m[1]!.trim()) }
  return [...out]
}

/** Strings that must never be text on the page: directions, multi-word look tails, raw notes that carried them. */
export function directionStrings(notes: readonly string[]): { text: string; why: string; note: string }[] {
  const out: { text: string; why: string; note: string }[] = []
  for (const n of notes) {
    // n92: a progress bar note is told and checked by progress.ts (its caption is copy, its percent is the fill)
    if (progressOf(n)) continue
    const p = noteParts(n)
    if (!p.look && !p.directions.length && !p.place) continue
    // n104: the position word printed after the label ("2:14 pm above"), even when the label is split over spans
    if (p.place && p.copy) {
      const last = p.copy.split(/\s+/).slice(-2).join(' ')
      out.push({ text: `${last} ${p.place}`, why: 'a position word', note: n })
    }
    for (const d of p.directions) if (d.replace(/[^\p{L}\p{N}]/gu, '').length >= 3) out.push({ text: d, why: 'a direction', note: n })
    if (p.look && p.look.trim().split(/\s+/).length >= 2) out.push({ text: p.look, why: 'look words', note: n })
    if (p.look && p.copy && !p.place) out.push({ text: `${p.copy}, ${p.look}`, why: 'the raw note', note: n })
  }
  return out
}

export function typedCopyBrief(notes: readonly string[]): string {
  const lines: string[] = []
  const times = typedTimes(notes)
  if (times.length) {
    lines.push(`- ${times.map((t) => `"${t}"`).join(', ')} ${times.length > 1 ? 'are times' : 'is a time'} the person TYPED: show exactly that text, static. ` +
      'Never a live clock or countdown (no Date(), no setInterval/setTimeout ticking it, no toLocaleTimeString): the page must read the typed value. Checked on the page.')
  }
  const seen = new Set<string>()
  for (const n of notes) {
    if (progressOf(n)) continue
    const p = noteParts(n)
    if ((!p.look && !p.directions.length && !p.place) || seen.has(n)) continue
    seen.add(n)
    if (p.place || p.more?.length) {
      // n104: "Mia · 2:14 pm above; Copy is final." = a small label placed above the item, and the item's own text
      const said = [p.place ? `"${p.place}" says WHERE the label "${p.copy}" goes (${p.place} the item's own text, its own line), never a word to print` : '',
        p.look ? `"${p.look}" says how it looks` : '',
        p.directions.length ? `${p.directions.map((d) => `"${d}"`).join(', ')} ${p.directions.length > 1 ? 'are directions' : 'is a direction'} (apply, never print)` : ''].filter(Boolean).join('; ')
      const texts = [`"${p.copy}"`, ...(p.more ?? []).map((m) => `"${m}"`)].join(' and ')
      lines.push(`- "${n}": the text on the page is ${texts}${p.more?.length ? ` (the sentence${p.more.length > 1 ? 's are' : ' is'} the item's own copy, shown in full)` : ''}. ${said}.`)
      if (lines.length >= 24) break
      continue
    }
    const said = [p.look ? `"${p.look}" says how it looks` : '', p.directions.length ? `${p.directions.map((d) => `"${d}"`).join(', ')} ${p.directions.length > 1 ? 'are directions' : 'is a direction'} (apply ${p.directions.length > 1 ? 'them' : 'it'}: which items are on, done, ticked, active)` : ''].filter(Boolean).join('; ')
    lines.push(`- "${n}": the text on the page is only "${p.copy}". ${said}. Never print the note itself, its look words or its directions as text (no subtitle, caption or label repeating them).`)
    if (lines.length >= 24) break
  }
  return lines.length ? `TYPED COPY vs DIRECTIONS (deterministic; checked on the page):\n${lines.join('\n')}\n\n` : ''
}

const pageText = (after: Snap) => after.nodes.map((n) => (n.text ?? '').trim()).filter(Boolean)

/** Typed times are on the page as typed (a live clock shows the real time instead). */
export function verifyTypedTimes(notes: readonly string[], after: Snap): CopyVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const times = typedTimes(notes)
  if (!times.length) return { satisfied: true, unverifiable: true, reason: 'no time typed' }
  const all = norm(pageText(after).join(' | '))
  if (!all) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const missing = times.filter((t) => !all.includes(norm(t)))
  return missing.length
    ? { satisfied: false, reason: `the typed time${missing.length > 1 ? 's' : ''} ${missing.map((t) => `"${t}"`).join(', ')} ${missing.length > 1 ? 'are' : 'is'} not on the page as typed (a live clock or a changed value): show exactly that static text where it was typed; remove any Date()/timer code that writes it; change nothing else` }
    : { satisfied: true, reason: `${String(times.length)} typed time${times.length > 1 ? 's' : ''} shown as typed` }
}

/** No direction, look tail or raw note is shown as text. */
export function verifyNoDirections(notes: readonly string[], after: Snap): CopyVerdict {
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const bad = directionStrings(notes)
  if (!bad.length) return { satisfied: true, unverifiable: true, reason: 'no note with look words or directions' }
  const texts = pageText(after).map(norm)
  const shown = new Map<string, { text: string; why: string; note: string }>()
  for (const b of bad) {
    const want = norm(b.text)
    if (want.length < 3) continue
    // a direction like "done M T W F" may be split over spans; a leaf that contains it, or a short leaf equal to it
    if (texts.some((t) => t.includes(want))) shown.set(b.text, b)
  }
  if (!shown.size) return { satisfied: true, reason: `${String(bad.length)} direction${bad.length > 1 ? 's' : ''} and look tails kept off the page` }
  const list = [...shown.values()].slice(0, 6)
  return { satisfied: false, reason: list.map((b) => `"${b.text}" (${b.why} of the note "${b.note}") is printed on the page`).join('; ') +
    ': remove that text (it is how the note asked the item to look or behave, not copy), keep the item\'s own words and apply what it asked; change nothing else' }
}

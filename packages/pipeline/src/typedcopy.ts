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
import { cardList } from './repeatmark.js'
import { countedRow } from './countrow.js'
import { endPair } from './endpair.js'
import { cellRows, countedItems } from './drawnlist.js'
import { progressOf } from './progress.js'
import { calendarOf } from './calendar.js'
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

/** n130: words that name the state or kind of an item, typed after a comma ("Biscuit selected, avatar"). */
const STATE = /^(selected|active|current|highlighted|chosen|disabled|faded|dashed|avatar|avatars|icon|icons|image|picture|photo|thumbnail|logo|placeholder)$/i
/** n130: a state word ending a short label. */
const ON_STATE = /^(selected|active|current|highlighted|chosen)$/i
/** n130: how many go in a row ("4 a row", "3 per row", "5 across"). */
const PER_ROW = /^\d+\s+(?:(?:a|per|each|in\s+a)\s+(?:row|line)|across|columns?|cols?|wide)$/i

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

/** n167: words that only ever say how big or heavy a line is, never its copy, when they end a note. */
const SIZE_WEIGHT = /^(big|bigger|huge|giant|large|larger|massive|jumbo|enormous|bold|bolder|semibold|tiny|smaller|italic|caps|uppercase)$/i

/**
 * n167: a trailing run of look words with no comma before it, holding at least one size or weight word, after at least
 * two words of copy: "Website relaunch big" -> copy "Website relaunch", look "big". Round 42 e4 printed "big" in the
 * title. A run of only colour or place words is left alone ("Overdue 3 red" is read elsewhere), and so is a one-word
 * copy ("Think big" stays copy).
 */
function bareLookTail(copy: string): { copy: string; look: string } | null {
  const toks = copy.split(/\s+/).filter(Boolean)
  let i = toks.length
  while (i > 0) {
    const w = toks[i - 1]!.replace(/[^\p{L}]/gu, '')
    // n164: a word ending a sentence is the copy's own ("Every Friday, after dark. huge bold")
    if (i < toks.length && /[.!?…]["'”’)]?$/.test(toks[i - 1]!)) break
    if (w && (LOOK.test(w) || SIZE_WEIGHT.test(w)) && !/^(and|text|size|label|heading|title|subtitle|headline|link|button|pill|chip|badge|left|right)$/i.test(w)) i--
    else break
  }
  if (i === toks.length || i < 2) return null
  const tail = toks.slice(i)
  if (!tail.some((w) => SIZE_WEIGHT.test(w.replace(/[^\p{L}]/gu, '')))) return null
  // n164: copy with its own commas keeps a one-word tail ("Think small, dream big"); two or more look words are a tail
  if (copy.includes(',') && tail.length < 2) return null
  // "so big", "too bold": the look word is part of a phrase
  if (/^(so|too|very|really|the|a|an|be|is|go|think|dream|stay|get)$/i.test(toks[i - 1]!.replace(/[^\p{L}]/gu, ''))) return null
  return { copy: toks.slice(0, i).join(' '), look: tail.join(' ') }
}

/**
 * n164: ", MATE outlined only" after copy holding MATE: the word or two named, then only look words. The named words must
 * be in the copy before the comma, exactly as typed, so "Bold, bold move" and "Sam, Sam white" style copy is judged by
 * the look words too: at least one must follow, and the copy before must keep something besides them.
 */
function scopedLook(copy: string): { copy: string; direction: string } | null {
  const j = copy.lastIndexOf(',')
  if (j <= 0) return null
  const tail = copy.slice(j + 1).trim()
  const toks = tail.split(/\s+/).filter(Boolean)
  if (toks.length < 2 || toks.length > 5) return null
  const clean = toks.map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
  let e = clean.length
  if (/^only$/i.test(clean[e - 1]!)) e--
  let n = 0
  while (n < e && !LOOK.test(clean[n]!)) n++
  if (n < 1 || n > 2 || n === e) return null
  if (!clean.slice(n, e).every((w) => LOOK.test(w) || SIZE_WEIGHT.test(w))) return null
  const head = copy.slice(0, j).split(/[\s/]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
  if (!clean.slice(0, n).every((w) => head.includes(w))) return null
  // the word must have another word beside it in the copy: "Sam, Sam white" names the only word there is
  if (head.filter(Boolean).length <= n) return null
  return { copy: copy.slice(0, j).trim(), direction: tail }
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
  // n164: a second look tail before the first ("First tracks, / warm fire, huge bold, right"): only one was taken, so
  // "huge bold" was printed as a third heading line. It must hold a size or weight word, so "Red, green, blue" stays copy.
  for (let k = 0; look && k < 2; k++) {
    const j = copy.lastIndexOf(',')
    if (j <= 0) break
    const tail = copy.slice(j + 1).trim()
    const words = tail.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean)
    // a value is copy: "Paid, 612 big, +3% green" is a stat with its number
    if (/\d/.test(tail) || !words.length || !words.every((w) => LOOK.test(w) || SIZE_WEIGHT.test(w)) || !words.some((w) => SIZE_WEIGHT.test(w))) break
    look = `${tail}, ${look}`
    copy = copy.slice(0, j).trim()
  }
  // n164: a look given to one word of the copy ("CHECK / MATE huge bold caps, MATE outlined only"): how that word looks,
  // never copy. Round 41 c4 printed "MATE HUGE BOLD CAPS, MATE OUTLINED ONLY" as the second heading line.
  const sc = scopedLook(copy)
  if (sc) { directions.unshift(sc.direction); copy = sc.copy }
  // n130: comma tails that say what the item is or how many go in a row ("Biscuit selected, avatar", "..., 4 a row")
  for (let k = 0; k < 3; k++) {
    const j = copy.lastIndexOf(',')
    if (j <= 0) break
    const tail = copy.slice(j + 1).trim()
    const words = tail.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean)
    const kind = words.length > 0 && words.length <= 3 && words.every((w) => STATE.test(w) || LOOK.test(w)) && words.some((w) => STATE.test(w))
    if (!kind && !PER_ROW.test(tail)) break
    directions.unshift(tail)
    copy = copy.slice(0, j).trim()
  }
  // n130: a state word after a short label ("Biscuit selected") says which item is on, never copy
  const lw = copy.split(/\s+/)
  if (lw.length >= 2 && lw.length <= 4 && ON_STATE.test(lw.at(-1)!.replace(/[^\p{L}]/gu, '')) && !/^(not|un)/i.test(lw.at(-2)!)) {
    directions.unshift(lw.at(-1)!)
    copy = lw.slice(0, -1).join(' ')
  }
  const pt = placeTail(copy, more.length > 0)
  if (pt.place) { copy = pt.copy; look = [pt.look, look].filter(Boolean).join(', ') || null }
  // n167: a size or weight run typed straight after the copy with no comma ("Website relaunch big", "Slow Science huge bold")
  if (!look && !pt.place) { const bt = bareLookTail(copy); if (bt) { copy = bt.copy; look = bt.look } }
  return { copy, look, directions, ...(pt.place ? { place: pt.place } : {}), ...(more.length ? { more } : {}) }
}


/** n179: words that name a part of an item or how it looks, in a note that describes a kind of item. */
const PART = /^(picture|pictures|image|images|photo|photos|thumbnail|thumb|name|names|title|titles|price|prices|label|labels|caption|captions|subtitle|top|bottom|under|below|above|beneath|left|right|corner|icon|icons|avatar|avatars|tag|tags|badge|badges|button|buttons|tinted|tint|bold|grey|gray|muted|small|big|line|lines|text|date|dates|age|breed|meta|rating|stars|footer|header|body|description|row|rows|column|columns|each|every|rounded|shadow|border|outline|filled|pale|light|dark)$/i

/**
 * n179 (round 43 e4 pets): "pet cards: tinted picture top (peach, sage, blue, lilac), name bold, age · breed under"
 * says how every pet card is laid out; one build printed it whole as the first card's name. A note "<kind>: <how
 * each looks>" whose part after the colon is lower-case words naming parts and looks is a description, never copy.
 * A colon note whose list holds names ("filters: Animal (Dogs, Cats)") is not one.
 */
export function specNote(note: string): { kind: string; desc: string; lead: string } | null {
  const m = /^\s*([\p{L}][\p{L}\s'-]{1,30}?)\s*:\s*(.+)$/u.exec(note)
  if (!m || note.includes(';')) return null
  const kind = m[1]!.trim(), desc = m[2]!.trim()
  if (kind.split(/\s+/).length > 3 || /\p{Lu}/u.test(kind.slice(1))) return null
  const words = desc.split(/[\s,()·/]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean)
  if (words.length < 3) return null
  if (words.filter((w) => /^\p{Lu}/u.test(w)).length > 1 || /\d/.test(desc)) return null
  if (words.filter((w) => PART.test(w)).length < 2) return null
  const lead = desc.split(/[,(;]/)[0]!.trim()
  return { kind, desc, lead: lead.split(/\s+/).length >= 2 ? lead : desc.split(/\s+/).slice(0, 4).join(' ') }
}

/**
 * n179 (round 43 e4 pets): "Biscuit, Juno, Pepper, Otis, Maple, Rio" typed on the pet cards gives one name to each;
 * one build printed the whole list as the second card's name. Three or more short capitalised items with commas
 * are names for as many items, each printed alone, never the list as one line.
 */
export function nameList(note: string): string[] | null {
  if (/[:;()]/.test(note)) return null
  const items = note.split(',').map((t) => t.trim()).filter(Boolean)
  if (items.length < 3) return null
  for (const it of items) {
    const ws = it.split(/\s+/)
    if (ws.length > 3 || !/^\p{Lu}/u.test(it) || /[.!?]$/.test(it)) return null
    if (ws.every((w) => LOOK.test(w.replace(/[^\p{L}]/gu, '')))) return null
  }
  return items.map((it) => nameItem(it).name)
}

/** n246: a name and the look words typed after it ("Drift bold" is the name Drift, bold). */
function nameItem(item: string): { name: string; looks: string[] } {
  const ws = item.split(/\s+/)
  let cut = ws.length
  while (cut > 1 && LOOK.test(ws[cut - 1]!.replace(/[^\p{L}]/gu, ''))) cut--
  return { name: ws.slice(0, cut).join(' '), looks: ws.slice(cut) }
}

/**
 * n246: round 48: "Drift bold, Week, Month, Goals right" was told as four names, look words in: "Drift bold" and
 * "Goals right" were printed on the sleep page, and on the rota "right" moved only the last name. A name's look words
 * only style it, and "right" on the last name puts the names after the first at the bar's right end, as typed.
 */
export function nameListLooks(note: string): { raw: string[]; lastRight: boolean } {
  const items = note.split(',').map((t) => t.trim()).filter(Boolean)
  const raw = items.filter((it) => nameItem(it).looks.length)
  return { raw, lastRight: items.length > 0 && nameItem(items[items.length - 1]!).looks.some((w) => /^right$/i.test(w)) }
}

const TIME = /(?<![\d:])(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?)(?![\d:])/gi

/** Times typed in the notes' copy (14:32, 9:05 pm). */
export function typedTimes(notes: readonly string[]): string[] {
  const out = new Set<string>()
  for (const n of notes) { const p = noteParts(n); for (const c of [p.copy, ...(p.more ?? [])]) for (const m of c.matchAll(TIME)) out.add(m[1]!.trim()) }
  return [...out]
}

/** Strings that must never be text on the page: directions, multi-word look tails, raw notes that carried them. */
/**
 * n268: the words before a trailing run of lower-case look words, however they were typed ("Mara Lind grey", "The Deep
 * Blue bold", "On loan red pill"). A capital stops it, so "Deep Blue" is kept whole.
 */
export function withoutLookTail(text: string): string {
  const words = text.trim().split(/\s+/)
  while (words.length > 1 && words.at(-1) === words.at(-1)!.toLowerCase() && LOOK.test(words.at(-1)!.replace(/[^\p{L}]/gu, ''))) words.pop()
  return words.join(' ')
}

/** n268: words that say how a whole kind of thing looks, typed after its name. */
const FILL_WORD = /^(solid|flat|hollow|filled|plain|empty|outlined)$/
const TAIL_WORD = /^(solid|flat|hollow|filled|plain|empty|outlined|rounded|round|square|dashed|dotted|striped|thick|thin|bold|big|small|huge|tiny|dark|light|pale|bright|faint|white|black|grey|gray|red|orange|yellow|green|teal|cyan|blue|navy|indigo|purple|violet|pink|brown|beige|cream|gold|silver)$/
const HOW_MANY = /^(all|every|each|both|two|three|four|five|six|seven|eight|nine|ten|\d+)$/
/**
 * n268 (library search): "four covers solid" typed on the first of four covers says how they look. It was taken as the
 * first cover's words, and a check then demanded it on the page, replacing the title The Deep Blue. The same for
 * "pale chips solid" and "tracks thick black". A count or "all", then a plural (or one thing plus a fill word), then look
 * words. Copy with a look word stays copy: "results grey", "Four Seasons bold", "All white". Returns the thing's name.
 */
export function lookNote(text: string): string | null {
  const t = text.trim()
  if (!t || /[:;,.!?"]/.test(t)) return null
  const words = t.split(/\s+/)
  if (words.length < 2 || words.length > 6) return null
  if (words.slice(1).some((w) => w !== w.toLowerCase())) return null
  const first = words[0]!.toLowerCase()
  const capital = words[0] !== first
  let i = 0
  const many = HOW_MANY.test(first)
  if (many) i++
  if (words[i]?.toLowerCase() === 'the') i++
  let adjectives = 0
  while (i < words.length - 2 && TAIL_WORD.test(words[i]!.toLowerCase())) { i++; adjectives++ }
  const noun = words[i]?.toLowerCase()
  if (!noun || !/^[a-z]{3,}$/.test(noun) || TAIL_WORD.test(noun)) return null
  const tail = words.slice(i + 1).map((w) => w.toLowerCase())
  if (!tail.length || !tail.every((w) => TAIL_WORD.test(w))) return null
  const plural = /[^su]s$/.test(noun) && noun !== 'news'
  const fill = tail.some((w) => FILL_WORD.test(w))
  // a capital opens a title as easily as a note: only a fill word says it is a look ("Four covers solid", not "Four seasons bold")
  if (capital && !(many && fill)) return null
  if (plural && (many || fill || tail.length >= 2)) return noun
  return !plural && !many && !adjectives && fill ? noun : null
}

export function directionStrings(notes: readonly string[]): { text: string; why: string; note: string }[] {
  const out: { text: string; why: string; note: string }[] = []
  for (const n of notes) {
    // n268: "four covers solid" says how a kind of thing looks; none of it is text
    if (lookNote(n)) { out.push({ text: n.trim(), why: 'how a kind of thing looks', note: n }); continue }
    // n92: a progress bar note is told and checked by progress.ts (its caption is copy, its percent is the fill)
    if (progressOf(n)) continue
    // n215: rows with cells listed after a count are all typed copy (row data tells and checks them)
    if (cellRows(n) || countedRow(n)) continue
    // n228: a name, a value and how it looks: only the look words are not copy, and they are never one line with the rest
    if (endPair(n)) continue
    // n179: a note describing how a kind of item looks, and a list of names one per item, are never one line of text
    const sp = specNote(n)
    if (sp) { out.push({ text: sp.lead, why: `a description of how the ${sp.kind} look`, note: n }); continue }
    const nl = nameList(n)
    if (nl) {
      out.push({ text: nl.slice(0, 3).join(', '), why: 'a list of names, one per item', note: n })
      for (const raw of nameListLooks(n).raw) out.push({ text: raw, why: 'a name with its look words', note: n })
      continue
    }
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
    // n167: a look run typed with no comma: the note as typed, printed whole
    if (p.look && p.copy && !p.place && !n.includes(',')) out.push({ text: `${p.copy} ${p.look}`, why: 'the raw note', note: n })
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
    // n268: a note about how a whole kind of thing looks prints nothing
    const kindLook = lookNote(n)
    if (kindLook) { lines.push(`- "${n}": says how the ${kindLook} look. None of these words is text on the page: never print them as a title, name or caption; each item keeps its own typed words.`); continue }
    if (progressOf(n)) continue
    // n215: rows with cells listed after a count are all typed copy (row data tells and checks them)
    if (cellRows(n) || countedRow(n)) continue
    // n113: a calendar note describes its block; calendar.ts tells its heading and days
    if (calendarOf(n)) continue
    const sp = specNote(n)
    if (sp && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}" DESCRIBES how each of the ${sp.kind} looks (its parts and their style): build that layout on EVERY one of them. ` +
        `None of these words is text on the page: never print the note, "${sp.kind}" or "${sp.lead}" as a name, title or caption.`)
      continue
    }
    const nl = nameList(n)
    if (nl && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}" gives ${nl.length} names, one per item, in drawn order (left to right, then top to bottom): ${nl.map((t) => `"${t}"`).join(', ')}. ` +
        'Each item shows only its own name; never print the list (or several names) as one line.' +
        (nameListLooks(n).raw.length ? ` Look words typed with a name (${nameListLooks(n).raw.map((t) => `"${t}"`).join(', ')}) only style that name; never print them.` : '') +
        (nameListLooks(n).lastRight ? ` "right" on the last name: the first name stays at the left and the names after it sit together at the bar's right end, in typed order.` : ''))
      continue
    }
    // n228: a name and a value: two pieces of text, whatever else the note could be read as
    const pair = endPair(n)
    if (pair && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}": the text on the page is "${pair.name}" and "${pair.value}", two separate pieces. The comma${pair.looks.length ? ' and the look words are' : ' is'} not printed.`)
      continue
    }
    // n223: a count across: the items are the text, in one row
    const across = countedRow(n)
    if (across && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}": the text on the page is the ${String(across.n)} items, side by side: ${across.items.map((i) => `"${i.main}"${i.under ? ` with "${i.under}" under it` : ''}`).join(', ')}. The count, the words before the colon, the comma between an item's two lines and the look words are never printed.`)
      continue
    }
    // n225: a count of cards, each a picture and a caption: only the captions are text
    const cards = cardList(n)
    if (cards && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}": the only text on the page from this note is the ${String(cards.length)} captions: ${cards.map((i) => `"${i.caption}"`).join(', ')}. Everything else in it says what to draw and how it looks; never print it.`)
      continue
    }
    // n214: a count listing its items: the items are the text, never the count, the lead or a share
    const counted = countedItems(n)
    if (counted && !seen.has(n)) {
      seen.add(n)
      lines.push(`- "${n}": the text on the page is the ${String(counted.n)} items: ${counted.items.map((i) => `"${i.label}"${i.value ? ` with "${i.value}"` : ''}`).join(', ')}. The count, the words before the colon and any share (half, 70%) are directions: never print them.`)
      continue
    }
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

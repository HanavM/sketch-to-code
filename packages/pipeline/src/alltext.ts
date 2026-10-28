/**
 * "All text white": one note about the colour of every word on the page (n30).
 *
 * Round 31 e4 (hand, n28 and n29): the whole-sketch note "all text white" was
 * passed along with the other words, the build kept the hero white but set the
 * hourly and daily panels in dark grey, and a fix note on a panel bound to one
 * span, so only that word changed. A person who types "all text white" means
 * every word on the page. So the note is read here, told to codegen as one rule
 * for every text element, and checked on the built page: nearly every element
 * with its own words paints that colour. Zero tokens.
 */
import type { DomSnapshot } from '@s2c/dom'
import { deltaE, hexOf, parseCssColor } from './palette.js'

const WORDS: Record<string, string> = {
  white: '#ffffff', black: '#111111', 'off-white': '#f6f4ee', cream: '#f3ead8', navy: '#1b2a4e',
  charcoal: '#2b2b2b', grey: '#9ca3af', gray: '#9ca3af',
}
const C = Object.keys(WORDS).join('|')
const TEXT = '(?:text|words|type|copy|lettering|letters|labels|writing)'
const PATTERNS = [
  // "all text white", "all the text is white", "every word in white"
  new RegExp(`\\b(?:all|every|all the)\\s+(?:the\\s+)?${TEXT}\\s+(?:is\\s+|are\\s+|in\\s+|=\\s*)?(${C})\\b`, 'i'),
  // "white text everywhere", "white text throughout"
  new RegExp(`\\b(${C})\\s+${TEXT}\\s+(?:everywhere|throughout|all over|on everything)\\b`, 'i'),
  // "text all white"
  new RegExp(`\\b${TEXT}\\s+all\\s+(${C})\\b`, 'i'),
]

export interface AllText { word: string; hex: string; note: string }

/** The first note that sets the colour of all text on the page, or null. */
export function allTextColour(notes: string[]): AllText | null {
  for (const note of notes) {
    for (const re of PATTERNS) {
      const m = re.exec(note)
      if (m) { const word = m[1]!.toLowerCase(); return { word, hex: WORDS[word]!, note } }
    }
  }
  return null
}

export function allTextBrief(a: AllText | null): string {
  if (!a) return ''
  return `ALL TEXT ONE COLOUR (the user typed "${a.note}"; checked on the page): every piece of text on the page, in every ` +
    `panel, card, row, label and small caption, is ${a.word} (about ${a.hex}; slightly see-through ${a.word} for small or secondary ` +
    `text is fine). Never dark grey, black or a muted tone inside panels; text on a coloured button may differ only if the button ` +
    `itself was typed with its own text colour.\n\n`
}

export interface AllTextVerdict { satisfied: boolean; unverifiable?: boolean; reason: string; share?: number }

const TOL = 14

export function verifyAllText(a: AllText | null, after: DomSnapshot): AllTextVerdict {
  if (!a) return { satisfied: true, unverifiable: true, reason: 'no note about all text' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const want = parseCssColor(a.hex)!
  const texts = after.nodes.filter((n) => n.text.trim().length > 0 && n.rect.w > 0 && n.rect.h > 0 &&
    !['script', 'style', 'title', 'option'].includes(n.tag))
  if (texts.length < 2) return { satisfied: true, unverifiable: true, reason: 'too little text to judge' }
  const off = texts.filter((n) => { const g = parseCssColor(n.style.color); return !g || deltaE(g, want) > TOL })
  const share = 1 - off.length / texts.length
  if (share >= 0.85) return { satisfied: true, reason: `${String(texts.length - off.length)} of ${String(texts.length)} text elements ${a.word}`, share }
  const shown = off.slice(0, 5).map((n) => `"${n.text.slice(0, 24)}" (${hexOf(parseCssColor(n.style.color) ?? want)})`).join(', ')
  return {
    satisfied: false,
    share,
    reason: `the user typed "${a.note}", but ${String(off.length)} of ${String(texts.length)} text elements are not ${a.word}: ${shown}` +
      `${off.length > 5 ? ', …' : ''}; set every one of them to ${a.word} text (text-white or ${a.hex}); change nothing else`,
  }
}

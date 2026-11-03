/**
 * A button's typed label stays as typed (n111).
 *
 * Round 38 e1 (hotel booking, n108/n78): a dark bar drawn under the calendar was typed "Reserve · 4 nights". The
 * number with a word made it a stat card (a huge "4" over a small "Reserve"), and the dot made it a row of two
 * cells. A person who types a phrase that starts with an action word (Reserve, Book, Apply, Buy, Sign up...) on a
 * box means the button's label, word for word.
 *
 * Here: a short note that starts with an action word is a BUTTON LABEL: never a stat card, never split into cells;
 * the build is told to print it exactly as typed on one line (dots and numbers included) inside its box, and the
 * page is checked that the label is one piece of text. Zero tokens.
 */
import { noteParts } from './typedcopy.js'

interface NodeLike { id: string; text?: string; textBox?: { x: number; y: number; w: number; h: number } }
interface Snap { nodes: NodeLike[]; truncated?: boolean }
export interface ButtonLabelVerdict { satisfied: boolean; unverifiable?: boolean; reason: string }

/** Words a button label starts with. */
const ACTION = /^(reserve|book|buy|pay|checkout|check|sign|log|apply|join|subscribe|get|start|continue|send|add|save|submit|rent|donate|download|try|shop|register|upgrade|confirm|place|request|schedule|claim|enrol|enroll|follow|contact|call|message|invite|create|share|install|view|explore|learn|discover|watch|listen|play|go|next|back|finish|proceed|accept|redeem|reply|post|publish|upload|connect|retry|cancel|delete|remove|edit|update|search|find|browse|compare|pre-order|preorder)\b/i

/** The button label a note gives (its copy, as typed), or null. */
export function buttonLabel(note: string): string | null {
  const copy = noteParts(note).copy.trim()
  if (!copy || !ACTION.test(copy)) return null
  // only a label: short, one phrase, no rows, no sentence of copy
  if (/\s\/\s|\n|[,;:]/.test(copy)) return null
  const words = copy.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
  if (words.length < 2 || words.length > 6) return null
  // three or more dotted parts are a nav or a meta line ("Shop · Visit · Recipes"), not one label
  if (copy.split(/\s*[·•|]\s*/).filter(Boolean).length > 2) return null
  // a plain two-word label ("Sign in") needs no help; this is for labels with a number or a separator in them
  if (!/\d|[·•|–—]/.test(copy)) return null
  return copy
}

const q = (s: string) => `"${s}"`

export function buttonLabelBrief(notes: readonly string[]): string {
  const labels = [...new Set(notes.map(buttonLabel).filter((l): l is string => !!l))]
  if (!labels.length) return ''
  return `BUTTON LABELS (deterministic; checked on the page). These notes start with an action word, so each is a button's label, typed word for word: ` +
    `${labels.slice(0, 8).map(q).join(', ')}. Print each EXACTLY as typed, as ONE piece of text on one line inside its drawn box or bar ` +
    `(centred, the button's weight and size), dots, numbers and words in the typed order. It is never a stat card (no big number, no number over a label), ` +
    `never split into two cells or two lines, never reworded.\n\n`
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s*([·•|–—])\s*/g, ' $1 ').replace(/\s+/g, ' ').trim()

/** Each button label is on the page as one piece of text. */
export function verifyButtonLabels(notes: readonly string[], after: Snap): ButtonLabelVerdict {
  const labels = [...new Set(notes.map(buttonLabel).filter((l): l is string => !!l))]
  if (!labels.length) return { satisfied: true, unverifiable: true, reason: 'no typed button labels' }
  if (after.truncated) return { satisfied: true, unverifiable: true, reason: 'snapshot truncated' }
  const texts = after.nodes.filter((n) => (n.text ?? '').trim()).map((n) => norm(n.text!))
  if (!texts.length) return { satisfied: true, unverifiable: true, reason: 'no text on the page' }
  const miss = labels.filter((l) => !texts.some((t) => t.includes(norm(l))))
  return miss.length
    ? { satisfied: false, reason: `the button label${miss.length > 1 ? 's' : ''} ${miss.map(q).join(', ')} ${miss.length > 1 ? 'are' : 'is'} not on the page as one piece of text: print it exactly as typed on one line inside its button (no big number, no split); change nothing else` }
    : { satisfied: true, reason: `${String(labels.length)} button label${labels.length > 1 ? 's' : ''} printed as typed` }
}

import { BASE_APP } from './base.mjs'
import { rarrow } from '../../lib/rough.mjs'

/**
 * Edit: two arrows between the first and third feature cards, one each way.
 * INTERPRET_PROMPT: "TWO arrows between the same two elements (or crossing) =
 * swap them". No words: the pair of marks is the whole instruction. The
 * arrows pass over the middle card on the way, as a hurried hand's would.
 */
export default {
  id: 'r13-two-arrows-swap-cards',
  title: 'EDIT: two wobbly arrows, card 1 to card 3 and back (swap them), no words',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Instant previews', 'Usage-based billing'],
  strokes: [
    rarrow(240, 418, 1020, 414),
    rarrow(1030, 456, 250, 462),
  ],
  notes: [],
  edits: [
    { check: 'leftOf', a: 'Usage-based billing', b: 'One-click rollbacks', must: true },
    { check: 'leftOf', a: 'One-click rollbacks', b: 'Instant previews', must: true },
    { check: 'kept', text: 'Instant previews', must: true },
    { check: 'kept', text: 'Usage-based billing', must: true },
    { check: 'kept', text: 'We cut our release time' },
  ],
}

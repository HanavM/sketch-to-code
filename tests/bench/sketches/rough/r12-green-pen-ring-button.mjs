import { BASE_APP } from './base.mjs'
import { rring } from '../../lib/rough.mjs'

/**
 * Edit: the same lopsided ring as r03, drawn in a GREEN pen, and no words.
 * The pen colour is the value (s2c-015): this is r03 with the one thing r03
 * needed words for carried by the mark instead. "bigger" is not asked for:
 * size has no mark here (resize is a tweak-mode drag, docs/visual-language.md).
 */
export default {
  id: 'r12-green-pen-ring-button',
  title: 'EDIT: a lopsided ring around the button, drawn in a green pen, no words',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Get started'],
  strokes: [rring(640, 309, 96, 38, { seed: 1203 })],
  pens: ['#16a34a'],
  notes: [],
  edits: [
    { check: 'bg', text: 'Get started', hue: [90, 170], must: true },
    { check: 'kept', text: 'Get started', must: true },
    { check: 'kept', text: 'Ship faster with Acme' },
    { check: 'kept', text: 'Instant previews' },
  ],
}

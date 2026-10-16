import { BASE_LIST_APP } from './base.mjs'
import { rbox } from '../../lib/rough.mjs'

/**
 * Edit: one loose empty box in the empty fourth cell of a three-tile row, and
 * no words. Row 9 of docs/visual-language.md, "add one more of a list": the
 * box's place says "one more of these", and nothing says what it is, so the
 * tile's name and copy are the model's to invent. The lexicon reads repeated
 * boxes as a list; this asks whether ONE new box next to three existing ones
 * reads as "another" rather than as a new, different card or a frame.
 *
 * Judged on the count only (4 tiles in the row) plus no collateral damage.
 * Whether the invented tile looks like the other three (heading + one line,
 * same border) is not checked: the IoU/visual side of the report shows it.
 */
export default {
  id: 'r15-box-one-more-tile',
  title: 'EDIT: one loose empty box in the empty slot after three tiles (add one more), no words',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_LIST_APP,
  anchors: ['GitHub', 'GitLab', 'Slack'],
  strokes: [rbox(966, 600, 252, 72, { seed: 1501 })],
  notes: [],
  edits: [
    { check: 'siblings', text: 'Slack', min: 4, must: true },
    { check: 'kept', text: 'GitHub', must: true },
    { check: 'kept', text: 'GitLab', must: true },
    { check: 'kept', text: 'Slack', must: true },
    { check: 'kept', text: 'Instant previews' },
  ],
}

import { BASE_APP } from './base.mjs'
import { rarrow } from '../../lib/rough.mjs'

/** Edit: one arrow from the quote up to the top of the features. Move it. */
export default {
  id: 'r04-arrow-move-quote',
  title: 'EDIT: one wobbly arrow from the testimonial up above the feature cards',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['We cut our release time', 'Instant previews'],
  strokes: [rarrow(660, 600, 630, 372)],
  notes: [{ at: { x: 700, y: 500 }, text: 'move the quote up here', content: null }],
  edits: [
    { check: 'above', a: 'We cut our release time', b: 'Instant previews', must: true },
    { check: 'above', a: 'Ship faster with Acme', b: 'We cut our release time' },
    { check: 'kept', text: 'Priya N.' },
    { check: 'kept', text: 'Usage-based billing' },
  ],
}

import { BASE_APP } from './base.mjs'
import { rscribble } from '../../lib/rough.mjs'

/** Edit: one loose scribble over the third feature card, no words. Delete it. */
export default {
  id: 'r01-scribble-out-card',
  title: 'EDIT: a single loose scribble over the third feature card (delete it)',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Usage-based billing', 'Pay for the minutes'],
  strokes: [rscribble(880, 396, 330, 78)],
  notes: [],
  edits: [
    { check: 'absent', text: 'Usage-based billing', must: true },
    { check: 'kept', text: 'Instant previews' },
    { check: 'kept', text: 'One-click rollbacks' },
    { check: 'kept', text: 'Get started' },
  ],
}

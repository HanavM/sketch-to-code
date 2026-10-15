import { BASE_APP } from './base.mjs'
import { rline } from '../../lib/rough.mjs'

/** Edit: a quick X over one nav link. Delete just that link. */
export default {
  id: 'r06-x-out-nav-link',
  title: 'EDIT: a quick two-stroke X over the "Pricing" nav link',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Pricing', 'Features', 'About'],
  strokes: [
    rline(1110, 22, 1164, 46, { slop: 3 }),
    rline(1162, 20, 1112, 47, { slop: 3 }),
  ],
  notes: [],
  edits: [
    { check: 'absent', text: 'Pricing', must: true },
    { check: 'kept', text: 'Features' },
    { check: 'kept', text: 'About' },
    { check: 'kept', text: 'Ship faster with Acme' },
  ],
}

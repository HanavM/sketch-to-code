import { BASE_APP } from './base.mjs'
import { rline } from '../../lib/rough.mjs'

/** Edit: strike through the headline and type the new one. Rewrite, not delete. */
export default {
  id: 'r02-strike-headline',
  title: 'EDIT: a sloppy strike-through on the headline + the new words',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Ship faster with Acme'],
  strokes: [rline(420, 160, 860, 154, { slop: 10 })],
  notes: [{ at: { x: 640, y: 157 }, text: 'say: Sketch it. Ship it.' }],
  edits: [
    { check: 'absent', text: 'Ship faster with Acme', must: true },
    { check: 'present', kind: 'text', text: 'Sketch it', must: true },
    { check: 'kept', text: 'Get started' },
    { check: 'kept', text: 'Instant previews' },
  ],
}

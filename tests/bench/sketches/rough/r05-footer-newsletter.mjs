import { BASE_APP } from './base.mjs'
import { rbox } from '../../lib/rough.mjs'

/** Edit: a three-sided box in the footer + a few words. Add a form there. */
export default {
  id: 'r05-footer-newsletter',
  title: 'EDIT: a three-sided box on the footer + "email + Subscribe button"',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['© 2026 Acme Inc.'],
  strokes: [rbox(820, 706, 400, 46, { sides: 3 })],
  notes: [{ at: { x: 1000, y: 729 }, text: 'newsletter: email box + Subscribe button', content: 'email, Subscribe' }],
  edits: [
    { check: 'present', kind: 'input', must: true },
    { check: 'present', kind: 'control', text: 'subscribe', must: true, needsWords: true },
    { check: 'kept', text: '© 2026 Acme' },
    { check: 'kept', text: 'Priya N.' },
  ],
}

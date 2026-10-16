import { BASE_APP } from './base.mjs'
import { rcaret } from '../../lib/rough.mjs'

/**
 * Edit: a caret under the gap between "Features" and "Pricing" + "Blog".
 * The caret is the only mark that says WHERE without saying WHAT: the new
 * link's text is content no mark can carry, so with --words none this page is
 * not judged. It exists because the reader has recognised carets since v1
 * (packages/intent/src/plan.ts, INSERT) and no bench page ever drew one.
 */
export default {
  id: 'r14-caret-insert-nav-link',
  title: 'EDIT: a quick caret between two nav links + "Blog"',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Features', 'Pricing'],
  strokes: [rcaret(1098, 42, 18, 16)],
  notes: [{ at: { x: 1098, y: 66 }, text: 'Blog', content: 'Blog' }],
  edits: [
    { check: 'present', kind: 'text', text: 'Blog', must: true, needsWords: true },
    { check: 'leftOf', a: 'Features', b: 'Blog', must: true, needsWords: true },
    { check: 'leftOf', a: 'Blog', b: 'Pricing', must: true, needsWords: true },
    { check: 'kept', text: 'Features' },
    { check: 'kept', text: 'Pricing' },
  ],
}

import { BASE_APP } from './base.mjs'
import { rring } from '../../lib/rough.mjs'

/** Edit: a lopsided ring around the CTA + "bigger and green". Restyle it. */
export default {
  id: 'r03-ring-button-green',
  title: 'EDIT: a lopsided ring around the button + "bigger and green"',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  base: BASE_APP,
  anchors: ['Get started'],
  strokes: [rring(640, 309, 96, 38)],
  notes: [{ at: { x: 640, y: 309 }, text: 'bigger and green' }],
  edits: [
    // Tailwind v4 computes oklch(): green-500/600 sit at ~145-150; sRGB green ~120
    { check: 'bg', text: 'Get started', hue: [90, 170], must: true },
    { check: 'kept', text: 'Get started', must: true },
    { check: 'kept', text: 'Ship faster with Acme' },
  ],
}

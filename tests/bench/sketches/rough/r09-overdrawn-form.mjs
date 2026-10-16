import { rbox } from '../../lib/rough.mjs'

/** New UI: a sign-up form with one field drawn twice and a box that overruns. */
export default {
  id: 'r09-overdrawn-form',
  title: 'NEW: a signup form, one field overdrawn twice, one-word labels',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'name-input', kind: 'input', rect: { x: 440, y: 200, w: 400, h: 48 }, must: true },
    { role: 'email-input', rect: { x: 440, y: 280, w: 400, h: 48 }, must: true },
    { role: 'submit-button', rect: { x: 540, y: 360, w: 200, h: 52 }, must: true },
  ],
  strokes: [
    rbox(440, 200, 400, 48),
    rbox(444, 204, 396, 46, { seed: 99 }), // went over it again
    rbox(440, 280, 400, 48),
    rbox(540, 360, 200, 52, { close: 'overlap' }),
  ],
  notes: [
    { at: { x: 640, y: 224 }, text: 'name', content: 'name' },
    { at: { x: 640, y: 304 }, text: 'email', content: 'email' },
    { at: { x: 640, y: 386 }, text: 'Sign up', content: 'Sign up' },
  ],
}

import { box, textLine, wave } from '../lib/draw.mjs'

/** Archetype: email capture card — one field, one button, consent line. */
export default {
  id: '08-newsletter-capture',
  title: 'Newsletter capture card with one email field, a submit button and a consent checkbox',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'card', rect: { x: 332, y: 232, w: 616, h: 376 }, must: true },
    { role: 'heading', rect: { x: 392, y: 282, w: 440, h: 52 }, must: true },
    { role: 'email-input', rect: { x: 376, y: 404, w: 348, h: 60 }, must: true },
    { role: 'submit', rect: { x: 736, y: 404, w: 168, h: 60 }, must: true },
    { role: 'consent', rect: { x: 376, y: 482, w: 350, h: 36 } },
    { role: 'decor-wave', rect: { x: 72, y: 660, w: 1136, h: 80 } },
  ],
  strokes: [
    box(340, 240, 600, 360, { radius: 20 }),             // the card
    textLine(400, 310, 420, { amp: 7, wavelength: 44 }), // heading
    textLine(400, 362, 440),                             // supporting line
    box(380, 410, 340, 52),                              // email input
    box(740, 410, 160, 52, { radius: 20 }),              // submit button
    box(382, 490, 18, 18),                               // consent checkbox
    textLine(412, 500, 300),                             // consent copy
    wave(80, 700, 1120, { amp: 28, crests: 1.5 }),       // ONE decorative ribbon
  ],
  notes: [
    { at: { x: 640, y: 310 }, text: 'centred email signup card, field and button side by side on one row' },
    { at: { x: 640, y: 700 }, text: 'the long wave is decoration behind the section, not a chart' },
  ],
}

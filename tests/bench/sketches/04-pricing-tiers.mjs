import { box, textLine } from '../lib/draw.mjs'

/** Archetype: three pricing tiers, the middle one drawn taller to mark it featured. */
export default {
  id: '04-pricing-tiers',
  title: 'Pricing page with three tier cards, the middle one emphasised',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'heading', rect: { x: 450, y: 100, w: 380, h: 56 }, must: true },
    { role: 'tier-1', rect: { x: 132, y: 212, w: 336, h: 396 }, must: true },
    { role: 'tier-2', rect: { x: 472, y: 182, w: 336, h: 456 }, must: true },
    { role: 'tier-3', rect: { x: 812, y: 212, w: 336, h: 396 }, must: true },
    { role: 'cta-featured', rect: { x: 512, y: 522, w: 256, h: 64 } },
  ],
  strokes: [
    textLine(470, 130, 340, { amp: 7, wavelength: 44 }), // heading
    box(140, 220, 320, 380),                             // tier 1
    box(480, 190, 320, 440),                             // tier 2 — taller = featured
    box(820, 220, 320, 380),                             // tier 3
    textLine(180, 290, 140, { amp: 6, wavelength: 40 }), // prices (larger writing)
    textLine(520, 262, 140, { amp: 6, wavelength: 40 }),
    textLine(860, 290, 140, { amp: 6, wavelength: 40 }),
    box(180, 500, 240, 48, { radius: 20 }),              // per-tier buttons
    box(520, 530, 240, 48, { radius: 20 }),
    box(860, 500, 240, 48, { radius: 20 }),
  ],
  notes: [
    { at: { x: 640, y: 130 }, text: 'three pricing tiers side by side' },
    { at: { x: 640, y: 210 }, text: 'middle tier is the emphasised one, taller with a filled button' },
  ],
}

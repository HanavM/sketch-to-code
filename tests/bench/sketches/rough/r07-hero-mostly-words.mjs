import { rbox, rline } from '../../lib/rough.mjs'

/** New UI, mostly words: one line, one box, two notes. */
export default {
  id: 'r07-hero-mostly-words',
  title: 'NEW: a hero from one line, one sloppy box and two typed notes',
  set: 'rough',
  viewport: { width: 1280, height: 900 },
  regions: [
    { role: 'hero-headline', rect: { x: 300, y: 170, w: 680, h: 64 }, must: true, minWords: 3 },
    { role: 'cta-primary', rect: { x: 550, y: 290, w: 180, h: 60 }, must: true },
  ],
  strokes: [
    rline(380, 204, 900, 198),
    rbox(560, 300, 160, 50),
  ],
  notes: [
    { at: { x: 640, y: 200 }, text: 'headline: Plan trips with friends', content: 'Plan trips with friends' },
    { at: { x: 640, y: 325 }, text: 'button: Start planning', content: 'Start planning' },
  ],
}

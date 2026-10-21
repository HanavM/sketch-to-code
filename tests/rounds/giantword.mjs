/**
 * Free check (n40): every one-line display heading (>= 40px) in a round's auto plan,
 * drawn the way the bench draws it, and the type size its ink reads as on its own.
 *
 *   node tests/rounds/giantword.mjs [round...]      (needs npm run build)
 */
import { readFileSync } from 'node:fs'
import { textStacks, measureTextMark } from '../../packages/pipeline/dist/textmark.js'
import { mark } from './lib/pages.mjs'

const rounds = process.argv.length > 2 ? process.argv.slice(2) : ['round1', 'round2', 'round3', 'round4']
let worst = 0
for (const round of rounds) {
  const dir = new URL(`./${round}/`, import.meta.url)
  const plans = JSON.parse(readFileSync(new URL('autoplan.json', dir), 'utf8'))
  const { targets } = JSON.parse(readFileSync(new URL('targets.json', dir), 'utf8'))
  for (const [id, { plan }] of Object.entries(plans)) {
    for (const [role, kind, o] of plan) {
      if (kind !== 'heading' || !o?.fontPx || o.lines !== 1 || o.fontPx < 40) continue
      const r = targets[id].regions.find((g) => g.role === role).rect
      const [pts] = mark(kind, r, o)
      const st = textStacks([{ id: 's', points: pts }])[0]
      const m = measureTextMark(pts, 'fit')
      const read = st?.fontPx ?? 0
      const off = Math.abs(read - o.fontPx) / o.fontPx
      worst = Math.max(worst, off)
      console.log(`${round} ${id} ${role}: set ${o.fontPx}px, region ${Math.round(r.w)}x${Math.round(r.h)}, ` +
        `ink ${Math.round(m.chord)}x${Math.round(m.thickness)} ${m.crests} crests -> ${read ? read + 'px' : 'NOT TEXT'} (${Math.round(off * 100)}% off)`)
    }
  }
}
console.log(`worst ${Math.round(worst * 100)}% off`)

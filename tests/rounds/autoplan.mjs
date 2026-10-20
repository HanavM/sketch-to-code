/**
 * Auto-plan a round (approach n2) and set it beside the hand plans.
 *
 *   node tests/rounds/autoplan.mjs round1
 *
 * Writes <round>/autoplan.json ({id: {plan, notes}}), which <round>/auto.mjs
 * turns into a bench set (--set <round>auto). Prints per page: marks that agree
 * with the hand plan, and words typed (hand vs auto). Zero tokens.
 */
import { chromium } from 'playwright'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoPlan, wordCount } from './lib/autoplan.mjs'

const ROUND = process.argv[2] ?? 'round1'
const DIR = new URL(`./${ROUND}/`, import.meta.url).pathname
const ids = readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort()
let hand = []
try { hand = (await import(join(DIR, 'sketches.mjs'))).default } catch { /* a round may have no hand plans */ }
const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const out = {}
let agreeAll = 0, handAll = 0
for (const id of ids) {
  const a = await autoPlan(browser, join(DIR, `${id}.html`))
  out[id] = a
  const h = hand.find((p) => p.id === id)
  const line = [`${id}`]
  if (h?.plan) {
    const hk = new Map(h.plan)
    const agree = a.plan.filter(([r, k]) => hk.get(r) === k).length
    agreeAll += agree; handAll += h.plan.length
    line.push(`marks agree ${agree}/${h.plan.length} (auto ${a.plan.length})`, `words hand ${wordCount(h.planNotes)} auto ${wordCount(a.notes)}`)
  } else line.push(`marks ${a.plan.length}`, `words ${wordCount(a.notes)}`)
  console.log(line.join(' · '))
  for (const [r, k] of a.plan) console.log(`    ${r.padEnd(12)} ${k.padEnd(8)}${h?.plan ? ` (hand: ${new Map(h.plan).get(r) ?? '—'})` : ''}`)
  for (const [r, n] of a.notes) console.log(`    note ${r}: ${n}`)
}
if (handAll) console.log(`\nall pages: ${agreeAll}/${handAll} hand marks matched`)
writeFileSync(join(DIR, 'autoplan.json'), JSON.stringify(out, null, 1))
await browser.close()

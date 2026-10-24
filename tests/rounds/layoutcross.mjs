/**
 * Sanity check for the layout score, zero tokens: each target's own regions
 * scored against its own DOM (should be ~100%) and against every OTHER target
 * of the round (unrelated pages, should stay low), single-element matching vs
 * with unwrapped groups credited (score.mjs matchGroups).
 *   node tests/rounds/layoutcross.mjs round17 [round16 ...]
 */
import { chromium } from 'playwright'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { measureTarget } from './lib/likeness.mjs'
import { scorePage } from '../bench/lib/score.mjs'

const rounds = process.argv.slice(2).length ? process.argv.slice(2) : ['round17']
const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const pct = (x) => (x == null ? '  —' : `${Math.round(x * 100)}`.padStart(3))
const all = { selfS: [], selfG: [], unS: [], unG: [] }
for (const round of rounds) {
  const dir = join('tests/rounds', round)
  const ids = readdirSync(dir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort()
  const regs = {}
  for (const id of ids) regs[id] = (await measureTarget(browser, join(process.cwd(), dir, `${id}.html`))).regions
  for (const a of ids) {
    let self, bestS = 0, bestG = 0
    for (const b of ids) {
      await page.goto(`file://${join(process.cwd(), dir, `${b}.html`)}`)
      await page.waitForTimeout(100)
      const s = await scorePage(page, { regions: regs[a] })
      if (a === b) self = s
      else { bestS = Math.max(bestS, s.regionScore ?? 0); bestG = Math.max(bestG, s.regionScoreGrouped ?? 0) }
    }
    all.selfS.push(self.regionScore); all.selfG.push(self.regionScoreGrouped); all.unS.push(bestS); all.unG.push(bestG)
    const flat = regs[a].filter((r) => r.rect.w < 4 || r.rect.h < 4).map((r) => r.role)
    console.log(`${round} ${a.padEnd(22)} self ${pct(self.regionScore)} / ${pct(self.regionScoreGrouped)} · best unrelated ${pct(bestS)} / ${pct(bestG)}  (single / grouped)${flat.length ? `  flat regions: ${flat.join(', ')}` : ''}`)
  }
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length
const max = (xs) => Math.max(...xs)
console.log(`all: self mean ${pct(mean(all.selfS))} / ${pct(mean(all.selfG))} · unrelated mean of best ${pct(mean(all.unS))} / ${pct(mean(all.unG))}, max ${pct(max(all.unS))} / ${pct(max(all.unG))}`)
await browser.close()

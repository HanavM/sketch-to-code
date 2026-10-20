/**
 * Measure a round's targets: first-screen PNG and [data-r] regions for each,
 * written to <round>/ref/<id>.png and <round>/targets.json. Then calibrate the
 * likeness measure so its numbers mean something: every target against itself
 * (must be 1), against a blank white page (what "built nothing" scores), and
 * against the other targets (what "built the wrong page" scores).
 *
 *   node tests/rounds/measure.mjs round1
 *
 * Zero tokens.
 */
import { chromium } from 'playwright'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { measureTarget, pictureLikeness } from './lib/likeness.mjs'

const ROUND = process.argv[2] ?? 'round1'
const DIR = new URL(`./${ROUND}/`, import.meta.url).pathname
const ids = readdirSync(DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort()
mkdirSync(join(DIR, 'ref'), { recursive: true })

const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const targets = {}
const shots = {}
for (const id of ids) {
  const { png, regions } = await measureTarget(browser, join(DIR, `${id}.html`))
  writeFileSync(join(DIR, 'ref', `${id}.png`), png)
  targets[id] = { regions }
  shots[id] = png
  console.log(`${id}: ${regions.length} regions`)
}
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.setContent('<body style="margin:0;background:#fff"></body>')
const blank = await page.screenshot()
const pct = (x) => `${Math.round(x * 100)}%`
const cal = {}
for (const id of ids) {
  const self = await pictureLikeness(page, shots[id], shots[id])
  const vsBlank = await pictureLikeness(page, shots[id], blank)
  const others = []
  for (const o of ids) if (o !== id) others.push(await pictureLikeness(page, shots[id], shots[o]))
  const mean = (k) => others.reduce((s, x) => s + x[k], 0) / others.length
  cal[id] = { self, blank: vsBlank, otherMean: { colour: mean('colour'), structure: mean('structure') } }
  console.log(`${id}: self ${pct(self.colour)}/${pct(self.structure)} · blank ${pct(vsBlank.colour)}/${pct(vsBlank.structure)} · other pages ${pct(cal[id].otherMean.colour)}/${pct(cal[id].otherMean.structure)}  (colour/structure)`)
}
writeFileSync(join(DIR, 'targets.json'), JSON.stringify({ measured: new Date().toISOString(), targets, calibration: cal }, null, 1))
await browser.close()

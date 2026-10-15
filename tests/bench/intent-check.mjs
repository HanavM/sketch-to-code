/**
 * Zero-token check that the PRIMARY bench score (lib/intent.mjs) reads a real
 * DOM the way docs/findings.md says a person reads these pages. Three pages,
 * hand-written as plain HTML in a real browser, no app and no model:
 *
 *   12 correct, moved — the timeline page that IoU scored 0% "and is correct"
 *   05 traced         — the quote and attribution drawn back as SVG squiggles
 *   05 fixed          — the same page with a real quote and attribution
 *
 * Expected: realized / not realized / realized. Exits 1 if not.
 *
 *   node tests/bench/intent-check.mjs [--report]
 *   S2C_CHROMIUM=/path/to/chrome node tests/bench/intent-check.mjs   # if playwright's browser is missing
 */
import { chromium } from 'playwright'
import { scorePage } from './lib/score.mjs'
import { formatReport } from './lib/report.mjs'
import p05 from './sketches/05-logo-wall-testimonial.mjs'
import p12 from './sketches/12-timeline-steps.mjs'
const shell = (b) => `<!doctype html><html><head><style>body{margin:0;font-family:sans-serif}</style></head><body><div id="root">${b}</div></body></html>`
const html12 = shell(`<section style="width:800px;margin:20px auto;text-align:center"><h2 style="font-size:32px">How it works</h2>
<ol style="display:flex;gap:40px;list-style:none;padding:0">${['Sign up free','Connect your app','Draw a sketch','Ship the change'].map((t,i)=>`<li style="flex:1"><span style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#4f46e5;color:#fff">${i+1}</span><p>${t}</p></li>`).join('')}</ol></section>`)
const logos = `<div style="display:flex;gap:40px;justify-content:center;margin:40px">${[1,2,3,4,5].map(i=>`<div style="width:160px;height:60px;background:#ddd"></div>`).join('')}</div>`
const html05bad = shell(`<section style="padding-top:96px;text-align:center"><p>Trusted by teams at</p>${logos}<svg width="640" height="140"><path d="M0 20 Q 20 0 40 20 T 80 20 T 120 20 T 640 20" stroke="#000" fill="none"/><path d="M0 70 Q 20 50 40 70 T 80 70 T 640 70" stroke="#000" fill="none"/></svg><img width="56" height="56" style="background:#ccc;border-radius:50%"></section>`)
const html05good = shell(`<section style="padding-top:96px;text-align:center"><p>Trusted by teams at</p>${logos}<figure><blockquote style="font-size:28px">This replaced three tools for our design team and nobody misses them.</blockquote><figcaption><span style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#999"></span> <span>Dana Reyes, Head of Design at Northwind</span></figcaption></figure></section>`)
const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const results = []
for (const [id, spec, html] of [['12 correct, moved', p12, html12], ['05 traced', p05, html05bad], ['05 fixed', p05, html05good]]) {
  await page.setContent(html)
  const s = await scorePage(page, spec)
  results.push({ id, title: spec.title, score: s })
  console.log(id, '| realized', s.realized, '| intent', s.intent?.toFixed(2), 'S', s.structure?.toFixed(2), 'C', s.content?.toFixed(2), 'O', s.intentOrder, '| IoU', s.regionScore?.toFixed(2))
  console.log('   ', s.intentRegions.map(r => `${r.role}:${r.el ? r.el.tag : 'MISS'}`).join(' '), s.intentNotes.join(' / '))
}
await browser.close()
const want = { '12 correct, moved': true, '05 traced': false, '05 fixed': true }
const wrong = results.filter((r) => r.score.realized !== want[r.id])
if (wrong.length) {
  console.error('FAIL: intent score disagrees with findings.md on', wrong.map((r) => r.id).join(', '))
  process.exit(1)
}
if (process.argv.includes('--report')) console.log(formatReport({ results }))
console.log('ok: the intent score agrees with findings.md on all three pages; IoU does not')

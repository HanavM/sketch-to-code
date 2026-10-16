/**
 * Zero-token check that every rough EDIT spec's answer key can be passed and
 * can be failed, on a real DOM. For each of r01-r06: the base page as plain
 * HTML must score NOT realized, and the same page with the intended change
 * applied by hand (a few DOM lines, below) must score realized. A check that
 * nothing could pass, or that the base already passes, would make the rough
 * set's realized % meaningless before a single paid run.
 *
 * The same holds for the --words none answer key (lib/words.mjs, s2c-016),
 * which drops the checks only typed words can pass: what is left must still
 * fail untouched and pass edited, or the page must say it is not judged.
 *
 *   node tests/bench/rough-check.mjs
 *   S2C_CHROMIUM=/path/to/chrome node tests/bench/rough-check.mjs
 */
import { chromium } from 'playwright'
import { scorePage } from './lib/score.mjs'
import rough from './sketches/rough/index.mjs'
import { answerKey } from './lib/words.mjs'

// the base page's structure (sketches/rough/base.mjs) with inline styles, no Tailwind
const BASE = `<!doctype html><html><head><style>body{margin:0;font-family:sans-serif}
nav{display:flex;justify-content:space-between;padding:20px 48px}nav div{display:flex;gap:32px}
section{padding:48px;text-align:center}#features{display:grid;grid-template-columns:1fr 1fr 1fr;gap:32px;text-align:left}
article{border:1px solid #ddd;border-radius:12px;padding:24px}button{background:#0f172a;color:#fff;padding:12px 24px;border:0}
</style></head><body><div id="root"><main>
<nav><span>Acme</span><div><a href="#f">Features</a><a href="#p">Pricing</a><a href="#a">About</a></div></nav>
<section id="hero"><h1>Ship faster with Acme</h1><p>The deploy platform for small teams who would rather build than babysit servers.</p><button>Get started</button></section>
<section id="features"><article><h3>Instant previews</h3><p>Every branch gets its own live URL in seconds.</p></article>
<article><h3>One-click rollbacks</h3><p>Undo a bad deploy without touching a terminal.</p></article>
<article id="c3"><h3>Usage-based billing</h3><p>Pay for the minutes you run, nothing when idle.</p></article></section>
<section id="quote" style="background:#f8fafc"><blockquote>"We cut our release time in half."</blockquote><p>Priya N., CTO at Fieldnote</p></section>
<footer><span>© 2026 Acme Inc.</span></footer></main></div></body></html>`

/** The change each edit sketch asks for, done by hand. */
const APPLY = {
  'r01-scribble-out-card': () => document.getElementById('c3').remove(),
  'r02-strike-headline': () => { document.querySelector('h1').textContent = 'Sketch it. Ship it.' },
  'r03-ring-button-green': () => {
    const b = document.querySelector('button')
    // what Tailwind v4 computes for bg-green-600
    b.style.background = 'oklch(0.627 0.194 149.214)'
    b.style.padding = '16px 32px'
  },
  'r04-arrow-move-quote': () => {
    const q = document.getElementById('quote')
    document.getElementById('features').before(q)
  },
  'r05-footer-newsletter': () => {
    const f = document.querySelector('footer')
    f.insertAdjacentHTML('beforeend', '<form><input type="email" placeholder="you@example.com"><button>Subscribe</button></form>')
  },
  'r06-x-out-nav-link': () => document.querySelector('a[href="#p"]').remove(),
}

const browser = await chromium.launch(process.env.S2C_CHROMIUM ? { executablePath: process.env.S2C_CHROMIUM } : {})
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const wrong = []
for (const spec of rough.filter((s) => s.edits)) {
  const apply = APPLY[spec.id]
  if (!apply) { wrong.push(`${spec.id}: no hand-applied change in rough-check.mjs`); continue }
  await page.setContent(BASE)
  const before = await scorePage(page, spec)
  await page.evaluate(apply)
  const after = await scorePage(page, spec)
  console.log(`${spec.id.padEnd(24)} untouched ${before.intent.toFixed(2)} realized=${before.realized} · edited ${after.intent.toFixed(2)} realized=${after.realized}`)
  if (before.realized) wrong.push(`${spec.id}: untouched page already realized`)
  if (!after.realized) wrong.push(`${spec.id}: correct edit NOT realized (${after.intentNotes.join(' / ')})`)
  const bare = answerKey(spec, 'none')
  if (!bare.judged) {
    console.log(`${''.padEnd(24)} --words none: not judged (needs words: ${bare.dropped.join('; ')})`)
    continue
  }
  await page.setContent(BASE)
  const b0 = await scorePage(page, bare.spec)
  await page.evaluate(apply)
  const b1 = await scorePage(page, bare.spec)
  console.log(`${''.padEnd(24)} --words none: untouched realized=${b0.realized} · edited realized=${b1.realized}${bare.dropped.length ? ` (dropped ${bare.dropped.join('; ')})` : ''}`)
  if (b0.realized) wrong.push(`${spec.id}: --words none key passes the untouched page`)
  if (!b1.realized) wrong.push(`${spec.id}: --words none key fails the correct edit (${b1.intentNotes.join(' / ')})`)
}
await browser.close()
if (wrong.length) {
  console.error('FAIL:\n  ' + wrong.join('\n  '))
  process.exit(1)
}
console.log('ok: every rough edit spec fails untouched and passes when the change is made, with and without words')

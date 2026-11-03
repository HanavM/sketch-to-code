/**
 * Side-by-side proof picture: target (left) vs built (right), with a label.
 *   node tests/rounds/cmp.mjs <round> <page-id> [tag] [label]
 * Reads tests/rounds/<round>/ref/<id>.png and tests/bench/out/shots/<id>-built.png,
 * writes tests/rounds/<round>/built/<id>[-tag]-cmp.png. Zero tokens.
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [round, id, tag = '', label = ''] = process.argv.slice(2)
if (!round || !id) throw new Error('usage: cmp.mjs <round> <page-id> [tag] [label]')
const uri = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64')
const ref = uri(join('tests/rounds', round, 'ref', `${id}.png`))
const built = uri(join('tests/bench/out/shots', `${id}-built.png`))
const outDir = join('tests/rounds', round, 'built')
mkdirSync(outDir, { recursive: true })
const out = join(outDir, `${id}${tag ? '-' + tag : ''}-cmp.png`)

const browser = await chromium.launch({ executablePath: process.env.S2C_CHROMIUM || undefined })
const page = await browser.newPage({ viewport: { width: 1300, height: 600 } })
await page.setContent(`<body style="margin:0;font:14px system-ui;background:#eee">
<div style="padding:6px 10px">${id} ${label}</div>
<div style="display:flex;gap:10px;padding:0 10px 10px">
<figure style="margin:0;flex:1"><figcaption>target</figcaption><img src="${ref}" style="width:100%;border:1px solid #999"></figure>
<figure style="margin:0;flex:1"><figcaption>built from the drawing</figcaption><img src="${built}" style="width:100%;border:1px solid #999"></figure>
</div></body>`)
await page.waitForTimeout(200)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
console.log(out)

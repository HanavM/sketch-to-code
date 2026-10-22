import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { chromium } from 'playwright'
import { build } from 'esbuild'
const ROOT = '/home/claude/n3'
const { fillClaims, verifyFills } = await import(`${ROOT}/packages/pipeline/dist/fills.js`)
const bundle = await build({ entryPoints: [`${ROOT}/packages/dom/dist/snapshot.js`], bundle: true, write: false, format: 'iife', globalName: 'S2C' })
const code = bundle.outputFiles[0].text
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
let total = 0, fails = 0
for (let r = 1; r <= 7; r++) {
  const dir = `${ROOT}/tests/rounds/round${r}/`
  if (!existsSync(dir + 'autoplan.json')) continue
  const auto = JSON.parse(readFileSync(dir + 'autoplan.json', 'utf8'))
  for (const [id, a] of Object.entries(auto)) {
    const claims = a.notes.flatMap(([, t]) => fillClaims(t))
    if (!claims.length) continue
    await page.goto('file://' + dir + id + '.html'); await page.waitForTimeout(150)
    await page.addScriptTag({ content: code })
    const snap = await page.evaluate(() => S2C.takeSnapshot(document, { maxNodes: 5000 }))
    const v = verifyFills(snap, claims)
    total += v.checked.length; fails += v.checked.filter((c) => !c.ok).length
    console.log(`r${r} ${id}: ${claims.length} claims, ${v.checked.length} judged, ${v.satisfied ? 'ok' : 'FAIL: ' + v.reason}`)
    for (const c of v.checked) console.log('   ', c.ok ? 'ok ' : 'BAD', JSON.stringify(c.claim), c.got)
  }
}
console.log({ total, fails })
await browser.close()

/**
 * Live e2e: THE EDITOR BRIDGE — both directions, against a real dev server.
 *
 * Nothing is faked except the editor's UI: the "editor" here is the extension's
 * OWN compiled client + node transport (packages/vscode-extension/out), so the
 * SSE stream, the headers, the reconnect logic and the wire types under test are
 * the ones that ship. The browser end is a real Chromium page on the demo app —
 * it POSTs reveals with the overlay's per-boot token and listens on the existing
 * /@s2c/events hub, exactly as the overlay does.
 *
 * Phases:
 *   1. status with nobody attached — connected:false
 *   2. a reveal with no editor: 200, delivered 0 — it must NOT hang or error
 *   3. the editor attaches: hello carries protocol + the dev server root
 *   4. status flips, and the BROWSER is told over the hub (ide-status)
 *   5. click → reveal: the page sends a real <path> element's data-s2c stamp and
 *      the editor receives that exact file:line:col
 *   6. cursor → browser: the editor reports a position and a browser SSE client
 *      receives ide-cursor with it
 *   7. a file outside the project is refused 400 and never forwarded
 *   8. the gates: no token → 403; a browser trying to pose as an editor → 403,
 *      with the editor count unchanged
 *   9. the editor quits: status goes false and the browser is told
 *
 * Starts and kills its own dev server on port 5234.
 * Run FROM THE REPO ROOT:  node tests/e2e/live-ide-bridge.mjs
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const PORT = Number(process.env.S2C_PORT ?? 5234)
const BASE = `http://localhost:${PORT}`
const REPO_ROOT = new URL('../../', import.meta.url).pathname
const APP_DIR = `${REPO_ROOT}examples/demo-app`
const require = createRequire(import.meta.url)

const log = (...a) => console.log('[e2e-ide]', ...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let failures = 0
function check(label, cond, extra = '') {
  if (cond) log(`✓ ${label}`)
  else {
    failures++
    log(`✗ ${label} ${extra}`)
  }
}
async function waitFor(label, fn, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const v = await fn()
    if (v) return v
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const status = async () => (await fetch(`${BASE}/@s2c/ide/status`)).json()

let vite
let browser
try {
  // ── boot a real dev server ───────────────────────────────────────────────
  // A server already on the port is a leftover from an earlier run, and
  // talking to it (its own boot token, its own editor list) fails phase 6 in a
  // way that looks like a bridge bug. Say what it is instead.
  const stale = await fetch(`${BASE}/@s2c/ping`).then((r) => r.ok, () => false)
  if (stale) throw new Error(`port ${PORT} already has a dev server (a leftover run?): kill it first`)
  // detached = its own process group, so the finally below can kill vite and
  // not just the npx wrapper. Killing npx alone left vite on the port after
  // EVERY run, green ones included, and the next run failed (s2c-036).
  vite = spawn('npx', ['vite', '--port', String(PORT)], {
    cwd: APP_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    detached: true,
  })
  vite.stdout.on('data', (d) => process.env.S2C_VERBOSE && process.stdout.write(`[vite] ${d}`))
  vite.stderr.on('data', (d) => process.stdout.write(`[vite!] ${d}`))
  await waitFor('dev server', async () => {
    try {
      const r = await fetch(`${BASE}/@s2c/ping`)
      return r.ok
    } catch {
      return false
    }
  }, 30_000)
  log(`dev server up on ${PORT}`)

  // ── 1. nothing attached ─────────────────────────────────────────────────
  const s0 = await status()
  check('status with no editor: connected false, count 0', s0.connected === false && s0.count === 0, JSON.stringify(s0))

  // ── a real browser page, with a real SSE client on the existing hub ──────
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForSelector('[data-s2c]')
  await page.evaluate(() => {
    window.__IDE = { cursor: [], status: [] }
    const es = new EventSource('/@s2c/events')
    es.addEventListener('ide-cursor', (e) => window.__IDE.cursor.push(JSON.parse(e.data)))
    es.addEventListener('ide-status', (e) => window.__IDE.status.push(JSON.parse(e.data)))
    window.__IDE_ES = es
    // how the overlay will POST a reveal: the stamp, split, plus the token
    window.__reveal = async (loc) => {
      const [file, line, col] = loc.split(':')
      const r = await fetch('/@s2c/ide/reveal', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-s2c-token': globalThis.__S2C_TOKEN__ },
        body: JSON.stringify({ file, line: Number(line), col: Number(col) }),
      })
      return { status: r.status, body: await r.json() }
    }
  })
  await sleep(300) // let the EventSource attach before we assert on its events

  // ── 2. a reveal with no editor listening ────────────────────────────────
  const stampedPath = await page.evaluate(() => {
    const el = document.querySelector('path[data-s2c]') ?? document.querySelector('[data-s2c]')
    return el.dataset.s2c
  })
  log(`stamp under test: ${stampedPath}`)
  const noEditor = await page.evaluate((loc) => window.__reveal(loc), stampedPath)
  check(
    'reveal with no editor: 200 ok delivered:0 with a reason',
    noEditor.status === 200 && noEditor.body.ok === true && noEditor.body.delivered === 0 &&
      noEditor.body.reason === 'no editor connected',
    JSON.stringify(noEditor),
  )

  // ── 3. attach the editor, using the extension's own compiled client ─────
  // The extension's out/ is gitignored and the root `tsc -b` doesn't build it,
  // so a fresh clone had nothing to require (s2c-036). Build it when it isn't
  // there; it's one tsc call, a few seconds, and it's the code that ships.
  if (!existsSync(`${REPO_ROOT}packages/vscode-extension/out/client.js`)) {
    execFileSync('npm', ['run', 'build', '-w', 'packages/vscode-extension'], { cwd: REPO_ROOT, stdio: 'inherit' })
  }
  const { IdeBridgeClient } = require(`${REPO_ROOT}packages/vscode-extension/out/client.js`)
  const { createNodeTransport } = require(`${REPO_ROOT}packages/vscode-extension/out/node-transport.js`)
  const reveals = []
  const states = []
  const client = new IdeBridgeClient({
    url: BASE,
    editorName: 'e2e editor',
    transport: createNodeTransport(),
    cursorDebounceMs: 50,
    onReveal: (ev) => reveals.push(ev),
    onState: (state, detail) => states.push([state, detail]),
    log: (m) => process.env.S2C_VERBOSE && log(`[client] ${m}`),
  })
  client.start()
  await waitFor('hello', () => client.serverRoot !== null)
  check('editor attached: state connected', client.state === 'connected', JSON.stringify(states))
  check(
    'hello carries the dev server root',
    client.serverRoot.replace(/\/$/, '') === APP_DIR.replace(/\/$/, ''),
    `${client.serverRoot} vs ${APP_DIR}`,
  )

  // ── 4. status flips, and the browser hears about it ─────────────────────
  const s1 = await status()
  check(
    'status: connected true, editor named, count 1',
    s1.connected === true && s1.editor === 'e2e editor' && s1.count === 1,
    JSON.stringify(s1),
  )
  const pushed = await waitFor('ide-status in the browser', () =>
    page.evaluate(() => window.__IDE.status.find((s) => s.connected === true) ?? null),
  )
  check('browser got ide-status {connected:true} over the existing hub', pushed.editor === 'e2e editor', JSON.stringify(pushed))

  // ── 5. click → reveal, exact file:line:col ──────────────────────────────
  const delivered = await page.evaluate((loc) => window.__reveal(loc), stampedPath)
  check('reveal accepted: delivered 1', delivered.status === 200 && delivered.body.delivered === 1, JSON.stringify(delivered))
  const got = await waitFor('reveal at the editor', () => reveals.at(-1) ?? null)
  const [wantFile, wantLine, wantCol] = stampedPath.split(':')
  check(
    'the editor received exactly the stamped location',
    got.file === wantFile && got.line === Number(wantLine) && got.col === Number(wantCol),
    `${JSON.stringify(got)} vs ${stampedPath}`,
  )
  check('the reveal carries the root the editor needs to open it', got.root === client.serverRoot)

  // ── 6. cursor → browser ─────────────────────────────────────────────────
  client.reportCursor({ file: wantFile, line: 12, col: 3 })
  const cursor = await waitFor('ide-cursor in the browser', () =>
    page.evaluate(() => window.__IDE.cursor.at(-1) ?? null),
  )
  check(
    'a browser SSE client received ide-cursor with the editor position',
    cursor.file === wantFile && cursor.line === 12 && cursor.editor === 'e2e editor',
    JSON.stringify(cursor),
  )

  // ── 7. path escaping over the wire ──────────────────────────────────────
  const escaped = await page.evaluate(() =>
    fetch('/@s2c/ide/reveal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-token': globalThis.__S2C_TOKEN__ },
      body: JSON.stringify({ file: '../../../etc/passwd', line: 1 }),
    }).then(async (r) => ({ status: r.status, body: await r.json() })),
  )
  const revealCount = reveals.length
  check('a file outside the project is refused 400', escaped.status === 400, JSON.stringify(escaped))
  await sleep(200)
  check('…and nothing was forwarded to the editor', reveals.length === revealCount)

  // ── 8. the gates ────────────────────────────────────────────────────────
  const noToken = await fetch(`${BASE}/@s2c/ide/reveal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ file: wantFile, line: 1 }),
  })
  check('reveal without the per-boot token: 403', noToken.status === 403, String(noToken.status))

  const pageCursor = await page.evaluate(() =>
    fetch('/@s2c/ide/cursor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-s2c-ide': '1' },
      body: JSON.stringify({ file: 'src/App.tsx', line: 99 }),
    }).then((r) => r.status),
  )
  check('a page cannot post a cursor (browser-originated): 403', pageCursor === 403, String(pageCursor))

  const posedAsEditor = await page.evaluate(async () => {
    const es = new EventSource('/@s2c/ide/events?editor=malicious')
    const outcome = await new Promise((resolve) => {
      es.onopen = () => resolve('open')
      es.onerror = () => resolve('error')
      setTimeout(() => resolve('timeout'), 2000)
    })
    es.close()
    return outcome
  })
  const s2 = await status()
  check(
    'a page cannot register as an editor (Sec-Fetch-* gate)',
    posedAsEditor !== 'open' && s2.count === 1,
    `${posedAsEditor}, count ${s2.count}`,
  )

  // ── 9. the editor quits ─────────────────────────────────────────────────
  client.stop()
  const s3 = await waitFor('status to go false', async () => {
    const s = await status()
    return s.connected === false ? s : null
  })
  check('status: disconnect detected', s3.count === 0, JSON.stringify(s3))
  const off = await waitFor('ide-status {connected:false} in the browser', () =>
    page.evaluate(() => window.__IDE.status.filter((s) => s.connected === false).at(-1) ?? null),
  )
  check('browser was told the editor went away', off.count === 0, JSON.stringify(off))
} finally {
  await browser?.close().catch(() => {})
  if (vite) {
    const group = (sig) => { try { process.kill(-vite.pid, sig) } catch { /* already gone */ } }
    group('SIGTERM')
    await sleep(500)
    group('SIGKILL')
  }
}

log(failures === 0 ? 'ALL PHASES PASSED' : `${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)

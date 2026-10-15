/**
 * The codegen agent cannot see or touch `.sketch2code/` (seed2tree s2c-007).
 *
 * Zero tokens: the REAL bundled Claude Code binary runs against a local mock
 * of the Messages API that issues a fixed list of tool calls and records what
 * the tools returned. Same tool permissions the product uses
 * (codegenToolOptions from the built pipeline), in a scratch app whose
 * .gitignore lists .sketch2code/ the way `init` writes it.
 *
 * Before the deny rules: Glob listed the library index and old run bundles
 * (it runs ripgrep with --no-ignore --hidden), Read returned a library
 * entry's stored source, and Write replaced the library index.
 *
 *   npm run build && node tests/e2e/codegen-private-state.mjs
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { codegenToolOptions } from '@s2c/pipeline'

// Minimal Anthropic Messages API mock: scripted tool calls, records tool_results.
import http from 'node:http'
function startMock(script) {
  const seen = []
  let step = 0
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      if (!req.url.startsWith('/v1/messages') || req.url.includes('count_tokens')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ input_tokens: 10 }))
        return
      }
      let j = {}
      try { j = JSON.parse(body) } catch {}
      const last = j.messages?.[j.messages.length - 1]
      if (Array.isArray(last?.content)) for (const b of last.content) if (b.type === 'tool_result') seen.push(b)
      // side requests (titles, etc.) without tools get plain text
      const isMain = Array.isArray(j.tools) && j.tools.length > 0
      const next = isMain ? script[step++] : null
      const id = `toolu_${step}`
      const ev = []
      const send = (type, data) => ev.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
      send('message_start', { message: { id: 'msg_' + step, type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 1 } } })
      if (next) {
        send('content_block_start', { index: 0, content_block: { type: 'tool_use', id, name: next.name, input: {} } })
        send('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(next.input) } })
        send('content_block_stop', { index: 0 })
        send('message_delta', { delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 1 } })
      } else {
        send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
        send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'done' } })
        send('content_block_stop', { index: 0 })
        send('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } })
      }
      send('message_stop', {})
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.end(ev.join(''))
    })
  })
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, seen })))
}

const log = (...a) => console.log('[e2e-private-state]', ...a)
const app = mkdtempSync(join(tmpdir(), 's2c-private-'))
mkdirSync(join(app, 'src'), { recursive: true })
mkdirSync(join(app, '.sketch2code/library'), { recursive: true })
mkdirSync(join(app, '.sketch2code/runs/r1'), { recursive: true })
writeFileSync(join(app, 'src/App.tsx'), 'export default function App() { return <main /> }\n')
const INDEX = JSON.stringify([{ id: 'x', name: 'SketchShape', source: 'export function SketchShape() { return <svg /> }' }])
writeFileSync(join(app, '.sketch2code/library/index.json'), INDEX)
writeFileSync(join(app, '.sketch2code/runs/r1/reply-design-1.txt'), 'built SketchShape')
writeFileSync(join(app, '.gitignore'), 'node_modules/\n.sketch2code/\n')
execFileSync('git', ['init', '-q'], { cwd: app })

const script = [
  { name: 'Glob', input: { pattern: '**/*' } },
  { name: 'Grep', input: { pattern: 'SketchShape', path: '.sketch2code', output_mode: 'files_with_matches' } },
  { name: 'Read', input: { file_path: join(app, '.sketch2code/library/index.json') } },
  { name: 'Write', input: { file_path: join(app, '.sketch2code/library/index.json'), content: '[]' } },
  { name: 'Read', input: { file_path: join(app, 'src/App.tsx') } },
]
const mock = await startMock(script)
// a fresh HOME and a fake key aimed at the mock: nothing can reach a real API
const env = {
  PATH: process.env.PATH, HOME: mkdtempSync(join(tmpdir(), 's2c-home-')),
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${String(mock.port)}`, ANTHROPIC_API_KEY: 'sk-ant-mock',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_TELEMETRY: '1', DISABLE_AUTOUPDATER: '1',
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1', NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost',
}
const q = query({
  prompt: 'go',
  options: {
    cwd: app, permissionMode: 'acceptEdits', ...codegenToolOptions(), settingSources: [],
    persistSession: false, maxTurns: 12, env, model: 'claude-sonnet-4-5', strictMcpConfig: true,
  },
})
for await (const m of q) if (m.type === 'result') break
mock.server.close()

const out = mock.seen.map((r) => (typeof r.content === 'string' ? r.content : JSON.stringify(r.content)))
const fail = (msg) => { console.error('[e2e-private-state] ASSERT:', msg); process.exit(1) }
if (out.length !== script.length) fail(`expected ${String(script.length)} tool results, got ${String(out.length)}`)
if (out[0].includes('.sketch2code')) fail(`Glob listed .sketch2code/: ${out[0].slice(0, 200)}`)
if (!out[0].includes('src/App.tsx')) fail('Glob no longer lists the app source')
if (!mock.seen[1].is_error) fail(`Grep searched .sketch2code/: ${out[1].slice(0, 200)}`)
if (!mock.seen[2].is_error || out[2].includes('export function')) fail('Read returned the library index')
if (!mock.seen[3].is_error) fail('Write was allowed into .sketch2code/')
if (readFileSync(join(app, '.sketch2code/library/index.json'), 'utf8') !== INDEX) fail('the library index was changed')
if (mock.seen[4].is_error || !out[4].includes('export default function App')) fail('Read of app source broke')
log('✓ Glob hides it, Grep/Read/Write are refused, the index is untouched, app source still readable')

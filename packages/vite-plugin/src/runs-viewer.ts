import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join, resolve } from 'node:path'
import { sendJson } from './middleware.js'

const SAFE_NAME = /^[\w.-]+$/

/**
 * Read-only debug pages: exactly what each run sent to / got back from the
 * agent. GET-only; local-Host-gated by the caller. Serves nothing outside
 * <root>/.sketch2code/runs.
 */
export function runsViewer(root: string) {
  const runsRoot = resolve(root, '.sketch2code', 'runs')

  return (req: IncomingMessage, res: ServerResponse): void => {
    const url = new URL(req.url ?? '/', 'http://x')
    const id = url.searchParams.get('id')
    const file = url.searchParams.get('file')

    try {
      if (id && file) {
        if (!SAFE_NAME.test(id) || !SAFE_NAME.test(file)) return sendJson(res, 400, { ok: false })
        const p = resolve(runsRoot, id, file)
        if (!p.startsWith(runsRoot)) return sendJson(res, 400, { ok: false })
        const buf = readFileSync(p)
        res.writeHead(200, {
          'content-type': file.endsWith('.png') ? 'image/png'
            : file.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
        })
        res.end(buf)
        return
      }

      if (id) {
        if (!SAFE_NAME.test(id)) return sendJson(res, 400, { ok: false })
        const dir = join(runsRoot, id)
        const files = readdirSync(dir).sort()
        const img = (f: string) =>
          `<figure><figcaption>${f}</figcaption><img src="/@s2c/runs?id=${id}&file=${f}" style="max-width:100%;border:1px solid #ccc"/></figure>`
        const pre = (f: string) => {
          const text = readFileSync(join(dir, f), 'utf8')
          return `<details ${f === 'prompt.txt' || f === 'result.json' ? 'open' : ''}><summary>${f}</summary><pre>${escapeHtml(text)}</pre></details>`
        }
        const body = files
          .map((f) => (f.endsWith('.png') ? img(f) : pre(f)))
          .join('\n')
        return html(res, `<h1>${id}</h1><p><a href="/@s2c/runs">← all runs</a></p>${body}`)
      }

      const entries = readdirSync(runsRoot)
        .filter((d) => SAFE_NAME.test(d))
        .map((d) => ({ d, t: statSync(join(runsRoot, d)).mtimeMs }))
        .sort((a, b) => b.t - a.t)
        .slice(0, 50)
      const rows = entries
        .map(({ d, t }) => `<li><a href="/@s2c/runs?id=${d}">${d}</a> — ${new Date(t).toLocaleString()}</li>`)
        .join('\n')
      return html(res, `<h1>sketch2code runs</h1><p>What the agent saw, per run.</p><ul>${rows || '<li>(no runs yet)</li>'}</ul>`)
    } catch (err) {
      sendJson(res, 404, { ok: false, error: String(err) })
    }
  }
}

function html(res: ServerResponse, body: string): void {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><title>s2c runs</title>
<style>body{font:14px ui-sans-serif,system-ui;margin:24px auto;max-width:960px;padding:0 16px}
pre{background:#f6f8fa;padding:12px;overflow:auto;border-radius:6px}summary{cursor:pointer;font-weight:600;margin:8px 0}</style>
${body}`)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

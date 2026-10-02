/**
 * The benchmark's written output: one markdown file a person can read and
 * argue with.
 *
 * Two rules it keeps, because a benchmark that flatters itself is worse than no
 * benchmark:
 *
 * 1. Missing is not zero. A page that never ran, a sketch with no `must`
 *    regions, a page with nothing to order — all print `—`. Writing 0 there
 *    would read as a failure that did not happen; writing 1 would read as a
 *    success that was never tested.
 * 2. Rounding never rounds UP. Scores are truncated toward zero at 3 decimals,
 *    so 0.9999 prints as 0.999 and never as 1.000. Only an exact 1 prints as
 *    1.000. Same for seconds.
 *
 * Exports: writeReport(path, { results, meta }) -> { path, markdown }, and
 * formatReport({ results, meta }) for callers that just want the string.
 *
 * Expected per-page record (every field optional except `id`):
 *   {
 *     id, title,
 *     strokes,                                  // how many polylines were drawn
 *     seconds,                                  // wall clock; or drawMs/runMs in ms
 *     tokens: { input, cacheRead, output },     // pipeline TokenUsage
 *     verified,                                 // the pipeline's OWN score, 0..1
 *     error,                                    // if the page failed to run
 *     score: <scorePage() result>,              // the independent score
 *   }
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { summarise } from './score.mjs'

const MISSING = '—'

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** Truncate toward zero: a reported score is never higher than the real one. */
function trunc(v, dp) {
  if (!isNum(v)) return null
  const f = 10 ** dp
  return Math.trunc(v * f) / f
}

const fixed = (v, dp) => (isNum(v) ? trunc(v, dp).toFixed(dp) : MISSING)

/** 0..1 as a percentage, truncated — 99.99% never prints as 100%. */
const pct = (v) => (isNum(v) ? `${trunc(v * 100, 1).toFixed(1)}%` : MISSING)

const int = (v) => (isNum(v) ? Math.round(v).toLocaleString('en-US') : MISSING)

const escapeCell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ')

const tokensOf = (r) => r?.tokens ?? r?.usage ?? null

/**
 * Wall clock for a page, in seconds. A runner may record it as `seconds`, or as
 * millisecond spans (`drawMs` for the drawing, `runMs` for the pipeline) — both
 * are accepted, and the spans are ADDED, because the wall clock a person cares
 * about is "how long did this page take", drawing included. Returns null, not 0,
 * when nothing was recorded.
 */
function secondsOf(r) {
  if (isNum(r?.seconds)) return r.seconds
  const ms = [r?.drawMs, r?.runMs, r?.ms].filter(isNum)
  return ms.length ? ms.reduce((a, b) => a + b, 0) / 1000 : null
}

/** "12,345 / 98,765 / 1,234" — input / cacheRead / output, each missing-safe. */
function tokenCell(r) {
  const t = tokensOf(r)
  if (!t) return MISSING
  return `${int(t.input)} / ${int(t.cacheRead)} / ${int(t.output)}`
}

function table(results) {
  const head = [
    '| id | title | strokes | secs | tokens (in / cacheRead / out) | verified | regionScore | mustScore | order | elements |',
    '| --- | --- | --: | --: | --: | --: | --: | --: | --: | --: |',
  ]
  const rows = results.map((r) => {
    const s = r.score ?? {}
    const title = r.error ? `${escapeCell(r.title ?? '')} **(failed)**` : escapeCell(r.title ?? '')
    return `| \`${escapeCell(r.id)}\` | ${title} | ${int(r.strokes ?? r.strokeCount)} | ${fixed(secondsOf(r), 2)} | ` +
      `${tokenCell(r)} | ${pct(r.verified)} | ${fixed(s.regionScore, 3)} | ${fixed(s.mustScore, 3)} | ` +
      `${fixed(s.order, 3)} | ${int(s.elements)} |`
  })
  return [...head, ...rows].join('\n')
}

function totals(results) {
  const sum = (pick) => {
    const xs = results.map(pick).filter(isNum)
    return xs.length ? xs.reduce((a, b) => a + b, 0) : null
  }
  return {
    seconds: sum(secondsOf),
    input: sum((r) => tokensOf(r)?.input),
    cacheRead: sum((r) => tokensOf(r)?.cacheRead),
    output: sum((r) => tokensOf(r)?.output),
    verified: results.map((r) => r.verified).filter(isNum),
    failed: results.filter((r) => r.error).length,
  }
}

function metaBlock(meta = {}) {
  const lines = []
  const put = (label, value) => {
    if (value === undefined || value === null || value === '') return
    lines.push(`- **${label}:** ${Array.isArray(value) ? value.join(', ') : value}`)
  }
  put('run', meta.runId)
  put('started', meta.startedAt)
  put('finished', meta.finishedAt)
  put('model', meta.model)
  put('commit', meta.commit)
  put('checkout', meta.repo)
  put('app dir', meta.appDir)
  put('port', meta.port)
  put('match IoU threshold', isNum(meta.threshold) ? meta.threshold : undefined)
  put('attempts per page', meta.attempts)
  put('notes', meta.notes)
  for (const [k, v] of Object.entries(meta.extra ?? {})) put(k, v)
  return lines.length ? lines.join('\n') : '_no run metadata recorded_'
}

function perPageSections(results) {
  const out = []
  for (const r of results) {
    const s = r.score ?? {}
    const lines = [`### \`${r.id}\`${r.title ? ` — ${r.title}` : ''}`, '']
    if (r.error) lines.push(`- **failed:** ${escapeCell(r.error)}`, '')
    const missed = s.missed ?? []
    if (!s.missed) {
      lines.push('- not scored (no score recorded for this page)')
    } else if (!missed.length) {
      lines.push(`- every region matched (${(s.matched ?? []).length}/${(s.matched ?? []).length})`)
    } else {
      const matchedN = (s.matched ?? []).length
      lines.push(`- missed ${missed.length} of ${matchedN + missed.length} regions:`)
      for (const m of missed) {
        const r0 = m.rect ?? {}
        lines.push(
          `  - \`${m.role}\`${m.must ? ' **(must)**' : ''}` +
          `${isNum(r0.x) ? ` — asked for ${Math.round(r0.w)}×${Math.round(r0.h)} at (${Math.round(r0.x)}, ${Math.round(r0.y)})` : ''}`,
        )
      }
    }
    if ((s.matched ?? []).length) {
      lines.push('- matched:')
      for (const m of s.matched) {
        lines.push(`  - \`${m.role}\` → \`<${m.found?.tag ?? '?'}>\`${m.found?.srcLoc ? ` at \`${m.found.srcLoc}\`` : ''} (IoU ${fixed(m.iou, 3)})`)
      }
    }
    for (const n of s.notes ?? []) lines.push(`- note: ${escapeCell(n)}`)
    out.push(lines.join('\n'))
  }
  return out.join('\n\n')
}

/** The markdown, without touching the disk. */
export function formatReport({ results = [], meta = {} } = {}) {
  const agg = summarise(results)
  const t = totals(results)
  const verifiedMean = t.verified.length ? t.verified.reduce((a, b) => a + b, 0) / t.verified.length : null

  return `# sketch-to-code benchmark

${metaBlock({ ...meta })}

## Pages

${table(results)}

## Aggregate

Means skip pages where the value does not exist (no \`must\` regions, nothing to
order, a page that failed) rather than counting them as 0.

| metric | value | over |
| --- | --: | --: |
| verified (the pipeline's own score) | ${pct(verifiedMean)} | ${t.verified.length} page(s) |
| regionScore (mean IoU, independent) | ${fixed(agg.regionScore, 3)} | ${agg.rows.filter((r) => isNum(r.regionScore)).length} page(s) |
| mustScore | ${fixed(agg.mustScore, 3)} | ${agg.rows.filter((r) => isNum(r.mustScore)).length} page(s) |
| order | ${fixed(agg.order, 3)} | ${agg.rows.filter((r) => isNum(r.order)).length} page(s) |
| elements rendered | ${fixed(agg.elements, 1)} | ${agg.rows.filter((r) => isNum(r.elements)).length} page(s) |

| total | value |
| --- | --: |
| pages | ${int(agg.pages)} |
| pages that failed to run | ${int(t.failed)} |
| regions missed | ${int(agg.regionsMissed)} |
| \`must\` regions missed | ${int(agg.mustMissed)} |
| wall clock | ${isNum(t.seconds) ? `${fixed(t.seconds, 2)}s (${fixed(t.seconds / 60, 2)} min)` : MISSING} |
| input tokens | ${int(t.input)} |
| cacheRead tokens | ${int(t.cacheRead)} |
| output tokens | ${int(t.output)} |

- **worst page (by regionScore):** ${agg.worst ? `\`${agg.worst.id}\` at ${fixed(agg.worst.regionScore, 3)}` : MISSING}
- **best page (by regionScore):** ${agg.best ? `\`${agg.best.id}\` at ${fixed(agg.best.regionScore, 3)}` : MISSING}

## Per page

${perPageSections(results) || '_no pages_'}

---

\`regionScore\`, \`mustScore\` and \`order\` are measured from the rendered DOM by
\`tests/bench/lib/score.mjs\`, independently of the pipeline. \`verified\` is the
pipeline's own opinion of its own actions and is reported for comparison only.
Scores are truncated, never rounded up; \`${MISSING}\` means not measured.
`
}

/** Write the report to `path` (parent dirs created). Returns { path, markdown }. */
export function writeReport(path, { results = [], meta = {} } = {}) {
  const markdown = formatReport({ results, meta })
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, markdown)
  return { path, markdown }
}

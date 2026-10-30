/**
 * n115: a run cut short because the dev server itself stopped.
 *
 * A run writes its record (`result.json`) only when it ends. Found in round 38
 * (hotel, n113 tries 2 and 3): the app's dev server died mid-run, right after
 * an edit. The process that would have written the record was gone, so the run
 * left a folder with a stage log and no record, and nothing ever said what
 * happened to it. The edits it had already made were on disk, unreviewed.
 *
 * When the dev server starts again, every run folder that has a stage log but
 * no record is one of those. Each gets a record saying so: interrupted, the
 * last stage it reached, and that the page on disk was kept as it was left (no
 * revert, no rebuild). The runs viewer and anything reading records then see
 * it like any other finished run.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface InterruptedRecord {
  ok: false
  interrupted: true
  reason: string
  lastStage: string | null
  lastDetail: string | null
  stoppedAfterMs: number | null
  markedAt: string
  kept: 'page on disk kept as the run left it'
}

/** The last stage a run reached, from its stage log (one JSON object per line). */
function lastStage(dir: string): { stage: string | null; detail: string | null; ms: number | null } {
  try {
    const lines = readFileSync(join(dir, 'stages.jsonl'), 'utf8').split('\n').filter((l) => l.trim())
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const o = JSON.parse(lines[i]!) as { stage?: string; detail?: string; ms?: number }
        return { stage: o.stage ?? null, detail: o.detail ?? null, ms: typeof o.ms === 'number' ? o.ms : null }
      } catch { /* a line cut mid-write by the crash: try the one before */ }
    }
  } catch { /* no stage log */ }
  return { stage: null, detail: null, ms: null }
}

/**
 * Write a record for each run under `<root>/.sketch2code/runs` that started (has a
 * stage log) but never ended (no result.json). `activeRunIds` are runs this
 * server is running now, never marked. Returns the run ids marked.
 */
export function markInterruptedRuns(root: string, activeRunIds: ReadonlySet<string> = new Set(), at = new Date()): string[] {
  const runs = join(root, '.sketch2code', 'runs')
  if (!existsSync(runs)) return []
  const marked: string[] = []
  for (const id of readdirSync(runs)) {
    const dir = join(runs, id)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    if (activeRunIds.has(id)) continue
    if (existsSync(join(dir, 'result.json'))) continue
    if (!existsSync(join(dir, 'stages.jsonl'))) continue
    const last = lastStage(dir)
    const rec: InterruptedRecord = {
      ok: false,
      interrupted: true,
      reason: 'the dev server stopped while this run was going; it never finished',
      lastStage: last.stage,
      lastDetail: last.detail,
      stoppedAfterMs: last.ms,
      markedAt: at.toISOString(),
      kept: 'page on disk kept as the run left it',
    }
    try {
      writeFileSync(join(dir, 'result.json'), JSON.stringify(rec, null, 2))
      marked.push(id)
    } catch { /* read-only or gone: nothing to record into */ }
  }
  return marked
}

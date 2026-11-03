import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { markInterruptedRuns } from '../src/interrupted-runs.js'

function app() {
  const root = mkdtempSync(join(tmpdir(), 's2c-n115-'))
  const runs = join(root, '.sketch2code', 'runs')
  const make = (id: string, files: Record<string, string>) => {
    mkdirSync(join(runs, id), { recursive: true })
    for (const [f, t] of Object.entries(files)) writeFileSync(join(runs, id, f), t)
  }
  return { root, runs, make }
}

describe('n115: runs cut short by a dev server that stopped', () => {
  it('writes a record for a run with a stage log and no record, naming its last stage', () => {
    const a = app()
    a.make('r1', { 'stages.jsonl': '{"ms":10,"stage":"reading"}\n{"ms":90000,"stage":"editing","detail":"src/App.tsx"}\n{"ms":95' })
    expect(markInterruptedRuns(a.root, new Set(), new Date('2026-10-30T15:00:00Z'))).toEqual(['r1'])
    const rec = JSON.parse(readFileSync(join(a.runs, 'r1', 'result.json'), 'utf8'))
    expect(rec).toMatchObject({ ok: false, interrupted: true, lastStage: 'editing', lastDetail: 'src/App.tsx', stoppedAfterMs: 90000 })
    expect(rec.kept).toMatch(/page on disk kept/)
  })
  it('leaves finished runs, runs still going here, and folders with no stage log alone', () => {
    const a = app()
    a.make('done', { 'stages.jsonl': '{"ms":1,"stage":"x"}\n', 'result.json': '{"ok":true}' })
    a.make('live', { 'stages.jsonl': '{"ms":1,"stage":"x"}\n' })
    a.make('empty', {})
    expect(markInterruptedRuns(a.root, new Set(['live']))).toEqual([])
    expect(JSON.parse(readFileSync(join(a.runs, 'done', 'result.json'), 'utf8'))).toEqual({ ok: true })
    expect(existsSync(join(a.runs, 'live', 'result.json'))).toBe(false)
    expect(existsSync(join(a.runs, 'empty', 'result.json'))).toBe(false)
  })
  it('is a no-op for an app that has never run', () => {
    expect(markInterruptedRuns(mkdtempSync(join(tmpdir(), 's2c-n115-')))).toEqual([])
  })
  it('marks a run only once', () => {
    const a = app()
    a.make('r1', { 'stages.jsonl': '{"ms":1,"stage":"x"}\n' })
    expect(markInterruptedRuns(a.root)).toEqual(['r1'])
    expect(markInterruptedRuns(a.root)).toEqual([])
  })
})

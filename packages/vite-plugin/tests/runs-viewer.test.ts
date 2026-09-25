import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  escapeHtml, listRuns, normalizeFidelity, readRunSettings, readRunSummary, routeOf, scoreVerification,
} from '../src/runs-viewer.js'

let root: string
let runsRoot: string

const write = (id: string, name: string, body: string | Buffer): void => {
  mkdirSync(join(runsRoot, id), { recursive: true })
  writeFileSync(join(runsRoot, id, name), body)
}
const writeJson = (id: string, name: string, data: unknown): void =>
  write(id, name, JSON.stringify(data, null, 2))

/** A bundle with everything today's pipeline writes. */
function completeBundle(id = 'run-1789609047318-v2'): string {
  write(id, 'evidence.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  write(id, 'evidence.json', 'brief')
  write(id, 'prompt.txt', 'implement every action now')
  write(id, 'system.txt', 'contract')
  write(id, 'reply-1.txt', 'action 0: did the thing')
  write(id, 'checkpoint.txt', 'f784c637b6d590dd6248f252d5b59793e076c76e\n')
  writeJson(id, 'interpretation.json', {
    reading: 'a side profile',
    actions: [{ kind: 'design', instruction: 'draw it' }],
  })
  writeJson(id, 'fidelity.json', {
    resemblance: 1,
    keep: { asymmetry: true, rhythm: false, proportions: true, placement: false },
    fill: 'realized',
    palette: 'sketch',
  })
  writeJson(id, 'notes.json', [{ id: 'n0', text: 'a side profile of a face', scope: 'run' }])
  writeJson(id, 'codemod.json', { handled: [{ index: 0 }, { index: 2 }], refused: ['action 1'], files: [] })
  writeJson(id, 'verify-1.json', [{ kind: 'add', index: 0, verdict: { satisfied: false, reason: 'nope' } }])
  writeJson(id, 'verify-2.json', [
    { kind: 'add', index: 0, verdict: { satisfied: true, reason: 'ok' } },
    { kind: 'composition', index: 0, score: 0.71, flaws: [], notes: [] },
  ])
  writeJson(id, 'result.json', {
    engine: 'model',
    checkpoint: 'f784c637b6d590dd6248f252d5b59793e076c76e',
    changedFiles: ['src/components/UserTable.tsx'],
    reading: 'a side profile of a face, looking right',
    verification: [],
    tokens: { input: 29165, cacheRead: 424283, output: 11608 },
    codemod: { handled: [0, 2], refused: ['action 1'] },
    fidelity: { resemblance: 1 },
  })
  return id
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 's2c-runs-'))
  runsRoot = join(root, '.sketch2code', 'runs')
  mkdirSync(runsRoot, { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('readRunSummary', () => {
  it('summarises a complete bundle', () => {
    const id = completeBundle()
    const s = readRunSummary(runsRoot, id)!
    expect(s.id).toBe(id)
    expect(s.at).toBe(1789609047318)
    expect(s.mode).toBe('design') // inferred from the design action
    expect(s.engine).toBe('model')
    expect(s.reading).toBe('a side profile of a face, looking right')
    expect(s.tokens).toEqual({ input: 29165, cacheRead: 424283, output: 11608 })
    expect(s.changedFiles).toEqual(['src/components/UserTable.tsx'])
    expect(s.notes).toEqual(['a side profile of a face'])
    expect(s.codemod).toEqual({ handled: 2, refused: 1 })
    expect(s.checkpoint).toBe('f784c637b6d590dd6248f252d5b59793e076c76e')
    expect(s.ink).toBe('evidence.png')
    expect(s.candidates).toBeNull()
    expect(s.partial).toBe(false)
    // newest verify file wins, not the first
    expect(s.summaryScore).toEqual({ kind: 'verified', score: 1, satisfied: 1, total: 1, round: '2' })
    // fidelity.json beats result.json's copy and is fully normalized
    expect(s.fidelity).toEqual({
      resemblance: 1,
      keep: { asymmetry: true, rhythm: false, proportions: true, placement: false },
      fill: 'realized',
      palette: 'sketch',
    })
  })

  it('tolerates a bundle with no fidelity.json and no notes.json', () => {
    const id = 'run-1786745394985-0'
    write(id, 'ink.png', Buffer.from([0x89]))
    writeJson(id, 'request.json', { mode: 'screenshot', strokeCount: 3 })
    writeJson(id, 'verify-1.json', { verdicts: [{ satisfied: true }, { satisfied: false }], satisfied: 1, total: 2, score: 0.5 })
    writeJson(id, 'result.json', { checkpoint: 'abc123', changedFiles: ['src/App.tsx'], rounds: 1 })

    const s = readRunSummary(runsRoot, id)!
    expect(s.fidelity).toBeNull()
    expect(s.notes).toEqual([])
    expect(s.mode).toBe('screenshot')
    expect(s.reading).toBeNull()
    expect(s.ink).toBe('ink.png')
    expect(s.tokens).toEqual({ input: 0, cacheRead: 0, output: 0 })
    expect(s.codemod).toEqual({ handled: 0, refused: 0 })
    expect(s.summaryScore).toEqual({ kind: 'verified', score: 0.5, satisfied: 1, total: 2, round: '1' })
    expect(s.partial).toBe(false)
  })

  it('does not throw on corrupt JSON — it degrades and flags the bundle', () => {
    const id = 'run-1786745470713-1'
    write(id, 'result.json', '{"changedFiles": ["a.tsx", ') // truncated mid-write
    write(id, 'fidelity.json', 'not json at all')
    writeJson(id, 'verify-1.json', [{ kind: 'composition', index: 0, score: 0.42 }])

    const s = readRunSummary(runsRoot, id)!
    expect(s.partial).toBe(true)
    expect(s.reading).toBeNull()
    expect(s.changedFiles).toEqual([])
    expect(s.fidelity).toBeNull()
    // composition is what got measured, so that is the score reported
    expect(s.summaryScore).toEqual({
      kind: 'composition', score: 0.42, satisfied: null, total: null, round: '1',
    })
  })

  it('handles an empty run directory', () => {
    mkdirSync(join(runsRoot, 'run-1789000000000-v2'))
    const s = readRunSummary(runsRoot, 'run-1789000000000-v2')!
    expect(s.files).toEqual([])
    expect(s.summaryScore).toBeNull()
    expect(s.ink).toBeNull()
    expect(s.changedFiles).toEqual([])
    expect(s.notes).toEqual([])
    expect(s.partial).toBe(false)
  })

  it('returns null for an unknown or unsafe id', () => {
    expect(readRunSummary(runsRoot, 'nope')).toBeNull()
    expect(readRunSummary(runsRoot, '../../etc')).toBeNull()
    expect(readRunSummary(runsRoot, '..')).toBeNull() // matches SAFE_NAME, escapes the bundle
    expect(readRunSummary(runsRoot, '.')).toBeNull()
  })

  it('reads the candidates array from result.json and from candidates.json', () => {
    const a = 'run-1789700000000-v2'
    writeJson(a, 'result.json', {
      changedFiles: [],
      candidates: [
        { index: 0, score: 0.5, files: ['a.tsx'], chosen: false, tokens: { input: 10, cacheRead: 1, output: 2 } },
        { index: 1, score: 0.9, files: ['a.tsx', 'b.tsx'], chosen: true },
      ],
    })
    const s = readRunSummary(runsRoot, a)!
    expect(s.candidates).toEqual([
      { index: 0, score: 0.5, tokens: { input: 10, cacheRead: 1, output: 2 }, files: ['a.tsx'], chosen: false },
      { index: 1, score: 0.9, tokens: null, files: ['a.tsx', 'b.tsx'], chosen: true },
    ])

    const b = 'run-1789700000001-v2'
    writeJson(b, 'candidates.json', [{ index: 0, score: 1, files: [], chosen: true }])
    expect(readRunSummary(runsRoot, b)!.candidates).toHaveLength(1)
  })

  it('prefers verify-final.json over numbered rounds', () => {
    const id = 'run-1789700000002-v2'
    writeJson(id, 'verify-1-1.json', [{ kind: 'add', index: 0, satisfied: false }])
    writeJson(id, 'verify-final.json', [{ kind: 'add', index: 0, satisfied: true }])
    expect(readRunSummary(runsRoot, id)!.summaryScore).toEqual({
      kind: 'verified', score: 1, satisfied: 1, total: 1, round: 'final',
    })
  })
})

describe('listRuns', () => {
  it('is newest-first and skips nothing readable', () => {
    completeBundle('run-1789609047318-v2')
    writeJson('run-1780000000000-0', 'result.json', { changedFiles: [] })
    writeJson('run-1789999999999-v2', 'result.json', { changedFiles: [] })
    const ids = listRuns(runsRoot).map((r) => r.id)
    expect(ids).toEqual(['run-1789999999999-v2', 'run-1789609047318-v2', 'run-1780000000000-0'])
  })

  it('returns [] when the runs directory does not exist', () => {
    expect(listRuns(join(root, 'nowhere'))).toEqual([])
  })

  it('survives a bundle full of garbage', () => {
    write('run-1789609047318-v2', 'result.json', '   not json')
    write('run-1789609047318-v2', 'verify-1.json', '[[[')
    write('run-1789609047318-v2', 'notes.json', '{"text": broken')
    const runs = listRuns(runsRoot)
    expect(runs).toHaveLength(1)
    expect(runs[0]!.partial).toBe(true)
    expect(runs[0]!.notes).toEqual([])
  })

  it('honours the limit', () => {
    for (let i = 0; i < 5; i++) writeJson(`run-178900000000${i}-v2`, 'result.json', { changedFiles: [] })
    expect(listRuns(runsRoot, 2)).toHaveLength(2)
  })
})

describe('readRunSettings', () => {
  it('returns the documented {fidelity, notes, mode} shape', () => {
    const id = completeBundle()
    expect(readRunSettings(runsRoot, id)).toEqual({
      fidelity: {
        resemblance: 1,
        keep: { asymmetry: true, rhythm: false, proportions: true, placement: false },
        fill: 'realized',
        palette: 'sketch',
      },
      notes: ['a side profile of a face'],
      mode: 'design',
    })
  })

  it('normalizes a fidelity that predates the fill/palette fields', () => {
    const id = 'run-1789532441913-v2'
    writeJson(id, 'fidelity.json', {
      resemblance: 1,
      keep: { asymmetry: true, placement: false, proportions: true, rhythm: false },
      palette: 'sketch',
    })
    const s = readRunSettings(runsRoot, id)!
    expect(s.fidelity!.fill).toBe('filled') // today's default, filled in
    expect(s.fidelity!.palette).toBe('sketch')
  })

  it('is null-fidelity for a bundle that predates fidelity entirely', () => {
    const id = 'run-1786062560064-0'
    writeJson(id, 'result.json', { checkpoint: 'a', changedFiles: [] })
    expect(readRunSettings(runsRoot, id)).toEqual({ fidelity: null, notes: [], mode: 'gesture' })
  })

  it('returns null for an unknown run', () => {
    expect(readRunSettings(runsRoot, 'run-1-0')).toBeNull()
  })
})

describe('normalizeFidelity', () => {
  it('falls back to the defaults for anything unrecognized', () => {
    expect(normalizeFidelity(null)).toEqual({
      resemblance: 0.5,
      keep: { asymmetry: true, rhythm: true, proportions: true, placement: true },
      fill: 'filled',
      palette: 'app',
    })
    expect(normalizeFidelity({ resemblance: 7, fill: 'wat', palette: 'nope' })).toMatchObject({
      resemblance: 1, fill: 'filled', palette: 'app',
    })
    expect(normalizeFidelity({ resemblance: -3 }).resemblance).toBe(0)
    expect(normalizeFidelity({ resemblance: 'high' }).resemblance).toBe(0.5)
  })
})

describe('scoreVerification', () => {
  it('counts every countable verdict shape', () => {
    expect(scoreVerification({ verdicts: [{ satisfied: true }, { satisfied: true }] }, '1')?.score).toBe(1)
    expect(scoreVerification([{ kind: 'swap', satisfied: false }], '1')).toMatchObject({ satisfied: 0, total: 1 })
    expect(scoreVerification([{ verdicts: [{ satisfied: true }] }, { verdict: { satisfied: false } }], '1'))
      .toMatchObject({ satisfied: 1, total: 2 })
  })

  it('reports composition only when nothing pass/fail was measured', () => {
    expect(scoreVerification([{ kind: 'composition', score: 0.6 }], '1')?.kind).toBe('composition')
    expect(
      scoreVerification([{ kind: 'composition', score: 0.6 }, { kind: 'add', verdict: { satisfied: true } }], '1')?.kind,
    ).toBe('verified')
  })

  it('is null for detail it cannot read', () => {
    expect(scoreVerification({ pageChanged: true }, '1')).toBeNull()
    expect(scoreVerification(undefined, '1')).toBeNull()
    expect(scoreVerification('nonsense', '1')).toBeNull()
  })
})

describe('routeOf', () => {
  it('routes both the full path and the connect-stripped path', () => {
    expect(routeOf('/@s2c/runs.json')).toEqual({ kind: 'list' })
    expect(routeOf('.json')).toEqual({ kind: 'list' })
    expect(routeOf('/@s2c/runs/run-1-v2/settings.json')).toEqual({ kind: 'settings', id: 'run-1-v2' })
    expect(routeOf('/run-1-v2/settings.json')).toEqual({ kind: 'settings', id: 'run-1-v2' })
    expect(routeOf('/@s2c/runs')).toMatchObject({ kind: 'index' })
    expect(routeOf('/?id=run-1-v2')).toEqual({ kind: 'detail', id: 'run-1-v2' })
    expect(routeOf('/@s2c/runs?id=run-1-v2&file=evidence.png'))
      .toEqual({ kind: 'file', id: 'run-1-v2', file: 'evidence.png' })
    expect(routeOf('/@s2c/runs/whatever')).toEqual({ kind: 'unknown' })
  })
})

describe('escapeHtml', () => {
  it('neutralises markup in attributes as well as text', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(escapeHtml('" onerror="alert(1)')).toBe('&quot; onerror=&quot;alert(1)')
    expect(escapeHtml("' onload='x")).toBe('&#39; onload=&#39;x')
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })
})

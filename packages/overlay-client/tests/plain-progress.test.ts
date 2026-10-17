import { describe, expect, it } from 'vitest'
import { plainStage, rawStage, readingFailedLine } from '../src/plain-progress.js'

// the developer words the old progress lines were made of
const JARGON = /\.(jsx?|tsx?|json)\b|src\/|\/api\/|\b(POST|GET)\b|\baction \d|\bround \d|\(s\)|\bgit\b|checkpoint|snapshot|codemod|codegen|Claude Code|^\w+: |\d+%|\[v2\]/

// every stage run.ts / run2.ts emits, with the detail it sends
const EMITTED: Array<[string, string?]> = [
  ['safety', 'git checkpoint'],
  ['intent', 'Add a testimonials section under the counter (e12).'],
  ['rule', 'could not be carried out: action 2 targets e99 which is not on the page'],
  ['codemod', 'action 0: App now saves email to server/data/apps.json through POST /api/apps'],
  ['codemod', 'action 1 refused: no stamp for src/App.jsx:12:3'],
  ['codegen', 'Claude Code editing source'],
  ['finish', 'src/App.jsx: wrapped in <form>'],
  ['verify', 'round 1: snapshotting edited page'],
  ['verify', '67% of actions satisfied'],
  ['verify', 'no improvement — stopping'],
  ['verify', 'testing 1 behaviour(s) in the page'],
  ['verify', 'failed: POST /api/apps returned 500'],
  ['repair', 'round 2'],
  ['repair', 'round 2: 1 op(s) unsatisfied'],
  ['candidate', 'attempt 2/3: generating'],
  ['candidate', 'attempt 2/3: 71% faithful'],
  ['candidate', 'keeping attempt 2 (71%)'],
  ['something-new', 'TypeError: x is undefined at foo (src/a.ts:1:2)'],
]

describe('plainStage', () => {
  it('never shows a developer word, whatever the detail carries', () => {
    for (const [stage, detail] of EMITTED) {
      const line = plainStage({ stage, detail })
      expect(line, `${stage}: ${detail}`).toBeTruthy()
      expect(line!, `${stage}: ${detail}`).not.toMatch(JARGON)
    }
  })
  it('never echoes the detail (model- or code-written text)', () => {
    const line = plainStage({ stage: 'intent', detail: 'Make the heading red' })
    expect(line).not.toContain('heading')
  })
  it('says what kind of step it is', () => {
    expect(plainStage({ stage: 'safety', detail: 'git checkpoint' })).toMatch(/undone/)
    expect(plainStage({ stage: 'codemod', detail: 'action 0: x' })).toBe('Making the change…')
    expect(plainStage({ stage: 'codemod', detail: 'action 1 refused: y' })).toMatch(/didn’t go in/)
    expect(plainStage({ stage: 'verify', detail: 'round 1: snapshotting edited page' })).toMatch(/matches your sketch/)
    expect(plainStage({ stage: 'verify', detail: 'testing 1 behaviour(s) in the page' })).toMatch(/Trying it out/)
    expect(plainStage({ stage: 'repair', detail: 'round 2' })).toBe('Not quite right yet. Fixing it (try 2)…')
    expect(plainStage({ stage: 'candidate', detail: 'attempt 2/3: 71% faithful' })).toMatch(/version 2 of 3.*best/)
  })
  it('leaves the bar alone on done: the run’s own sentence follows', () => {
    expect(plainStage({ stage: 'done', detail: '[v2] 100% verified · revert: git restore …' })).toBeNull()
  })
  it('keeps the raw line for the tooltip/console', () => {
    expect(rawStage({ stage: 'verify', detail: 'round 1: snapshotting edited page' })).toBe('verify: round 1: snapshotting edited page')
    expect(rawStage({ stage: 'done' })).toBe('done')
  })
  it('stays short enough for the bar', () => {
    for (const [stage, detail] of EMITTED) expect((plainStage({ stage, detail }) ?? '').length).toBeLessThanOrEqual(80)
  })
})

describe('readingFailedLine', () => {
  it('is plain and says what to press', () => {
    expect(readingFailedLine()).not.toMatch(JARGON)
    expect(readingFailedLine()).toMatch(/▶ Run/)
  })
})

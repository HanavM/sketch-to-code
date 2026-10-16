import { describe, expect, it } from 'vitest'
import { describeTarget, explainError, explainRun, isPlain, scrub } from '../src/explain.js'
import type { GroundedAction, GroundedTarget } from '../src/intent2.js'

const T = (tag: string, text: string, srcLoc = 'src/App.tsx:42:7'): GroundedTarget => ({
  domId: 'e12', srcLoc, tag, text, subtreeText: text, classes: ['px-4'], rect: { x: 0, y: 0, w: 10, h: 10 },
})
const A = (kind: GroundedAction['kind'], targets: GroundedTarget[], extra: Partial<GroundedAction> = {}): GroundedAction => ({
  kind, targets, instruction: 'do it', needsConfirm: false, ...extra,
})

// the real verifier strings, copied from run2/verify: full of jargon on purpose
const MOVE_FAIL = 'action 1 (MOVE): source not inside dest'
const DEL_FAIL = 'action 0 (DELETE): elements from src/App.tsx: 3→3'
const COLOUR_FAIL = 'action 0 (colour): nothing near the drawing is the colour that was drawn (#22c55e); closest is ΔE 41.2 away'

describe('explainRun', () => {
  const actions = [A('delete', [T('article', 'Pro plan $29/month')]), A('move', [T('blockquote', 'Best tool I ever used')])]

  it('a partial miss names what was understood, what did not happen, and offers undo', () => {
    const ex = explainRun({
      reading: 'Delete the Pro card (e12) and move the quote into the hero',
      actions, failures: [MOVE_FAIL], files: ['src/App.tsx'],
    })
    expect(ex.problem).toBe(true)
    expect(ex.undoable).toBe(true)
    expect(ex.sentence).toContain('I read your sketch as: delete the Pro card and move the quote into the hero.')
    expect(ex.sentence).toContain(`But I couldn't move the quote with "Best tool I ever used".`)
    expect(ex.sentence).toContain('Undo puts your files back')
    expect(isPlain(ex.sentence)).toBe(true)
  })

  it('never leaks the verifier reason, ids, paths or action numbers', () => {
    const ex = explainRun({ reading: 'Remove the card', actions, failures: [DEL_FAIL, MOVE_FAIL], files: ['src/App.tsx'] })
    for (const bad of ['src/', '.tsx', 'action 0', 'e12', '3→3', 'dest', 'MOVE']) expect(ex.sentence).not.toContain(bad)
    expect(ex.sentence).toMatch(/couldn't remove the card with "Pro plan \$29\/month" and move the quote/)
  })

  it('says which check failed in words: colour', () => {
    const ex = explainRun({
      reading: 'Make the button green',
      actions: [A('modify', [T('button', 'Get started')], { color: { drawn: '#22c55e' } as never })],
      failures: [COLOUR_FAIL], files: ['src/App.tsx'],
    })
    expect(ex.sentence).toContain(`couldn't change the button with "Get started" in the colour you drew`)
    expect(ex.sentence).not.toMatch(/ΔE|#22c55e/)
  })

  it('dropped marks are reported even when everything that ran verified', () => {
    const ex = explainRun({ reading: 'Delete the card', actions: [actions[0]!], droppedActions: 1, failures: [], files: ['src/App.tsx'] })
    expect(ex.problem).toBe(true)
    expect(ex.sentence).toContain("But one of your marks didn't match anything on the page, so I skipped it.")
    const two = explainRun({ reading: 'x', actions, droppedActions: 2, failures: [MOVE_FAIL], files: [] })
    expect(two.sentence).toContain('Also, 2 of your marks')
  })

  it('no files changed: no undo offered, and it says nothing was changed', () => {
    const ex = explainRun({ reading: 'Move the quote up', actions, failures: [MOVE_FAIL], files: [] })
    expect(ex.undoable).toBe(false)
    expect(ex.sentence).toMatch(/Nothing was changed\.$/)
  })

  it('a broken drawn rule is said once, in words', () => {
    const ex = explainRun({
      reading: 'Delete the card', actions: [actions[0]!],
      failures: ['a rule you drew is broken (align-left): e4 drifted 12px — you wrote: "keep aligned"'], files: ['a.tsx'],
    })
    expect(ex.sentence).toContain('breaks a rule you drew earlier')
    expect(ex.sentence).not.toContain('e4')
  })

  it('a backend refusal is explained without its code-shaped reason', () => {
    const ex = explainRun({
      reading: 'Load the team list from the server',
      actions: [A('serve', [T('ul', 'Ana Bo Cy')])], failures: [],
      refused: ['action 0 (serve): the list is not a literal array in src/Team.tsx:12:3'], files: [],
    })
    expect(ex.sentence).toContain(`couldn't load the list with "Ana Bo Cy" from the server`)
    expect(isPlain(ex.sentence)).toBe(true)
  })

  it('success is one plain sentence in the past tense and is not a problem', () => {
    const ex = explainRun({
      reading: 'Swap the two cards', failures: [], files: ['src/App.tsx'],
      actions: [A('swap', [T('article', 'Starter'), T('article', 'Team')])],
    })
    expect(ex).toEqual({ problem: false, sentence: 'Done: swapped the card with "Starter" and the card with "Team".', undoable: true })
  })

  it('a failure line it cannot parse is not invented into a phrase', () => {
    const ex = explainRun({ reading: 'Delete the card', actions, failures: ['weird verifier output'], files: ['a.tsx'] })
    expect(ex.problem).toBe(false)
  })
})

describe('explainError', () => {
  it('no valid actions -> nothing changed, with what to try', () => {
    const ex = explainError('no valid actions (rejected: unknown element id "e99"; swap action needs exactly 2 targets, got 1)', false)
    expect(ex.sentence).toBe("I couldn't tell what to change from that sketch, so nothing was changed. Try a clearer mark, or type a word or two about what you want.")
    expect(ex.undoable).toBe(false)
  })
  it('a crash part way offers undo only when files changed, and never shows the stack', () => {
    const msg = 'TypeError: Cannot read properties of undefined (reading \'rect\')\n    at verifyActions (/x/run2.ts:640:12)'
    const changed = explainError(msg, true)
    expect(changed.sentence).toBe('Something went wrong while making that change. Undo puts your files back the way they were.')
    expect(changed.undoable).toBe(true)
    expect(explainError(msg, false).sentence).toMatch(/Nothing was changed\.$/)
  })
  it('timeout and busy are told apart', () => {
    expect(explainError('run exceeded 600s cap', true).sentence).toMatch(/^That took too long and I stopped\. Undo/)
    expect(explainError('a run is already in progress', false).sentence).toMatch(/^Another change is still being made/)
  })
})

describe('describeTarget / scrub / isPlain', () => {
  it('uses the visible noun and text, trimmed', () => {
    expect(describeTarget(T('a', 'Pricing'))).toBe('the link with "Pricing"')
    expect(describeTarget(T('p', 'Hello there'))).toBe('the text "Hello there"')
    expect(describeTarget(T('div', ''))).toBe('the part')
    expect(describeTarget(T('h2', 'A very long heading that keeps going and going'))).toBe('the heading with "A very long heading that…"')
    expect(describeTarget(undefined)).toBe('that part of the page')
  })
  it('scrub removes ids, paths, action numbers and tags', () => {
    expect(scrub('Move element e12 from src/App.tsx:12:3 into <section> (action 2)')).toBe('Move from the page into (part)')
  })
  it('isPlain flags developer-only tokens', () => {
    for (const bad of ['see src/App.tsx', 'at 12:3:4', 'action 2 failed', 'element e12', 'git restore --source=abc', 'TypeError: x', '{"a":1}']) {
      expect(isPlain(bad), bad).toBe(false)
    }
    expect(isPlain('I read your sketch as: delete the Pro card. Undo puts your files back the way they were.')).toBe(true)
  })
})

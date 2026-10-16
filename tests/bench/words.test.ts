import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain .mjs bench module, no types
import { parseWords, countWords, notesFor, wordsTyped, answerKey, wordSummary, unclassified, armTable } from './lib/words.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import rough from './sketches/rough/index.mjs'
// @ts-expect-error — plain .mjs bench module, no types
import tidy from './sketches/index.mjs'

type Note = { at: { x: number; y: number }; text: string; content?: string | null }
type Spec = { id: string; notes?: Note[]; edits?: { check: string; text?: string; must?: boolean; needsWords?: boolean }[]; regions?: unknown[] }
const at = { x: 1, y: 1 }
const byId = (id: string): Spec => rough.find((s: Spec) => s.id.startsWith(id))

describe('--words parsing', () => {
  it('defaults to all, accepts the three arms in any case, refuses typos', () => {
    expect(parseWords(null)).toBe('all')
    expect(parseWords(true)).toBe('all') // bare --words
    expect(parseWords('Content')).toBe('content')
    expect(parseWords(' none ')).toBe('none')
    expect(() => parseWords('off')).toThrow(/all, content, none/)
  })
})

describe('counting words', () => {
  it('counts tokens with a letter or digit, not punctuation', () => {
    expect(countWords('say: Sketch it. Ship it.')).toBe(5)
    expect(countWords('email box + Subscribe button')).toBe(4)
    expect(countWords('  ')).toBe(0)
    expect(countWords(undefined)).toBe(0)
  })
})

describe('which notes get typed', () => {
  const spec: Spec = {
    id: 'x',
    notes: [
      { at, text: 'move the quote up here', content: null },
      { at, text: 'headline: Plan trips', content: ' Plan trips ' },
      { at, text: 'blank', content: '   ' },
    ],
  }
  it('all types every note verbatim', () => {
    expect(notesFor(spec, 'all').map((n: Note) => n.text)).toEqual(['move the quote up here', 'headline: Plan trips', 'blank'])
  })
  it('content types only the content, trimmed, and drops action-only notes', () => {
    expect(notesFor(spec, 'content')).toEqual([{ at, text: 'Plan trips' }])
    expect(wordsTyped(spec, 'content')).toBe(2)
  })
  it('none types nothing', () => {
    expect(notesFor(spec, 'none')).toEqual([])
    expect(wordsTyped(spec, 'none')).toBe(0)
  })
  it('content refuses a note nobody classified, rather than guessing', () => {
    const bad: Spec = { id: 'b', notes: [{ at, text: 'make it pop' }] }
    expect(unclassified(bad)).toEqual(['make it pop'])
    expect(() => notesFor(bad, 'content')).toThrow(/b: .*unclassified: "make it pop"/)
    expect(notesFor(bad, 'all')).toHaveLength(1) // the old behaviour is untouched
  })
})

describe('the answer key per arm', () => {
  it('all and content keep every check', () => {
    const s = byId('r02')
    expect(answerKey(s, 'all').spec).toBe(s)
    expect(answerKey(s, 'content')).toEqual({ spec: s, judged: true, dropped: [] })
  })
  it('none drops checks only words can pass, and keeps the rest', () => {
    const k = answerKey(byId('r02'), 'none')
    expect(k.judged).toBe(true)
    expect(k.dropped).toEqual(['present Sketch it'])
    expect(k.spec.edits.map((c: { check: string }) => c.check)).toEqual(['absent', 'kept', 'kept'])
    expect(byId('r02').edits).toHaveLength(4) // the original is not mutated
  })
  it('a page left with only `kept` musts is not judged, never scored', () => {
    const k = answerKey(byId('r03'), 'none') // a ring cannot say "green"
    expect(k.judged).toBe(false)
    expect(k.dropped).toEqual(['bg Get started'])
  })
  it('new-UI pages keep their key: real words are asked for, not particular ones', () => {
    const s = byId('r07')
    expect(answerKey(s, 'none')).toEqual({ spec: s, judged: true, dropped: [] })
  })
})

describe('the rough set is classified (the claim, written down)', () => {
  it('every rough note declares its content, so --words content can run', () => {
    for (const s of rough as Spec[]) expect(unclassified(s), s.id).toEqual([])
  })
  it('content mode never types more than all mode, and fewer over the set', () => {
    let all = 0
    let content = 0
    for (const s of rough as Spec[]) {
      expect(wordsTyped(s, 'content'), s.id).toBeLessThanOrEqual(wordsTyped(s, 'all'))
      all += wordsTyped(s, 'all')
      content += wordsTyped(s, 'content')
    }
    expect(content).toBeLessThan(all) // r09's one-word labels are already pure content; the rest shrink
  })
  it('at least one edit page carries its action with no words at all in content mode', () => {
    // r04: the arrow alone has to say "move"; without such a page the arm tests nothing new
    expect(notesFor(byId('r04'), 'content')).toEqual([])
  })
  it('only checks on edit pages may need words, and each one is a must', () => {
    for (const s of rough as Spec[]) {
      for (const c of s.edits ?? []) if (c.needsWords) expect(c.must, `${s.id} ${c.check}`).toBe(true)
    }
  })
  it('the tidy set is left unclassified, so content mode refuses it loudly', () => {
    const withNotes = (tidy as Spec[]).filter((s) => s.notes?.length)
    expect(withNotes.length).toBeGreaterThan(0)
    expect(() => notesFor(withNotes[0], 'content')).toThrow(/unclassified/)
  })
})

describe('per-arm totals', () => {
  it('realized % is over judged pages; words per realized page is null when none realized', () => {
    const rows = [
      { realized: true, wordsTyped: 3 },
      { realized: false, wordsTyped: 2 },
      { judged: false, wordsTyped: 0 },
      { realized: true, wordsTyped: 0 },
    ]
    expect(wordSummary(rows)).toEqual({
      pages: 4, judged: 3, notJudged: 1, realized: 2, realizedPct: 2 / 3, wordsTyped: 5, wordsPerRealized: 2.5,
    })
    expect(wordSummary([{ realized: false, wordsTyped: 4 }]).wordsPerRealized).toBeNull()
    expect(wordSummary([]).realizedPct).toBeNull()
  })
})

describe('the arm comparison', () => {
  it('sets arms side by side: totals, then a page matrix with not-judged and errors told apart', () => {
    const md = armTable({
      none: [{ id: 'r03', judged: false, wordsTyped: 0 }, { id: 'r04', realized: false, wordsTyped: 0 }],
      all: [{ id: 'r03', realized: true, wordsTyped: 3 }, { id: 'r04', realized: true, wordsTyped: 5 }],
      content: [{ id: 'r03', realized: true, wordsTyped: 1 }, { id: 'r04', error: 'boom', wordsTyped: 0 }],
    })
    const lines = md.split('\n')
    // arms always print in all, content, none order, whatever order they came in
    expect(lines[2]).toBe('| all | 100% | 2 | 0 | 8 | 4.0 |')
    expect(lines[3]).toBe('| content | 100% | 1 | 0 | 1 | 1.0 |') // the errored page is not a judged fail
    expect(lines[4]).toBe('| none | 0% | 1 | 1 | 0 | — |')
    expect(md).toContain('| r03 | yes | yes | n/j |')
    expect(md).toContain('| r04 | yes | err | no |')
  })
})

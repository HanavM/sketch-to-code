import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { editLabel, nameWords, plainLabel, runUndoLabel, type EditKind } from '../src/undo-store.js'
// @ts-expect-error plain .mjs shared with the e2e walkthrough, no types
import { jargonIn } from '../../cli/tests/e2e/jargon.mjs'

describe('runUndoLabel (s2c-045): what Ctrl+Z says it undid', () => {
  it('reuses the Done sentence of a run that went as drawn', () => {
    expect(runUndoLabel({ problem: false, sentence: 'Done: added "testimonials" where you drew it.' }))
      .toBe('added "testimonials" where you drew it')
    expect(runUndoLabel({ problem: false, sentence: '✓ Done: made the heading with "Get started" green.' }))
      .toBe('made the heading with "Get started" green')
  })
  it('says "your last sketch" when there is no plain sentence to reuse', () => {
    expect(runUndoLabel(undefined)).toBe('your last sketch')
    expect(runUndoLabel(null)).toBe('your last sketch')
    expect(runUndoLabel({ problem: false, sentence: 'Done.' })).toBe('your last sketch')
    // a misread's sentence is a complaint, not a description of what to take back
    expect(runUndoLabel({ problem: true, sentence: "I read your sketch as: x. But I couldn't add it." })).toBe('your last sketch')
  })
  it('a stopped run says so', () => {
    expect(runUndoLabel({ problem: false, sentence: 'Done: x.' }, true)).toBe('your last sketch (stopped part way)')
  })
  it('never the old developer label', () => {
    for (const e of [undefined, { problem: false, sentence: 'Done.' }]) expect(runUndoLabel(e)).not.toMatch(/sketch run/)
  })
})

describe('editLabel (s2c-046): every other edit, as Ctrl+Z says it', () => {
  const kinds: EditKind[] = ['instant', 'paint', 'image', 'extract', 'endpoint', 'form', 'data-real',
    'place', 'restore', 'setting', 'data-move', 'manipulate', 'responsive']
  const props = ['move', 'resize', 'reorder', 'w', 'h', 'gap', 'p', 'pt', 'ml', 'mt', 'translate-x', 'translate-y', undefined]
  const names = ['PricingCard', 'Hero', 'Navbar2', undefined, 'src/App.tsx', '../x', 'e12']

  it('no label any edit can produce trips the walkthrough\'s jargon list', () => {
    for (const k of kinds) for (const prop of props) for (const name of names) {
      const l = editLabel(k, { name, prop })
      expect(jargonIn(l), `${k}/${prop}/${name}: "${l}"`).toEqual([])
      expect(l).not.toMatch(/[#→<>{}[\]`]|\bw-\d|\binstant\b|\bextract\b|\bscrubbed\b/)
      expect(plainLabel(l)).toBe(l) // and the load-time guard leaves it alone
    }
  })
  it('names what was done in words', () => {
    expect(editLabel('instant', { name: 'PricingCard' })).toBe('added the pricing card you drew')
    expect(editLabel('extract', { name: 'NavBar' })).toBe('made the nav bar a reusable piece')
    expect(editLabel('place', { name: 'Hero' })).toBe('put the hero on the page')
    expect(editLabel('manipulate', { prop: 'resize' })).toBe('resized that part')
    expect(editLabel('manipulate', { prop: 'pt' })).toBe('changed the spacing')
    expect(editLabel('responsive', { prop: 'w' })).toBe('changed the width at this screen size only')
    expect(editLabel('restore')).toBe('went back to an earlier version')
  })
  it('a name that is a path or an id is not quoted', () => {
    expect(editLabel('instant', { name: 'src/App.tsx' })).toBe('added what you drew')
    expect(nameWords('e12')).toBe('') // an element id
    expect(editLabel('instant', { name: 'e12' })).toBe('added what you drew')
    expect(editLabel('place', { name: '../x' })).toBe('put that piece on the page')
  })
  it('labels saved by an older version are not shown as classes or files', () => {
    for (const old of ['+ w-64 h-12', 'fill: #111111 → #ef4444', 'instant PricingCard', 'extract Card',
      'moved child 2 → position 1', 'the picture now shows public/s2c/cat.png', 'scrubbed back to an earlier version',
      'title: none → "Hi"', 'edit', 'sketch run']) {
      expect(plainLabel(old), old).toBe('an earlier change')
    }
    expect(plainLabel('added "testimonials" where you drew it')).toBe('added "testimonials" where you drew it')
  })
  it('every pushEdit in the plugin goes through editLabel or runUndoLabel', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
    const calls = [...src.matchAll(/pushEdit\(\s*\w+\.sha,\s*([^\n]*)/g)].map((m) => m[1]!)
    expect(calls.length).toBeGreaterThanOrEqual(15)
    for (const c of calls) expect(c, c).toMatch(/^(editLabel|runUndoLabel)\(/)
  })
})

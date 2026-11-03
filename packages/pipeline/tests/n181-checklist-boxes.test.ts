import { describe, it, expect } from 'vitest'
import { checklistOf, checklistBrief, verifyChecklists } from '../src/checklist.js'

const pet = 'filters: Animal (Dogs, Cats, Rabbits), Age (Puppy, Adult, Senior), Size (Small, Medium, Large); Dogs, Adult, Medium checked orange'

describe('n181: a filters note with a "checked" tail is a checkbox list', () => {
  it('reads bracketed groups, headings and the checked names', () => {
    const g = checklistOf(pet)!
    expect(g.map((x) => x.heading)).toEqual(['Animal', 'Age', 'Size'])
    expect(g.flatMap((x) => x.options.map((o) => o.label))).toEqual(['Dogs', 'Cats', 'Rabbits', 'Puppy', 'Adult', 'Senior', 'Small', 'Medium', 'Large'])
    expect(g.flatMap((x) => x.options.filter((o) => o.on).map((o) => o.label))).toEqual(['Dogs', 'Adult', 'Medium'])
    expect(checklistBrief([pet])).toMatch(/\[ \] Cats/)
    expect(checklistBrief([pet])).toMatch(/EMPTY box/)
  })
  it('the colon form with a tail works too, and plain lists stay plain', () => {
    const g = checklistOf('Type: Full time, Part time, Remote; Level: Junior, Mid; Remote and Mid ticked teal')!
    expect(g.flatMap((x) => x.options.filter((o) => o.on).map((o) => o.label))).toEqual(['Remote', 'Mid'])
    expect(checklistOf('Dogs, Cats, Donate')).toBeNull()
    expect(checklistOf('pet cards: tinted picture top (peach, sage, blue, lilac), name bold, age · breed under')).toBeNull()
    expect(checklistOf('Biscuit, Juno, Pepper, Otis, Maple, Rio')).toBeNull()
  })
})

describe('n181: every option has a box a person can see', () => {
  const labels = ['Dogs', 'Cats', 'Rabbits', 'Puppy', 'Adult', 'Senior', 'Small', 'Medium', 'Large']
  const on = new Set(['Dogs', 'Adult', 'Medium'])
  const page = (border: string, withBoxes = true): Array<{ id: string; text: string; tag?: string; rect: { x: number; y: number; w: number; h: number }; style?: { border?: string; backgroundColor?: string } }> => labels.flatMap((t, i) => [
    { id: `l${i}`, text: t, rect: { x: 38, y: 90 + i * 28, w: 50, h: 16 } },
    ...(withBoxes ? [{ id: `b${i}`, text: '', tag: 'span', rect: { x: 16, y: 90 + i * 28, w: 16, h: 16 }, style: on.has(t) ? { backgroundColor: 'rgb(224, 122, 63)' } : { border, backgroundColor: 'rgba(0, 0, 0, 0)' } }] : []),
  ])
  it('passes visible grey boxes', () => {
    expect(verifyChecklists([pet], { nodes: page('1.5px rgb(176, 176, 176)') }).satisfied).toBe(true)
  })
  it('fails near-white boxes (the round 43 pets build)', () => {
    const v = verifyChecklists([pet], { nodes: page('1px rgb(236, 236, 236)') })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/too faint/)
  })
  it('fails labels with no box at all', () => {
    const v = verifyChecklists([pet], { nodes: page('', false) })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/no box/)
  })
  it('native checkboxes pass', () => {
    const nodes = labels.flatMap((t, i) => [{ id: `l${i}`, text: t, rect: { x: 38, y: 90 + i * 28, w: 50, h: 16 } }, { id: `b${i}`, text: '', tag: 'input', rect: { x: 16, y: 91 + i * 28, w: 14, h: 14 }, style: {} }])
    expect(verifyChecklists([pet], { nodes }).satisfied).toBe(true)
  })
  it('a <label> whose rect holds its box is read by its letters', () => {
    const nodes = labels.flatMap((t, i) => [
      { id: `l${i}`, text: t, rect: { x: 16, y: 90 + i * 28, w: 80, h: 18 }, textBox: { x: 40, y: 91 + i * 28, w: 40, h: 16 } },
      { id: `b${i}`, text: '', tag: 'span', rect: { x: 16, y: 91 + i * 28, w: 16, h: 16 }, style: { border: '1.5px rgb(176, 176, 176)' } },
    ])
    expect(verifyChecklists([pet], { nodes }).satisfied).toBe(true)
  })
  it('a nav link with the same word does not count as the option (n181 pets try 2)', () => {
    const nodes = [{ id: 'nav1', text: 'Dogs', rect: { x: 1050, y: 24, w: 34, h: 20 } }, { id: 'nav2', text: 'Cats', rect: { x: 1100, y: 24, w: 30, h: 20 } }, ...page('1.5px rgb(176, 176, 176)')]
    expect(verifyChecklists([pet], { nodes }).satisfied).toBe(true)
  })
})

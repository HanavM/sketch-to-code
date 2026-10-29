import { describe, expect, it } from 'vitest'
import { directionStrings, noteParts, typedCopyBrief, typedTimes, verifyNoDirections, verifyTypedTimes } from '../src/typedcopy.js'

const leaf = (id: string, text: string) => ({ id, text, textBox: { x: 0, y: 0, w: 10, h: 10 } })

// round 34 e2 departures and e3 habits (n66 sketches)
const departures = ['Departures, big bold yellow', '14:32, big bold white', '14:40 Lisbon TP 1351 B12 Boarding blue pill']
const habits = ['Read 20 pages, bold; done M T W F', 'Drink water; done M-S, not Sun', '7 day circles per card, green filled when done, grey ring when not']

describe('a note is its copy, its look words and its directions (n73)', () => {
  it('splits look tails and directions off the copy', () => {
    expect(noteParts('Read 20 pages, bold; done M T W F')).toEqual({ copy: 'Read 20 pages', look: 'bold', directions: ['done M T W F'] })
    expect(noteParts('14:32, big bold white')).toEqual({ copy: '14:32', look: 'big bold white', directions: [] })
    expect(noteParts('7 day circles per card, green filled when done, grey ring when not').look).toBeNull()
    expect(noteParts('Hello, world').look).toBeNull()
  })
  it('finds typed times in the copy only', () => {
    expect(typedTimes(departures)).toEqual(['14:32', '14:40'])
    expect(typedTimes(['Opens 9:05 pm, small grey'])).toEqual(['9:05 pm'])
    expect(typedTimes(['Ratio 16:9:4'])).toEqual([])
  })
  it('tells the time is static and the directions are not copy', () => {
    const b = typedCopyBrief([...departures, ...habits])
    expect(b).toContain('Never a live clock')
    expect(b).toContain('the text on the page is only "Read 20 pages"')
    expect(b).toContain('"done M T W F"')
  })
})

describe('the page is checked (n73)', () => {
  it('fails a live clock, passes the typed time', () => {
    expect(verifyTypedTimes(['14:32, big bold white'], { nodes: [leaf('a', 'Departures'), leaf('b', '11:58')] }).satisfied).toBe(false)
    expect(verifyTypedTimes(['14:32, big bold white'], { nodes: [leaf('a', 'Departures'), leaf('b', '14:32')] }).satisfied).toBe(true)
    expect(verifyTypedTimes(['Hello'], { nodes: [leaf('a', 'x')] }).unverifiable).toBe(true)
  })
  it('fails the raw note printed as a subtitle, passes the title alone', () => {
    const bad = verifyNoDirections(habits, { nodes: [leaf('t', 'Read 20 pages'), leaf('s', 'Read 20 pages, bold; done M T W F')] })
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toContain('done M T W F')
    expect(verifyNoDirections(habits, { nodes: [leaf('t', 'Read 20 pages'), leaf('u', 'Drink water'), leaf('d', 'M T W T F S S')] }).satisfied).toBe(true)
  })
  it('never forbids a single look word on its own (real copy can say bold)', () => {
    expect(directionStrings(['Be brave, bold']).map((d) => d.text)).toEqual(['Be brave, bold'])
    expect(verifyNoDirections(['Be brave, bold'], { nodes: [leaf('a', 'Be brave'), leaf('b', 'Go bold')] }).satisfied).toBe(true)
  })
})

describe('a repair that breaks a passing check is seen (n73)', () => {
  it('names each failure by its check', async () => {
    const { failKind } = await import('../src/run2.js')
    expect(failKind('page (note directions and look words never printed): "done M F" is printed')).toBe('page (note directions and look words never printed)')
    expect(failKind('action 3 (add, drawn boxes): the box is 40px low')).toBe('action 3 (add, drawn boxes)')
  })
})

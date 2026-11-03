import { describe, expect, it } from 'vitest'
import { directionStrings, noteParts, typedCopyBrief, verifyNoDirections } from '../src/typedcopy.js'

const leaf = (id: string, text: string) => ({ id, text, textBox: { x: 0, y: 0, w: 10, h: 10 } })

// round 41 c4 chess night and round 42 c3 ski lodge: style words after a heading's copy were printed
describe('style words after a heading are never copy (n164)', () => {
  it('a look given to one word of the copy is a direction, and the look before it comes off', () => {
    const p = noteParts('CHECK / MATE huge bold caps, MATE outlined only')
    expect(p.copy).toBe('CHECK / MATE')
    expect(p.look).toBe('huge bold caps')
    expect(p.directions).toEqual(['MATE outlined only'])
    expect(noteParts('Day Week Month toggle, Week dark').directions).toEqual(['Week dark'])
  })
  it('two look tails both come off when the copy has its own commas', () => {
    const p = noteParts('First tracks, / warm fire, huge bold, right')
    expect(p.copy).toBe('First tracks, / warm fire')
    expect(p.look).toBe('huge bold, right')
  })
  it('a look run with no comma comes off copy that has commas, when it is two words or more', () => {
    expect(noteParts('Fresh flowers, at your door by noon. huge bold')).toMatchObject({ copy: 'Fresh flowers, at your door by noon.', look: 'huge bold' })
    expect(noteParts('Coffee, cake & tiles huge bold')).toMatchObject({ copy: 'Coffee, cake & tiles', look: 'huge bold' })
  })
  it('real copy stays copy', () => {
    expect(noteParts('Every Friday, after dark. huge bold').copy).toBe('Every Friday, after dark.')
    expect(noteParts('Think small, dream big').copy).toBe('Think small, dream big')
    expect(noteParts('Red, green, blue')).toMatchObject({ copy: 'Red, green', look: 'blue' })
    expect(noteParts('Paid, 612 big, +3% green').copy).toBe('Paid, 612 big')
    expect(noteParts('Visitors, 48,210 big, +12% green').copy).toBe('Visitors, 48,210 big')
    expect(noteParts('Sam, Sam white').directions).toEqual([])
    expect(noteParts('Tea, coffee black').directions).toEqual([])
    expect(noteParts('Every Thursday, 7pm, bold')).toMatchObject({ copy: 'Every Thursday, 7pm', look: 'bold' })
  })
  it('tells the build and fails the page that prints them', () => {
    const note = 'CHECK / MATE huge bold caps, MATE outlined only'
    expect(typedCopyBrief([note])).toContain('the text on the page is only "CHECK / MATE"')
    expect(directionStrings([note]).map((b) => b.text)).toContain('MATE outlined only')
    const after = { nodes: [leaf('a', 'CHECK'), leaf('b', 'MATE HUGE BOLD CAPS, MATE OUTLINED ONLY')] }
    expect(verifyNoDirections([note], after).satisfied).toBe(false)
    expect(verifyNoDirections([note], { nodes: [leaf('a', 'CHECK'), leaf('b', 'MATE')] }).satisfied).toBe(true)
  })
})

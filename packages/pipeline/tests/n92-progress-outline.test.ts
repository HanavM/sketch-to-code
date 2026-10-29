import { describe, expect, it } from 'vitest'
import { progressBrief, progressOf, verifyProgress } from '../src/progress.js'
import { inkOutlineBox } from '../src/inkcolour.js'

const node = (id: string, x: number, y: number, w: number, h: number, style: Record<string, string> = {}, text = '') =>
  ({ id, rect: { x, y, w, h }, text, style })

describe('n92 progress bar from a note', () => {
  it('reads the percent and the caption, and ignores notes with no bar', () => {
    const p = progressOf('progress bar 82%, grey track to the end; 41 of 50 hours logged')
    expect(p?.pct).toBe(82)
    expect(p?.caption).toBe('41 of 50 hours logged')
    expect(progressOf('meter, 3 of 4 done')?.pct).toBe(75)
    expect(progressOf('Weekly target, bold')).toBeNull()
    expect(progressOf('save 20% today')).toBeNull()
    expect(progressBrief(['progress bar 82%'])).toMatch(/never print "82%"/)
  })
  it('passes a track with an 82% fill, fails a big printed 82% over a rule', () => {
    const notes = ['progress bar 82%, grey track to the end']
    const good = { nodes: [node('t', 100, 400, 500, 10, { backgroundColor: 'rgb(230, 230, 235)' }), node('f', 100, 400, 410, 10, { backgroundColor: 'rgb(124, 58, 237)' })] }
    expect(verifyProgress(notes, good).satisfied).toBe(true)
    const bad = { nodes: [node('h', 100, 340, 120, 40, { fontSize: '36px' }, '82%'), node('r', 100, 400, 500, 2, { backgroundColor: 'rgb(124, 58, 237)' })] }
    const v = verifyProgress(notes, bad)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/big text/)
  })
})

describe('n92 small dark-ink box is an outlined control', () => {
  it('small square in dark neutral ink: outline; big box, coloured pen or light ink: not', () => {
    expect(inkOutlineBox('#1f2433', { w: 28, h: 26 })).toBe(true)
    expect(inkOutlineBox('#1f2433', { w: 300, h: 120 })).toBe(false)
    expect(inkOutlineBox('#7c3aed', { w: 28, h: 26 })).toBe(false)
    expect(inkOutlineBox('#e5e7eb', { w: 28, h: 26 })).toBe(false)
    expect(inkOutlineBox(null, { w: 28, h: 26 })).toBe(false)
  })
})

describe('n92 a progress note is not a stat card nor a direction', () => {
  it('statOf skips a box with a progress note; the caption is never called a direction', async () => {
    const { statOf } = await import('../src/statcard.js')
    const { directionStrings, typedCopyBrief } = await import('../src/typedcopy.js')
    const notes = ['Weekly target, bold', 'progress bar 82%, grey track to the end; 41 of 50 hours logged']
    expect(statOf(notes)).toBeNull()
    expect(directionStrings(notes).some((d) => /41 of 50/.test(d.text))).toBe(false)
    expect(typedCopyBrief([notes[1]!])).toBe('')
  })
  it('wants the typed caption on the page', () => {
    const notes = ['progress bar 82%; 41 of 50 hours logged']
    const bar = [node('t', 100, 400, 500, 10, { backgroundColor: 'rgb(230, 230, 235)' }), node('f', 100, 400, 410, 10, { backgroundColor: 'rgb(124, 58, 237)' })]
    expect(verifyProgress(notes, { nodes: bar }).satisfied).toBe(false)
    expect(verifyProgress(notes, { nodes: [...bar, node('c', 100, 420, 200, 16, { fontSize: '13px' }, '41 of 50 hours logged')] }).satisfied).toBe(true)
  })
})

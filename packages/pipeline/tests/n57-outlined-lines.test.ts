import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { markTextPlaces, resolveSame, textPlaceBrief } from '../src/textplace.js'
import { textLookBrief, verifyOutlined } from '../src/textlook.js'
import { copyWords, spanFontPx, verifyLineSpan } from '../src/linespan.js'

const VP = { w: 1280, h: 900 }
// round 33 c2 slow agency, as drawn in n49
const line = (id: string, x0: number, x1: number, y: number, words?: string): ShapeMark =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, ...(words ? { words } : {}) })
const node = (text: string, r: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}) =>
  ({ id: text, tag: 'h1', text, rect: r, textBox: r, style: { backgroundColor: 'transparent', ...style } })
const notes = [
  { text: 'SLOW, giant outlined letters', focus: ['l1'] },
  { text: 'WORK, same', focus: ['l2'] },
]

describe('a word typed on a line can be outlined, and "same" copies the look above (n57)', () => {
  it('"WORK, same" takes the look of the line above', () => {
    const marks = [line('l1', 60, 930, 380), line('l2', 60, 950, 630)]
    markTextPlaces(marks, notes)
    expect(marks[1]!.words).toBe('WORK, giant outlined letters')
    expect(marks[0]!.outlined).toEqual({ colour: null })
    expect(marks[1]!.outlined).toEqual({ colour: null })
  })
  it('leaves a plain note alone, and a "same" with nothing above', () => {
    const a = [line('a', 60, 400, 300, 'Grown in the valley, the same day'), line('b', 60, 400, 100, 'Hi, same')]
    resolveSame(a)
    expect(a[0]!.words).toBe('Grown in the valley, the same day')
    expect(a[1]!.words).toBe('Hi, same')
  })
  it('tells hollow letters, kept whole, and checks them', () => {
    const marks = [line('l1', 60, 930, 380), line('l2', 60, 950, 630)]
    markTextPlaces(marks, notes)
    const brief = textLookBrief([{ shapeMarks: marks }])
    expect(brief).toMatch(/"SLOW" typed on the line .* OUTLINED/)
    expect(brief).toMatch(/"WORK"/)
    expect(brief).toMatch(/never split it/)
    const solid = verifyOutlined(marks, { viewport: VP, nodes: [node('SLOW', { x: 60, y: 200, w: 800, h: 190 }, { color: 'rgb(255, 255, 255)', fontSize: '220px' })] })
    expect(solid.satisfied).toBe(false)
    expect(solid.reason).toMatch(/"SLOW" .* solid letters/)
    const hollow = verifyOutlined(marks, { viewport: VP, nodes: [node('SLOW', { x: 60, y: 200, w: 800, h: 190 }, { color: 'rgba(0, 0, 0, 0)', textStroke: '2px rgb(255, 255, 255)', fontSize: '220px' })] })
    expect(hollow.satisfied).toBe(true)
  })
  it('a single giant word is sized by its line and checked', () => {
    expect(copyWords('SLOW, giant outlined letters')).toEqual(['slow'])
    expect(spanFontPx('SLOW', 870)).toBeGreaterThan(200)
    const marks = [line('l1', 60, 930, 380, 'SLOW, giant outlined letters')]
    expect(textPlaceBrief([{ shapeMarks: marks }], VP)).toMatch(/the line sets its SIZE/)
    const small = verifyLineSpan(marks, { nodes: [node('SLOW', { x: 60, y: 300, w: 300, h: 80 }, { fontSize: '96px' })] })
    expect(small.satisfied).toBe(false)
    expect(small.reason).toMatch(/"slow"/)
    const wide = verifyLineSpan(marks, { nodes: [node('SLOW', { x: 60, y: 300, w: 1220, h: 80 }, { fontSize: '96px' })] })
    expect(wide.satisfied).toBe(false)
  })
  it('a giant word in a two-line stack is still sized by its own line', () => {
    const marks = [line('l1', 60, 930, 380, 'SLOW, giant outlined letters')]
    const stacked = new Set(['l1'])
    expect(textPlaceBrief([{ shapeMarks: marks, textSize: [{ lines: 2, strokes: ['l1', 'l2'] }] }], VP)).toMatch(/the line sets its SIZE/)
    const small = verifyLineSpan(marks, { nodes: [node('SLOW', { x: 60, y: 300, w: 220, h: 80 }, { fontSize: '90px' })] }, stacked)
    expect(small.satisfied).toBe(false)
    const ok = verifyLineSpan(marks, { nodes: [node('SLOW WORK', { x: 60, y: 200, w: 860, h: 440 }, { fontSize: '220px' })] }, stacked)
    expect(ok.satisfied).toBe(true)
    const plain = [line('p', 60, 930, 380, 'A design studio that takes the time to get it right')]
    expect(verifyLineSpan(plain, { nodes: [node('A design studio that takes the time to get it right', { x: 60, y: 370, w: 300, h: 20 }, { fontSize: '14px' })] }, new Set(['p'])).unverifiable).toBe(true)
  })
})

import { allTextColour, ownColourText, verifyAllText } from '../src/alltext.js'
describe('"all text white" leaves hollow letters and words given their own colour (n57)', () => {
  const t = (text: string, color: string, textStroke?: string) =>
    ({ id: text, tag: 'p', text, rect: { x: 0, y: 0, w: 100, h: 20 }, style: { color, backgroundColor: 'transparent', ...(textStroke ? { textStroke } : {}) } })
  const notes = ['all text white', 'A design studio that takes the time to get it right. light grey', 'SLOW, giant outlined letters']
  it('does not ask the grey tagline or the outlined word to go white', () => {
    const a = allTextColour(notes)
    const snap = { nodes: [t('SLOW', 'rgba(0, 0, 0, 0)', '2px'), t('WORK', 'rgba(0, 0, 0, 0)', '2px'), t('A design studio that takes the time', 'rgb(153, 161, 175)'), t('slow studio', 'rgb(255, 255, 255)'), t('Work About Contact', 'rgb(255, 255, 255)')], viewport: { w: 1280, h: 900 } }
    expect(verifyAllText(a, snap as never, ownColourText(a, notes)).satisfied).toBe(true)
    const dark = { ...snap, nodes: [...snap.nodes, t('See our projects', 'rgb(20, 20, 20)'), t('More', 'rgb(20, 20, 20)')] }
    expect(verifyAllText(a, dark as never, ownColourText(a, notes)).satisfied).toBe(false)
  })
})
describe('"same" reaches a line in another action (n57)', () => {
  it('links across actions', async () => {
    const { linkSame } = await import('../src/textplace.js')
    const a = line('l1', 60, 930, 380, 'SLOW, giant outlined letters'), b = line('l2', 60, 950, 630, 'WORK, same')
    linkSame([b]); expect(b.outlined).toBeUndefined()
    linkSame([a, b]); expect(b.words).toBe('WORK, giant outlined letters'); expect(b.outlined).toEqual({ colour: null })
  })
})

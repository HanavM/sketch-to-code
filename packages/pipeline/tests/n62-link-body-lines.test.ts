import { describe, expect, it } from 'vitest'
import { bodyLineFont, linkLineBrief, linkLines, verifyBodyLines, verifyLinkLines } from '../src/linkline.js'
import { verifyTextLinesNotRules } from '../src/textrules.js'

// round 33 c2 slow agency (n49 sketch)
const line = (id: string, x0: number, x1: number, y: number, words: string) =>
  ({ strokeId: id, shape: 'line', box: { x: x0, y, w: x1 - x0, h: 0 }, from: { x: x0, y }, to: { x: x1, y }, words })
const actions = [{
  shapeMarks: [
    line('tag', 64, 532, 746, 'A design studio that takes the time to get it right. light grey'),
    line('link', 1062, 1216, 786, 'See our projects →'),
    line('nav', 1042, 1216, 56, 'Work · About · Contact'),
    line('slow', 64, 930, 382, 'SLOW, giant outlined letters'),
  ],
  inkColours: [{ strokeId: 'link', paint: 'text', color: '#ef4444', how: 'pen' }],
}]
const node = (id: string, text: string, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string> = {}, parent: string | null = null) =>
  ({ id, tag: 'p', text, rect, textBox: rect, parent, style: { fontSize: '16px', color: '#fff', backgroundColor: 'transparent', ...style } })
const snap = (nodes: ReturnType<typeof node>[]) => ({ nodes })

describe('a link drawn on a coloured line is underlined (n62)', () => {
  it('finds the red link line only', () => {
    expect(linkLines(actions).map((l) => l.strokeId)).toEqual(['link'])
    // in black pen, or not a link, or onScreen: nothing
    expect(linkLines([{ ...actions[0]!, inkColours: [{ strokeId: 'link', paint: 'text', color: '#0a0a0a', how: 'pen' }] }])).toEqual([])
    expect(linkLines([{ ...actions[0]!, onScreen: true }])).toEqual([])
    expect(linkLines([{ shapeMarks: [line('x', 0, 150, 100, 'Pricing plans')], inkColours: [{ strokeId: 'x', paint: 'text', color: '#ef4444', how: 'pen' }] }])).toEqual([])
  })
  it('tells the build', () => {
    const b = linkLineBrief(actions)
    expect(b).toContain('"See our projects →" is typed on a short line drawn in #ef4444 pen')
    expect(b).toContain('underline')
  })
  it('fails with no underline, passes with a border, text-decoration on a parent, or a bar under it', () => {
    const t = node('a', 'See our projects →', { x: 1060, y: 766, w: 150, h: 18 }, { color: '#ef4444' })
    expect(verifyLinkLines(actions, snap([t])).satisfied).toBe(false)
    expect(verifyLinkLines(actions, snap([{ ...t, style: { ...t.style, borderBottom: '1px rgb(239, 68, 68)' } }])).satisfied).toBe(true)
    const outer = node('o', 'See our projects →', { x: 1060, y: 766, w: 150, h: 18 }, { textDecoration: 'underline' })
    expect(verifyLinkLines(actions, snap([outer, { ...t, parent: 'o' }])).satisfied).toBe(true)
    expect(verifyLinkLines(actions, snap([t, node('bar', '', { x: 1060, y: 786, w: 150, h: 2 }, { backgroundColor: 'rgb(239, 68, 68)' })])).satisfied).toBe(true)
  })
  it('fails when the link wraps onto two lines', () => {
    const t = node('a', 'See our projects →', { x: 1075, y: 764, w: 141, h: 43 }, { color: '#ef4444', borderBottom: '1px red' })
    expect(verifyLinkLines(actions, snap([t])).reason).toContain('wraps onto two lines')
  })
  it('the no-rules check leaves the link line alone', () => {
    const t = node('a', 'See our projects →', { x: 1060, y: 766, w: 150, h: 18 }, { borderBottom: '1px red' })
    expect(verifyTextLinesNotRules(actions[0]!.shapeMarks, snap([t]) as never).satisfied).toBe(false)
    expect(verifyTextLinesNotRules(actions[0]!.shapeMarks, snap([t]) as never, new Set(['link'])).satisfied).toBe(true)
  })
})

describe('a sentence on one drawn line runs its length (n62)', () => {
  it('sizes body sentences, not headings, short labels or display words', () => {
    expect(bodyLineFont('A design studio that takes the time to get it right. light grey', 468)).toBe(18)
    expect(bodyLineFont('Work · About · Contact', 174)).toBeNull()
    expect(bodyLineFont('SLOW, giant outlined letters', 866)).toBeNull()
    expect(bodyLineFont('Fresh herbs, picked this morning', 916)).toBeNull()
    expect(bodyLineFont('a b c d e f', 900)).toBeNull()
  })
  it('fails when the tagline runs short, passes near the drawn length', () => {
    const short = node('t', 'A design studio that takes the time to get it right.', { x: 64, y: 725, w: 366, h: 16 }, { fontSize: '13px' })
    const v = verifyBodyLines(actions, snap([short]))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('from 13px to about 17px')
    expect(verifyBodyLines(actions, snap([{ ...short, rect: { ...short.rect, w: 455 }, textBox: { ...short.rect, w: 455 } }])).satisfied).toBe(true)
    const wrapped = { ...short, rect: { ...short.rect, w: 460, h: 44 }, textBox: { ...short.rect, w: 460, h: 44 }, style: { ...short.style, fontSize: '18px' } }
    expect(verifyBodyLines(actions, snap([wrapped])).reason).toContain('ONE line')
  })
})

describe('capital words touch by their letters, not their line boxes (n62)', async () => {
  const { inkBand, verifyOwnWords } = await import('../src/ownwords.js')
  const marks = [line('slow', 64, 930, 382, 'SLOW, giant outlined letters'), line('work', 60, 980, 636, 'WORK, same')]
  const big = (id: string, text: string, y: number, h = 348) => ({ id, text, rect: { x: 64, y, w: 866, h }, textBox: { x: 64, y, w: 866, h }, parent: null, style: { fontSize: '290px' } })
  it('cap band is about 0.74em', () => {
    const b = inkBand(big('s', 'SLOW', 108))
    expect(b.h).toBe(215)
    expect(inkBand({ ...big('x', 'Slow', 108) }).h).toBe(348)
  })
  it('SLOW and WORK on lines 254px apart do not run into each other', () => {
    const v = verifyOwnWords(['SLOW, giant outlined letters', 'WORK, same'], marks, { nodes: [] }, { nodes: [big('s', 'SLOW', 108), big('w', 'WORK', 358)] })
    expect(v.overlaps ?? []).toEqual([])
    const v2 = verifyOwnWords(['SLOW, giant outlined letters', 'WORK, same'], marks, { nodes: [] }, { nodes: [big('s', 'SLOW', 108), big('w', 'WORK', 200)] })
    expect((v2.overlaps ?? []).length).toBe(1)
  })
})

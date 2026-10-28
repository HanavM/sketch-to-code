import { describe, expect, it } from 'vitest'
import type { ShapeMark } from '../src/shapemark.js'
import { markTextPlaces, placedBrief, sideOf, textPlaceBrief, verifyPlaced, verifyTextPlace } from '../src/textplace.js'

const VP = { w: 1280, h: 900 }
// round 5 c5 bento, as drawn in n19
const hero = (): ShapeMark => ({ strokeId: 'hero', shape: 'box', box: { x: 40, y: 40, w: 720, h: 440 } })
const title = (): ShapeMark => ({ strokeId: 'title', shape: 'line', box: { x: 68, y: 255, w: 254, h: 0 }, from: { x: 68, y: 255 }, to: { x: 322, y: 255 } })
const cta = (): ShapeMark => ({ strokeId: 'cta', shape: 'box', box: { x: 970, y: 500, w: 270, h: 360 } })
const btn = (): ShapeMark => ({ strokeId: 'btn', shape: 'box', box: { x: 998, y: 786, w: 214, h: 46 } })

const node = (text: string, tb: { x: number; y: number; w: number; h: number }, rect = tb) => ({ id: text, tag: 'p', text, rect, textBox: tb })

describe('words sit where drawn or typed (n21)', () => {
  it('a line near a box\'s left edge is left; a middle one is centred', () => {
    expect(sideOf(title().box, hero().box)).toBe('left')
    expect(sideOf({ x: 300, y: 200, w: 240, h: 0 }, hero().box)).toBe('centre')
    expect(sideOf({ x: 500, y: 200, w: 240, h: 0 }, hero().box)).toBe('right')
  })

  it('keeps a line\'s own words and a box\'s typed spots, not notes shared with other marks', () => {
    const marks = [hero(), title(), cta(), btn()]
    markTextPlaces(marks, [
      { text: 'Prism 2', strokeIds: ['title'], at: { x: 200, y: 268 } },
      { text: 'blue and pink glows on dark', focus: ['hero'], at: { x: 400, y: 140 } },
      { text: 'Ready when you are.', focus: ['cta'], at: { x: 1000, y: 745 } },
      { text: 'Get Prism 2', focus: ['btn'], at: { x: 1100, y: 810 } },
      { text: 'shared', focus: ['cta', 'btn'], at: { x: 1000, y: 600 } },
    ])
    expect(marks[1]!.words).toBe('Prism 2')
    expect(marks[2]!.typed).toEqual([{ text: 'Ready when you are.', x: 1000, y: 745 }])
    expect(marks[3]!.typed).toBeUndefined() // too small to have a spot
    expect(marks[0]!.typed).toHaveLength(1)
  })

  it('briefs the side and the spot', () => {
    const t = { ...title(), words: 'Prism 2' }
    const c = { ...cta(), typed: [{ text: 'Ready when you are.', x: 1000, y: 745 }] }
    const b = textPlaceBrief([{ shapeMarks: [hero(), t] }, { shapeMarks: [c, btn()] }], VP)
    expect(b).toMatch(/LEFT-aligned and their first letter starts at x 68/)
    expect(b).toMatch(/lower left part of the box, about 68% down/)
    expect(textPlaceBrief([{ shapeMarks: [hero()] }], VP)).toBe('')
  })

  it('fails centred words on a left line, passes them at the line\'s start', () => {
    const marks = [hero(), { ...title(), words: 'Prism 2' }]
    const bad = verifyTextPlace(marks, { nodes: [node('Prism 2', { x: 330, y: 230, w: 180, h: 50 }, { x: 40, y: 230, w: 720, h: 50 })] }, VP)
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/starting at x 68; its letters start at x 330/)
    const good = verifyTextPlace(marks, { nodes: [node('Prism 2', { x: 70, y: 230, w: 180, h: 50 })] }, VP)
    expect(good.satisfied).toBe(true)
  })

  it('fails copy built far from where it was typed; skips a note no text carries', () => {
    const marks = [{ ...cta(), typed: [{ text: 'Ready when you are.', x: 1000, y: 745 }, { text: 'purple card', x: 1000, y: 560 }] }]
    const bad = verifyTextPlace(marks, { nodes: [node('Ready when you are.', { x: 990, y: 520, w: 180, h: 44 })] }, VP)
    expect(bad.satisfied).toBe(false)
    expect(bad.reason).toMatch(/too high by 203px/)
    expect(verifyTextPlace(marks, { nodes: [node('Ready when you are.', { x: 990, y: 700, w: 180, h: 44 })] }, VP).satisfied).toBe(true)
    expect(verifyTextPlace(marks, { nodes: [] }, VP).unverifiable).toBe(true)
  })
})

describe('n29: dividers are column edges; words typed in empty space keep their spot', () => {
  // round 31 e2 inbox, as drawn in n28: a divider at x 620, the title line 664-1066 at y 52
  const divider = (): ShapeMark => ({ strokeId: 'div', shape: 'line', box: { x: 620, y: 2, w: 0, h: 895 }, from: { x: 620, y: 2 }, to: { x: 620, y: 897 } })
  const titleLine = (): ShapeMark => ({ strokeId: 't', shape: 'line', box: { x: 664, y: 52, w: 402, h: 0 }, from: { x: 664, y: 52 }, to: { x: 1066, y: 52 }, words: 'Venue walkthrough on Thursday' })

  it('a line just right of a divider is left-aligned in its column, not right on the page', () => {
    const b = textPlaceBrief([{ shapeMarks: [divider(), titleLine()] }], VP)
    expect(b).toMatch(/LEFT-aligned and their first letter starts at x 664/)
    expect(textPlaceBrief([{ shapeMarks: [titleLine()] }], VP)).toMatch(/RIGHT-aligned/)
    const bad = verifyTextPlace([divider(), titleLine()], { nodes: [node('Venue walkthrough on Thursday', { x: 760, y: 32, w: 300, h: 40 })] }, VP)
    expect(bad.satisfied).toBe(false)
  })

  it('briefs and checks words typed where nothing is drawn', () => {
    const notes = [{ text: 'Today · Fri 14 June', x: 1140, y: 45 }]
    expect(placedBrief(notes, VP)).toMatch(/typed at \(1140,45\).*on the right, around x 1140/)
    expect(placedBrief(undefined, VP)).toBe('')
    expect(verifyPlaced(notes, { nodes: [node('Today · Fri 14 June', { x: 64, y: 90, w: 160, h: 20 })] }).satisfied).toBe(false)
    expect(verifyPlaced(notes, { nodes: [node('Today · Fri 14 June', { x: 1060, y: 36, w: 160, h: 20 })] }).satisfied).toBe(true)
    expect(verifyPlaced(notes, { nodes: [] }).unverifiable).toBe(true)
  })
})

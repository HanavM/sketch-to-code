import { describe, it, expect } from 'vitest'
import { dropPageInk } from '../src/intent2.js'
import { markRowWords, lookAlikeLists } from '../src/rowwords.js'
import { verifyReadable } from '../src/textlook.js'
import type { ShapeMark } from '../src/shapemark.js'
import type { InkColour } from '../src/intent2.js'

const box = (id: string, x: number, y: number, w: number, h: number): ShapeMark => ({ strokeId: id, shape: 'box', box: { x, y, w, h } })
const ink = (strokeId: string, color: string, how: 'pen' | 'tap', paint: 'text' | 'background' = 'text'): InkColour =>
  ({ strokeId, mark: 'line', paint, color, box: { x: 48, y: 45, w: 124, h: 2 }, how })

describe('n83 a mark drawn in the page colour is not painted that colour', () => {
  it('drops pen colours that match the tapped page, keeps taps and other pens', () => {
    const a = { inkColours: [ink('t', '#121418', 'pen'), ink('b', '#ff6b2c', 'pen'), ink('c', '#121418', 'tap', 'background')] }
    const b = { inkColours: [ink('u', '#131519', 'pen', 'background')] }
    dropPageInk([a, b], ['#121418'])
    expect(a.inkColours.map((c) => c.strokeId)).toEqual(['b', 'c'])
    expect(b.inkColours).toBeUndefined()
  })
  it('the readability check flags invisible text even when its colour was typed', () => {
    const node = (id: string, parent: string | null, rect: { x: number; y: number; w: number; h: number }, style: Record<string, string>, text = '') =>
      ({ id, tag: 'div', parent, rect, text, style: { backgroundColor: 'rgba(0, 0, 0, 0)', position: 'static', zIndex: 'auto', ...style } })
    const page = (colour: string) => ({ viewport: { w: 1280, h: 900 }, nodes: [
      node('p', null, { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(18, 20, 24)' }),
      node('h', 'p', { x: 48, y: 30, w: 140, h: 30 }, { color: colour }, 'Push day')] })
    const named = () => true
    expect(verifyReadable(page('rgb(18, 20, 24)'), { skip: named }).satisfied).toBe(false)
    expect(verifyReadable(page('rgb(70, 74, 80)'), { skip: named }).satisfied).toBe(true) // typed dark grey: their call
    expect(verifyReadable(page('rgb(255, 255, 255)'), { skip: named }).satisfied).toBe(true)
  })
})

describe('n83 one note on a row of pills gives each pill its word', () => {
  const pills = () => [box('p1', 1002, 28, 72, 34), box('p2', 1082, 28, 78, 34), box('p3', 1168, 28, 64, 34)]
  it('splits "Week Month Year, dark pills" over three pills in drawn order', () => {
    const m = pills()
    markRowWords(m, [{ text: 'Week Month Year, dark pills', focus: ['p1'] }, { text: 'Month, white bold', focus: ['p2'] }])
    expect(m.map((x) => x.own)).toEqual(['Week', 'Month', 'Year'])
    expect(lookAlikeLists(m)).toHaveLength(1)
  })
  it('without a confirming pill it still splits three words on three pills', () => {
    const m = pills()
    markRowWords(m, [{ text: 'Week Month Year', focus: ['p1'] }])
    expect(m.map((x) => x.own)).toEqual(['Week', 'Month', 'Year'])
  })
  it('leaves a two-word label on one of two buttons, and a count that does not match', () => {
    const two = [box('a', 100, 100, 120, 40), box('b', 236, 100, 120, 40)]
    markRowWords(two, [{ text: 'Sign up', focus: ['a'] }])
    expect(two.map((x) => x.own)).toEqual(['Sign up', undefined])
    const m = pills()
    markRowWords(m, [{ text: 'Day Week', focus: ['p1'] }])
    expect(m[0]!.own).toBe('Day Week')
    const d = pills()
    markRowWords(d, [{ text: 'Week Month Year', focus: ['p1'] }, { text: 'Today', focus: ['p2'] }])
    expect(d[0]!.own).toBe('Week Month Year')
  })
})

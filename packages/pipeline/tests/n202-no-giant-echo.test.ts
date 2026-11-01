import { describe, expect, it } from 'vitest'
import { markAreasAndEdges } from '../src/areas.js'
import { verifyOwnWords } from '../src/ownwords.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }

describe('n202: a listing card is never one big word\'s area', () => {
  // round 45 e1 car rental: card box round a picture box and a Select button, two copy notes on it
  const card = () => [
    { strokeId: 'card', shape: 'box', box: { x: 325, y: 205, w: 920, h: 200 } },
    { strokeId: 'pic', shape: 'box', box: { x: 356, y: 234, w: 242, h: 142 } },
    { strokeId: 'sel', shape: 'box', box: { x: 1080, y: 312, w: 135, h: 48 } },
  ] as ShapeMark[]
  const inner = [{ x: 356, y: 234, w: 242, h: 142 }, { x: 1080, y: 312, w: 135, h: 48 }]
  it('a box holding a drawn mark and carrying two notes is not an area (no giant 500)', () => {
    const m = card()
    markAreasAndEdges(m, [
      { text: 'Fiat 500 bold, 4 seats · Automatic', focus: ['card'] },
      { text: '$38 big bold, per day', focus: ['card'] },
    ], vp, inner)
    expect(m[0]!.area).toBeUndefined()
    expect(m[0]!.word).toBeUndefined()
  })
  it('a lone big-word box with one note is still an area, its word from the big note', () => {
    const m: ShapeMark[] = [{ strokeId: 'b', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 } }]
    markAreasAndEdges(m, [{ text: 'huge outlined 09, white', focus: ['b'] }], vp, [])
    expect(m[0]!.area).toBe(true)
    expect(m[0]!.word).toBe('09')
  })
  it('the word comes from the note asking for size, not a copy note beside it', () => {
    const m: ShapeMark[] = [{ strokeId: 'b', shape: 'box', box: { x: 400, y: 140, w: 510, h: 375 } }]
    markAreasAndEdges(m, [{ text: 'Room 12 open', focus: ['b'] }, { text: 'giant SALE', focus: ['b'] }], vp, [])
    expect(m[0]!.area).toBe(true)
    expect(m[0]!.word).toBe('SALE')
  })
})

describe('n202: own-words flags a blown-up copy of typed words', () => {
  const t = (id: string, text: string, rect: { x: number; y: number; w: number; h: number }, fontSize: string) =>
    ({ id, parent: 'card', rect, text, style: { fontSize } })
  it('"500" at 160px over "Fiat 500" at 20px is an echo to take out', () => {
    const after = { nodes: [
      { id: 'card', parent: null, rect: { x: 329, y: 209, w: 911, h: 192 } },
      t('a', '500', { x: 610, y: 210, w: 360, h: 180 }, '160px'),
      t('b', 'Fiat 500', { x: 634, y: 281, w: 82, h: 24 }, '20px'),
    ] }
    const v = verifyOwnWords(['Fiat 500 bold, 4 seats · Automatic'], [], { nodes: [] }, after)
    expect(v.satisfied).toBe(false)
    expect(v.echoes).toEqual([{ big: '500', of: 'Fiat 500' }])
    expect(v.reason).toMatch(/blown-up copy/)
  })
  it('two different words that touch are not an echo', () => {
    const after = { nodes: [
      t('a', 'SALE', { x: 600, y: 200, w: 400, h: 180 }, '160px'),
      t('b', 'Fiat 500', { x: 634, y: 281, w: 82, h: 24 }, '20px'),
    ] }
    const v = verifyOwnWords(['giant SALE', 'Fiat 500'], [], { nodes: [] }, after)
    expect(v.echoes).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { tintListOf, tintBrief, verifyTints } from '../src/tints.js'

const pet = 'pet cards: tinted picture top (peach, sage, blue, lilac), name bold, age · breed under'

describe('n182: colour words in a tint note become fixed soft values', () => {
  it('reads the bracketed colour list in order', () => {
    const t = tintListOf(pet)!
    expect(t.words).toEqual(['peach', 'sage', 'blue', 'lilac'])
    expect(t.hexes.every((h) => /^#[0-9a-f]{6}$/.test(h))).toBe(true)
    const b = tintBrief([pet])
    expect(b).toMatch(/item 5 is peach again/)
    expect(b).toMatch(/never mint/)
  })
  it('leaves other notes alone', () => {
    expect(tintListOf('filters: Animal (Dogs, Cats, Rabbits); Dogs checked orange')).toBeNull()
    expect(tintListOf('Bitcoin bold, 0.21 BTC, $14,120, +2.4% green')).toBeNull()
    expect(tintListOf('cards (red, blue) bold')).toBeNull() // no tint word: the builder may use full colours
    expect(tintListOf('soft tints: pale pink, mint and cream')!.words).toEqual(['pink', 'mint', 'cream'])
    expect(tintBrief(['Dogs, Cats, Donate'])).toBe('')
  })
})

describe('n182: the page keeps the named tints', () => {
  const card = (i: number, bg: string) => ({ id: `c${i}`, text: '', rect: { x: 160 + (i % 3) * 150, y: 100 + Math.floor(i / 3) * 135, w: 140, h: 88 }, style: { backgroundColor: bg } })
  const t = tintListOf(pet)!
  const rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`
  it('passes when every item has its tint, cycling', () => {
    const nodes = [0, 1, 2, 3, 4, 5].map((i) => card(i, rgb(t.hexes[i % 4]!)))
    expect(verifyTints([pet], { nodes }).satisfied).toBe(true)
  })
  it('fails the mint-and-yellow run, naming the values', () => {
    const drift = ['#fdecc8', '#d1fae5', '#dbeafe', '#ede9fe', '#fdecc8', '#d1fae5']
    const v = verifyTints([pet], { nodes: drift.map((h, i) => card(i, rgb(h))) })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/sage #/)
  })
  it('a drifted item among right ones is named; small or white boxes are ignored', () => {
    const nodes = [0, 1, 2, 3].map((i) => card(i, rgb(t.hexes[i]!)))
    nodes.push(card(4, 'rgb(209, 250, 229)'))
    nodes.push({ id: 'btn', text: '', rect: { x: 0, y: 0, w: 16, h: 16 }, style: { backgroundColor: 'rgb(224, 122, 63)' } })
    nodes.push({ id: 'pg', text: '', rect: { x: 0, y: 0, w: 1280, h: 800 }, style: { backgroundColor: 'rgb(255, 255, 255)' } })
    const v = verifyTints([pet], { nodes })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/1 items filled #d1fae5/)
  })
  it('no tint note: nothing to check', () => {
    expect(verifyTints(['Pawhome bold'], { nodes: [] }).unverifiable).toBe(true)
  })
})

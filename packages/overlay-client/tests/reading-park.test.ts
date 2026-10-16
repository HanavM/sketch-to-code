import { describe, expect, it } from 'vitest'
import { lostSentence, newReadingId, nextSeq, parseParked, READING_PARK_MS } from '../src/reading-park.js'

const NOW = 1_800_000_000_000
const stroke = { id: 's3', points: [{ x: 1, y: 2, t: 0 }, { x: 5, y: 9, t: 16 }] }
const note = { id: 'n1', text: 'make it a card', at: { x: 3, y: 4 }, anchor: { kind: 'strokes', strokeIds: ['s3'] }, refs: [] }
const park = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ id: 'rabcdefghij0123456789', at: NOW - 1000, strokes: [stroke], notes: [note], instant: null, ...over })

describe('parked reading (s2c-002)', () => {
  it('round-trips the ink, the words and the instant component', () => {
    const p = parseParked(park({ instant: 'src/components/Sketch1.tsx' }), NOW)
    expect(p).toEqual({
      id: 'rabcdefghij0123456789', at: NOW - 1000, strokes: [stroke], notes: [note],
      instant: 'src/components/Sketch1.tsx',
    })
  })

  it('keeps a pen colour and an anchor', () => {
    const s = { ...stroke, color: '#e11d48', anchor: { src: 'src/App.tsx:4:5', index: 0, rect: { x: 0, y: 0, w: 10, h: 10 }, scale: 1 } }
    expect(parseParked(park({ strokes: [s] }), NOW)!.strokes[0]).toEqual(s)
  })

  it('a stale park is nothing: it must never put back a drawing from another session', () => {
    expect(parseParked(park({ at: NOW - READING_PARK_MS - 1 }), NOW)).toBeNull()
    expect(parseParked(park({ at: NOW + 60_000 }), NOW)).toBeNull() // from the future: clock skew or junk
  })

  it('malformed or empty is nothing', () => {
    expect(parseParked(null, NOW)).toBeNull()
    expect(parseParked('{', NOW)).toBeNull()
    expect(parseParked('"x"', NOW)).toBeNull()
    expect(parseParked(park({ strokes: [] }), NOW)).toBeNull()
    expect(parseParked(park({ id: 'x' }), NOW)).toBeNull()
    expect(parseParked(park({ id: '../../etc' }), NOW)).toBeNull()
    expect(parseParked(park({ strokes: [{ id: 's1', points: [{ x: 'a', y: 1, t: 0 }] }] }), NOW)).toBeNull()
    expect(parseParked(park({ notes: [{ id: 'n1' }] }), NOW)).toBeNull()
  })

  it('missing notes are no notes', () => {
    expect(parseParked(park({ notes: undefined }), NOW)!.notes).toEqual([])
  })

  it('reading ids match what the server accepts', () => {
    let k = 0
    const id = newReadingId(() => (k++ % 36) / 36)
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
    expect(newReadingId()).not.toBe(newReadingId())
  })

  it('a stroke drawn after the reload never reuses a restored id', () => {
    expect(nextSeq(['s0', 's7', 's3'], 's', 0)).toBe(8)
    expect(nextSeq(['n2'], 'n', 5)).toBe(5)
    expect(nextSeq(['sx', 'q9'], 's', 0)).toBe(0)
  })

  it('a lost reading is told in plain words, with what to do next', () => {
    for (const w of ['lost', 'expired'] as const) {
      expect(lostSentence(w)).toMatch(/Your drawing is back: press ▶ Run/)
      expect(lostSentence(w)).not.toMatch(/fetch|HTTP|error/i)
    }
  })
})

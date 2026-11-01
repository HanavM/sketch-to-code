import { describe, expect, it } from 'vitest'
import { namedWords, narrowDelete } from '../src/narrowdelete.js'

const node = (id: string, parent: string | null, text: string, x: number, y: number, w: number, h: number, tag = 'div') => ({
  id, tag, srcLoc: `src/App.tsx:${id.slice(1)}:5`, rect: { x, y, w, h }, text, classes: [],
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0,0,0,0)', color: 'rgb(0,0,0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' },
  parent,
})
// round 45 e1: the Fiat card with its name, and a huge grey "500" painted behind it
const snap = {
  nodes: [
    node('e1', null, '', 0, 0, 1280, 900),
    node('e10', 'e1', '', 330, 210, 900, 180),
    node('e11', 'e10', 'Fiat 500', 520, 230, 160, 28, 'h3'),
    node('e12', 'e10', '4 seats · Automatic', 520, 262, 200, 20, 'p'),
    node('e13', 'e10', '500', 700, 200, 420, 200, 'span'),
    node('e14', 'e10', 'Select', 1100, 320, 100, 40, 'button'),
  ],
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '/', takenAt: 0, truncated: false,
} as never

describe('n200 a delete note deletes only what it names', () => {
  it('reads the named words, not the look or the verb', () => {
    expect(namedWords('delete the huge grey 500')).toEqual(['500'])
    expect(namedWords('remove "Book now"')).toEqual(['book', 'now'])
    expect(namedWords('make the 500 smaller')).toEqual([])
  })
  it('narrows a card delete to the huge "500" the note sits on', () => {
    const r = narrowDelete(snap, 'e10', 'delete the giant 500 watermark', [{ text: 'delete the huge grey 500', at: { x: 900, y: 300 } }])
    expect(r?.node.id).toBe('e13')
    expect(r?.why).toMatch(/only the "500"/)
  })
  it('never narrows to the card title that only contains the word', () => {
    const r = narrowDelete(snap, 'e10', 'delete', [{ text: 'delete the fiat', at: { x: 600, y: 240 } }])
    expect(r).toBeNull()
  })
  it('keeps the target when the note names the card itself', () => {
    expect(narrowDelete(snap, 'e10', 'delete this card', [{ text: 'delete this card', at: { x: 600, y: 300 } }])).toBeNull()
  })
  it('keeps the target when it already is the named thing', () => {
    expect(narrowDelete(snap, 'e13', 'delete the 500', [{ text: 'delete the 500', at: { x: 900, y: 300 } }])).toBeNull()
  })
  it('uses the model words when no delete note was typed on the target', () => {
    const r = narrowDelete(snap, 'e10', 'remove the Select button', [{ text: 'delete the huge grey 500', at: { x: 10, y: 10 } }])
    expect(r?.node.id).toBe('e14')
  })
})

import { describe, expect, it } from 'vitest'
import { isRole, pickOther, placedAgainst, alreadySo } from '../src/fix-subject.js'

describe('n39: a fix note that names a part as a place is about another part', () => {
  it('reads the named part and the relation', () => {
    expect(placedAgainst('one line, below heading')).toEqual({ rel: 'below', role: 'heading' })
    expect(placedAgainst('smaller, under the big title')).toEqual({ rel: 'under', role: 'heading' })
    expect(placedAgainst('move it next to the button')).toEqual({ rel: 'next to', role: 'button' })
    expect(placedAgainst('two lines: NORTH / LIGHTS')).toBeNull()
    expect(placedAgainst('below the fold')).toBeNull()
  })

  it('knows a heading when it sees one', () => {
    const p = { tag: 'h1', fontPx: 64, inNav: false, isButtonish: false, isImageish: false }
    expect(isRole(p, 'heading')).toBe(true)
    expect(isRole({ ...p, tag: 'p', fontPx: 18 }, 'heading')).toBe(false)
  })

  // round 32 c2 (n37 try 1): typed at (420,445) on the heading's lower edge
  const heading = { x: 80, y: 242, w: 444, h: 224 }
  const subtitle = { name: 'subtitle', box: { x: 80, y: 497, w: 410, h: 54 } }
  const nav = { name: 'nav', box: { x: 990, y: 36, w: 210, h: 20 } }
  const button = { name: 'button', box: { x: 80, y: 604, w: 160, h: 57 } }
  const logo = { name: 'logo', box: { x: 80, y: 30, w: 160, h: 32 } }

  it('round 32 c2: "below heading" on the heading picks the subtitle under it', () => {
    expect(pickOther([nav, logo, subtitle, button], { x: 420, y: 445 }, 'below', heading)?.name).toBe('subtitle')
  })
  it('never picks a part on the wrong side', () => {
    expect(pickOther([logo], { x: 120, y: 250 }, 'below', heading)).toBeNull()
    expect(pickOther([logo, subtitle], { x: 120, y: 250 }, 'above', heading)?.name).toBeUndefined()
  })
  it('keeps the pointer pick when nothing is within reach', () => {
    expect(pickOther([button], { x: 500, y: 300 }, 'below', heading)).toBeNull()
  })
})

describe('alreadySo (n43)', () => {
  const sub = { lines: 1, weight: 400, centred: false, upper: false, italic: false }
  it('a subtitle already on one line: nothing to change (round 32 c2)', () => {
    expect(alreadySo('one line, below heading', sub)).toBe('already one line')
  })
  it('a subtitle on two lines still needs the fix', () => {
    expect(alreadySo('one line, below heading', { ...sub, lines: 2 })).toBeNull()
  })
  it('any clause asking for something else runs the fix', () => {
    expect(alreadySo('one line, bigger', sub)).toBeNull()
    expect(alreadySo('one line, below heading, white', sub)).toBeNull()
    expect(alreadySo('move it left', sub)).toBeNull()
  })
  it('several looks it already has', () => {
    expect(alreadySo('bold and centred', { ...sub, weight: 700, centred: true })).toBe('already bold, centred')
    expect(alreadySo('make it bold', sub)).toBeNull()
    expect(alreadySo('all caps', { ...sub, upper: true })).toBe('already in capitals')
    expect(alreadySo('3 lines', { ...sub, lines: 3 })).toBe('already 3 lines')
  })
  it('a place alone is not a request with nothing to change', () => {
    expect(alreadySo('below heading', sub)).toBeNull()
    expect(alreadySo('', sub)).toBeNull()
  })
})

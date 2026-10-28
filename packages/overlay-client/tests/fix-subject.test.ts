import { describe, expect, it } from 'vitest'
import { isRole, pickOther, placedAgainst } from '../src/fix-subject.js'

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

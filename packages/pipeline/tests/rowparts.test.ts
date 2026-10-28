import { describe, expect, it } from 'vitest'
import { rowParts, rowPartsBrief } from '../src/rowparts.js'

describe('rowParts (n24)', () => {
  it('reads the parts of every row from a whole-sketch note', () => {
    const r = rowParts(['4 rows, title + grey line: Email digests, Mentions, Product news, Weekly report'])
    expect(r).toHaveLength(1)
    expect(r[0]!.parts).toEqual(['title', 'grey line'])
  })
  it('takes three parts and "plus"', () => {
    expect(rowParts(['each card: photo + name plus price'])[0]!.parts).toEqual(['photo', 'name', 'price'])
  })
  it('ignores notes that are not about rows', () => {
    expect(rowParts(['Settings', 'Save changes', 'C + D'])).toEqual([])
  })
  it('briefs every part for every row', () => {
    const b = rowPartsBrief(['4 rows, title + grey line: Email digests, Mentions'])
    expect(b).toContain('every row gets a title and a grey line')
    expect(b).toContain('Never leave a named part out')
  })
})

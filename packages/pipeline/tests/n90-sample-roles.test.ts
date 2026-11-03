import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowTemplateBrief, sampleRoles } from '../src/rowtemplate.js'
import { statOrder } from '../src/statcard.js'

const strokesOf = (page: string) => (JSON.parse(readFileSync(new URL(`../../../tests/hand/out-n87/round36/${page}/digest.json`, import.meta.url), 'utf8')) as { strokesDrawn: Array<{ way: number[][] }> })
  .strokesDrawn.map((s, k) => ({ id: `s${String(k)}`, points: s.way.map(([x, y]) => ({ x: x!, y: y! })) }))

describe('n90 sample rows put each value kind in its drawn column', () => {
  it('transactions: amount at the right end, category/date in the middle', () => {
    const b = rowTemplateBrief([{ notes: ['5 rows like this, thin dividers'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokesOf('e2-transactions'))
    expect(b).toContain('text column 3 (right aligned, at the row\'s end) holds the row\'s figure')
    expect(b).toContain('text column 2 holds a secondary detail')
  })
  it('typed rows get no roles; a lone name column gets none', () => {
    const b = rowTemplateBrief([{ notes: ['5 rows like this: Corner Market · Food · -42.10 / City Rail · Travel · -3.20'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokesOf('e2-transactions'))
    expect(b).not.toContain('Which value goes where')
    expect(sampleRoles({ parts: [{ kind: 'mark', x: 0, w: 20, h: 20 }, { kind: 'text', x: 40, w: 200, h: 4 }] })).toBe('')
  })
  it('no right end: middle columns are details, no figure clause', () => {
    const r = sampleRoles({ parts: [{ kind: 'text', x: 0, w: 100, h: 4 }, { kind: 'text', x: 300, w: 100, h: 4 }] })
    expect(r).toContain('text column 2 holds a secondary detail')
    expect(r).not.toContain('figure')
  })
})

describe('n90 a look note says where stat labels go', () => {
  it('reads label-above and label-under phrasings', () => {
    expect(statOrder(['stat cards: small grey label, big number under'])).toBe(true)
    expect(statOrder(['label on top, grey'])).toBe(true)
    expect(statOrder(['numbers below the labels'.replace('the ', '')])).toBe(true)
    expect(statOrder(['big number, label under'])).toBe(false)
    expect(statOrder(['number on top'])).toBe(false)
    expect(statOrder(['Income 3,800', 'Saved 1,660'])).toBeNull()
  })
})

describe('n90 stat values keep thousands, dates and copy words', () => {
  it('reads the round 36 transactions cards whole', async () => {
    const { statOf } = await import('../src/statcard.js')
    expect(statOf(['Income 3,800'])).toEqual({ value: '3,800', label: 'Income' })
    expect(statOf(['Saved 1,660'])).toEqual({ value: '1,660', label: 'Saved' })
    expect(statOf(['Biggest day Oct 3'])).toEqual({ value: 'Oct 3', label: 'Biggest day' })
    expect(statOf(['Budget left 18%'])).toEqual({ value: '18%', label: 'Budget left' })
    expect(statOf(['6 big, on loan grey'])).toEqual({ value: '6', label: 'on loan' })
  })
})

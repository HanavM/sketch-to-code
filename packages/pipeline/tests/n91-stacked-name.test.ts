import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { rowTemplateBrief, stackedName } from '../src/rowtemplate.js'

const strokesOf = (page: string) => (JSON.parse(readFileSync(new URL(`../../../tests/hand/out-n87/round36/${page}/digest.json`, import.meta.url), 'utf8')) as { strokesDrawn: Array<{ way: number[][] }> })
  .strokesDrawn.map((s, k) => ({ id: `s${String(k)}`, points: s.way.map(([x, y]) => ({ x: x!, y: y! })) }))

describe('n91 a look tail can ask for a two-line name', () => {
  it('reads two-line phrasings', () => {
    expect(stackedName('5 rows like this, title over small grey line, toggles on on off off on')).toBe(true)
    expect(stackedName('4 like this, name with a small grey line under it')).toBe(true)
    expect(stackedName('6 rows like this, two-line items')).toBe(true)
    expect(stackedName('5 rows like this, thin dividers')).toBe(false)
    expect(stackedName('7 rows like this, names bold')).toBe(false)
  })
  it('notifications brief stacks the name column, transactions keeps one line', () => {
    const n = rowTemplateBrief([{ notes: ['5 rows like this, title over small grey line, toggles on on off off on'], region: { x: 340, y: 166, w: 600, h: 428 } }], strokesOf('e5-notifications'))
    expect(n).toContain('TWO stacked lines')
    expect(n).not.toContain('Never put one column\'s text under another\'s: a detail')
    const t = rowTemplateBrief([{ notes: ['5 rows like this, thin dividers'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokesOf('e2-transactions'))
    expect(t).not.toContain('TWO stacked lines')
  })
})

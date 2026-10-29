import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { likeCount, rowTemplates, rowTemplateBrief, verifyRowTemplate, hasFillerRows } from '../src/rowtemplate.js'

const strokesOf = (page: string) => (JSON.parse(readFileSync(new URL(`../../../tests/hand/out-n87/round36/${page}/digest.json`, import.meta.url), 'utf8')) as { strokesDrawn: Array<{ way: number[][] }> })
  .strokesDrawn.map((s, k) => ({ id: `s${String(k)}`, points: s.way.map(([x, y]) => ({ x: x!, y: y! })) }))
const leaf = (id: string, text: string, x: number, y: number, w = 100, h = 18) => ({ id, text, rect: { x, y, w, h } })

describe('n89 drawn first row is the template', () => {
  it('reads a like-count with or without typed rows', () => {
    expect(likeCount('5 rows like this, thin dividers')).toEqual({ total: 5, typed: false })
    expect(likeCount('7 like this')).toEqual({ total: 7, typed: false })
    expect(likeCount('5 rows like this: Corner Market · Food · -42.10 / City Rail · Travel · -3.20')!.typed).toBe(true)
    expect(likeCount('Recent, bold')).toBeNull()
    expect(hasFillerRows(['5 rows like this, thin dividers'])).toBe(true)
  })
  it('finds the transactions row: square, name, middle column, right amount, about 58px', () => {
    const strokes = strokesOf('e2-transactions')
    const [t] = rowTemplates([{ notes: ['5 rows like this, thin dividers'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokes)
    expect(t).toBeDefined()
    expect(t!.parts.map((p) => p.kind)).toEqual(['mark', 'text', 'text', 'text'])
    expect(t!.parts[1]!.x).toBe(348)
    expect(t!.parts[2]!.x).toBe(934)
    expect(t!.parts[3]!.right).toBe(true)
    expect(t!.pitch).toBeGreaterThanOrEqual(50)
    expect(t!.pitch).toBeLessThanOrEqual(64)
    const b = rowTemplateBrief([{ notes: ['5 rows like this, thin dividers'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokes)
    expect(b).toContain('SAMPLE content')
    expect(b).toContain('STARTING at x 934')
  })
  it('finds the email row with its divider below', () => {
    const strokes = strokesOf('e4-email-compose')
    const region = { x: 235, y: 5, w: 1030, h: 870 }
    const [t] = rowTemplates([{ notes: ['7 rows like this'], region }], strokes)
    expect(t).toBeDefined()
    expect(t!.parts.filter((p) => p.kind === 'text').length).toBe(3)
    expect(t!.parts[t!.parts.length - 1]!.right).toBe(true)
    expect(t!.cy).toBeLessThan(60)
  })
  it('flags a middle column stacked under the name and rows too tall', () => {
    const strokes = strokesOf('e2-transactions')
    const acts = [{ notes: ['5 rows like this'], region: { x: 268, y: 470, w: 964, h: 390 } }]
    const bad = { nodes: [0, 1, 2, 3, 4].flatMap((k) => [leaf(`n${String(k)}`, 'Name', 346, 540 + k * 90), leaf(`d${String(k)}`, 'Food · Oct 28', 346, 562 + k * 90), leaf(`a${String(k)}`, '-4.10', 1150, 545 + k * 90, 55)]) }
    const v = verifyRowTemplate(acts, strokes, bad)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('x 934')
    expect(v.reason).toMatch(/step every/)
    const good = { nodes: [0, 1, 2, 3, 4].flatMap((k) => [leaf(`n${String(k)}`, 'Name', 346, 542 + k * 58), leaf(`d${String(k)}`, 'Food · Oct 28', 934, 542 + k * 58), leaf(`a${String(k)}`, '-4.10', 1150, 542 + k * 58, 55)]) }
    expect(verifyRowTemplate(acts, strokes, good).satisfied).toBe(true)
  })
  it('stays quiet without a like-count or a drawn row', () => {
    expect(rowTemplateBrief([{ notes: ['Recent, bold'], region: { x: 268, y: 470, w: 964, h: 390 } }], strokesOf('e2-transactions'))).toBe('')
  })
})

import { rowData } from '../src/rowdata.js'
describe('n89 a look tail after the count is no row', () => {
  it('never prints "thin dividers" as a typed row', () => {
    expect(rowData('5 rows like this, thin dividers')).toBeNull()
    expect(rowData('7 rows like this, names bold')).toBeNull()
    expect(rowData('6 rows like this: The Salt Path · 2 Nov')!.total).toBe(6)
  })
})

import { solidOf } from '../src/solids.js'
describe('n89 a small grey label is words, not a grey block', () => {
  it('reads label styling as text', () => {
    expect(solidOf('stat cards: small grey label, big number under')).toBeNull()
    expect(solidOf('lime badge NEW')!.word).toBe('lime')
    expect(solidOf('red label Sale')!.word).toBe('red')
  })
})

import { describe, expect, it } from 'vitest'
import { verifyStackLines } from '../src/stacklines.js'
import type { TextStack } from '../src/textmark.js'

const quote: TextStack = { strokes: ['a', 'b'], lines: 2, box: { x: 200, y: 305, w: 880, h: 120 }, linePitchPx: 60, fontPx: 46, lineWidths: [880, 672] }
const n = (id: string, rect: { x: number; y: number; w: number; h: number }, fontSize: string, text = 'We shipped our whole spring catalogue in a weekend') => ({ id, rect, textBox: rect, text, style: { fontSize } })

describe('stacked text keeps its drawn lines (n33)', () => {
  it('a two-line quote built three lines tall fails, naming the drawn breaks', () => {
    const v = verifyStackLines([quote], { nodes: [n('q', { x: 240, y: 300, w: 800, h: 180 }, '44px')] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('more lines than drawn')
    expect(v.reason).toContain('forced line break')
    expect(v.reason).toContain('880 then 672')
  })
  it('two lines at the drawn size pass', () => {
    expect(verifyStackLines([quote], { nodes: [n('q', { x: 220, y: 305, w: 840, h: 118 }, '45px')] }).satisfied).toBe(true)
  })
  it('two lines at half the size fail on size', () => {
    const v = verifyStackLines([quote], { nodes: [n('q', { x: 330, y: 340, w: 620, h: 60 }, '22px')] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('font-size 46px')
  })
  it('nothing drawn in lines, or nothing found, is not judged', () => {
    expect(verifyStackLines([], { nodes: [] }).unverifiable).toBe(true)
    expect(verifyStackLines([quote], { nodes: [n('x', { x: 0, y: 800, w: 100, h: 20 }, '14px')] }).unverifiable).toBe(true)
  })
})

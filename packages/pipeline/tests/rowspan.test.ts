import { describe, expect, it } from 'vitest'
import { verifyRowSpan, rowBrief } from '../src/rowspan.js'

const line = (x0: number, x1: number, y: number, words: string) => ({ shape: 'line', box: { x: x0, y, w: x1 - x0, h: 2 }, from: { x: x0, y }, to: { x: x1, y }, words })
const node = (id: string, text: string, x: number, y: number, w: number, h = 20) => ({ id, text, rect: { x, y, w, h }, textBox: { x, y, w, h } })
const nav = line(698, 1222, 52, 'Shop Events, Leaf & Spine big bold serif, Clubs Visit')

describe('row of words on a drawn line (n46)', () => {
  it('fails a nav spread to the page edges', () => {
    const v = verifyRowSpan([nav], { nodes: [
      node('wrap', 'Shop Events Leaf & Spine Clubs Visit', 0, 40, 1920, 32),
      node('a', 'Shop', 36, 46, 30), node('b', 'Events', 96, 46, 44), node('c', 'Leaf & Spine', 900, 42, 120, 28),
      node('d', 'Clubs', 1810, 46, 36), node('e', 'Visit', 1870, 46, 30)] })
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/within x 698 to 1222/)
    expect(v.reason).toMatch(/5 pieces/)
  })
  it('passes a row kept round the logo', () => {
    const v = verifyRowSpan([nav], { nodes: [
      node('a', 'Shop', 720, 46, 30), node('b', 'Events', 790, 46, 44), node('c', 'Leaf & Spine', 900, 42, 120, 28),
      node('d', 'Clubs', 1080, 46, 36), node('e', 'Visit', 1160, 46, 30)] })
    expect(v.satisfied).toBe(true)
    expect(v.unverifiable).toBeFalsy()
  })
  it('leaves a single heading to the heading checks', () => {
    const v = verifyRowSpan([line(600, 1250, 170, 'A quiet place to read. big italic serif green')], { nodes: [node('h', 'A quiet place to read.', 640, 140, 560, 60)] })
    expect(v.unverifiable).toBe(true)
  })
  it('ignores rows far from the line', () => {
    const v = verifyRowSpan([nav], { nodes: [node('a', 'Shop', 36, 600, 30), node('b', 'Visit', 1870, 600, 30)] })
    expect(v.unverifiable).toBe(true)
  })
  it('brief names the span and forbids space-between', () => {
    expect(rowBrief('x', 698, 1222)).toMatch(/x 698 to 1222.*space-between/)
  })
})

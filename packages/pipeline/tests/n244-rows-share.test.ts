import { describe, expect, it } from 'vitest'
import type { Stroke } from '@s2c/ink'
import { repeatPlans } from '../src/repeatmark.js'
import { rowData, verifyRowData } from '../src/rowdata.js'
import { offRows, rowTemplateBrief, rowTemplates, sharedPitch, templateIn, verifyRowTemplate } from '../src/rowtemplate.js'

const S = (id: string, w: number[][], color: string | null = null) => ({ id, color, points: w.map(([x, y]) => ({ x: x!, y: y!, t: 0, p: 0.5 })) }) as unknown as Stroke
const rect = (x: number, y: number, w: number, h: number) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]
const NOTE = "x6 down: Living room TV, 192.168.1.14, 3.2 GB; Hanna's phone, 192.168.1.20, 840 MB; Work laptop, 192.168.1.31, 5.6 GB; Printer, 192.168.1.42, 12 MB off; Thermostat, 192.168.1.50, 4 MB; Game console, 192.168.1.66, 9.1 GB off"
const panel = { x: 260, y: 260, w: 980, h: 560 }
const strokes = [S('p', rect(260, 260, 980, 560), '#dfe3ea'), S('i', rect(290, 322, 44, 44), '#e4572e'), S('t1', [[312, 344]], '#e4572e'), S('g', rect(1140, 327, 64, 34), '#2a9d8f'), S('t2', [[1160, 344]], '#2a9d8f')]
const acts = [{ notes: [NOTE], region: panel }]
const leaf = (t: string, x: number, y: number, w = 90) => ({ id: t, text: t, rect: { x, y, w, h: 20 } })
const names = ['Living room TV', "Hanna's phone", 'Work laptop', 'Printer', 'Thermostat', 'Game console']

describe('n244: a drawn box keeps its size when a count fills it', () => {
  it('six rows share the panel evenly (wifi)', () => {
    const t = rowTemplates(acts, strokes)[0]!
    expect(t).toMatchObject({ total: 6, cy: 344, pitch: 82, shared: true })
    expect(t.cy + (t.total - 0.5) * t.pitch).toBeLessThanOrEqual(820)
  })
  it('a pill at the row end, under figures, is a toggle; off rows are told', () => {
    const t = rowTemplates(acts, strokes)[0]!
    expect(t.parts.map((p) => p.kind)).toEqual(['mark', 'toggle'])
    expect(t.parts[1]!.paint).toBe('#2a9d8f')
    expect(t.parts[0]!.paint).toBe('#e4572e')
    expect(t.off).toEqual([4, 6])
    const b = rowTemplateBrief(acts, strokes)
    expect(b).toMatch(/keeps EXACTLY its drawn height/)
    expect(b).toMatch(/NO words in or beside it/)
    expect(b).toMatch(/Rows 4, 6 typed "off"/)
    expect(b).not.toMatch(/no taller rows/)
  })
  it('a pill under typed words is that word\'s badge, not a toggle', () => {
    const n = 'x3 down: Ana, Paid; Bo, Late; Cy, Paid'
    expect(templateIn(panel, strokes, 3, n)!.parts[1]!.kind).toBe('mark')
    expect(offRows(n)).toEqual([])
  })
  it('the word toggle makes it one, typed rows or not', () => {
    expect(templateIn(panel, strokes, 5, '5 rows like this, toggles')!.parts[1]!.kind).toBe('toggle')
  })
  it('a part drawn low in the box is the floor: too little room left to share, the rows keep their pitch', () => {
    const foot = S('f', [[300, 760], [600, 760]], '#000000')
    const t = templateIn(panel, [...strokes, foot], 6, NOTE)!
    expect(t.pitch).toBe(64)
    expect(t.shared).toBeUndefined()
  })
  it('a drawn divider says the pitch, however tall the box', () => {
    const line = S('d', [[270, 374], [1230, 374]], '#000000')
    const t = templateIn(panel, [...strokes, line], 6, NOTE)!
    expect(t.pitch).toBe(60)
    expect(t.shared).toBeUndefined()
  })
  it('rows that would pass twice the drawn row stay at its pitch, the box keeping its height (night market, transactions)', () => {
    expect(sharedPitch(344, 820, 3, 64, 44)).toBeNull()
    const t = templateIn(panel, strokes, 3, 'x3 down: A, 1; B, 2; C, 3')!
    expect(t).toMatchObject({ pitch: 64, roomy: true })
    expect(t.shared).toBeUndefined()
    const b = rowTemplateBrief([{ notes: ['x3 down: A, 1; B, 2; C, 3'], region: panel }], strokes)
    expect(b).toMatch(/empty space under the last row is drawn on purpose/)
  })
  it('a short box never squeezes the rows and is not told to keep its height: it may be the first card', () => {
    expect(sharedPitch(344, 640, 6, 64, 44)).toBeNull()
    const t = templateIn({ x: 260, y: 300, w: 980, h: 116 }, strokes, 4, NOTE)!
    expect(t.pitch).toBe(64)
    expect(t.roomy).toBeUndefined()
    expect(t.shared).toBeUndefined()
  })
  it('checks the step against the shared pitch and finds words on toggles', () => {
    const at = (pitch: number) => names.map((n, k) => leaf(n, 350, 334 + k * pitch))
    expect(verifyRowTemplate(acts, strokes, { nodes: at(84) }).satisfied).toBe(true)
    expect(verifyRowTemplate(acts, strokes, { nodes: at(65) }).reason).toMatch(/step every 65px/)
    const worded = [...at(84), leaf('Online', 1150, 334, 40)]
    expect(verifyRowTemplate(acts, strokes, { nodes: worded }).reason).toMatch(/hold words/)
  })
  it('a whole sidebar with a way down is never copied', () => {
    const side = S('s', rect(2, 2, 218, 896), '#e3e6ec')
    expect(repeatPlans([{ text: 'x4 down: Devices, Guests, Parental, Settings', at: { x: 30, y: 110 } }], [side], { w: 1280, h: 900 })).toEqual([])
  })
  it('rows listed by commas after a look and a colon are the rows, nothing to invent', () => {
    const d = rowData('5 rows like this, thin dividers: Hand-pulled noodles Row A, Grilled corn Row B, Bubble tea Row B, Dumplings Row C, Mango sticky rice Row D')!
    expect(d.total).toBeNull()
    expect(d.rows.map((r) => r[0])).toEqual(['Hand-pulled noodles Row A', 'Grilled corn Row B', 'Bubble tea Row B', 'Dumplings Row C', 'Mango sticky rice Row D'])
  })
  it('a list of another length, or one with semicolons, is not read this way', () => {
    expect(rowData('5 rows like this: Ana, Bo')!.total).toBe(5)
    expect(rowData('5 rows like this, thin dividers: A, B, C, D; E')!.total).toBe(5)
  })
  it('a run-of-words row split across its two columns is on the page; half of one is not', () => {
    const n = '3 rows like this, thin: Grilled corn Row B, Bubble tea Row B, Dumplings Row C'
    const row = (a: string, b: string, y: number) => [leaf(a, 900, y), leaf(b, 1140, y, 40)]
    expect(verifyRowData([n], { nodes: [...row('Grilled corn', 'Row B', 400), ...row('Bubble tea', 'Row B', 440), ...row('Dumplings', 'Row C', 480)] }).satisfied).toBe(true)
    expect(verifyRowData([n], { nodes: [...row('Grilled corn', 'Row B', 400), ...row('Bubble tea', 'Row B', 440), leaf('Dumplings', 900, 480)] }).reason).toMatch(/Dumplings Row C/)
  })
})

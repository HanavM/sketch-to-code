import { describe, expect, it } from 'vitest'
import { markAreasAndEdges } from '../src/areas.js'
import { markOutlined } from '../src/textlook.js'
import { areaWordBuilt, areaWordInk, inkColoursBrief, tapDotBuilt, verifyInkColours } from '../src/inkcolour.js'
import type { GroundedAction, InkColour } from '../src/intent2.js'
import type { ShapeMark } from '../src/shapemark.js'
import type { DomNode, DomSnapshot } from '@s2c/dom'

const box = (strokeId: string, x: number, y: number, w: number, h: number) => ({ strokeId, shape: 'box', box: { x, y, w, h } }) as unknown as ShapeMark
const node = (x: number, y: number, w: number, h: number, bg: string | undefined, text = '', tag = 'div') =>
  ({ tag, text, rect: { x, y, w, h }, style: bg ? { backgroundColor: bg } : {} }) as unknown as DomNode

// round 40 c2 wave fest: a white pen box round "WAVE, huge outlined letters"; c5 venn: a black pen box round "40, giant black bold"
function read(note: string, pen: string, tapped = false) {
  const marks = [box('s1', 60, 95, 690, 177)]
  const notes = [{ text: note, focus: ['s1'] }]
  markAreasAndEdges(marks, notes, { w: 1280, h: 900 })
  markOutlined(marks, notes)
  const inks: InkColour[] = [{ strokeId: 's1', mark: 'box', paint: 'background', color: pen, box: marks[0]!.box, how: 'pen' }]
  if (tapped) inks.unshift({ strokeId: 's1', mark: 'box', paint: 'background', color: '#ff0000', box: marks[0]!.box, how: 'tap' })
  areaWordInk(marks, inks)
  return { marks, ink: inks.at(-1)! }
}

describe('n140: a pen box round a big word is its area; the pen colours the letters', () => {
  it('WAVE: white outlined letters, never a white block', () => {
    const { marks, ink } = read('WAVE, huge outlined letters', '#ffffff')
    expect(ink.paint).toBe('text')
    expect(ink.areaWord).toEqual({ word: 'WAVE', outlined: true })
    expect(marks[0]!.outlined?.colour).toBe('#ffffff')
    const brief = inkColoursBrief({ actions: [{ inkColours: [ink] } as unknown as GroundedAction], pageFill: null } as never)
    expect(brief).toMatch(/LETTERS' colour/)
    expect(brief).toMatch(/NEVER a block/)
  })
  it('40: black letters', () => {
    const { ink } = read('40, giant black bold', '#111111')
    expect(ink.paint).toBe('text')
    expect(ink.areaWord?.outlined).toBe(false)
  })
  it('a tapped box, a card note or a plain label keep their fill', () => {
    expect(read('WAVE, huge outlined letters', '#ffffff', true).ink.paint).toBe('background')
    expect(read('Get tickets', '#ffffff').ink.paint).toBe('background')
    expect(read('40, giant number on a white card', '#ffffff').ink.paint).toBe('background')
  })
  it('the check fails a solid block of the pen colour and passes bare letters', () => {
    const c = { box: { x: 60, y: 95, w: 690, h: 177 }, color: '#ffffff' }
    expect(areaWordBuilt(c, [node(60, 95, 690, 177, 'rgb(255, 255, 255)')]).ok).toBe(false)
    expect(areaWordBuilt(c, [node(60, 95, 690, 177, 'rgba(0, 0, 0, 0)', 'WAVE')]).ok).toBe(true)
    const v = verifyInkColours([{ inkColours: [{ ...read('WAVE, huge outlined letters', '#ffffff').ink }] } as unknown as GroundedAction], null as never,
      { viewport: { w: 1280, h: 900 }, nodes: [node(60, 95, 690, 177, 'rgb(255, 255, 255)')] } as unknown as DomSnapshot)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toMatch(/only marks where the letters sit/)
  })
})

describe('n140: a tap is a fill, never an inner disc', () => {
  const ring: Pick<InkColour, 'box' | 'color'> = { box: { x: 150, y: 720, w: 80, h: 80 }, color: '#f87171' }
  it('flags a darker disc where the tap dot was', () => {
    expect(tapDotBuilt(ring, [node(150, 720, 80, 80, 'rgb(248, 113, 113)'), node(185, 754, 44, 44, 'rgb(185, 28, 28)')]).ok).toBe(false)
  })
  it('passes one plain disc, a label, or a same-colour inner element', () => {
    expect(tapDotBuilt(ring, [node(150, 720, 80, 80, 'rgb(248, 113, 113)')]).ok).toBe(true)
    expect(tapDotBuilt(ring, [node(170, 740, 40, 40, 'rgb(0, 0, 0)', 'Hi')]).ok).toBe(true)
    expect(tapDotBuilt(ring, [node(170, 740, 40, 40, 'rgb(248, 113, 113)')]).ok).toBe(true)
  })
  it('the brief says the dots are only taps', () => {
    const tap: InkColour = { strokeId: 's10', mark: 'ring', paint: 'background', color: '#f87171', box: ring.box as InkColour['box'], how: 'tap' }
    expect(inkColoursBrief({ actions: [{ inkColours: [tap] } as unknown as GroundedAction], pageFill: null } as never)).toMatch(/only show WHERE a colour was tapped/)
  })
})

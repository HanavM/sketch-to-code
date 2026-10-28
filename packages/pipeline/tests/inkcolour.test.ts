import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { Stroke } from '@s2c/ink'
import { buildEvidence } from '../src/intent2.js'
import { inkColoursBrief, inkHexes, verifyInkColours } from '../src/inkcolour.js'
import { askedHexes, finishSource } from '../src/finish.js'
import type { GroundedAction } from '../src/intent2.js'

const node = (id: string, rect: DomNode['rect'], style: Partial<DomNode['style']> = {}, text = ''): DomNode => ({
  id, tag: 'div', srcLoc: null, rect, text, classes: [], parent: null, depth: 1,
  style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0', backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0', ...style },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: 'x', takenAt: 0, truncated: false })
const tap = (id: string, x: number, y: number, color: string): Stroke => ({ id, color, points: [{ x, y, t: 0 }, { x: x + 1, y, t: 1 }, { x: x + 1, y: y + 1, t: 2 }] })
const act = (inkColours: GroundedAction['inkColours']): GroundedAction => ({ kind: 'design', targets: [], instruction: 'x', rejected: [], inkColours } as unknown as GroundedAction)

describe('colours from the ink reach codegen and are checked (n10)', () => {
  it('taps never reach the reading as strokes; they arrive as fills', () => {
    const box: Stroke = { id: 'b', points: [[100, 100], [300, 100], [300, 200], [100, 200], [100, 100]].flatMap(([x, y], i, a) => i === 0 ? [{ x: x!, y: y!, t: 0 }] : Array.from({ length: 10 }, (_, k) => ({ x: a[i - 1]![0]! + ((x! - a[i - 1]![0]!) * (k + 1)) / 10, y: a[i - 1]![1]! + ((y! - a[i - 1]![1]!) * (k + 1)) / 10, t: i * 10 + k }))) }
    const ev = buildEvidence([box, tap('t', 200, 150, '#ec4899'), tap('p', 20, 20, '#1e1b4b')], snap([]))
    expect([...ev.strokes.keys()]).toEqual(['b'])
    expect(ev.fills!.map((f) => f.target)).toEqual(['b', null])
    expect(ev.brief).toContain('colourFills')
  })
  it('the brief states exact hex per mark and the page gradient', () => {
    const b = inkColoursBrief({
      pageFill: { colors: ['#ff7a50', '#8b2cf5'], angle: 124, css: 'linear-gradient(124deg, #ff7a50, #8b2cf5)' },
      actions: [act([{ strokeId: 's', mark: 'box', paint: 'background', color: '#ffffff', box: { x: 530, y: 616, w: 220, h: 60 }, how: 'tap' }])],
    })
    expect(b).toContain('linear-gradient(124deg, #ff7a50, #8b2cf5)')
    expect(b).toContain('the box drawn at x 530, y 616, 220x60: the block built for it is filled with #ffffff')
  })
  it('passes when each colour is on its mark, fails naming the mark when not', () => {
    const page = { colors: ['#1e1b4b'], css: '#1e1b4b' }
    const marks = act([
      { strokeId: 'r', mark: 'ring', paint: 'background', color: '#ec4899', box: { x: 120, y: 80, w: 420, h: 430 }, how: 'tap' },
      { strokeId: 'h', mark: 'line', paint: 'text', color: '#ffffff', box: { x: 215, y: 305, w: 855, h: 0 }, how: 'pen' },
    ])
    const good = snap([
      node('root', { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(30, 27, 75)' }),
      node('blob', { x: 110, y: 90, w: 430, h: 420 }, { backgroundColor: 'rgb(236, 72, 153)' }),
      // a two-line heading: its box is centred well below the first line's y
      node('h1', { x: 255, y: 310, w: 770, h: 220 }, { color: 'rgb(255, 255, 255)' }, 'Stay for the golden hour'),
    ])
    expect(verifyInkColours([marks], page, good).satisfied).toBe(true)
    const pale = snap([
      node('root', { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(30, 27, 75)' }),
      node('blob', { x: 110, y: 90, w: 430, h: 420 }, { backgroundColor: 'rgb(255, 255, 255)' }),
      node('h1', { x: 255, y: 310, w: 770, h: 220 }, { color: 'rgb(255, 255, 255)' }, 'Stay'),
    ])
    const v = verifyInkColours([marks], page, pale)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('the ring drawn at (120,80)')
    expect(v.reason).toContain('#ec4899')
  })

  it('a tapped pale page is exact: white does not pass for #f3f4f6, and finishing never snaps it (n18)', () => {
    const page = { colors: ['#f3f4f6'], css: '#f3f4f6' }
    const white = snap([node('root', { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(255, 255, 255)' })])
    const v = verifyInkColours([], page, white)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('#f3f4f6')
    const grey = snap([node('root', { x: 0, y: 0, w: 1280, h: 900 }, { backgroundColor: 'rgb(243, 244, 246)' })])
    expect(verifyInkColours([], page, grey).satisfied).toBe(true)
    const asked = askedHexes(inkHexes({ pageFill: page, actions: [act([{ strokeId: 's', mark: 'box', paint: 'background', color: '#2563eb', box: { x: 0, y: 0, w: 10, h: 10 }, how: 'tap' }])] }))
    const palette = [{ token: 'bg-white', rgb: { r: 255, g: 255, b: 255 } }, { token: 'bg-blue-600', rgb: { r: 37, g: 99, b: 235 } }] as never
    const { code, edits } = finishSource('<main className="bg-[#f3f4f6]"><b className="bg-[#2563eb]"/></main>', palette, asked)
    expect(edits).toEqual([])
    expect(code).toContain('bg-[#f3f4f6]')
  })
})

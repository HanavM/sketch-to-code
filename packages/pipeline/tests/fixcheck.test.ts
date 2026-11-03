import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { fixBrief, isBuiltPage, newTextOverlaps, noFillMisses, verifyFix } from '../src/fixcheck.js'
import type { GroundedAction } from '../src/intent2.js'

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text = '', style: Record<string, string> = {}, parent: string | null = 'root'): DomNode =>
  ({ id, tag: text ? 'p' : 'div', srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes: [], parent, depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0', ...style } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [node('root', { x: 0, y: 0, w: 1280, h: 900 }, '', {}, null), ...nodes], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })
const action = (notes: string[], target: DomNode): GroundedAction => ({
  kind: 'modify', instruction: notes.join(' '), notes,
  targets: [{ domId: target.id, srcLoc: target.srcLoc, tag: target.tag, text: target.text, subtreeText: target.text || 'bars', classes: [], rect: target.rect }],
}) as GroundedAction

// r32 c1 aurora: the heading broke onto two lines and ran down into the date
const heading = (h: number) => node('h', { x: 300, y: 300, w: 680, h }, 'NORTH LIGHTS')
const date = node('d', { x: 420, y: 470, w: 440, h: 30 }, '14–16 FEB · TROMSØ')
const nav = node('n', { x: 40, y: 30, w: 400, h: 20 }, 'LINEUP · TICKETS · TRAVEL')

describe('fix check (n37)', () => {
  it('a blank page is not built; a page with copy is', () => {
    expect(isBuiltPage(snap([]))).toBe(false)
    expect(isBuiltPage(snap([heading(120), date, nav]))).toBe(true)
  })

  it('words that were apart and now overlap are a failure, named by their words', () => {
    const o = newTextOverlaps(snap([heading(120), date, nav]), snap([heading(240), date, nav]))
    expect(o).toHaveLength(1)
    expect(o[0]).toMatchObject({ a: 'NORTH LIGHTS', b: '14–16 FEB · TROMSØ' })
  })

  it('words that already touched, or a parent and its child, are not this fix', () => {
    const before = snap([heading(240), date, nav])
    expect(newTextOverlaps(before, snap([heading(250), date, nav]))).toHaveLength(0)
    const wrap = node('w', { x: 300, y: 300, w: 680, h: 300 }, 'Section words', {}, 'root')
    const child = node('c', { x: 320, y: 320, w: 200, h: 30 }, 'inner copy', {}, 'w')
    expect(newTextOverlaps(snap([wrap, child, nav]), snap([wrap, child, nav]))).toHaveLength(0)
  })

  it('a heading that grows down into empty space is fine', () => {
    const lowDate = node('d', { x: 420, y: 700, w: 440, h: 30 }, '14–16 FEB · TROMSØ')
    expect(newTextOverlaps(snap([heading(120), lowDate, nav]), snap([heading(240), lowDate, nav]))).toHaveLength(0)
  })

  it('words that run under a painted shape they were clear of fail too (r32 c2 disc)', () => {
    const disc = node('disc', { x: 620, y: 120, w: 300, h: 300 }, '', { backgroundColor: 'rgb(194, 114, 64)', borderRadius: '50%' })
    const h = (w: number) => node('h', { x: 40, y: 140, w, h: 60 }, 'Small batch, roasted on Thursdays.')
    const o = newTextOverlaps(snap([disc, h(320), date, nav]), snap([disc, h(900), date, nav]))
    expect(o[0]?.a).toBe('Small batch, roasted on Thursdays.')
    expect(o[0]?.b).toMatch(/shape/)
    expect(newTextOverlaps(snap([disc, h(320), date, nav]), snap([disc, h(330), date, nav]))).toHaveLength(0)
  })

  it('"no panel behind bars" fails while the panel still paints, in any colour', () => {
    const panel = node('p', { x: 200, y: 200, w: 800, h: 300 }, '', { backgroundColor: 'rgb(30, 30, 40)' })
    const before = snap([panel, heading(120), date, nav])
    const a = [action(['no panel behind bars; pink at top'], panel)]
    const pink = snap([{ ...panel, style: { ...panel.style, backgroundColor: 'rgb(200, 60, 160)' } }, heading(120), date, nav])
    expect(noFillMisses(a, before, pink)).toEqual([{ action: 0, what: 'panel', target: 'bars' }])
    const gone = snap([{ ...panel, style: { ...panel.style, backgroundColor: 'rgba(0, 0, 0, 0)' } }, heading(120), date, nav])
    expect(noFillMisses(a, before, gone)).toHaveLength(0)
  })

  it('the brief names the parts, not the wrapper, and says what "no panel" means', () => {
    const panel = node('p', { x: 200, y: 200, w: 800, h: 300 }, '', { backgroundColor: 'rgb(30, 30, 40)' })
    const b = fixBrief([action(['no panel behind bars; pink at top'], panel)], snap([panel, heading(120), date, nav]))
    expect(b).toMatch(/FIX ON A BUILT PAGE/)
    expect(b).toMatch(/Change the bars themselves/)
    expect(b).toMatch(/stops painting/)
    expect(fixBrief([], snap([]))).toBe('')
  })

  it('verifyFix says nothing on a first build from a blank page', () => {
    expect(verifyFix([], snap([]), snap([heading(240), date, nav])).failures).toHaveLength(0)
    expect(verifyFix([], snap([heading(120), date, nav]), snap([heading(240), date, nav])).failures[0]).toMatch(/now runs into/)
  })
})

import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { colourFamily, fixBrief, lostCopy, namedFamilies, pageUnchanged, unaskedRecolours, verifyFix } from '../src/fixcheck.js'
import { finishSource } from '../src/finish.js'
import { appPalette, isColorValue } from '../src/palette.js'
import type { GroundedAction } from '../src/intent2.js'

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text = '', style: Record<string, string> = {}, classes: string[] = []): DomNode =>
  ({ id, tag: text ? 'p' : 'div', srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes, parent: 'root', depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(17, 24, 39)', fontSize: '15px', fontWeight: '400', borderRadius: '0', ...style } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [{ ...node('root', { x: 0, y: 0, w: 1240, h: 900 }), parent: null }, ...nodes], viewport: { w: 1240, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })
const recolour = (n: DomNode, style: Record<string, string>): DomNode => ({ ...n, style: { ...n.style, ...style } })

// r44 e5 delivery tracker, as built before the fix
const heading = node('h', { x: 800, y: 80, w: 300, h: 40 }, 'Out for delivery')
const order = node('o', { x: 800, y: 50, w: 200, h: 20 }, 'Order #48213', { color: 'rgb(107, 114, 128)' })
const arrival = node('a', { x: 800, y: 130, w: 200, h: 22 }, 'Arriving 6:40 pm', { color: 'rgb(234, 88, 12)' })
const track = node('t', { x: 800, y: 170, w: 160, h: 8 }, '', { backgroundColor: 'rgb(234, 88, 12)' })
const call = node('c', { x: 1040, y: 700, w: 90, h: 36 }, 'Call', { backgroundColor: 'rgb(234, 88, 12)', color: 'rgb(255, 255, 255)' })
const before = snap([order, heading, arrival, track, call])
const runNote = (text: string): GroundedAction[] => [{ kind: 'modify', instruction: text, notes: [text], targets: [] } as unknown as GroundedAction]

describe('a fix changes only what it names (n190)', () => {
  it('colour families a person would name', () => {
    expect(colourFamily({ r: 234, g: 88, b: 12 })).toBe('orange')
    expect(colourFamily({ r: 107, g: 114, b: 128 })).toBe('grey')
    expect(colourFamily({ r: 17, g: 24, b: 39 })).toBe('black')
    expect(colourFamily({ r: 37, g: 99, b: 235 })).toBe('blue')
    expect([...namedFamilies('grey track to right edge')]).toEqual(['grey'])
  })

  it('r44 e5: the orange arrival line turned black by a note about a grey track is unasked', () => {
    const after = snap([order, heading, recolour(arrival, { color: 'rgb(17, 24, 39)' }), recolour(track, { backgroundColor: 'rgb(229, 231, 235)' }), call])
    const r = unaskedRecolours(runNote('grey track to right edge'), before, after)
    expect(r.map((x) => x.what)).toContain('"Arriving 6:40 pm"')
    const v = verifyFix(runNote('grey track to right edge'), before, after)
    expect(v.failures.some((f) => /Arriving 6:40 pm/.test(f) && /#ea580c/.test(f))).toBe(true)
  })

  it('r44 e5 live: the orange drawn route repainted grey (and run to the edge) by a note about a grey track is unasked', () => {
    const route = { ...node('r', { x: 158, y: 179, w: 461, h: 600 }, '', { svgStroke: 'rgb(234, 88, 12)' }), tag: 'path' } as DomNode
    const b = snap([order, heading, arrival, track, call, route])
    const a = snap([order, heading, arrival, track, call, { ...route, rect: { x: 158, y: 179, w: 602, h: 600 }, style: { ...route.style, svgStroke: 'rgb(209, 213, 219)' } }])
    const r = unaskedRecolours(runNote('dark end dot and avatar: filled circles, avatar plain peach; grey track to right edge'), b, a)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ prop: 'stroke', was: '#ea580c', now: '#d1d5db' })
    expect(r[0]!.what).toMatch(/drawn path/)
    expect(fixBrief(runNote('grey track'), b)).toMatch(/line #ea580c \(orange\) on path/)
  })

  it('r44 e3: coloured squares greyed by a note about grey squares elsewhere are unasked', () => {
    const thumbs = [0, 1, 2, 3].map((i) => node(`th${i}`, { x: 100 + i * 90, y: 700, w: 80, h: 60 }, '', { backgroundColor: ['rgb(244, 114, 182)', 'rgb(96, 165, 250)', 'rgb(74, 222, 128)', 'rgb(250, 204, 21)'][i]! }))
    const b = snap([order, heading, ...thumbs])
    const a = snap([order, heading, ...thumbs.map((t) => recolour(t, { backgroundColor: 'rgb(209, 213, 219)' }))])
    expect(unaskedRecolours(runNote('4 grey squares under it'), b, a)).toHaveLength(4)
  })

  it('a grey part made grey, a change on the marked element, and whole-page notes are fine', () => {
    const greyed = snap([order, heading, arrival, recolour(track, { backgroundColor: 'rgb(229, 231, 235)' }), call])
    // the track was orange: a whole-sketch note naming grey still flags it (it had its own strong colour) ...
    expect(unaskedRecolours(runNote('grey track'), before, greyed)).toHaveLength(1)
    // ... but not when the note sits on the track itself
    const onTrack = [{ kind: 'modify', instruction: 'grey track', notes: ['grey track'], targets: [{ domId: 't', rect: track.rect, tag: 'div' }] } as unknown as GroundedAction]
    expect(unaskedRecolours(onTrack, before, greyed)).toHaveLength(0)
    // a pale panel tinted grey by a note naming grey is fine
    const pale = node('pp', { x: 780, y: 300, w: 400, h: 200 }, '', { backgroundColor: 'rgb(255, 255, 255)' })
    expect(unaskedRecolours(runNote('grey panel'), snap([order, heading, pale]), snap([order, heading, recolour(pale, { backgroundColor: 'rgb(229, 231, 235)' })]))).toHaveLength(0)
    // the note names the words of what changed
    expect(unaskedRecolours(runNote('Call button blue'), before, snap([order, heading, arrival, track, recolour(call, { backgroundColor: 'rgb(37, 99, 235)' })]))).toHaveLength(0)
    // a note about every colour
    expect(unaskedRecolours(runNote('all text white'), before, snap([order, heading, recolour(arrival, { color: 'rgb(255,255,255)' }), track, call]))).toHaveLength(0)
  })

  it('r44 e3: a fix that changes nothing visible says so', () => {
    expect(pageUnchanged(before, snap([order, heading, arrival, track, call]))).toBe(true)
    expect(pageUnchanged(before, snap([order, heading, arrival, recolour(track, { backgroundColor: 'rgb(0,0,0)' }), call]))).toBe(false)
    const v = verifyFix(runNote('thumbnails back to pen colours'), before, snap([order, heading, arrival, track, call]))
    expect(v.unchanged).toBe(true)
    expect(v.failures[0]).toMatch(/changed nothing visible/)
    // no note typed (only new strokes): not this check
    expect(verifyFix([], before, snap([order, heading, arrival, track, call])).unchanged).toBeFalsy()
  })

  it('r44 e3 live: "delete texts 4 grey squares" typed on the whole sketch may empty that text (never put back)', () => {
    const cap = node('cap', { x: 20, y: 300, w: 120, h: 18 }, '4 grey squares')
    const b = snap([order, heading, arrival, cap]), a = snap([order, heading, arrival])
    const acts = [{ kind: 'modify', instruction: 'make thumbnails coloured', targets: [] } as unknown as GroundedAction]
    expect(lostCopy(acts, b, a)).toHaveLength(1)
    expect(lostCopy(acts, b, a, ['bottom thumbnails back to pen colours; delete texts 4 grey squares and 5 sliders'])).toHaveLength(0)
    expect(verifyFix(acts, b, a, ['delete texts 4 grey squares']).lost).toHaveLength(0)
  })

  it('the fix brief lists the colours that stay', () => {
    const b = fixBrief(runNote('grey track'), before)
    expect(b).toMatch(/Colours not named in the notes stay/)
    expect(b).toMatch(/#ea580c \(orange\) on "Arriving 6:40 pm"/)
  })
})

describe('size utilities are never colours (n190, r44 e5 arrival line)', () => {
  it('text-[15px] is not a colour class; text-[#ea580c] and bg-[rgb(1,2,3)] are', () => {
    expect(isColorValue('15px')).toBe(false)
    expect(isColorValue('#ea580c')).toBe(true)
    expect(isColorValue('rgb(1,2,3)')).toBe(true)
    const s = snap([node('x', { x: 0, y: 0, w: 100, h: 20 }, 'Label', { color: 'rgb(234, 88, 12)' }, ['text-[#ea580c]', 'text-[15px]', 'text-[15px]'])])
    expect(appPalette(s).map((p) => p.token)).toEqual(['text-[#ea580c]'])
  })

  it('a typed orange is never snapped onto a font size', () => {
    const pal = [{ token: 'text-[15px]', css: 'rgb(234, 88, 12)', rgb: { r: 234, g: 88, b: 12 }, count: 9 }, { token: 'text-[#ea580c]', css: 'rgb(234, 88, 12)', rgb: { r: 234, g: 88, b: 12 }, count: 1 }]
    const r = finishSource('<p className="text-[#ea580c] text-[15px]">Arriving</p>', pal)
    expect(r.code).toContain('text-[#ea580c]')
    expect(r.edits).toHaveLength(0)
  })
})

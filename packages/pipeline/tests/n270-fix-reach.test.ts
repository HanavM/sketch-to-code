import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { fixBrief, isPluralNote, outlinesLost, partRepaints, pluralNamed, setsUnreached, smallPartNamed, verifyFix } from '../src/fixcheck.js'
import type { GroundedAction } from '../src/intent2.js'

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text = '', style: Record<string, string> = {}): DomNode =>
  ({ id, tag: text ? 'p' : 'div', srcLoc: `src/App.tsx:${id}:1`, rect, text, classes: [], parent: 'root', depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(17, 24, 39)', fontSize: '15px', fontWeight: '400', borderRadius: '0', ...style } }) as unknown as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [...nodes], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 } }) as unknown as DomSnapshot
const paint = (n: DomNode, style: Record<string, string>, rect?: Partial<R>): DomNode => ({ ...n, rect: { ...n.rect, ...rect }, style: { ...n.style, ...style } })
const on = (note: string, target: DomNode): GroundedAction =>
  ({ kind: 'modify', instruction: note, notes: [note], targets: [{ domId: target.id, tag: target.tag, rect: target.rect, subtreeText: target.text }] }) as unknown as GroundedAction

const CREAM = 'rgb(239, 224, 196)', GOLD = 'rgb(201, 162, 77)'
const words = ['Time, made by hand', 'SINCE 1952', 'Each movement is tuned'].map((t, i) => node(`w${i}`, { x: 740, y: 260 + i * 100, w: 400, h: 40 }, t))

describe('a small fix stays small (n270)', () => {
  const face = node('face', { x: 151, y: 200, w: 479, h: 480 }, '', { backgroundColor: CREAM })
  const before = snap([face, ...words])

  it('names the small part a short note leads with', () => {
    expect(smallPartNamed('hub gold')).toBe('hub')
    expect(smallPartNamed('the knob red')).toBe('knob')
    expect(smallPartNamed('centre pin gold')).toBe('pin')
    expect(smallPartNamed('face gold')).toBeNull()
    expect(smallPartNamed('handle bar thin and grey')).toBeNull()
    expect(smallPartNamed('badge:')).toBeNull()
    expect(smallPartNamed('make the whole clock face a warm cream colour with a hub at the centre')).toBeNull()
  })

  it('"hub gold" that paints the face gold is sent back', () => {
    const after = snap([paint(face, { backgroundColor: GOLD }), ...words])
    const r = partRepaints([on('hub gold', face)], before, after)
    expect(r).toHaveLength(1)
    expect(r[0]!.part).toBe('hub')
    expect(verifyFix([on('hub gold', face)], before, after).failures.join(' ')).toContain('Put that element')
  })

  it('leaves it alone when only a small thing took the colour', () => {
    const hub = node('hub', { x: 380, y: 430, w: 20, h: 20 }, '', { backgroundColor: 'rgb(18, 48, 43)' })
    const b = snap([face, hub, ...words])
    const after = snap([face, paint(hub, { backgroundColor: GOLD }), ...words])
    expect(partRepaints([on('hub gold', face)], b, after)).toEqual([])
  })

  it('a note about the face itself may paint the face', () => {
    const after = snap([paint(face, { backgroundColor: GOLD }), ...words])
    expect(partRepaints([on('face gold', face)], before, after)).toEqual([])
    expect(verifyFix([on('face gold', face)], before, after).repainted).toEqual([])
  })

  it('a big thing already that colour family is not a repaint', () => {
    const b = snap([paint(face, { backgroundColor: 'rgb(190, 150, 60)' }), ...words])
    const after = snap([paint(face, { backgroundColor: GOLD }), ...words])
    expect(partRepaints([on('hub gold', face)], b, after)).toEqual([])
  })

  it('tells the build to change only the part', () => {
    const brief = fixBrief([on('hub gold', face)], before)
    expect(brief).toContain('about the hub')
    expect(brief).toContain('keeps its own fill')
  })
})

describe('hollow keeps an outline (n270)', () => {
  const button = node('btn', { x: 740, y: 580, w: 230, h: 56 }, 'SEE THE COLLECTION', { backgroundColor: GOLD })
  const before = snap([button, ...words])
  const note = 'button hollow, gold outline'

  it('fill and outline both gone is a failure', () => {
    const after = snap([paint(button, { backgroundColor: 'rgba(0, 0, 0, 0)' }), ...words])
    expect(outlinesLost([on(note, button)], after)).toHaveLength(1)
    expect(verifyFix([on(note, button)], before, after).failures.join(' ')).toContain('neither a border nor a fill')
  })

  it('a border, or a border on the element around it, passes', () => {
    expect(outlinesLost([on(note, button)], snap([paint(button, { backgroundColor: 'rgba(0, 0, 0, 0)', border: `1px ${GOLD}` }), ...words]))).toEqual([])
    const wrap = node('wrap', { x: 736, y: 576, w: 238, h: 64 }, '', { border: `1px ${GOLD}` })
    expect(outlinesLost([on(note, button)], snap([wrap, paint(button, { backgroundColor: 'rgba(0, 0, 0, 0)' }), ...words]))).toEqual([])
  })

  it('a note with no such word asks nothing', () => {
    expect(outlinesLost([on('button bigger', button)], snap([paint(button, { backgroundColor: 'rgba(0, 0, 0, 0)' }), ...words]))).toEqual([])
  })

  it('the brief says what hollow means', () => {
    expect(fixBrief([on(note, button)], before)).toContain('no fill AND a visible outline')
  })
})

describe('a plural reaches them all (n270)', () => {
  const GREY = 'rgb(60, 60, 70)', BLACK = 'rgb(0, 0, 0)'
  const tracks = [0, 1, 2, 3, 4, 5].map((i) => node(`t${i}`, { x: 70 + i * 150, y: 400, w: 4, h: 360 }, '', { backgroundColor: GREY }))
  const before = snap([...tracks, ...words])
  const note = 'tracks thick black'

  it('reads the plural a note leads with', () => {
    expect(pluralNamed(note)).toBe('tracks')
    expect(pluralNamed('the tracks thicker')).toBe('tracks')
    expect(pluralNamed('fader tracks black')).toBe('tracks')
    expect(isPluralNote('hub gold')).toBe(false)
    expect(isPluralNote('master needs thick black track too')).toBe(false)
    expect(isPluralNote('cards:')).toBe(false)
    expect(isPluralNote('add dots under each card')).toBe(false)
    expect(isPluralNote('right cards dark')).toBe(false)
    expect(isPluralNote('nav rows evenly spaced')).toBe(false)
    expect(isPluralNote('two lines: NORTH / LIGHTS')).toBe(false)
  })

  it('one of six changed is a failure', () => {
    const after = snap([paint(tracks[1]!, { backgroundColor: BLACK }, { w: 8 }), tracks[0]!, ...tracks.slice(2), ...words])
    const r = setsUnreached([on(note, tracks[1]!)], before, after)
    expect(r).toEqual([{ note, kind: 'tracks', changed: 1, total: 6 }])
    expect(verifyFix([on(note, tracks[1]!)], before, after).failures.join(' ')).toContain('only 1 of 6 changed')
  })

  it('all six changed passes', () => {
    const after = snap([...tracks.map((t) => paint(t, { backgroundColor: BLACK }, { w: 8 })), ...words])
    expect(setsUnreached([on(note, tracks[1]!)], before, after)).toEqual([])
  })

  it('a singular note on one track never asks for the rest', () => {
    const after = snap([paint(tracks[1]!, { backgroundColor: BLACK }), tracks[0]!, ...tracks.slice(2), ...words])
    expect(setsUnreached([on('track thick black', tracks[1]!)], before, after)).toEqual([])
  })

  it('tells the build every one', () => {
    expect(fixBrief([on(note, tracks[1]!)], before)).toContain('EVERY one')
  })
})

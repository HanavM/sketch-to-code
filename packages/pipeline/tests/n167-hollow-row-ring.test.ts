import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { markOpenRows, openRowsBrief } from '../src/openrows.js'
import { hollowRowMarks } from '../src/intent2.js'
import { noteParts, directionStrings, verifyNoDirections } from '../src/typedcopy.js'
import { shapeOf } from '../src/shapemark.js'
import type { InkColour } from '../src/intent2.js'

const HAND = new URL('../../../tests/hand/out-n162/round42/', import.meta.url).pathname
const load = (id: string) => {
  const d = JSON.parse(readFileSync(`${HAND}${id}/digest.json`, 'utf8'))
  const run = d.events.find((e: { op: string }) => e.op === 'run').at
  const shapes = d.strokesDrawn.filter((s: { at: number }) => s.at < run).flatMap((s: { way: number[][] }) => {
    const m = shapeOf(s.way.map(([x, y]) => ({ x: x!, y: y! }))); return m ? [m] : []
  })
  const notes = d.notesTyped.filter((n: { at: number }) => n.at < run).map((n: { text: string; x: number; y: number }) => ({ text: n.text, x: n.x, y: n.y }))
  return { shapes, notes }
}

describe('n167 a ring drawn hollow stays hollow on every row', () => {
  it('podcast: the purple ring leading the rows becomes a thin ring and the rows brief says hollow', () => {
    const { shapes, notes } = load('e1-podcast-app')
    const rows = notes.find((n: { text: string }) => n.text.startsWith('rows:'))!
    const [p] = markOpenRows([rows], shapes, notes, 1280)
    const m = p!.openRows!.mark!
    expect(m.round).toBe(true)
    // the live reader called this ring a small box (n167 try 1): the list's reading decides
    const ink: InkColour = { strokeId: 's9', mark: 'box', paint: 'background', color: '#6c3fd6', box: { x: m.x + 1, y: m.y - 1, w: m.w, h: m.h }, how: 'pen' }
    const other: InkColour = { strokeId: 's1', mark: 'box', paint: 'background', color: '#6c3fd6', box: { x: 290, y: 40, w: 200, h: 200 }, how: 'pen' }
    hollowRowMarks([{ inkColours: [ink, other] }], [m])
    expect(ink.paint).toBe('border')
    expect(ink.ring?.thickness).toBeGreaterThanOrEqual(2)
    expect(other.paint).toBe('background')
    expect(openRowsBrief([p!])).toContain('HOLLOW ring')
    expect(openRowsBrief([p!])).toContain('#6c3fd6')
  })
  it('a small square that leads a list is not made round', () => {
    const m = { x: 290, y: 325, w: 36, h: 36 } as { x: number; y: number; w: number; h: number; hollow?: string; round?: boolean }
    const ink: InkColour = { strokeId: 's9', mark: 'box', paint: 'background', color: '#6c3fd6', box: { ...m }, how: 'pen' }
    hollowRowMarks([{ inkColours: [ink] }], [m])
    expect(ink.paint).toBe('background')
  })
  it('a tapped ring stays filled', () => {
    const m = { x: 290, y: 325, w: 36, h: 36 } as { x: number; y: number; w: number; h: number; hollow?: string }
    const ink: InkColour = { strokeId: 's9', mark: 'ring', paint: 'background', color: '#6c3fd6', box: { ...m }, how: 'tap' }
    hollowRowMarks([{ inkColours: [ink] }], [m])
    expect(ink.paint).toBe('background')
    expect(m.hollow).toBeUndefined()
  })
})

describe('n167 size and weight words after a title are never copy', () => {
  it('splits a trailing run with no comma', () => {
    expect(noteParts('Website relaunch big')).toMatchObject({ copy: 'Website relaunch', look: 'big' })
    expect(noteParts('Slow Science huge bold')).toMatchObject({ copy: 'Slow Science', look: 'huge bold' })
    expect(noteParts('Push day bold white')).toMatchObject({ copy: 'Push day', look: 'bold white' })
  })
  it('leaves copy alone', () => {
    expect(noteParts('Think big').copy).toBe('Think big')
    expect(noteParts('Dream so big').copy).toBe('Dream so big')
    expect(noteParts('Overdue 3 red').copy).toBe('Overdue 3 red')
    expect(noteParts('Inside a lightning bolt').copy).toBe('Inside a lightning bolt')
    expect(noteParts('Following').copy).toBe('Following')
  })
  it('the page is checked for the printed note', () => {
    const bad = directionStrings(['Website relaunch big'])
    expect(bad.some((b) => b.text === 'Website relaunch big')).toBe(true)
    const page = (t: string) => ({ nodes: [{ id: 'a', text: t, textBox: {} }] })
    expect(verifyNoDirections(['Website relaunch big'], page('Website relaunch big')).satisfied).toBe(false)
    expect(verifyNoDirections(['Website relaunch big'], page('Website relaunch')).satisfied).toBe(true)
  })
})

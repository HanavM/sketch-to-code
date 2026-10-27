import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { fillClaims, verifyFills } from '../src/fills.js'

const node = (id: string, parent: string | null, tag: string, rect: DomNode['rect'], bg = 'rgba(0, 0, 0, 0)', text = '', depth = 0, position = 'static'): DomNode => ({
  id, tag, srcLoc: null, rect, text, classes: [], parent, depth,
  style: { display: 'block', position, zIndex: 'auto', flexDirection: 'row', gap: 'normal', padding: '0px', margin: '0px', backgroundColor: bg, color: 'rgb(0, 0, 0)', fontSize: '14px', fontWeight: '400', borderRadius: '0px' },
})
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 } } as DomSnapshot)

const TABLE_NOTE = 'table (a real <table>): pale grey (#f3f4f6) header row (bg-[#f3f4f6] on every header cell, visibly tinted against the card, not white), 12px grey'
const BAR_NOTE = 'dark blue (#1e3a8a) bar 1200x44px, 8px rounded: white bold "3 selected" at the left'

function page(thBg: string, barBg: string, pageBg = 'rgb(249, 250, 251)'): DomSnapshot {
  return snap([
    node('body', null, 'body', { x: 0, y: 0, w: 1280, h: 900 }, pageBg, '', 0),
    node('bar', 'body', 'div', { x: 40, y: 150, w: 1200, h: 44 }, barBg, '', 1),
    node('sel', 'bar', 'span', { x: 56, y: 162, w: 70, h: 20 }, undefined, '3 selected', 2),
    node('card', 'body', 'div', { x: 40, y: 210, w: 1200, h: 500 }, 'rgb(255, 255, 255)', '', 1),
    node('tr', 'card', 'tr', { x: 40, y: 210, w: 1200, h: 40 }, undefined, '', 2),
    node('th1', 'tr', 'th', { x: 40, y: 210, w: 200, h: 40 }, thBg, 'Name', 3),
    node('th2', 'tr', 'th', { x: 240, y: 210, w: 200, h: 40 }, thBg, 'Email', 3),
  ])
}

describe('typed fills', () => {
  it('reads a header-row tint, a filled bar holding copy and a page colour from the words', () => {
    expect(fillClaims(TABLE_NOTE)).toEqual([{ kind: 'header', hex: '#f3f4f6' }])
    expect(fillClaims(BAR_NOTE)).toEqual([{ kind: 'quoted', hex: '#1e3a8a', noun: 'bar', copy: '3 selected' }])
    expect(fillClaims('whole page: pale grey (#f9fafb, plainly not white) page, Helvetica type')).toEqual([{ kind: 'page', hex: '#f9fafb' }])
    // the hex before 'label text' is the words' ink, not the button's fill (round 30 c5)
    expect(fillClaims('a button bar with a near-black (#2b2118) fill and cream (#f3ead8) label text reading "ORDER THE 2027 DIAL".')).toEqual([])
    expect(fillClaims('whole page: deep indigo (#1e1b4b) page with soft colour glows')).toEqual([])
    // a card's quote that is really a table cell is not the card's own copy
    expect(fillClaims('a white (#ffffff) card 1200px wide, header row "Name"')).toEqual([])
  })

  it('fails a header row built white and a bar in the wrong blue, naming the fix', () => {
    const claims = [...fillClaims(TABLE_NOTE), ...fillClaims(BAR_NOTE)]
    const v = verifyFills(page('rgba(0, 0, 0, 0)', 'rgb(37, 99, 235)'), claims)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('bg-[#f3f4f6]')
    expect(v.reason).toContain('#ffffff')
    expect(v.reason).toContain('"3 selected" sits on #2563eb')
  })

  it('passes when the header row and bar paint the typed hex (row or cell)', () => {
    const claims = [...fillClaims(TABLE_NOTE), ...fillClaims(BAR_NOTE)]
    expect(verifyFills(page('rgb(243, 244, 246)', 'rgb(30, 58, 138)'), claims).satisfied).toBe(true)
  })

  it('checks the page fill on the in-flow page, not a modal scrim over it', () => {
    const s = page('rgb(243, 244, 246)', 'rgb(30, 58, 138)')
    s.nodes.push(node('scrim', 'body', 'div', { x: 0, y: 0, w: 1280, h: 900 }, 'rgba(15, 23, 42, 0.6)', '', 1, 'fixed'))
    expect(verifyFills(s, fillClaims('whole page: pale grey (#f9fafb) page')).satisfied).toBe(true)
    const white = page('rgb(243, 244, 246)', 'rgb(30, 58, 138)', 'rgb(255, 255, 255)')
    expect(verifyFills(white, fillClaims('whole page: pale grey (#f9fafb) page')).satisfied).toBe(false)
  })

  it('does not judge what it cannot find', () => {
    const v = verifyFills(page('rgb(1, 1, 1)', 'rgb(1, 1, 1)'), fillClaims('a red (#ff0000) pill "Missing copy"'))
    expect(v.unverifiable).toBe(true)
  })
})

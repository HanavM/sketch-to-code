import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { findInsertSlot, verifyInsertSlot } from '../src/insert-slot.js'
import { verifyActions } from '../src/run2.js'
import { buildEvidence, groundInterpretation, type RawAction } from '../src/intent2.js'
import { toStrokes } from '../../../tests/bench/lib/draw.mjs'
import { rbox } from '../../../tests/bench/lib/rough.mjs'
import r15 from '../../../tests/bench/sketches/rough/r15-box-one-more-tile.mjs'

/**
 * s2c-059. The slot code was only tested on the nav row (s2c-055). A new card
 * or list row drawn between two existing ones is the next most common insert,
 * and a grid that wraps onto a second row returned no slot at all.
 *
 * Geometry is the bench's list base (s2c-015, BASE_LIST_APP: a grid-cols-4
 * grid with GitHub, GitLab, Slack tiles at y 591-681, gap 24) plus two shapes
 * the bench does not have yet: the same tiles wrapped onto two rows of three,
 * and a stacked list.
 */
const BASE: DomSnapshot = JSON.parse(
  readFileSync(new URL('../../../tests/bench/fixtures/base-snapshot.json', import.meta.url), 'utf8'),
)
const tmpl = (id: string) => BASE.nodes.find((n) => n.id === id)!
const ARTICLE = tmpl('e14')
const H3 = tmpl('e15')

const TILE = { w: 278, h: 90, gap: 24, x0: 48, y0: 591 }
const tileAt = (i: number, cols: number) => ({
  x: TILE.x0 + (i % cols) * (TILE.w + TILE.gap),
  y: TILE.y0 + Math.floor(i / cols) * (TILE.h + TILE.gap),
  w: TILE.w,
  h: TILE.h,
})

/** BASE + a section whose grid holds `names` as tiles, `cols` per row. */
function gridPage(names: string[], cols: number): DomSnapshot {
  const rows = Math.ceil(names.length / cols)
  const gridH = rows * TILE.h + (rows - 1) * TILE.gap
  const nodes: DomNode[] = [...BASE.nodes]
  nodes.push({ ...ARTICLE, id: 'g0', parent: 'e2', tag: 'section', text: '', srcLoc: 'src/App.tsx:40:7', rect: { x: 0, y: 535, w: 1280, h: gridH + 104 } })
  nodes.push({ ...ARTICLE, id: 'g1', parent: 'g0', tag: 'div', text: '', srcLoc: 'src/App.tsx:42:9', rect: { x: 48, y: 591, w: 1184, h: gridH }, style: { ...ARTICLE.style, display: 'grid' } })
  names.forEach((t, i) => {
    const r = tileAt(i, cols)
    nodes.push({ ...ARTICLE, id: `t${i}`, parent: 'g1', tag: 'div', text: '', srcLoc: `src/App.tsx:${43 + 4 * i}:11`, rect: r })
    nodes.push({ ...H3, id: `h${i}`, parent: `t${i}`, text: t, srcLoc: `src/App.tsx:${44 + 4 * i}:13`, rect: { x: r.x + 21, y: r.y + 21, w: 236, h: 24 } })
  })
  return { ...BASE, nodes }
}

/** BASE + a stacked list: rows 40 tall, 12 apart, from y 591. */
function listPage(items: string[]): DomSnapshot {
  const nodes: DomNode[] = [...BASE.nodes]
  const h = items.length * 52 - 12
  nodes.push({ ...ARTICLE, id: 'l0', parent: 'e2', tag: 'ul', text: '', srcLoc: 'src/App.tsx:40:7', rect: { x: 48, y: 591, w: 600, h }, style: { ...ARTICLE.style, display: 'flex' } })
  items.forEach((t, i) => {
    nodes.push({ ...H3, id: `li${i}`, parent: 'l0', tag: 'li', text: t, srcLoc: `src/App.tsx:${41 + i}:9`, rect: { x: 48, y: 591 + 52 * i, w: 600, h: 40 } })
  })
  return { ...BASE, nodes }
}

const box = (x: number, y: number, w: number, h: number) => {
  const s = toStrokes([rbox(x, y, w, h)])
  const xs = s.flatMap((k) => k.points.map((p) => p.x))
  const ys = s.flatMap((k) => k.points.map((p) => p.y))
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}
const pair = (s: ReturnType<typeof findInsertSlot>) => s && [s.after.text, s.before.text]

const THREE = ['GitHub', 'GitLab', 'Slack']
const SIX = ['GitHub', 'GitLab', 'Slack', 'Linear', 'Sentry', 'Datadog']

describe('the list base: three tiles in one row (s2c-059)', () => {
  const page = gridPage(THREE, 4)

  it('a narrow box over the gap between GitLab and Slack is that slot', () => {
    // GitLab ends at x 628, Slack starts at 652
    const s = findInsertSlot(page, box(612, 600, 56, 72))
    expect(pair(s)).toEqual(['GitLab', 'Slack'])
    expect(s!.container.domId).toBe('g1')
  })

  it("r15's box in the empty fourth cell is no slot: the end of the row is the end", () => {
    const strokes = toStrokes(r15.strokes)
    expect(findInsertSlot(page, box(966, 600, 252, 72))).toBeUndefined()
    const ev = buildEvidence(strokes, page)
    const a = groundInterpretation({
      reading: 'one more tile', actions: [{
        kind: 'add', elements: null, destElement: 'g1', position: 'into', instruction: 'add a tile',
        strokes: strokes.map((s) => s.id), layer: 'in-flow', depicts: null, fidelity: null,
      } as RawAction],
    }, ev, page, 'gesture').actions[0]!
    expect(a.insertSlot).toBeUndefined()
  })

  it('a box over a tile is about the tile, not a slot', () => {
    expect(findInsertSlot(page, box(370, 600, 240, 72))).toBeUndefined()
  })
})

describe('a grid on two rows (s2c-059)', () => {
  const page = gridPage(SIX, 3)

  it('a box between Sentry and Datadog (second row) is that slot', () => {
    // row 2: y 705-795; Sentry ends at x 628, Datadog starts at 652
    const s = findInsertSlot(page, box(614, 714, 52, 72))
    expect(pair(s)).toEqual(['Sentry', 'Datadog'])
    expect(s!.axis).toBe('grid')
  })

  it('a box between GitHub and GitLab (first row) is that slot', () => {
    expect(pair(findInsertSlot(page, box(312, 600, 52, 72)))).toEqual(['GitHub', 'GitLab'])
  })

  it('no slot: on a tile, in the band between the rows, or in the empty last cell', () => {
    expect(findInsertSlot(page, box(370, 714, 240, 72))).toBeUndefined()
    expect(findInsertSlot(page, box(310, 686, 56, 16))).toBeUndefined()
    const five = gridPage(SIX.slice(0, 5), 3)
    expect(findInsertSlot(five, box(666, 714, 252, 72))).toBeUndefined()
  })
})

describe('a stacked list (s2c-059)', () => {
  const page = listPage(['Inbox', 'Drafts', 'Sent', 'Archive'])

  it('a flat box between Drafts and Sent is that slot', () => {
    // Drafts ends at y 683, Sent starts at 695
    const s = findInsertSlot(page, box(60, 678, 400, 22))
    expect(s?.axis).toBe('column')
    expect(pair(s)).toEqual(['Drafts', 'Sent'])
  })

  it('a box over a row is about the row', () => {
    expect(findInsertSlot(page, box(60, 645, 400, 36))).toBeUndefined()
  })
})

describe('the tick on a grid that reflows (s2c-059)', () => {
  // three columns: a new tile between GitLab and Slack pushes Slack onto row 2
  const before = gridPage(THREE, 3)
  const slot = findInsertSlot(before, box(612, 600, 56, 72))!
  const action = { kind: 'add', targets: [], instruction: 'add a tile', region: box(612, 600, 56, 72), insertSlot: slot } as never

  it('slot found on the one-row grid', () => {
    expect(pair(slot)).toEqual(['GitLab', 'Slack'])
  })

  it('Vercel between GitLab and Slack passes, though Slack wrapped to the next row', () => {
    const v = verifyInsertSlot(slot, before, gridPage(['GitHub', 'GitLab', 'Vercel', 'Slack'], 3))
    expect(v).toMatchObject({ satisfied: true })
    expect(v.reason).toBe('the new "Vercel" is between "GitLab" and "Slack"')
  })

  it('Vercel appended after Slack fails, and says where it went', () => {
    const after = gridPage(['GitHub', 'GitLab', 'Slack', 'Vercel'], 3)
    const v = verifyInsertSlot(slot, before, after)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toBe('the new "Vercel" went after "Slack", not between "GitLab" and "Slack" where it was drawn')
    expect(verifyActions([action], before, after).failures).toContain(
      'action 0 (place): the new "Vercel" went after "Slack", not between "GitLab" and "Slack" where it was drawn',
    )
  })

  it('Vercel put first fails too', () => {
    const v = verifyInsertSlot(slot, before, gridPage(['Vercel', 'GitHub', 'GitLab', 'Slack'], 3))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('went before "GitHub"')
  })

  it('a list: a new row between Drafts and Sent passes, at the end fails', () => {
    const b = listPage(['Inbox', 'Drafts', 'Sent'])
    const s = findInsertSlot(b, box(60, 678, 400, 22))!
    expect(verifyInsertSlot(s, b, listPage(['Inbox', 'Drafts', 'Starred', 'Sent']))).toMatchObject({ satisfied: true })
    expect(verifyInsertSlot(s, b, listPage(['Inbox', 'Drafts', 'Sent', 'Starred'])).satisfied).toBe(false)
  })
})

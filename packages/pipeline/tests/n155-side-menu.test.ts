import { describe, expect, it } from 'vitest'
import { markSideLists, sideItems, sideListBrief, sideListsOf, verifySideLists } from '../src/sidelist.js'
import type { ShapeMark } from '../src/shapemark.js'

const vp = { w: 1280, h: 900 }
const box = (id: string, x: number, y: number, w: number, h: number, typed?: ShapeMark['typed']): ShapeMark =>
  ({ strokeId: id, shape: 'box', box: { x, y, w, h }, ...(typed ? { typed } : {}) }) as ShapeMark
const line = (id: string, x: number, y: number, w: number): ShapeMark =>
  ({ strokeId: id, shape: 'line', box: { x, y, w, h: 0 }, from: { x, y }, to: { x: x + w, y } }) as ShapeMark
const NAV = 'nav: My files picked blue, Shared, Recent, Starred, Trash'
const BANK = 'nav: Home picked, Cards, Payments, Savings, Settings'
// round 41 e4 file browser as drawn in n150: the left panel, the Upload button under the nav note, the storage line
const fileBrowser = () => {
  const panel = box('s1', 2, 2, 238, 896, [{ text: NAV, x: 110, y: 130 }])
  const upload = box('s3', 20, 259, 199, 44)
  return { panel, marks: [panel, upload], shapes: [panel, upload, line('s5', 20, 630, 123)], notes: [{ text: NAV, x: 110, y: 130 }, { text: 'Upload', x: 120, y: 281 }] }
}
const text = (t: string, x: number, y: number, w = 80, h = 16) => ({ rect: { x, y, w, h }, textBox: { x, y, w, h }, text: t })

describe('n155 a side menu typed with no drawn rows stacks from the panel top', () => {
  it('reads the items of a lead list', () => {
    expect(sideItems(NAV)).toEqual(['My files picked blue', 'Shared', 'Recent', 'Starred', 'Trash'])
    expect(sideItems('Upload')).toBeNull()
    expect(sideItems('62% of 15 GB used, bar')).toBeNull()
  })

  it('file browser: starts near the top and fits above the Upload button', () => {
    const { panel, marks, shapes, notes } = fileBrowser()
    const lists = markSideLists(marks, shapes, notes, vp)
    expect(lists).toHaveLength(1)
    const l = lists[0]!
    expect(l.start).toBe(26)
    expect(l.foot?.y).toBe(259)
    expect(l.start + l.items.length * l.pitch).toBeLessThanOrEqual(259 - 12)
    expect(l.pitch).toBeGreaterThanOrEqual(40)
    // the typed spot moved, so no other brief says y 130
    expect(panel.typed![0]!.y).toBeLessThan(60)
    expect(sideListsOf(marks)).toHaveLength(1)
    expect(sideListBrief(lists)).toContain('first row\'s top is at y 26')
  })

  it('bank home: starts under the logo note above it, no button so 44px rows', () => {
    const panel = box('s1', 2, 2, 228, 896, [{ text: 'penny bold', x: 60, y: 48 }, { text: BANK, x: 110, y: 220 }])
    const l = markSideLists([panel], [panel], [{ text: 'penny bold', x: 60, y: 48 }, { text: BANK, x: 110, y: 220 }], vp)[0]!
    expect(l.start).toBe(48 + 14 + 32)
    expect(l.pitch).toBe(44)
    expect(l.foot).toBeNull()
  })

  it('leaves alone: a note already at the top, drawn rows, a wide box, a list low in the panel', () => {
    const top = box('s1', 2, 2, 238, 896, [{ text: NAV, x: 110, y: 36 }])
    expect(markSideLists([top], [top], [], vp)).toHaveLength(0)
    const ruled = box('s1', 2, 2, 238, 896, [{ text: NAV, x: 110, y: 130 }])
    expect(markSideLists([ruled], [ruled, line('l1', 20, 60, 180), line('l2', 20, 100, 180)], [], vp)).toHaveLength(0)
    const wide = box('s1', 2, 2, 700, 896, [{ text: NAV, x: 110, y: 130 }])
    expect(markSideLists([wide], [wide], [], vp)).toHaveLength(0)
    const low = box('s1', 2, 2, 238, 896, [{ text: NAV, x: 110, y: 700 }])
    expect(markSideLists([low], [low], [], vp)).toHaveLength(0)
    const mid = box('s1', 400, 2, 238, 896, [{ text: NAV, x: 500, y: 130 }])
    expect(markSideLists([mid], [mid], [], vp)).toHaveLength(0)
  })

  it('checks the page: menu built at the note and under the button fails; from the top passes', () => {
    const { marks, shapes, notes } = fileBrowser()
    const lists = markSideLists(marks, shapes, notes, vp)
    const low = { nodes: ['My files', 'Shared', 'Recent', 'Starred', 'Trash'].map((t, i) => text(t, 20, 136 + i * 40)) }
    const v = verifySideLists(lists, low)
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('move the whole menu up')
    expect(v.reason).toContain('under or behind the box drawn at y 259')
    const good = { nodes: ['My files', 'Shared', 'Recent', 'Starred', 'Trash'].map((t, i) => text(t, 20, 26 + lists[0]!.pitch / 2 - 8 + i * lists[0]!.pitch)) }
    expect(verifySideLists(lists, { nodes: [...good.nodes, { rect: { x: 20, y: 259, w: 199, h: 44 } }] }).satisfied).toBe(true)
    // the button followed the menu up and shrank to its words
    const up = verifySideLists(lists, { nodes: [...good.nodes, { rect: { x: 20, y: 197, w: 48, h: 40 } }] })
    expect(up.satisfied).toBe(false)
    expect(up.reason).toContain('put its top at y 259')
    expect(verifySideLists([], good).unverifiable).toBe(true)
  })
})

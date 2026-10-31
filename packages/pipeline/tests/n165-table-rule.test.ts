import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { markTableRows, tableNote, tableRowsBrief, verifyTableRule } from '../src/tablerows.js'
import { dropsKinds, lostCopy } from '../src/fixcheck.js'
import { placedBrief, verifyPlaced } from '../src/textplace.js'
import { shapeOf } from '../src/shapemark.js'
import type { GroundedAction } from '../src/intent2.js'

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
const tnode = (t: string | undefined, x: number, y: number, w: number, h: number) => ({ rect: { x, y, w, h }, ...(t ? { text: t, textBox: { x, y, w, h } } : {}) })

describe('n165 a table typed under its drawn header rule: row 1 cells drawn under it are cells, never buttons', () => {
  it('reads table notes', () => {
    expect(tableNote('table: Student, Lab 1, Lab 2, Quiz, Project, Average; 7 made-up students, scores 60-98')).toEqual(
      { columns: ['Student', 'Lab 1', 'Lab 2', 'Quiz', 'Project', 'Average'], rows: 7 })
    expect(tableNote('rows: A, B, C')).toBeNull()
    expect(tableNote('Year 9 Science big bold')).toBeNull()
  })
  it('gradebook: the rule is the header bottom, the green box is row 1\'s Average cell, the ring row 1\'s avatar', () => {
    const { shapes, notes } = load('e5-gradebook')
    const placed = markTableRows(notes, shapes)
    const p = placed.find((n) => n.table)!
    expect(p).toBeDefined()
    const t = p.table!
    expect(t.rule.y).toBe(242)
    expect(t.rule.x).toBe(260)
    expect(t.rule.w).toBeGreaterThan(950)
    expect(Math.abs(t.firstMid - 271)).toBeLessThanOrEqual(2)
    expect(t.pitch).toBe(56)
    expect(t.rows).toBe(7)
    expect(t.cells).toHaveLength(1)
    expect(t.cells[0]!.column).toBe('Average')
    expect(t.cells[0]!.last).toBe(true)
    expect(t.mark?.round).toBe(true)
    const brief = tableRowsBrief(placed)
    expect(brief).toContain('row 1\'s own "Average" cell')
    expect(brief).toContain('NOT a button')
    // told by its own brief, not as words typed in empty space
    expect(placedBrief(placed, { w: 1280, h: 900 })).not.toContain('table: Student')
    expect(verifyPlaced([p], { nodes: [] }).unverifiable).toBe(true)
  })
  it('on the page: a table pushed down by an invented button fails; one right under the rule passes', () => {
    const { shapes, notes } = load('e5-gradebook')
    const placed = markTableRows(notes, shapes)
    const t = placed.find((n) => n.table)!.table!
    const page = (dy: number) => ({ nodes: [tnode('Student', 270, 212 + dy, 60, 14),
      ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) => [tnode(undefined, 271, t.firstMid + dy + i * 56 - 12, 25, 25), tnode(`S${i}`, 310, t.firstMid + dy + i * 56 - 7, 80, 14)])] })
    expect(verifyTableRule(placed, page(0)).satisfied).toBe(true)
    const v = verifyTableRule(placed, page(70))
    expect(v.satisfied).toBe(false)
    expect(v.reason).toContain('move the whole table up 69px')
  })
  it('a ring and box drawn with no long rule above are left alone', () => {
    const notes = [{ text: 'table: Name, Score; 5 rows', x: 700, y: 440 }]
    const shapes = [{ shape: 'ellipse', box: { x: 270, y: 259, w: 25, h: 25 } }, { shape: 'box', box: { x: 1074, y: 243, w: 166, h: 56 } }]
    expect(markTableRows(notes, shapes)[0]!.table).toBeUndefined()
  })
})

const dnode = (id: string, tag: string, rect: { x: number; y: number; w: number; h: number }, text = '', parent: string | null = 'root'): DomNode =>
  ({ id, tag, srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes: [], parent, depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [dnode('root', 'div', { x: 0, y: 0, w: 1280, h: 900 }, '', null), ...nodes], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })

describe('n165 a fix note asking for an element to go is answered by emptying it', () => {
  const btn = dnode('btn', 'button', { x: 1110, y: 270, w: 90, h: 36 }, 'Save Grades')
  const head = dnode('hd', 'h1', { x: 260, y: 40, w: 200, h: 30 }, 'Year 9 Science')
  const act = (note: string): GroundedAction => ({ kind: 'modify', instruction: note, notes: [note],
    targets: [{ domId: btn.id, srcLoc: btn.srcLoc, tag: 'button', text: btn.text, subtreeText: btn.text, classes: [], rect: btn.rect }] }) as GroundedAction
  it('reads the kinds asked to go', () => {
    expect(dropsKinds("no button: first row's average cell")).toEqual(['button'])
    expect(dropsKinds('not a badge, plain text')).toEqual(['badge'])
    expect(dropsKinds('bigger, bold')).toEqual([])
  })
  it('"no button" removing the invented Save Grades is not lost copy; other copy lost still is', () => {
    const before = snap([btn, head])
    expect(lostCopy([act("no button: first row's average cell")], before, snap([head]))).toHaveLength(0)
    expect(lostCopy([act("no button: first row's average cell")], before, snap([btn])).map((l) => l.text)).toEqual(['Year 9 Science'])
    // without asking, the button's words are still guarded
    expect(lostCopy([act('a bit lower')], before, snap([head])).map((l) => l.text)).toEqual(['Save Grades'])
  })
})

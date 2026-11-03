import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { earlierNotes, earlierNotesBrief, inventedCopy, inventedFailures } from '../src/earlier.js'

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text = '', parent: string | null = 'root'): DomNode =>
  ({ id, tag: text ? 'p' : 'div', srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes: [], parent, depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [node('root', { x: 0, y: 0, w: 1280, h: 900 }, '', null), ...nodes], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })

// r37 e4 team chat: the row words typed before the first build (n98)
const rowsNote = { text: '#design / New logo is up, Ravi Patel / sounds good, #support / 3 new tickets, Lena Ortiz / call at 2?', x: 150, y: 320 }
const earlier = [
  { text: 'Channels, bold', x: 65, y: 32 },
  { text: '#launch / Mia: shipping at 5', x: 150, y: 163 },
  rowsNote,
  { text: 'Great. Shipping at 5 then.', x: 1130, y: 445 },
]
const bubble = node('bb', { x: 1000, y: 440, w: 260, h: 24 }, 'Great. Shipping at 5 then.')
const head = node('hd', { x: 400, y: 40, w: 200, h: 30 }, '#launch')
const row1 = node('r1', { x: 20, y: 160, w: 200, h: 18 }, '#launch')
const prev1 = node('q1', { x: 20, y: 180, w: 200, h: 16 }, 'Mia: shipping at 5')
const before = snap([bubble, head, row1, prev1])

function runsDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'n72-'))
  const put = (id: string, notes: unknown) => { mkdirSync(join(d, id), { recursive: true }); writeFileSync(join(d, id, 'notes.json'), JSON.stringify(notes)) }
  put('run-1000-v2', [{ id: 'a', text: 'Channels, bold', scope: 'strokes', at: { x: 65, y: 32 } }, { id: 'b', text: rowsNote.text, scope: 'strokes', at: { x: 150.4, y: 320 } }])
  mkdirSync(join(d, 'run-1500-v2'), { recursive: true }) // a run with no notes
  put('run-2000-v2', [{ id: 'c', text: 'white', scope: 'element' }, { id: 'd', text: 'channels, BOLD', scope: 'run' }])
  put('run-9000-v2', [{ id: 'e', text: 'from a later run', scope: 'run' }])
  return d
}

describe('n72: a fix reads the words typed earlier', () => {
  it('reads the notes of the runs before this one, newest first, words once, with their spot', () => {
    const got = earlierNotes(runsDir(), 'run-3000-v2')
    expect(got.map((n) => n.text)).toEqual(['white', 'channels, BOLD', rowsNote.text])
    expect(got[2]).toEqual({ text: rowsNote.text, x: 150, y: 320 })
    expect(got.some((n) => n.text === 'from a later run')).toBe(false)
  })

  it('no runs folder, no earlier notes', () => {
    expect(earlierNotes(join(tmpdir(), 'n72-none-' + Date.now()), 'run-1-v2')).toEqual([])
  })

  it('the brief lists the earlier words with their spot and says never make up copy', () => {
    const b = earlierNotesBrief(earlier)
    expect(b).toMatch(/WORDS TYPED EARLIER/)
    expect(b).toContain('at (150, 320): "#design / New logo is up')
    expect(b).toMatch(/Never make up copy/)
    expect(earlierNotesBrief([])).toBe('')
  })

  it('made-up row copy is caught, with the earlier note typed nearest it', () => {
    const after = snap([bubble, head, row1, prev1,
      node('r2', { x: 20, y: 300, w: 200, h: 18 }, '#marketing'),
      node('q2', { x: 20, y: 320, w: 200, h: 16 }, 'Mockups waiting in review'),
    ])
    const got = inventedCopy(before, after, ['each row: name, small grey preview under'], earlier)
    expect(got.map((g) => g.text)).toEqual(['Mockups waiting in review'])
    expect(got[0]!.near?.text).toBe(rowsNote.text)
    expect(inventedFailures(got)[0]).toMatch(/nobody typed.*#design \/ New logo is up/)
  })

  it('copy taken from the earlier notes passes', () => {
    const after = snap([bubble, head, row1, prev1,
      node('r2', { x: 20, y: 300, w: 200, h: 18 }, '#design'),
      node('q2', { x: 20, y: 320, w: 200, h: 16 }, 'New logo is up'),
      node('r3', { x: 20, y: 360, w: 200, h: 18 }, 'Ravi Patel'),
      node('q3', { x: 20, y: 380, w: 200, h: 16 }, 'Sounds good'),
      node('q4', { x: 20, y: 420, w: 200, h: 16 }, '3 new tickets'),
    ])
    expect(inventedCopy(before, after, ['each row: name, small grey preview under'], earlier)).toEqual([])
  })

  it('words the fix note itself typed, or a note asking for sample copy, are not invented', () => {
    const after = snap([bubble, head, row1, prev1, node('q2', { x: 20, y: 320, w: 200, h: 16 }, 'Weekly planning notes')])
    expect(inventedCopy(before, after, ['add row: Weekly planning notes'], earlier)).toEqual([])
    expect(inventedCopy(before, after, ['each row: sample names'], earlier)).toEqual([])
  })

  it('nothing typed earlier: nothing to hold copy to', () => {
    const after = snap([bubble, head, row1, prev1, node('q2', { x: 20, y: 320, w: 200, h: 16 }, 'Mockups waiting in review')])
    expect(inventedCopy(before, after, ['each row: name'], [])).toEqual([])
  })

  it('copy already on the page before the fix is never called invented', () => {
    const odd = node('zz', { x: 20, y: 500, w: 200, h: 16 }, 'Quarterly synergy roadmap')
    expect(inventedCopy(snap([bubble, odd]), snap([bubble, odd]), [], earlier)).toEqual([])
  })
})

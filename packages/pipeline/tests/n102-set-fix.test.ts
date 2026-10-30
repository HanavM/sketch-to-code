import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { copiedCopy, fixBrief, isSetNote, lostCopy, verifyFix } from '../src/fixcheck.js'
import type { GroundedAction } from '../src/intent2.js'

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text = '', parent: string | null = 'root'): DomNode =>
  ({ id, tag: text ? 'p' : 'div', srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes: [], parent, depth: 1,
     style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
       backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes: [node('root', { x: 0, y: 0, w: 1280, h: 900 }, '', null), ...nodes], viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 }, url: '', takenAt: 0, truncated: false })
const act = (note: string, t: DomNode): GroundedAction => ({
  kind: 'modify', instruction: note, notes: [note],
  targets: [{ domId: t.id, srcLoc: t.srcLoc, tag: t.tag, text: t.text, subtreeText: t.text, classes: [], rect: t.rect }],
}) as GroundedAction

// r37 e4 team chat, as n100's live fix left it
const b1 = node('b1', { x: 400, y: 200, w: 500, h: 24 }, 'Copy is final. Can someone check the pricing page on mobile?')
const b2 = node('b2', { x: 400, y: 300, w: 400, h: 24 }, 'Great. Shipping at 5 then.')
const head = node('hd', { x: 400, y: 40, w: 200, h: 30 }, '#launch')
const name1 = node('n1', { x: 20, y: 100, w: 120, h: 18 }, 'Ravi Patel')
const prev1 = node('p1', { x: 20, y: 120, w: 160, h: 16 }, 'New logo is up')
const name2 = node('n2', { x: 20, y: 160, w: 120, h: 18 }, 'Lena Ortiz')
const prev2 = node('p2', { x: 20, y: 180, w: 160, h: 16 }, 'call at 2?')

describe('n102: a fix about a set keeps every member\'s copy', () => {
  it('reads set notes', () => {
    expect(isSetNote('chat bubbles: message text only, time small above')).toBe(true)
    expect(isSetNote('each row: name, small grey preview under')).toBe(true)
    expect(isSetNote('every card: logo top left')).toBe(true)
    expect(isSetNote('white, placeholder Search')).toBe(false)
    expect(isSetNote('Mia · 2:14 pm above; Copy is final.')).toBe(false)
  })

  it('the brief tells codegen the note covers every member and keeps each one\'s words', () => {
    const before = snap([b1, b2, head, name1, prev1])
    const brief = fixBrief([act('chat bubbles: message text only, time small above', b1)], before)
    expect(brief).toMatch(/EVERY one of that set/)
    expect(brief).toMatch(/never empty a member/)
  })

  it('a bubble emptied by the fix is lost copy; one rewritten in place is not', () => {
    const before = snap([b1, b2, head, name1, prev1])
    const emptied = snap([node('b1', b1.rect, ''), b2, head, name1, prev1])
    expect(lostCopy([act('chat bubbles: message text only', b1)], before, emptied).map((l) => l.text)).toEqual([b1.text])
    const rewritten = snap([node('b1', b1.rect, 'Copy is final, check pricing on mobile'), b2, head, name1, prev1])
    expect(lostCopy([act('chat bubbles: message text only', b1)], before, rewritten)).toHaveLength(0)
    expect(lostCopy([act('remove the text', b1)], before, emptied)).toHaveLength(0)
  })

  it('a name copied into its preview line is copied copy, unless the note typed it or asks for more', () => {
    const before = snap([b1, head, name1, prev1, name2, prev2])
    const after = snap([b1, head, name1, node('p1', prev1.rect, 'Ravi Patel: New logo is up'), name2, node('p2', prev2.rect, 'Lena Ortiz call at 2?')])
    const c = copiedCopy([act('each row: name, small grey preview under', name1)], before, after)
    expect(c.map((x) => x.text).sort()).toEqual(['Lena Ortiz', 'Ravi Patel'])
    expect(copiedCopy([act('each row: Ravi Patel then preview', name1)], before, after).map((x) => x.text)).toEqual(['Lena Ortiz'])
    expect(copiedCopy([act('add 2 more rows like this', name1)], before, after)).toHaveLength(0)
  })

  it('verifyFix names both as failures so repair and put-back see them', () => {
    const before = snap([b1, b2, head, name1, prev1])
    const after = snap([node('b1', b1.rect, ''), b2, head, name1, node('p1', prev1.rect, 'Ravi Patel New logo is up')])
    const v = verifyFix([act('each row: name, small grey preview under', name1)], before, after)
    expect(v.lost).toHaveLength(1)
    expect(v.copied).toHaveLength(1)
    expect(v.failures.join('\n')).toMatch(/is now gone/)
    expect(v.failures.join('\n')).toMatch(/now shows 2 times/)
  })

  it('an unchanged page passes', () => {
    const p = snap([b1, b2, head, name1, prev1])
    expect(verifyFix([act('chat bubbles: grey', b1)], p, p).failures).toHaveLength(0)
  })
})

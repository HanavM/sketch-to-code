import { describe, expect, it } from 'vitest'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { lostCopy, type FixVerdict } from '../src/fixcheck.js'
import { diffHunks, onlyFillStayed, partBack } from '../src/partback.js'

const OLD = `export default function App() {
  return (
    <main>
      <h1 className="text-4xl">Six courts. Open till ten.</h1>
      <div className="court bg-white">
        <span>Book a court</span>
      </div>
      <p className="text-sm">First week free</p>
      <footer className="mt-4">Baseline Tennis</footer>
    </main>
  )
}
`
// the fix: the court goes to lines only (wanted), "First week free" is emptied (not wanted)
const FIX = `export default function App() {
  return (
    <main>
      <h1 className="text-4xl">Six courts. Open till ten.</h1>
      <div className="court border-2 border-white">
      </div>
      <p className="text-sm"></p>
      <footer className="mt-4">Baseline Tennis</footer>
    </main>
  )
}
`
const verdict = (over: Partial<FixVerdict>): FixVerdict => ({ overlaps: [], noFill: [], failures: [], ...over })

describe('a fix that breaks one part puts back only that part (n213)', () => {
  it('splits an edit into hunks, and hunks two lines apart are one edit', () => {
    const a = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], b = ['a', 'X', 'c', 'd', 'e', 'f', 'Y', 'h']
    expect(diffHunks(a, b)).toHaveLength(2)
    expect(diffHunks(a, ['a', 'X', 'c', 'Y', 'e', 'f', 'g', 'h'])).toHaveLength(1)
    expect(diffHunks(a, a)).toHaveLength(0)
  })

  it('emptied copy comes back, and the rest of the fix stays', () => {
    const a = OLD.replace('<p className="text-sm">First', '\n\n\n<p className="text-sm">First')
    const b = FIX.replace('<p className="text-sm"></p>', '\n\n\n<p className="text-sm"></p>')
    const r = partBack([{ rel: 'src/App.tsx', old: a, now: b }], verdict({ lost: [{ text: 'First week free' }] }))
    expect(r).not.toBeNull()
    expect(r!.undone).toBe(1)
    expect(r!.kept).toBe(1)
    const out = r!.files[0]!.content
    expect(out).toContain('First week free')
    expect(out).toContain('border-2 border-white')
    expect(out).not.toContain('Book a court')
  })

  it('every edit going back is the whole put-back, so it is not offered', () => {
    // the two edits sit close enough to be one hunk here
    expect(partBack([{ rel: 'src/App.tsx', old: OLD, now: FIX }], verdict({ lost: [{ text: 'First week free' }] }))).toBeNull()
  })

  it('a panel it was told to drop cannot be mended by putting source back', () => {
    expect(partBack([{ rel: 'a', old: OLD, now: FIX }], verdict({ noFill: [{ action: 0, what: 'panel', target: 'x' }] }))).toBeNull()
  })

  it('with other notes to keep, a fill that stayed does not throw them away', () => {
    const miss = verdict({ noFill: [{ action: 0, what: 'fill', target: 'court' }] })
    expect(onlyFillStayed(miss, 2)).toBe(true)
    expect(onlyFillStayed(miss, 1)).toBe(false)
    expect(onlyFillStayed({ ...miss, lost: [{ text: 'x y' }] }, 2)).toBe(false)
    expect(onlyFillStayed(verdict({}), 2)).toBe(false)
    // and a broken part alongside it still goes back by itself
    const a = OLD.replace('<p className="text-sm">First', '\n\n\n<p className="text-sm">First')
    const b = FIX.replace('<p className="text-sm"></p>', '\n\n\n<p className="text-sm"></p>')
    const both = { ...miss, lost: [{ text: 'First week free' }] }
    expect(partBack([{ rel: 'a', old: a, now: b }], both, true)).not.toBeNull()
    expect(partBack([{ rel: 'a', old: a, now: b }], both, false)).toBeNull()
  })

  it('a lost word found in no edit gives up, not a guess', () => {
    const a = OLD, b = OLD.replace('text-4xl', 'text-6xl')
    expect(partBack([{ rel: 'a', old: a, now: b }], verdict({ lost: [{ text: 'Never in the file' }] }))).toBeNull()
  })

  it('an edit that is not a whole piece of the tree gives up', () => {
    const c = 'one\n<b>x</b>\nFirst week free\ny\ntwo\nthree\nfour\nfive\nsix\nseven'
    const d = 'one\n<div>\ntwo\nthree\nfour\nfive\nsix\nCHANGED'
    expect(partBack([{ rel: 'a', old: c, now: d }], verdict({ lost: [{ text: 'First week free' }] }))).toBeNull()
  })

  it('a copy pasted somewhere extra goes, by the edit that added it', () => {
    const a = 'A\nB\nC\nD\nE\nF\nG\nH\nI\n'
    const b = 'A2\nB\nC\nD\nE\nF\nName\nG\nH\nI\n'
    const r = partBack([{ rel: 'a', old: a, now: b }], verdict({ copied: [{ text: 'Name', was: 1, now: 2 }] }))
    expect(r!.files[0]!.content).toBe('A2\nB\nC\nD\nE\nF\nG\nH\nI\n')
  })

  it('text that now runs into other text goes back by the class line just above it', () => {
    const a = 'A\nB\nC\nD\nE\nF\n<h1 className="s">\nBig words here\n</h1>\nG\n'
    const b = 'A2\nB\nC\nD\nE\nF\n<h1 className="xl">\nBig words here\n</h1>\nG\n'
    const r = partBack([{ rel: 'a', old: a, now: b }], verdict({ overlaps: [{ a: 'Big words here', b: 'Someone else', share: 0.5 }] }))
    expect(r!.files[0]!.content).toBe('A2\nB\nC\nD\nE\nF\n<h1 className="s">\nBig words here\n</h1>\nG\n')
  })
})

type R = { x: number; y: number; w: number; h: number }
const node = (id: string, rect: R, text: string): DomNode =>
  ({ id, tag: 'p', srcLoc: `src/App.tsx:${id.length}:1`, rect, text, classes: [], parent: 'root', depth: 1,
    style: { display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0', padding: '0', margin: '0',
      backgroundColor: 'rgba(0, 0, 0, 0)', color: 'rgb(0, 0, 0)', fontSize: '16px', fontWeight: '400', borderRadius: '0' } }) as DomNode
const snap = (nodes: DomNode[]): DomSnapshot => ({ nodes, viewport: { w: 1280, h: 900 } }) as unknown as DomSnapshot

describe('split up is not emptied (n213)', () => {
  const long = node('a', { x: 900, y: 300, w: 300, h: 40 }, 'stacked: 6 clay and hard courts / 14 coaches on staff / $39 a month, all courts')
  const keep = node('k', { x: 40, y: 40, w: 300, h: 40 }, 'Baseline Tennis')

  it('one long line taken apart into three tiles has lost nothing', () => {
    const after = snap([keep,
      node('t1', { x: 900, y: 500, w: 100, h: 40 }, '6 clay and hard courts'),
      node('t2', { x: 900, y: 600, w: 100, h: 40 }, '14 coaches on staff'),
      node('t3', { x: 900, y: 700, w: 100, h: 40 }, '$39 a month, all courts')])
    expect(lostCopy([], snap([keep, long]), after)).toEqual([])
  })

  it('a long line that is simply gone is still lost', () => {
    expect(lostCopy([], snap([keep, long]), snap([keep])).map((l) => l.text)).toEqual([long.text])
  })

  it('words that were already on the page do not count as the line coming back', () => {
    const had = node('h', { x: 40, y: 200, w: 300, h: 40 }, 'clay and hard courts coaches on staff month all')
    expect(lostCopy([], snap([keep, had, long]), snap([keep, had])).map((l) => l.text)).toEqual([long.text])
  })

  it('a short line needs its own words back', () => {
    const short = node('s', { x: 900, y: 300, w: 300, h: 40 }, 'First week free')
    const other = node('o', { x: 900, y: 700, w: 300, h: 40 }, 'free for a first week')
    expect(lostCopy([], snap([keep, short]), snap([keep, other])).map((l) => l.text)).toEqual([short.text])
  })
})

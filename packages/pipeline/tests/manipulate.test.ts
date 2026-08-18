import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyManipulation, rewriteClassList, snapSpacing, synthesizeMove, synthesizeResize,
} from '../src/manipulate.js'

describe('snapSpacing', () => {
  it('snaps to tokens within 2px', () => {
    expect(snapSpacing(24)).toEqual({ suffix: '6', snappedPx: 24, onToken: true })
    expect(snapSpacing(25)).toEqual({ suffix: '6', snappedPx: 24, onToken: true })
    expect(snapSpacing(2)).toEqual({ suffix: '0.5', snappedPx: 2, onToken: true })
    expect(snapSpacing(0)).toEqual({ suffix: '0', snappedPx: 0, onToken: true })
  })
  it('falls to arbitrary values off-token (§7.3 rung 5)', () => {
    // dense region (≤48px) always lands within 2px of a token; the sparse
    // upper scale is where arbitrary values appear
    expect(snapSpacing(52)).toEqual({ suffix: '[52px]', snappedPx: 52, onToken: false })
  })
})

describe('rewriteClassList', () => {
  it('replaces the existing utility in place', () => {
    const r = rewriteClassList('grid grid-cols-3 gap-4 p-2', 'gap', '6')
    expect(r.after).toBe('grid grid-cols-3 gap-6 p-2')
    expect(r.replaced).toBe('gap-4')
  })
  it('does not touch gap-x/gap-y when editing gap', () => {
    const r = rewriteClassList('flex gap-x-2 gap-4', 'gap', '8')
    expect(r.after).toBe('flex gap-x-2 gap-8')
  })
  it('appends when absent; side padding coexists with uniform p', () => {
    expect(rewriteClassList('flex items-center', 'gap', '4').after).toBe('flex items-center gap-4')
    expect(rewriteClassList('p-4 rounded', 'pt', '8').after).toBe('p-4 rounded pt-8')
  })
  it('replaces arbitrary values too', () => {
    expect(rewriteClassList('gap-[26px] flex', 'gap', '6').after).toBe('gap-6 flex')
  })
})

describe('applyManipulation', () => {
  it('edits exactly the className string, preserving formatting', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-manip-'))
    mkdirSync(join(root, 'src'))
    const code = `export default function C() {
  return (
    <section className="grid grid-cols-3 gap-4">
      <div className="p-5">a</div>
      <div className="p-5">b</div>
    </section>
  )
}
`
    writeFileSync(join(root, 'src/Comp.tsx'), code)
    const res = applyManipulation(root, { srcLoc: 'src/Comp.tsx:3:5', prop: 'gap', px: 24 })
    expect(res.ok).toBe(true)
    expect(res.change).toBe('gap-4 → gap-6')
    const after = readFileSync(join(root, 'src/Comp.tsx'), 'utf8')
    expect(after).toContain('className="grid grid-cols-3 gap-6"')
    // nothing else changed
    expect(after.replace('gap-6', 'gap-4')).toBe(code)
  })
  it('refuses dynamic classNames honestly', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-manip-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/D.tsx'), `const D = () => <div className={clsx('a', x && 'b')}>x</div>\n`)
    const res = applyManipulation(root, { srcLoc: 'src/D.tsx:1:17', prop: 'gap', px: 16 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('dynamic')
  })
  it('reports stale stamps instead of editing the wrong node', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-manip-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/E.tsx'), `const E = () => <div className="p-2">x</div>\n`)
    const res = applyManipulation(root, { srcLoc: 'src/E.tsx:9:9', prop: 'p', px: 16 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('stale')
  })
  it('escapes root are rejected', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-manip-'))
    const res = applyManipulation(root, { srcLoc: '../../etc/passwd:1:1', prop: 'p', px: 4 })
    expect(res.ok).toBe(false)
  })
})

describe('applyManipulation reorder', () => {
  it('reorders static JSX children preserving separators', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-reord-'))
    mkdirSync(join(root, 'src'))
    const code = `const R = () => (
  <div className="flex">
    <a>one</a>
    <b>two</b>
    <c>three</c>
  </div>
)
`
    writeFileSync(join(root, 'src/R.tsx'), code)
    const res = applyManipulation(root, { srcLoc: 'src/R.tsx:2:3', prop: 'reorder', from: 0, to: 2 })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/R.tsx'), 'utf8')
    expect(after.indexOf('<b>')).toBeLessThan(after.indexOf('<c>'))
    expect(after.indexOf('<c>')).toBeLessThan(after.indexOf('<a>'))
    expect(after.split('\n').length).toBe(code.split('\n').length) // formatting preserved
  })

  it('reorders the data array behind a .map (the demo StatCards case)', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-reord-'))
    mkdirSync(join(root, 'src'))
    const code = `const stats = [
  { label: 'Revenue' },
  { label: 'Users' },
  { label: 'Conversion' },
]
export default function S() {
  return (
    <section className="grid">
      {stats.map((s) => (
        <div key={s.label}>{s.label}</div>
      ))}
    </section>
  )
}
`
    writeFileSync(join(root, 'src/S.tsx'), code)
    const res = applyManipulation(root, { srcLoc: 'src/S.tsx:8:5', prop: 'reorder', from: 0, to: 2 })
    expect(res.ok).toBe(true)
    expect(res.change).toContain("'stats' entry 1 → position 3")
    const after = readFileSync(join(root, 'src/S.tsx'), 'utf8')
    const order = ['Users', 'Conversion', 'Revenue'].map((l) => after.indexOf(`'${l}'`))
    expect(order[0]).toBeLessThan(order[1]!)
    expect(order[1]).toBeLessThan(order[2]!)
  })

  it('refuses dynamic children honestly', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-reord-'))
    mkdirSync(join(root, 'src'))
    const lines = [
      'const T = ({ items }) => (',
      '  <ul className="flex">{items.map((i) => <li key={i}>{i}</li>)}</ul>',
      ')',
      '',
    ]
    writeFileSync(join(root, 'src/T.tsx'), lines.join('\n'))
    const res = applyManipulation(root, { srcLoc: 'src/T.tsx:2:3', prop: 'reorder', from: 0, to: 1 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('ink path')
  })
})

describe('rewriteClassList — canva additions', () => {
  it('edits w- without touching min-w/max-w', () => {
    const r = rewriteClassList('max-w-md w-40 min-w-0', 'w', '[300px]')
    expect(r.after).toBe('max-w-md w-[300px] min-w-0')
    expect(r.replaced).toBe('w-40')
  })
  it('replaces negative translate classes in either direction', () => {
    expect(rewriteClassList('-translate-x-2 flex', 'translate-x', '6', true).after).toBe('-translate-x-6 flex')
    expect(rewriteClassList('translate-x-2 flex', 'translate-x', '4', true).after).toBe('-translate-x-4 flex')
  })
  it('a positive margin replaces an existing negative one', () => {
    expect(rewriteClassList('-ml-2 flex', 'ml', '4').after).toBe('ml-4 flex')
  })
})

describe('synthesizeMove ladder', () => {
  it('rung (b): small axis-aligned in-flow moves become one margin utility', () => {
    expect(synthesizeMove(20, 1, true)).toEqual({
      edits: [{ prop: 'ml', suffix: '5', negative: false }], cosmetic: false,
    })
    expect(synthesizeMove(2, 24, true)).toEqual({
      edits: [{ prop: 'mt', suffix: '6', negative: false }], cosmetic: false,
    })
  })
  it('rung (b): leftward/upward nudges use NEGATIVE leading margins (mr/mb would not move the element)', () => {
    expect(synthesizeMove(-20, 0, true)).toEqual({
      edits: [{ prop: 'ml', suffix: '5', negative: true }], cosmetic: false,
    })
    expect(synthesizeMove(0, -16, true)).toEqual({
      edits: [{ prop: 'mt', suffix: '4', negative: true }], cosmetic: false,
    })
  })
  it('rung (c): diagonal moves fall to translate — the gesture never fails', () => {
    expect(synthesizeMove(51, -12, true)).toEqual({
      edits: [
        { prop: 'translate-x', suffix: '[51px]', negative: false },
        { prop: 'translate-y', suffix: '3', negative: true },
      ],
      cosmetic: true,
    })
  })
  it('rung (c): out-of-flow elements never get margin nudges', () => {
    expect(synthesizeMove(20, 1, false)).toEqual({
      edits: [{ prop: 'translate-x', suffix: '5', negative: false }], cosmetic: true,
    })
  })
  it('rung (c): big aligned moves exceed the margin budget', () => {
    const r = synthesizeMove(120, 0, true)
    expect(r?.cosmetic).toBe(true)
    expect(r?.edits).toEqual([{ prop: 'translate-x', suffix: '[120px]', negative: false }])
  })
  it('sub-threshold jitter synthesizes nothing', () => {
    expect(synthesizeMove(1, -2, true)).toBeNull()
  })
})

describe('synthesizeResize', () => {
  it('snaps each axis independently (token or arbitrary)', () => {
    expect(synthesizeResize(300, 150)).toEqual([
      { prop: 'w', suffix: '[300px]', negative: false },
      { prop: 'h', suffix: '[150px]', negative: false },
    ])
    expect(synthesizeResize(24, undefined)).toEqual([{ prop: 'w', suffix: '6', negative: false }])
  })
})

describe('applyManipulation move', () => {
  const fixture = `export default function M() {
  return (
    <section className="flex">
      <div className="p-2">a</div>
    </section>
  )
}
`
  const mkRoot = () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-move-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/M.tsx'), fixture)
    return root
  }
  it('diagonal drop lands translate classes, flagged cosmetic', () => {
    const root = mkRoot()
    const res = applyManipulation(root, { srcLoc: 'src/M.tsx:4:7', prop: 'move', dx: 51, dy: -12, inFlow: true })
    expect(res.ok).toBe(true)
    expect(res.change).toContain('(cosmetic transform)')
    const after = readFileSync(join(root, 'src/M.tsx'), 'utf8')
    expect(after).toContain('className="p-2 translate-x-[51px] -translate-y-3"')
  })
  it('small aligned in-flow drop lands a margin utility, not a transform', () => {
    const root = mkRoot()
    const res = applyManipulation(root, { srcLoc: 'src/M.tsx:4:7', prop: 'move', dx: 20, dy: 1, inFlow: true })
    expect(res.ok).toBe(true)
    expect(res.change).toBe('+ ml-5')
    const after = readFileSync(join(root, 'src/M.tsx'), 'utf8')
    expect(after).toContain('className="p-2 ml-5"')
    expect(after).not.toContain('translate')
  })
  it('replaces an existing translate instead of stacking a second one', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-move-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/N.tsx'), `const N = () => <div className="translate-x-2 p-1">x</div>\n`)
    const res = applyManipulation(root, { srcLoc: 'src/N.tsx:1:17', prop: 'move', dx: -24, dy: 0, inFlow: false })
    expect(res.ok).toBe(true)
    expect(res.change).toContain('translate-x-2 → -translate-x-6')
    const after = readFileSync(join(root, 'src/N.tsx'), 'utf8')
    expect(after).toContain('className="-translate-x-6 p-1"')
  })
  it('sub-threshold moves are a no-op, not a junk class', () => {
    const root = mkRoot()
    const res = applyManipulation(root, { srcLoc: 'src/M.tsx:4:7', prop: 'move', dx: 1, dy: 2, inFlow: true })
    expect(res.ok).toBe(true)
    expect(res.change).toContain('no change')
    expect(readFileSync(join(root, 'src/M.tsx'), 'utf8')).toBe(fixture)
  })
})

describe('applyManipulation resize', () => {
  it('width and height land as w-/h- classes in one edit', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-size-'))
    mkdirSync(join(root, 'src'))
    const code = `const R = () => <div className="rounded w-40">x</div>\n`
    writeFileSync(join(root, 'src/R.tsx'), code)
    const res = applyManipulation(root, { srcLoc: 'src/R.tsx:1:17', prop: 'resize', w: 300, h: 150 })
    expect(res.ok).toBe(true)
    expect(res.change).toBe('w-40 → w-[300px] · + h-[150px]')
    const after = readFileSync(join(root, 'src/R.tsx'), 'utf8')
    expect(after).toContain('className="rounded w-[300px] h-[150px]"')
  })
  it('inserts className when the element has none', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-size-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/B.tsx'), `const B = () => <div>x</div>\n`)
    const res = applyManipulation(root, { srcLoc: 'src/B.tsx:1:17', prop: 'resize', w: 24 })
    expect(res.ok).toBe(true)
    expect(readFileSync(join(root, 'src/B.tsx'), 'utf8')).toContain('<div className="w-6">x</div>')
  })
  it('refuses dynamic classNames honestly (resize)', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-size-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/D.tsx'), `const D = () => <div className={clsx('a')}>x</div>\n`)
    const res = applyManipulation(root, { srcLoc: 'src/D.tsx:1:17', prop: 'resize', w: 120 })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('dynamic')
  })
})

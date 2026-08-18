import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyManipulation, rewriteClassList, snapSpacing, snapSpacingExact, synthesizeMove, synthesizeResize,
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

describe('snapSpacingExact (magnetic-guide axes)', () => {
  it('keeps guide-snapped values pixel-exact — no 2px token drift', () => {
    // 25px is within 2px of token 6 (24px); tolerant snap would break alignment
    expect(snapSpacingExact(25)).toEqual({ suffix: '[25px]', snappedPx: 25, onToken: false })
    expect(snapSpacing(25).suffix).toBe('6') // the contrast that motivates it
  })
  it('still uses tokens when the exact value sits on the scale', () => {
    expect(snapSpacingExact(24)).toEqual({ suffix: '6', snappedPx: 24, onToken: true })
    expect(snapSpacingExact(2)).toEqual({ suffix: '0.5', snappedPx: 2, onToken: true })
  })
})

describe('synthesizeMove/Resize with exact axes', () => {
  it('exact axis produces the exact arbitrary value; the free axis still tokens', () => {
    expect(synthesizeMove(25, -25, false, { x: true })).toEqual({
      edits: [
        { prop: 'translate-x', suffix: '[25px]', negative: false },
        { prop: 'translate-y', suffix: '6', negative: true },
      ],
      cosmetic: true,
    })
  })
  it('exact margin-rung nudges are pixel-exact too', () => {
    expect(synthesizeMove(25, 0, true, { x: true })).toEqual({
      edits: [{ prop: 'ml', suffix: '[25px]', negative: false }], cosmetic: false,
    })
  })
  it('resize honors per-axis exactness', () => {
    expect(synthesizeResize(25, 25, { w: true })).toEqual([
      { prop: 'w', suffix: '[25px]', negative: false },
      { prop: 'h', suffix: '6', negative: false },
    ])
  })
})

describe('shared templates (.map instances)', () => {
  const mapFixture = `const stats = [
  { label: 'Revenue', value: 1 },
  { label: 'Users', value: 2 },
  { label: 'Conversion', value: 3 },
]
export default function S() {
  return (
    <section className="grid">
      {stats.map((s) => (
        <div key={s.label} className="rounded p-5">{s.label}</div>
      ))}
    </section>
  )
}
`
  const mkRoot = (code = mapFixture) => {
    const root = mkdtempSync(join(tmpdir(), 's2c-shared-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/S.tsx'), code)
    return root
  }
  // the mapped <div> opens at line 10, col 9
  const DIV = 'src/S.tsx:10:9'

  it('refuses with a structured shared:true response when no scope is chosen', () => {
    const root = mkRoot()
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: 40, dy: 30, inFlow: true,
      instanceIndex: 1, instanceCount: 3,
    })
    expect(res.ok).toBe(false)
    expect(res.shared).toBe(true)
    expect(res.instanceCount).toBe(3)
    expect(res.options).toEqual(['all', 'just-this-one'])
    expect(readFileSync(join(root, 'src/S.tsx'), 'utf8')).toBe(mapFixture) // untouched
  })

  it("choice 'all' edits the shared template exactly as before", () => {
    const root = mkRoot()
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'resize', w: 300,
      instanceIndex: 1, instanceCount: 3, choice: 'all',
    })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/S.tsx'), 'utf8')
    expect(after).toContain('className="rounded p-5 w-[300px]"')
  })

  it("'just this one' adds a per-item field + template spread; other items untouched", () => {
    const root = mkRoot()
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: 51, dy: -12, inFlow: true,
      instanceIndex: 1, instanceCount: 3, choice: 'just-this-one',
    })
    expect(res.ok).toBe(true)
    expect(res.change).toContain("'stats' item 2 of 3")
    expect(res.change).toContain('(cosmetic transform)')
    const after = readFileSync(join(root, 'src/S.tsx'), 'utf8')
    // item 2 gained the field; items 1 and 3 did not
    expect(after).toContain("{ label: 'Users', value: 2, className: 'translate-x-[51px] -translate-y-3' },")
    expect(after).toContain("{ label: 'Revenue', value: 1 },")
    expect(after).toContain("{ label: 'Conversion', value: 3 },")
    // template deliberately crossed into a template literal with the spread
    expect(after).toContain('className={`rounded p-5 ${s.className ?? \'\'}`}')
  })

  it("'just this one' merges into an existing per-item className instead of duplicating", () => {
    const root = mkRoot()
    // first narrow edit installs the hook…
    applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: 51, dy: 0, inFlow: false,
      instanceIndex: 1, instanceCount: 3, choice: 'just-this-one',
    })
    // …the second must reuse it: data-only edit, no second template rewrite
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: -24, dy: 0, inFlow: false,
      instanceIndex: 1, instanceCount: 3, choice: 'just-this-one',
    })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/S.tsx'), 'utf8')
    expect(after).toContain("className: '-translate-x-6'")
    expect(after.match(/\$\{s\.className \?\? ''\}/g)?.length).toBe(1)
  })

  it('refuses honestly when the array is not a same-file literal', () => {
    const root = mkRoot(`export default function T({ items }: { items: string[] }) {
  return (
    <ul className="flex">
      {items.map((i) => (
        <li key={i} className="p-2">{i}</li>
      ))}
    </ul>
  )
}
`)
    const res = applyManipulation(root, {
      srcLoc: 'src/S.tsx:5:9', prop: 'move', dx: 40, dy: 30, inFlow: true,
      instanceIndex: 0, instanceCount: 2, choice: 'just-this-one',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('same-file')
    expect(res.error).toMatch(/apply to all|ink path/)
  })

  it('refuses when the DOM count disagrees with the array length', () => {
    const root = mkRoot()
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: 40, dy: 30, inFlow: true,
      instanceIndex: 0, instanceCount: 6, choice: 'just-this-one',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('6 instances')
    expect(res.error).toContain('3 items')
  })

  it('single-instance elements never trip the shared gate', () => {
    const root = mkRoot()
    // the <section> itself renders once (line 8, col 5)
    const res = applyManipulation(root, {
      srcLoc: 'src/S.tsx:8:5', prop: 'move', dx: 51, dy: -12, inFlow: true,
      instanceIndex: 0, instanceCount: 1,
    })
    expect(res.ok).toBe(true)
    expect(res.shared).toBeUndefined()
  })

  it('resolves the array through SCOPE — never another component\'s same-named array', () => {
    const twoComps = `function A() {
  const rows = [
    { label: 'a' },
    { label: 'b' },
  ]
  return (
    <ul className="flex">
      {rows.map((r) => (
        <li key={r.label} className="p-2">{r.label}</li>
      ))}
    </ul>
  )
}
export function B() {
  const rows = [
    { label: 'x' },
    { label: 'y' },
  ]
  return (
    <ul className="flex">
      {rows.map((r) => (
        <li key={r.label} className="p-1">{r.label}</li>
      ))}
    </ul>
  )
}
`
    const root = mkdtempSync(join(tmpdir(), 's2c-scope-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/C.tsx'), twoComps)
    // B's <li> is at line 22, col 9
    const res = applyManipulation(root, {
      srcLoc: 'src/C.tsx:22:9', prop: 'move', dx: 51, dy: -12, inFlow: false,
      instanceIndex: 1, instanceCount: 2, choice: 'just-this-one',
    })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/C.tsx'), 'utf8')
    const aPart = after.slice(0, after.indexOf('function B'))
    const bPart = after.slice(after.indexOf('function B'))
    expect(bPart).toContain("{ label: 'y', className: 'translate-x-[51px] -translate-y-3' },")
    // A's data and template are untouched
    expect(aPart).toContain("{ label: 'a' },")
    expect(aPart).toContain("{ label: 'b' },")
    expect(aPart).not.toContain('className:')
    expect(aPart).toContain('className="p-2"')
  })

  it('reorder resolves the array through scope too', () => {
    const twoComps = `function A() {
  const rows = [
    { label: 'a' },
    { label: 'b' },
  ]
  return (
    <ul className="flex">
      {rows.map((r) => (
        <li key={r.label}>{r.label}</li>
      ))}
    </ul>
  )
}
export function B() {
  const rows = [
    { label: 'x' },
    { label: 'y' },
  ]
  return (
    <ul className="flex">
      {rows.map((r) => (
        <li key={r.label}>{r.label}</li>
      ))}
    </ul>
  )
}
`
    const root = mkdtempSync(join(tmpdir(), 's2c-scope-'))
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src/D.tsx'), twoComps)
    // B's <ul> opens at line 20, col 5
    const res = applyManipulation(root, { srcLoc: 'src/D.tsx:20:5', prop: 'reorder', from: 0, to: 1 })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/D.tsx'), 'utf8')
    const aPart = after.slice(0, after.indexOf('function B'))
    const bPart = after.slice(after.indexOf('function B'))
    expect(bPart.indexOf("'y'")).toBeLessThan(bPart.indexOf("'x'"))
    expect(aPart.indexOf("'a'")).toBeLessThan(aPart.indexOf("'b'"))
  })

  it("refuses 'just this one' when the template already pins a conflicting utility", () => {
    const root = mkRoot(`const stats = [
  { label: 'Revenue' },
  { label: 'Users' },
]
export default function S() {
  return (
    <section className="grid">
      {stats.map((s) => (
        <div key={s.label} className="rounded w-40">{s.label}</div>
      ))}
    </section>
  )
}
`)
    const res = applyManipulation(root, {
      srcLoc: 'src/S.tsx:9:9', prop: 'resize', w: 300,
      instanceIndex: 0, instanceCount: 2, choice: 'just-this-one',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("'w-40'")
    expect(res.error).toContain('apply to all')
  })

  it("'all' scope still works AFTER a per-instance edit installed the hook template", () => {
    const root = mkRoot()
    applyManipulation(root, {
      srcLoc: DIV, prop: 'move', dx: 51, dy: 0, inFlow: false,
      instanceIndex: 1, instanceCount: 3, choice: 'just-this-one',
    })
    const res = applyManipulation(root, {
      srcLoc: DIV, prop: 'resize', w: 300,
      instanceIndex: 0, instanceCount: 3, choice: 'all',
    })
    expect(res.ok).toBe(true)
    const after = readFileSync(join(root, 'src/S.tsx'), 'utf8')
    // static part gained w-[300px]; the per-item hook survived intact
    expect(after).toContain('className={`rounded p-5 w-[300px] ${s.className ?? \'\'}`}')
    expect(after).toContain("className: 'translate-x-[51px]'")
  })

  it("reorder is untouched by the gate (already single-instance semantics)", () => {
    const root = mkRoot()
    const res = applyManipulation(root, {
      srcLoc: 'src/S.tsx:8:5', prop: 'reorder', from: 0, to: 2,
      instanceIndex: 0, instanceCount: 3,
    })
    expect(res.ok).toBe(true)
    expect(res.change).toContain("'stats' entry 1 → position 3")
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

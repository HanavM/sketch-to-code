import { describe, expect, it } from 'vitest'
import { stampJsxSource } from '../src/jsx-source.js'

describe('stampJsxSource', () => {
  it('stamps host elements with file:line:col', () => {
    const code = `export default function App() {
  return (
    <div className="a">
      <button onClick={() => {}}>Hi</button>
    </div>
  )
}`
    const res = stampJsxSource(code, 'src/App.tsx')
    expect(res).not.toBeNull()
    expect(res!.count).toBe(2)
    expect(res!.code).toContain('<div data-s2c="src/App.tsx:3:5" className="a">')
    expect(res!.code).toContain('<button data-s2c="src/App.tsx:4:7" onClick=')
  })

  it('skips components, member expressions, and fragments', () => {
    const code = `const x = <><Foo.Bar/><Widget prop={1}/><span/></>`
    const res = stampJsxSource(code, 'a.tsx')
    expect(res!.count).toBe(1)
    expect(res!.code).toContain('<span data-s2c=')
    expect(res!.code).not.toContain('Widget data-s2c')
    expect(res!.code).not.toContain('Foo.Bar data-s2c')
  })

  it('handles self-closing hosts and TS generics', () => {
    const code = `function C<T,>(p: {v: T}) { return <input value={String(p.v)} /> }`
    const res = stampJsxSource(code, 'g.tsx')
    expect(res!.count).toBe(1)
    expect(res!.code).toContain('<input data-s2c="g.tsx:1:36"')
  })

  it('does not double-stamp on re-transform', () => {
    const code = `const a = <div data-s2c="x.tsx:1:1">hi</div>`
    const res = stampJsxSource(code, 'x.tsx')
    expect(res).toBeNull() // nothing new to stamp
  })

  it('returns null for files with no JSX hosts', () => {
    expect(stampJsxSource('export const n = 42', 'n.ts')).toBeNull()
    expect(stampJsxSource('const y = <Comp/>', 'c.tsx')).toBeNull()
  })

  it('map paths are line-preserving (appendLeft only)', () => {
    const code = `const a = 1\nconst b = <p>x</p>\nconst c = 3`
    const res = stampJsxSource(code, 'm.tsx')!
    const outLines = res.code.split('\n')
    expect(outLines).toHaveLength(3)
    expect(outLines[0]).toBe('const a = 1')
    expect(outLines[2]).toBe('const c = 3')
  })
})

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { insertCopy } from '../src/insert-copy.js'

const NAV = `export default function Navbar() {
  return (
    <nav>
      <div className="flex gap-6">
        <a href="#" className="text-sm text-gray-600">Overview</a>
        <a href="/reports" key="r" className="text-sm text-gray-600">Reports</a>
        <button className="rounded-md bg-blue-600">
          Sign out
        </button>
        <span className="x"><b>Bold</b></span>
      </div>
    </nav>
  )
}
`
const LIST = `const items = ['a', 'b']
export default function L() {
  return <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>
}
`

function project() {
  const root = mkdtempSync(join(tmpdir(), 's2c-insert-'))
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src/Nav.tsx'), NAV)
  writeFileSync(join(root, 'src/L.tsx'), LIST)
  return root
}
const node = (id: string, srcLoc: string, tag = 'a') => ({ id, srcLoc, tag, text: '', classes: [], rect: { x: 0, y: 0, w: 10, h: 10 }, style: {}, parent: null })
const snap = (...nodes: ReturnType<typeof node>[]) => ({ nodes, viewport: { w: 1280, h: 900 } }) as never

describe('insertCopy (n11)', () => {
  it('copies the link before the gap with the typed words', () => {
    const root = project()
    const out = insertCopy(root, { afterSrcLoc: 'src/Nav.tsx:5:9', beforeSrcLoc: 'src/Nav.tsx:6:9', text: 'Blog', snapshot: snap(node('1', 'src/Nav.tsx:5:9'), node('2', 'src/Nav.tsx:6:9')) })
    expect(out.ok).toBe(true)
    const code = readFileSync(join(root, 'src/Nav.tsx'), 'utf8')
    expect(code).toContain('<a href="#" className="text-sm text-gray-600">Overview</a>\n        <a href="#" className="text-sm text-gray-600">Blog</a>\n        <a href="/reports"')
  })
  it('resets a real href and drops a copied key', () => {
    const root = project()
    const out = insertCopy(root, { afterSrcLoc: 'src/Nav.tsx:6:9', beforeSrcLoc: 'src/Nav.tsx:7:9', text: '"Docs"', snapshot: snap(node('2', 'src/Nav.tsx:6:9'), node('3', 'src/Nav.tsx:7:9', 'button')) })
    expect(out.ok).toBe(true)
    const code = readFileSync(join(root, 'src/Nav.tsx'), 'utf8')
    expect(code).toContain('<a href="#" className="text-sm text-gray-600">Docs</a>\n        <button')
  })
  it('keeps multi-line words laid out as they were (copying the next one)', () => {
    const root = project()
    const out = insertCopy(root, { afterSrcLoc: null, beforeSrcLoc: 'src/Nav.tsx:7:9', text: 'Help', snapshot: snap(node('3', 'src/Nav.tsx:7:9', 'button')) })
    expect(out.ok).toBe(true)
    const code = readFileSync(join(root, 'src/Nav.tsx'), 'utf8')
    expect(code).toContain('<button className="rounded-md bg-blue-600">\n          Help\n        </button>\n        <button')
  })
  it('refuses a neighbour that holds more than words, a list template, and code-looking notes', () => {
    const root = project()
    const before = readFileSync(join(root, 'src/Nav.tsx'), 'utf8')
    expect(insertCopy(root, { afterSrcLoc: 'src/Nav.tsx:10:9', beforeSrcLoc: null, text: 'X', snapshot: snap(node('4', 'src/Nav.tsx:10:9', 'span')) }).ok).toBe(false)
    expect(insertCopy(root, { afterSrcLoc: 'src/L.tsx:3:39', beforeSrcLoc: 'src/L.tsx:3:39', text: 'c', snapshot: snap(node('a', 'src/L.tsx:3:39', 'li'), node('b', 'src/L.tsx:3:39', 'li')) }).ok).toBe(false)
    expect(insertCopy(root, { afterSrcLoc: 'src/Nav.tsx:5:9', beforeSrcLoc: null, text: '{alert(1)}', snapshot: snap(node('1', 'src/Nav.tsx:5:9')) }).ok).toBe(false)
    expect(insertCopy(root, { afterSrcLoc: 'src/Nav.tsx:5:9', beforeSrcLoc: null, text: '   ', snapshot: snap(node('1', 'src/Nav.tsx:5:9')) }).ok).toBe(false)
    expect(readFileSync(join(root, 'src/Nav.tsx'), 'utf8')).toBe(before)
  })
})

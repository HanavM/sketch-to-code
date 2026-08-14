import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyManipulation, rewriteClassList, snapSpacing } from '../src/manipulate.js'

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

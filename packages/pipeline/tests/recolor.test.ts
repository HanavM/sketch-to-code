/**
 * s2c-050: the recolour engine. One literal in one attribute, or a refusal
 * that hands the action back to codegen.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colorClass, isColorUtility, recolorElement, type RecolorRequest } from '../src/recolor.js'
import type { ColorMatch } from '../src/palette.js'

const GREEN: ColorMatch = { drawn: '#16a34a' }
const SNAPPED: ColorMatch = {
  drawn: '#15a34b',
  nearest: { token: 'text-green-600', css: 'rgb(22, 163, 74)', rgb: { r: 22, g: 163, b: 74 }, count: 2 },
  distance: 0.8,
}

/** Writes src/App.jsx, runs the engine on the element on `line`, returns the file. */
function run(src: string, line: number, req: Partial<RecolorRequest> = {}) {
  const root = mkdtempSync(join(tmpdir(), 's2c-recolor-'))
  const file = join(root, 'App.jsx')
  writeFileSync(file, src)
  const col = (src.split('\n')[line - 1] ?? '').indexOf('<') + 1
  const out = recolorElement(root, { srcLoc: `App.jsx:${line}:${col}`, prop: 'color', color: GREEN, tailwind: false, ...req })
  return { out, code: readFileSync(file, 'utf8') }
}

describe('recolorElement: plain CSS projects get an inline style', () => {
  it('the Vite starter heading: adds style={{ color }} (what demo shot 3 needs)', () => {
    const { out, code } = run('export default () => (\n  <div>\n    <h1>Get started</h1>\n  </div>\n)\n', 3)
    expect(out).toMatchObject({ ok: true, file: 'App.jsx', change: 'color → #16a34a' })
    expect(code).toContain("<h1 style={{ color: '#16a34a' }}>Get started</h1>")
  })
  it('merges into an existing static style, replacing an old colour', () => {
    const { out, code } = run("const A = () => <p style={{ fontSize: 12, color: 'red' }}>x</p>\n", 1)
    expect(out.ok).toBe(true)
    expect(code).toContain("style={{ fontSize: 12, color: '#16a34a' }}")
    expect(out.change).toBe("color 'red' → #16a34a")
  })
  it('appends after a spread so it wins', () => {
    const { code } = run('const A = (p) => <p style={{ ...p.s }}>x</p>\n', 1)
    expect(code).toContain("style={{ ...p.s, color: '#16a34a' }}")
  })
  it('a fill goes to backgroundColor', () => {
    const { out, code } = run('const A = () => <button className="counter">Go</button>\n', 1, { prop: 'backgroundColor' })
    expect(out.ok).toBe(true)
    expect(code).toContain(`<button style={{ backgroundColor: '#16a34a' }} className="counter">`)
  })
  it('same colour twice is a no-op', () => {
    const { out } = run("const A = () => <p style={{ color: '#16a34a' }}>x</p>\n", 1)
    expect(out).toMatchObject({ ok: true, change: 'no change (already that colour)' })
  })
})

describe('recolorElement: Tailwind projects swap the colour utility', () => {
  it('replaces the text colour and keeps text-lg / font-bold', () => {
    const { out, code } = run('const A = () => <h2 className="text-lg font-bold text-gray-900">Hi</h2>\n', 1, { tailwind: true, color: SNAPPED })
    expect(out).toMatchObject({ ok: true, change: 'text-gray-900 → text-green-600' })
    expect(code).toContain('className="text-lg font-bold text-green-600"')
  })
  it('a bg- token for the same shade becomes its text- twin; nothing close → arbitrary value', () => {
    const bg: ColorMatch = { ...SNAPPED, nearest: { ...SNAPPED.nearest!, token: 'bg-green-600' } }
    expect(colorClass(bg, 'text-')).toBe('text-green-600')
    expect(colorClass(GREEN, 'bg-')).toBe('bg-[#16a34a]')
    const { code } = run('const A = () => <button className="px-4 bg-blue-600 bg-cover">Go</button>\n', 1, { tailwind: true, prop: 'backgroundColor' })
    expect(code).toContain('className="px-4 bg-cover bg-[#16a34a]"')
  })
  it('knows colour utilities from the rest', () => {
    for (const c of ['text-red-500', 'text-white', 'text-[#fff]', 'text-red-500/50']) expect(isColorUtility(c, 'text-')).toBe(true)
    for (const c of ['text-sm', 'text-center', 'text-balance', 'text-2xl']) expect(isColorUtility(c, 'text-')).toBe(false)
    for (const c of ['bg-cover', 'bg-gradient-to-r', 'bg-fixed']) expect(isColorUtility(c, 'bg-')).toBe(false)
  })
})

describe('recolorElement: refuses (and codegen takes it) when the write is not one literal', () => {
  const refuses = (src: string, line: number, req: Partial<RecolorRequest> = {}) => {
    const { out, code } = run(src, line, req)
    expect(out.ok, out.error).toBe(false)
    expect(code).toBe(src) // nothing written
    return out.error!
  }
  it('a component tag', () => {
    expect(refuses('const A = () => <Title>Hi</Title>\n', 1)).toMatch(/component/)
  })
  it('a dynamic className in a Tailwind project', () => {
    expect(refuses('const A = (p) => <p className={p.on ? "a" : "b"}>x</p>\n', 1, { tailwind: true })).toMatch(/dynamic/)
  })
  it('a style that is not an object literal', () => {
    expect(refuses('const A = (p) => <p style={p.s}>x</p>\n', 1)).toMatch(/plain object/)
  })
  it('the background shorthand', () => {
    expect(refuses("const A = () => <p style={{ background: 'red' }}>x</p>\n", 1, { prop: 'backgroundColor' })).toMatch(/shorthand/)
  })
  it('a template rendered more than once', () => {
    expect(refuses('const A = () => <li>x</li>\n', 1, { instanceCount: 3 })).toMatch(/3 times/)
  })
  it('a stale stamp', () => {
    const root = mkdtempSync(join(tmpdir(), 's2c-recolor-'))
    writeFileSync(join(root, 'App.jsx'), 'const A = () => <p>x</p>\n')
    expect(recolorElement(root, { srcLoc: 'App.jsx:9:1', prop: 'color', color: GREEN, tailwind: false }).error).toMatch(/stale/)
  })
  it('a path outside the project', () => {
    expect(recolorElement('/tmp/x', { srcLoc: '../etc/passwd:1:1', prop: 'color', color: GREEN, tailwind: false }).ok).toBe(false)
  })
})

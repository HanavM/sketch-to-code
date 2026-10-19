import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { applyDirectEdit } from '../src/direct-edit.js'

const STATS = `const stats = [
  { label: 'Revenue' },
  { label: 'Users' },
  { label: 'Conversion' },
]

export default function StatCards() {
  return (
    <section className="grid grid-cols-3 gap-4">
      <h2 className="text-lg text-slate-900">Stats</h2>
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg bg-white p-5">{s.label}</div>
      ))}
      <button className="bg-blue-600 text-white">More</button>
    </section>
  )
}
`

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-direct-'))
  for (const [rel, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), code)
  }
  return root
}

const node = (id: string, srcLoc: string | null, parent: string | null, tag = 'div', bg = 'rgba(0, 0, 0, 0)', classes: string[] = []): DomNode => ({
  id, tag, srcLoc, parent, depth: 0, text: '', classes,
  rect: { x: 0, y: 0, w: 10, h: 10 },
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row', gap: '0px', padding: '0px',
    margin: '0px', backgroundColor: bg, color: 'rgb(15, 23, 42)', fontSize: '16px', fontWeight: '400', borderRadius: '0px',
  },
} as unknown as DomNode)

const snapshot = (): DomSnapshot => ({
  nodes: [
    node('e0', 'src/StatCards.tsx:9:5', null, 'section'),
    node('e1', 'src/StatCards.tsx:10:7', 'e0', 'h2'),
    node('e2', 'src/StatCards.tsx:12:9', 'e0', 'div', 'rgb(255, 255, 255)'),
    node('e3', 'src/StatCards.tsx:12:9', 'e0', 'div', 'rgb(255, 255, 255)'),
    node('e4', 'src/StatCards.tsx:12:9', 'e0', 'div', 'rgb(255, 255, 255)'),
    node('e5', 'src/StatCards.tsx:14:7', 'e0', 'button', 'rgb(37, 99, 235)', ['bg-blue-600', 'text-white']),
    node('e6', null, 'e0', 'span', 'rgb(22, 163, 74)', ['bg-green-600']),
  ],
  viewport: { w: 1280, h: 800, scrollX: 0, scrollY: 0 }, url: 'http://x/', takenAt: 0, truncated: false,
})

describe('applyDirectEdit', () => {
  it('erases a plain JSX element', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const out = applyDirectEdit(root, { kind: 'delete', srcLoc: 'src/StatCards.tsx:10:7', instanceIndex: 0, snapshot: snapshot() })
    expect(out.ok).toBe(true)
    expect(readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')).not.toContain('<h2')
  })

  it('erases one card of a .map() by removing its data entry', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const out = applyDirectEdit(root, { kind: 'delete', srcLoc: 'src/StatCards.tsx:12:9', instanceIndex: 1, snapshot: snapshot() })
    expect(out.ok).toBe(true)
    const code = readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')
    expect(code).not.toContain("'Users'")
    expect(code).toContain("'Revenue'")
    expect(code).toContain("'Conversion'")
  })

  it('refuses an element the page does not have, writing nothing', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const out = applyDirectEdit(root, { kind: 'delete', srcLoc: 'src/StatCards.tsx:99:1', instanceIndex: 0, snapshot: snapshot() })
    expect(out.ok).toBe(false)
    expect(readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')).toBe(STATS)
  })

  it('recolours a button fill to the drawn colour', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const out = applyDirectEdit(root, {
      kind: 'recolor', srcLoc: 'src/StatCards.tsx:14:7', instanceIndex: 0, snapshot: snapshot(),
      color: '#16a34a', prop: 'backgroundColor',
    })
    expect(out.ok).toBe(true)
    const code = readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')
    expect(code).not.toContain('bg-blue-600')
    expect(code).toMatch(/<button className="[^"]*bg-/)
  })

  it('refuses to recolour a .map() template (would hit every card)', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const out = applyDirectEdit(root, {
      kind: 'recolor', srcLoc: 'src/StatCards.tsx:12:9', instanceIndex: 0, snapshot: snapshot(),
      color: '#16a34a', prop: 'backgroundColor',
    })
    expect(out.ok).toBe(false)
    expect(readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')).toBe(STATS)
  })
})

describe('applyDirectEdit size gate', () => {
  it('refuses to erase an element over a third of the viewport (a person confirms those)', () => {
    const root = repo({ 'src/StatCards.tsx': STATS })
    const snap = snapshot()
    snap.nodes[1]!.rect = { x: 0, y: 0, w: 1280, h: 500 }
    const out = applyDirectEdit(root, { kind: 'delete', srcLoc: 'src/StatCards.tsx:10:7', instanceIndex: 0, snapshot: snap })
    expect(out.ok).toBe(false)
    expect(readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')).toBe(STATS)
  })
})

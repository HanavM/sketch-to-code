import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extractComponent } from '../src/extract.js'

const PAGE = `import Badge from './components/Badge'

const rows = [{ id: 1, name: 'Ada' }]

export default function Team({ title }: { title: string }) {
  const count = rows.length
  return (
    <section className="p-6">
      <h2>{title}</h2>
      <p className="muted">{count} members</p>
      <Badge tone="ok" />
      <footer>done</footer>
    </section>
  )
}
`

function repo(src = PAGE) {
  const root = mkdtempSync(join(tmpdir(), 's2c-extract-'))
  mkdirSync(join(root, 'src/components'), { recursive: true })
  writeFileSync(join(root, 'src/Team.tsx'), src)
  writeFileSync(join(root, 'src/components/Badge.tsx'), 'export default function Badge(_: { tone: string }) { return null }\n')
  return root
}
const read = (root: string, f: string) => readFileSync(join(root, f), 'utf8')

describe('extracting a component from a selection', () => {
  it('moves contiguous siblings out and leaves a call site', () => {
    const root = repo()
    // <h2> line 9, <p> line 10
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:9:7', 'src/Team.tsx:10:7'], name: 'team header' })
    expect(r.ok).toBe(true)
    expect(r.name).toBe('TeamHeader')
    expect(r.file).toBe('src/components/TeamHeader.tsx')

    const made = read(root, r.file!)
    expect(made).toContain('<h2>{title}</h2>')
    expect(made).toContain('<p className="muted">{count} members</p>')
    // several siblings need a fragment
    expect(made).toContain('<>')

    const page = read(root, 'src/Team.tsx')
    expect(page).toContain(`import TeamHeader from './components/TeamHeader'`)
    expect(page).not.toContain('<h2>')
    // what stayed, stayed
    expect(page).toContain('<Badge tone="ok" />')
    expect(page).toContain('<footer>done</footer>')
  })

  it('lifts what the JSX needed from the old scope into props', () => {
    const root = repo()
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:9:7', 'src/Team.tsx:10:7'] })
    // `title` is a prop of the old component, `count` a local — both must travel
    expect(r.props).toEqual(['count', 'title'])
    expect(read(root, r.file!)).toContain('{ count, title }')
    expect(read(root, 'src/Team.tsx')).toContain('<Extracted count={count} title={title} />')
  })

  it('does not treat module-scope things as props — it imports them instead', () => {
    const root = repo()
    // the <Badge> line: Badge is an import, rows/count are not referenced
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:11:7'], name: 'Tag' })
    expect(r.ok).toBe(true)
    expect(r.props).toEqual([])
    const made = read(root, r.file!)
    // imported from the NEW file's directory, not copied verbatim
    expect(made).toContain(`import Badge from './Badge'`)
    expect(made).not.toContain('{ Badge }')
  })

  it('a single element needs no fragment', () => {
    const root = repo()
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:12:7'], name: 'Foot' })
    expect(read(root, r.file!)).not.toContain('<>')
    expect(read(root, r.file!)).toContain('<footer>done</footer>')
  })

  it('refuses a non-contiguous selection rather than reordering the page', () => {
    const root = repo()
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:9:7', 'src/Team.tsx:12:7'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/contiguous/)
    expect(read(root, 'src/Team.tsx')).toBe(PAGE)
  })

  it('refuses elements that are not siblings', () => {
    const root = repo()
    // <section> and its own child
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:8:5', 'src/Team.tsx:9:7'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/not siblings|nested/)
    expect(read(root, 'src/Team.tsx')).toBe(PAGE)
  })

  it('refuses a selection spanning files', () => {
    const root = repo()
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:9:7', 'src/components/Badge.tsx:1:1'] })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/different files/)
  })

  it('refuses a stale stamp, an empty selection, and an escape attempt', () => {
    const root = repo()
    expect(extractComponent(root, { srcLocs: ['src/Team.tsx:99:1'] }).error).toMatch(/stale stamp/)
    expect(extractComponent(root, { srcLocs: [] }).error).toMatch(/nothing selected/)
    expect(extractComponent(root, { srcLocs: ['../outside.tsx:1:1'] }).error).toMatch(/escapes/)
    expect(read(root, 'src/Team.tsx')).toBe(PAGE)
  })

  it('never overwrites a component that already exists', () => {
    const root = repo()
    writeFileSync(join(root, 'src/components/Extracted.tsx'), 'export default function Extracted() { return null }\n')
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:12:7'] })
    expect(r.name).toBe('Extracted2')
    expect(read(root, 'src/components/Extracted.tsx')).toContain('return null')
  })

  it('leaves both files parseable', () => {
    const root = repo()
    const r = extractComponent(root, { srcLocs: ['src/Team.tsx:9:7', 'src/Team.tsx:10:7', 'src/Team.tsx:11:7'] })
    expect(r.ok).toBe(true)
    for (const f of [r.file!, 'src/Team.tsx']) {
      expect(() => JSON.stringify(read(root, f))).not.toThrow()
      expect(read(root, f)).toMatch(/export default|import/)
    }
  })
})

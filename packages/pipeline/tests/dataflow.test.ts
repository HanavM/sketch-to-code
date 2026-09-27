import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moveData } from '../src/dataflow.js'

// Line/column of every stamp used below is load-bearing: the numbers in the
// tests are the 1-based column of each `<`, exactly as the build-time stamper
// writes them.
//  11 <section>            5      22 <p className="mixed">  11
//  12 <h2>                 7      25 <footer className="out"> 7
//  13 <p className="total"> 7     33 <aside>                5
//  15 <div className="card"> 9    34 <p className="far">    7
//  16 <p className="label"> 11    35 <h3>                   7
//  17 <p className="value"> 11
//  18 <span className="slot"> 11
//  19 <em className="empty"> 11
//  20 <img className="pic"> 11
//  21 <div className="wrap"> 11 / <b> 33
const PAGE = `const stats = [
  { label: 'Revenue', value: '$48,210' },
  { label: 'Active users', value: '3,904' },
]

const TITLE = 'Overview'

export default function Cards() {
  const total = 2
  return (
    <section className="grid">
      <h2>{TITLE}</h2>
      <p className="total">{total}</p>
      {stats.map((s) => (
        <div key={s.label} className="card">
          <p className="label">{s.label}</p>
          <p className="value">{s.value}</p>
          <span className="slot">—</span>
          <em className="empty" />
          <img className="pic" src="/x.png" />
          <div className="wrap"><b>bold</b></div>
          <p className="mixed">{s.value} vs last month</p>
        </div>
      ))}
      <footer className="out">—</footer>
    </section>
  )
}

export function Other() {
  const total = 99
  return (
    <aside className="side">
      <p className="far">—</p>
      <h3>{total}</h3>
    </aside>
  )
}
`

const OTHER = `export default function Aside() {
  return <p className="only">hello</p>
}
`

function repo(src = PAGE) {
  const root = mkdtempSync(join(tmpdir(), 's2c-dataflow-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/Cards.tsx'), src)
  writeFileSync(join(root, 'src/Aside.tsx'), OTHER)
  return root
}
const read = (root: string, f = 'src/Cards.tsx') => readFileSync(join(root, f), 'utf8')

describe('dragging a value from one element to another', () => {
  it('copies the expression into a sibling in the same list', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:18:11' })
    expect(r.ok).toBe(true)
    expect(r.file).toBe('src/Cards.tsx')
    expect(r.change).toContain('`{s.value}`')
    expect(r.change).toContain('<span>')
    expect(r.change).toContain('replaced “—”')

    const page = read(root)
    expect(page).toContain('<span className="slot">{s.value}</span>')
    // a COPY: the element dragged from still renders what it rendered
    expect(page).toContain('<p className="value">{s.value}</p>')
  })

  it('copies static text too, and says what it replaced', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:25:7', to: 'src/Cards.tsx:16:11' })
    expect(r.ok).toBe(true)
    expect(r.change).toContain('“—” now also renders in <p>')
    expect(r.change).toContain('replaced “{s.label}”')
    expect(read(root)).toContain('<p className="label">—</p>')
    expect(read(root)).toContain('<footer className="out">—</footer>')
  })

  it('a module-scope value crosses between components in the file', () => {
    const root = repo()
    // TITLE is a module constant, so it resolves inside Other() as well
    const r = moveData(root, { from: 'src/Cards.tsx:12:7', to: 'src/Cards.tsx:34:7' })
    expect(r.ok).toBe(true)
    expect(read(root)).toContain('<p className="far">{TITLE}</p>')
  })

  it('reopens a self-closing destination rather than refusing it', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:19:11' })
    expect(r.ok).toBe(true)
    expect(read(root)).toContain('<em className="empty">{s.value}</em>')
    // nothing was lost, so nothing is reported as lost
    expect(r.change).not.toContain('replaced')
  })

  it('refuses a list parameter dropped outside its list, naming the fix', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:25:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('`s`')
    expect(r.error).toContain('{stats.map(…)} list')
    expect(r.error).toMatch(/prop/)
    expect(read(root)).toBe(PAGE)
  })

  it('refuses an identifier that resolves at the destination to something else', () => {
    const root = repo()
    // `total` exists in BOTH Cards() and Other() — the copy would silently
    // render 99 where the user dragged 2
    const r = moveData(root, { from: 'src/Cards.tsx:13:7', to: 'src/Cards.tsx:34:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('means something else')
    expect(r.error).toContain('Cards()')
    expect(r.error).toContain('Other()')
    expect(read(root)).toBe(PAGE)
  })

  it('refuses a source that renders more than one thing', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:22:11', to: 'src/Cards.tsx:18:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('an expression and text')
    expect(read(root)).toBe(PAGE)
  })

  it('refuses a source that renders an element, pointing at the inner one', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:21:11', to: 'src/Cards.tsx:18:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('<b>, not a value')
  })

  it('refuses a source that renders nothing', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:19:11', to: 'src/Cards.tsx:18:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('renders nothing')
  })

  it('refuses a destination holding elements rather than text', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:21:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('contains <b>')
    expect(read(root)).toBe(PAGE)
  })

  it('refuses a destination that cannot hold text at all', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:20:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('<img> cannot hold text')
  })

  it('refuses a drag between files, naming both', () => {
    const root = repo()
    const r = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Aside.tsx:2:10' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('src/Cards.tsx')
    expect(r.error).toContain('src/Aside.tsx')
    expect(r.error).toMatch(/prop/)
    expect(read(root, 'src/Aside.tsx')).toBe(OTHER)
  })

  it('says nothing changed when the destination already renders that', () => {
    const root = repo()
    // <footer> and <span> both render the same em dash
    const r = moveData(root, { from: 'src/Cards.tsx:25:7', to: 'src/Cards.tsx:18:11' })
    expect(r.ok).toBe(true)
    expect(r.change).toMatch(/no change/)
    expect(read(root)).toBe(PAGE)
  })

  it('refuses the same element, a stale stamp, a bad stamp and an escape', () => {
    const root = repo()
    expect(moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:17:11' }).error)
      .toMatch(/same element/)
    expect(moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:99:1' }).error)
      .toMatch(/stale stamp/)
    expect(moveData(root, { from: 'src/Cards.tsx:900:1', to: 'src/Cards.tsx:18:11' }).error)
      .toMatch(/stale stamp/)
    expect(moveData(root, { from: 'nonsense', to: 'src/Cards.tsx:18:11' }).error)
      .toMatch(/bad source location/)
    expect(moveData(root, { from: '../outside.tsx:1:1', to: '../outside.tsx:2:1' }).error)
      .toMatch(/escapes/)
    expect(read(root)).toBe(PAGE)
  })

  it('leaves the file parseable and everything else untouched', () => {
    const root = repo()
    expect(moveData(root, { from: 'src/Cards.tsx:16:11', to: 'src/Cards.tsx:18:11' }).ok).toBe(true)
    const page = read(root)
    for (const kept of [
      'export default function Cards()',
      'export function Other()',
      '<img className="pic" src="/x.png" />',
      '<div className="wrap"><b>bold</b></div>',
      '<p className="mixed">{s.value} vs last month</p>',
    ]) {
      expect(page).toContain(kept)
    }
    // a second drag onto the same destination replaces the first copy
    const again = moveData(root, { from: 'src/Cards.tsx:17:11', to: 'src/Cards.tsx:18:11' })
    expect(again.change).toContain('replaced “{s.label}”')
  })
})

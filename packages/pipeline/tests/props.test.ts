import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { firstJsxStamp, readComponentProps, setPropValue, type PropSpec } from '../src/props.js'

// ── a small app whose components are typed the way real ones are ────────────

const CARD = `import type { ReactNode } from 'react'

type Tone = 'light' | 'dark'

export default function Card({ title, count, open, tone, children, onPick, rows }: {
  title: string
  count?: number
  open: boolean
  tone: Tone
  children: ReactNode
  onPick: (id: string) => void
  rows?: string[]
}) {
  return (
    <section className="card" data-tone={tone}>
      <h3>{title}</h3>
      <span>{count ?? 0}</span>
      {children}
    </section>
  )
}
`

const STAT = `import type { Ref } from '../types'

interface Base {
  id: string
}

export interface StatProps extends Base {
  label: string
  value: number
  trend?: 'up' | 'down'
  meta?: Ref
}

export function Stat(props: StatProps) {
  return <div className="stat">{props.label}</div>
}
`

const PANEL = `import type { FC } from 'react'

interface PanelProps {
  heading: string
  dense?: boolean
}

export const Panel: FC<PanelProps> = ({ heading, dense }) => (
  <aside className="panel" data-dense={dense}>{heading}</aside>
)
`

const IMPORTED = `import type { Ref } from '../types'

export default function Badge({ href, label }: Ref & { label: string }) {
  return <a className="badge" href={href}>{label}</a>
}

export function Linky(props: Ref) {
  return <a className="linky" href={props.href}>x</a>
}
`

const UNTYPED = `export default function Untyped({ label, count }) {
  return <b className="untyped">{label}{count}</b>
}
`

const PLAIN = `export default function Plain() {
  return <hr className="plain" />
}
`

// a component the file never exports, rendering rows for the one it does
const LIST = `export default function List() {
  return (
    <ul className="list">
      <Row label="a" wide />
      <Row label="b" />
    </ul>
  )
}

function Row({ label, wide }: { label: string; wide: boolean }) {
  return <li className="row">{label}</li>
}
`

// its own local Card: same name, different component — must never be edited
const DECOY = `function Card({ title }: { title: string }) {
  return <b>{title}</b>
}

export default function Decoy() {
  return <Card title="decoy" />
}
`

const APP = `import Card from './components/Card'
import { Stat } from './components/Stat'
import { Panel } from './components/Panel'

const heading = 'Team'

export default function App() {
  return (
    <main className="app">
      <Card title="Overview" count={3} open tone="light" onPick={() => {}}>
        <p>one</p>
      </Card>
      <Card title={heading} tone="dark" open={false} onPick={() => {}} {...extra}>
        <p>two</p>
      </Card>
      <Stat id="u" label="Users" value={12} />
      <Panel heading="Hi" dense />
    </main>
  )
}
`

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-props-'))
  mkdirSync(join(root, 'src/components'), { recursive: true })
  writeFileSync(join(root, 'src/types.ts'), 'export interface Ref { href: string }\n')
  writeFileSync(join(root, 'src/App.tsx'), APP)
  writeFileSync(join(root, 'src/List.tsx'), LIST)
  writeFileSync(join(root, 'src/Decoy.tsx'), DECOY)
  writeFileSync(join(root, 'src/components/Card.tsx'), CARD)
  writeFileSync(join(root, 'src/components/Stat.tsx'), STAT)
  writeFileSync(join(root, 'src/components/Panel.tsx'), PANEL)
  writeFileSync(join(root, 'src/components/Imported.tsx'), IMPORTED)
  writeFileSync(join(root, 'src/components/Untyped.tsx'), UNTYPED)
  writeFileSync(join(root, 'src/components/Plain.tsx'), PLAIN)
  return root
}

const read = (root: string, f: string) => readFileSync(join(root, f), 'utf8')
const byName = (props: PropSpec[] | undefined, name: string): PropSpec => {
  const p = props?.find((x) => x.name === name)
  if (!p) throw new Error(`no prop ${name} in ${JSON.stringify(props?.map((x) => x.name))}`)
  return p
}

// the <section> and <h3> inside Card, and the <li> inside Row
const CARD_SECTION = 'src/components/Card.tsx:15:5'
const CARD_H3 = 'src/components/Card.tsx:16:7'
const ROW_LI = 'src/List.tsx:11:10'
// call sites
const CARD_1 = 'src/App.tsx:10:7'
const CARD_2 = 'src/App.tsx:13:7'
const STAT_1 = 'src/App.tsx:16:7'
const PANEL_1 = 'src/App.tsx:17:7'
const ROW_1 = 'src/List.tsx:4:7'

describe('reading a props panel off the types', () => {
  it('maps each primitive type to the control it asks for', () => {
    const r = readComponentProps(repo(), CARD_SECTION)
    expect(r.ok).toBe(true)
    expect(r.component).toBe('Card')
    expect(r.file).toBe('src/components/Card.tsx')

    expect(byName(r.props, 'title')).toMatchObject({ kind: 'string', required: true, editable: true, typeText: 'string' })
    expect(byName(r.props, 'count')).toMatchObject({ kind: 'number', required: false, editable: true })
    expect(byName(r.props, 'open')).toMatchObject({ kind: 'boolean', required: true, editable: true })
  })

  it('turns a union of string literals into a dropdown, following a local alias', () => {
    const r = readComponentProps(repo(), CARD_SECTION)
    expect(byName(r.props, 'tone')).toMatchObject({
      kind: 'enum', options: ['light', 'dark'], required: true, editable: true, typeText: 'Tone',
    })
  })

  it('greys what no control can honestly represent, and says why', () => {
    const r = readComponentProps(repo(), CARD_SECTION)
    const children = byName(r.props, 'children')
    expect(children.editable).toBe(false)
    expect(children.why).toMatch(/markup/)
    const onPick = byName(r.props, 'onPick')
    expect(onPick.editable).toBe(false)
    expect(onPick.why).toMatch(/callback/)
    const rows = byName(r.props, 'rows')
    expect(rows.editable).toBe(false)
    expect(rows.why).toMatch(/list/)
  })

  it('resolves the element to the component that renders it, not the exported one', () => {
    const r = readComponentProps(repo(), ROW_LI)
    expect(r.component).toBe('Row')
    expect(r.props?.map((p) => p.name)).toEqual(['label', 'wide'])
    // and finds the uses of Row, which live in the same file
    expect(r.callSites?.map((c) => c.loc)).toEqual([ROW_1, 'src/List.tsx:5:7'])
  })

  it('walks out through a .map() callback, which is not a component', () => {
    const root = repo()
    writeFileSync(
      join(root, 'src/Grid.tsx'),
      `const cells = ['a', 'b']

export default function Grid({ dense }: { dense?: boolean }) {
  return (
    <div className="grid" data-dense={dense}>
      {cells.map((c) => (
        <span key={c} className="cell">{c}</span>
      ))}
    </div>
  )
}
`,
    )
    const r = readComponentProps(root, 'src/Grid.tsx:7:9')
    expect(r.component).toBe('Grid')
    expect(byName(r.props, 'dense')).toMatchObject({ kind: 'boolean', required: false, editable: true })
  })

  it('reads an interface declared in the same file, including a local base', () => {
    const r = readComponentProps(repo(), 'src/components/Stat.tsx:15:10')
    expect(r.component).toBe('Stat')
    expect(byName(r.props, 'label').kind).toBe('string')
    expect(byName(r.props, 'value').kind).toBe('number')
    expect(byName(r.props, 'trend')).toMatchObject({ kind: 'enum', options: ['up', 'down'], required: false })
    // inherited from `interface Base`, which this file declares
    expect(byName(r.props, 'id')).toMatchObject({ kind: 'string', required: true })
    // meta: Ref is imported — named, but not editable, with the reason
    expect(byName(r.props, 'meta')).toMatchObject({ editable: false })
    expect(byName(r.props, 'meta').why).toMatch(/imported from '\.\.\/types'/)
  })

  it('reads a React.FC type argument, where the type sits on the variable', () => {
    const r = readComponentProps(repo(), 'src/components/Panel.tsx:9:3')
    expect(r.component).toBe('Panel')
    expect(byName(r.props, 'heading').kind).toBe('string')
    expect(byName(r.props, 'dense')).toMatchObject({ kind: 'boolean', required: false })
  })

  it('marks props it cannot read rather than pretending, when the type is imported', () => {
    const root = repo()
    const badge = readComponentProps(root, 'src/components/Imported.tsx:4:10')
    expect(badge.component).toBe('Badge')
    expect(byName(badge.props, 'label').kind).toBe('string')
    // href really is a prop — it just comes from a type this file can't see
    const href = byName(badge.props, 'href')
    expect(href.editable).toBe(false)
    expect(href.why).toMatch(/Ref is imported from '\.\.\/types'/)

    // nothing destructured, nothing readable: say so in a note, list no props
    const linky = readComponentProps(root, 'src/components/Imported.tsx:8:10')
    expect(linky.component).toBe('Linky')
    expect(linky.props).toEqual([])
    expect(linky.notes?.join(' ')).toMatch(/Ref is imported from '\.\.\/types'/)
  })

  it('names untyped props but offers no control, pointing at the fix', () => {
    const r = readComponentProps(repo(), 'src/components/Untyped.tsx:2:10')
    expect(r.ok).toBe(true)
    expect(r.props?.map((p) => p.name)).toEqual(['label', 'count'])
    expect(r.props?.every((p) => !p.editable)).toBe(true)
    expect(byName(r.props, 'label').why).toMatch(/no declared type/)
  })

  it('a component with no props, used nowhere, is not an error', () => {
    const r = readComponentProps(repo(), 'src/components/Plain.tsx:2:10')
    expect(r).toMatchObject({ ok: true, component: 'Plain', props: [], callSites: [] })
  })

  it('reports every call site with its literal values and its wiring', () => {
    const r = readComponentProps(repo(), CARD_SECTION)
    expect(r.callSites?.map((c) => c.loc)).toEqual([CARD_1, CARD_2])
    const [first, second] = r.callSites!
    expect(first!.values).toEqual({ title: 'Overview', count: '3', open: 'true', tone: 'light' })
    expect(first!.expressions).toEqual(['onPick'])
    // title is wired, and a spread can supply anything at all
    expect(second!.values).toEqual({ tone: 'dark', open: 'false' })
    expect(second!.expressions).toEqual(['title', 'onPick', '...extra'])
  })

  it('never mistakes another file’s same-named component for this one', () => {
    const r = readComponentProps(repo(), CARD_SECTION)
    expect(r.callSites?.some((c) => c.loc.startsWith('src/Decoy.tsx'))).toBe(false)
    // and the decoy's own Card sees only its own use
    const d = readComponentProps(repo(), 'src/Decoy.tsx:2:10')
    expect(d.component).toBe('Card')
    expect(d.callSites?.map((c) => c.loc)).toEqual(['src/Decoy.tsx:6:10'])
  })

  it('refuses a stale stamp, a bad location and an escape attempt', () => {
    const root = repo()
    expect(readComponentProps(root, 'src/App.tsx:99:1').error).toMatch(/stale stamp/)
    expect(readComponentProps(root, 'not-a-location').error).toMatch(/bad srcLoc/)
    expect(readComponentProps(root, '../outside.tsx:1:1').error).toMatch(/escapes/)
  })

  it('refuses an element that no component encloses', () => {
    const root = repo()
    writeFileSync(join(root, 'src/loose.tsx'), 'export const bit = <em className="loose">x</em>\n')
    const r = readComponentProps(root, 'src/loose.tsx:1:20')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/isn't inside a component/)
  })
})

describe('writing one value back at a call site', () => {
  it('replaces a string literal, keeping the quotes the file used', () => {
    const root = repo()
    const r = setPropValue(root, { callSite: CARD_1, name: 'title', value: 'Team' })
    expect(r).toMatchObject({ ok: true, file: 'src/App.tsx', change: 'title: "Overview" → "Team"' })
    expect(read(root, 'src/App.tsx')).toContain('<Card title="Team" count={3}')
  })

  it('writes numbers as expressions, never as strings', () => {
    const root = repo()
    expect(setPropValue(root, { callSite: CARD_1, name: 'count', value: 8 }).change).toBe('count: 3 → 8')
    expect(read(root, 'src/App.tsx')).toContain('count={8}')
    // a panel posts strings; a number prop still gets a number
    setPropValue(root, { callSite: STAT_1, name: 'value', value: '20' })
    expect(read(root, 'src/App.tsx')).toContain('value={20}')
  })

  it('writes booleans in JSX’s own idiom: bare for true, ={false} for false', () => {
    const root = repo()
    expect(setPropValue(root, { callSite: CARD_1, name: 'open', value: false }).change).toBe('open: true → false')
    expect(read(root, 'src/App.tsx')).toContain('<Card title="Overview" count={3} open={false}')
    expect(setPropValue(root, { callSite: CARD_2, name: 'open', value: 'true' }).change).toBe('open: false → true')
    expect(read(root, 'src/App.tsx')).toMatch(/<Card title=\{heading\} tone="dark" open onPick/)
  })

  it('adds an attribute that isn’t there yet', () => {
    const root = repo()
    const r = setPropValue(root, { callSite: CARD_2, name: 'count', value: 7 })
    expect(r.change).toBe('count: none → 7')
    expect(read(root, 'src/App.tsx')).toContain('<Card count={7} title={heading}')
  })

  it('edits an inherited prop, and a prop of a locally-declared component', () => {
    const root = repo()
    expect(setPropValue(root, { callSite: STAT_1, name: 'id', value: 'v' }).ok).toBe(true)
    expect(read(root, 'src/App.tsx')).toContain('<Stat id="v"')
    expect(setPropValue(root, { callSite: ROW_1, name: 'wide', value: false }).ok).toBe(true)
    expect(read(root, 'src/List.tsx')).toContain('<Row label="a" wide={false} />')
  })

  it('edits through a React.FC component too', () => {
    const root = repo()
    expect(setPropValue(root, { callSite: PANEL_1, name: 'heading', value: 'Yo' }).ok).toBe(true)
    expect(read(root, 'src/App.tsx')).toContain('<Panel heading="Yo" dense />')
  })

  it('reports a no-op as a no-op instead of rewriting the file', () => {
    const root = repo()
    const before = read(root, 'src/App.tsx')
    const r = setPropValue(root, { callSite: CARD_1, name: 'tone', value: 'light' })
    expect(r.ok).toBe(true)
    expect(r.change).toMatch(/no change/)
    expect(read(root, 'src/App.tsx')).toBe(before)
  })

  it('refuses to overwrite an attribute that is wired to an expression', () => {
    const root = repo()
    const before = read(root, 'src/App.tsx')
    const r = setPropValue(root, { callSite: CARD_2, name: 'title', value: 'Team' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('title is wired to an expression here (title={heading})')
    expect(r.error).toMatch(/drop that wiring/)
    expect(r.error).toMatch(/replace the expression with a literal in source/)
    expect(read(root, 'src/App.tsx')).toBe(before)
  })

  it('refuses a value the declared type rules out, naming what is allowed', () => {
    const root = repo()
    const before = read(root, 'src/App.tsx')
    expect(setPropValue(root, { callSite: CARD_1, name: 'count', value: 'wide' }).error)
      .toBe('"wide" isn\'t a number — count is declared number')
    expect(setPropValue(root, { callSite: CARD_1, name: 'tone', value: 'blue' }).error)
      .toBe('"blue" isn\'t one of tone\'s values — use one of: light, dark')
    expect(setPropValue(root, { callSite: CARD_1, name: 'open', value: 'maybe' }).error)
      .toMatch(/isn't true or false/)
    expect(read(root, 'src/App.tsx')).toBe(before)
  })

  it('refuses a prop the component doesn’t have, and one no control can set', () => {
    const root = repo()
    const before = read(root, 'src/App.tsx')
    expect(setPropValue(root, { callSite: CARD_1, name: 'titel', value: 'x' }).error)
      .toMatch(/<Card> has no prop called titel — it declares title, count, open, tone, children, onPick, rows/)
    const kids = setPropValue(root, { callSite: CARD_1, name: 'children', value: 'hi' })
    expect(kids.ok).toBe(false)
    expect(kids.error).toMatch(/children isn't editable from the panel: it holds markup/)
    expect(read(root, 'src/App.tsx')).toBe(before)
  })

  it('refuses a stale call site, a bad one, an escape and a nonsense name', () => {
    const root = repo()
    expect(setPropValue(root, { callSite: 'src/App.tsx:99:1', name: 'title', value: 'x' }).error)
      .toMatch(/stale stamp/)
    expect(setPropValue(root, { callSite: 'nope', name: 'title', value: 'x' }).error).toMatch(/bad call site/)
    expect(setPropValue(root, { callSite: '../out.tsx:1:1', name: 'title', value: 'x' }).error).toMatch(/escapes/)
    expect(setPropValue(root, { callSite: CARD_1, name: 'not a name', value: 'x' }).error)
      .toMatch(/isn't a usable prop name/)
  })

  it('a written value comes back out of the reader, and the file still parses', () => {
    const root = repo()
    setPropValue(root, { callSite: CARD_1, name: 'tone', value: 'dark' })
    setPropValue(root, { callSite: CARD_1, name: 'count', value: 41 })
    const r = readComponentProps(root, CARD_SECTION)
    expect(r.ok).toBe(true)
    const site = r.callSites?.find((c) => c.loc === CARD_1)
    expect(site?.values).toMatchObject({ tone: 'dark', count: '41' })
    // an h3 in the same component resolves to the same panel
    expect(readComponentProps(root, CARD_H3).component).toBe('Card')
  })

  it('handles a value carrying quotes without breaking the file', () => {
    const root = repo()
    const r = setPropValue(root, { callSite: CARD_1, name: 'title', value: `the "big" one` })
    expect(r.ok).toBe(true)
    expect(read(root, 'src/App.tsx')).toContain(`title='the "big" one'`)
    const back = readComponentProps(root, CARD_SECTION)
    expect(back.callSites?.find((c) => c.loc === CARD_1)?.values.title).toBe('the "big" one')
  })
})

describe('finding a component from its file alone', () => {
  it('points at the first element the file renders, not at line 1', () => {
    const dir = mkdtempSync(join(tmpdir(), 's2c-stamp-'))
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFileSync(join(dir, 'src/Card.tsx'), [
      "import { useState } from 'react'",
      '',
      'export default function Card() {',
      '  return (',
      '    <section className="a">',
      '      <p>hi</p>',
      '    </section>',
      '  )',
      '}',
      '',
    ].join('\n'))
    // line 5, column 5 — the <section>, which is what a click on the page
    // would have produced, and what readComponentProps can resolve
    const stamp = firstJsxStamp(dir, 'src/Card.tsx')
    expect(stamp).toBe('src/Card.tsx:5:5')
    expect(readComponentProps(dir, stamp!).component).toBe('Card')
  })

  it('has nothing to point at in a file that renders nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 's2c-stamp2-'))
    writeFileSync(join(dir, 'util.ts'), 'export const add = (a: number, b: number) => a + b\n')
    expect(firstJsxStamp(dir, 'util.ts')).toBeNull()
    expect(firstJsxStamp(dir, 'missing.tsx')).toBeNull()
    expect(firstJsxStamp(dir, '../escape.tsx')).toBeNull()
  })
})

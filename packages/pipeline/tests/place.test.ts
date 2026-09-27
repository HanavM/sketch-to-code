import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from '@babel/parser'
import { ensureEntry, materialiseEntry, placeEntry } from '../src/place.js'
import type { LibraryEntry } from '../src/library-types.js'

const PLAN_SOURCE = `export default function PlanCard({ title, seats }: { title: string; seats?: number }) {
  return <article>{title} · {seats}</article>
}
`

/** The everyday entry: a default export with values it really rendered with. */
const PLAN: LibraryEntry = {
  id: 'l1',
  name: 'Plan card',
  kind: 'extracted',
  file: 'src/components/PlanCard.tsx',
  exportName: 'default',
  props: [
    { name: 'title', kind: 'string', required: true },
    { name: 'seats', kind: 'number', required: false },
    { name: 'dense', kind: 'boolean', required: false },
  ],
  defaults: { title: 'Team', seats: '12', dense: 'true' },
  portable: true,
  source: PLAN_SOURCE,
  createdAt: 1,
  usedCount: 0,
}

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({ ...PLAN, ...over })

//  1 import Badge from './components/Badge'
//  2
//  3 export default function App() {
//  4   return (
//  5     <section className="p-6">
//  6       <h2>Team</h2>
//  7       <Badge tone="ok" />
//  8     </section>
const PAGE = `import Badge from './components/Badge'

export default function App() {
  return (
    <section className="p-6">
      <h2>Team</h2>
      <Badge tone="ok" />
    </section>
  )
}
`

function repo(page = PAGE): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-place-'))
  mkdirSync(join(root, 'src/components'), { recursive: true })
  writeFileSync(join(root, 'src/App.tsx'), page)
  writeFileSync(join(root, 'src/components/PlanCard.tsx'), PLAN_SOURCE)
  writeFileSync(join(root, 'src/components/Badge.tsx'), 'export default function Badge(_: { tone: string }) { return null }\n')
  writeFileSync(join(root, 'src/components/cards.tsx'), 'export function PlanCard() { return <div /> }\n')
  return root
}

const read = (root: string, f: string): string => readFileSync(join(root, f), 'utf8')
const parses = (src: string): boolean => {
  try {
    parse(src, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
    return true
  } catch {
    return false
  }
}
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

describe('placing a library entry', () => {
  it('writes a call site with its recorded values and one import', () => {
    const root = repo()
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    expect(r.ok).toBe(true)
    expect(r.name).toBe('PlanCard')
    expect(r.jsx).toBe('<PlanCard title="Team" seats={12} dense />')
    expect(r.imported).toBe(`import PlanCard from './components/PlanCard'`)
    expect(r.needs).toBeUndefined()

    const page = read(root, 'src/App.tsx')
    expect(page).toContain(`import PlanCard from './components/PlanCard'`)
    // last child of the section, at the same indentation as its siblings
    expect(page).toContain('      <Badge tone="ok" />\n      <PlanCard title="Team" seats={12} dense />\n    </section>')
    expect(parses(page)).toBe(true)
  })

  it('reports the call site where the element really ended up', () => {
    const root = repo()
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    // the added import pushed the JSX down one line
    expect(r.callSite).toBe('src/App.tsx:9:7')
    const line = read(root, 'src/App.tsx').split('\n')[8]!
    expect(line.slice(6)).toBe('<PlanCard title="Team" seats={12} dense />')
  })

  it('names required props it has no recorded value for, and invents nothing', () => {
    const root = repo()
    const r = placeEntry(root, {
      entry: entry({
        props: [
          { name: 'title', kind: 'string', required: true },
          { name: 'plan', kind: 'enum', options: ['free', 'pro'], required: true },
          { name: 'rows', kind: 'other', required: true },
          { name: 'note', kind: 'string', required: false },
        ],
        defaults: { title: 'Team', rows: 'items' },
      }),
      at: 'src/App.tsx:5:5',
    })
    expect(r.ok).toBe(true)
    // `plan` was never recorded; `rows` was recorded as an expression that
    // means nothing in this file
    expect(r.needs).toEqual(['plan', 'rows'])
    expect(r.jsx).toBe('<PlanCard title="Team" />')
    const page = read(root, 'src/App.tsx')
    expect(page).not.toContain('plan=')
    expect(page).not.toContain('rows=')
    expect(page).not.toContain('"Plan"')
    expect(parses(page)).toBe(true)
  })

  it('renders recorded values on their shape when the entry has no types', () => {
    const root = repo()
    const r = placeEntry(root, {
      entry: entry({ props: [], defaults: { title: 'Team', seats: '12', dense: 'true' } }),
      at: 'src/App.tsx:5:5',
    })
    expect(r.jsx).toBe('<PlanCard title="Team" seats={12} dense />')
  })

  it('quotes a value that contains a quote rather than breaking the attribute', () => {
    const root = repo()
    const r = placeEntry(root, {
      entry: entry({
        props: [{ name: 'title', kind: 'string', required: true }],
        defaults: { title: `the "best" plan` },
      }),
      at: 'src/App.tsx:5:5',
    })
    expect(r.jsx).toBe(`<PlanCard title='the "best" plan' />`)
    expect(parses(read(root, 'src/App.tsx'))).toBe(true)
  })
})

//  3 function PlanCard() {          ← a DIFFERENT PlanCard
//  7 function PlanCard2() {         ← and the obvious alias is taken too
// 13     <section className="p-6">
// 14       <PlanCard />
const COLLIDE = `import Badge from './components/Badge'

function PlanCard() {
  return <div>local</div>
}

function PlanCard2() {
  return <div>local too</div>
}

export default function App() {
  return (
    <section className="p-6">
      <PlanCard />
    </section>
  )
}
`

//  1 export const PlanCard = () => <div>local</div>
//  5     <main>
const NAMED_COLLIDE = `export const PlanCard = () => <div>local</div>

export default function App() {
  return (
    <main>
      <p>hi</p>
    </main>
  )
}
`

describe('name collisions', () => {
  it('aliases around a different local component, and around the alias too', () => {
    const root = repo(COLLIDE)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:13:5' })
    expect(r.ok).toBe(true)
    expect(r.name).toBe('PlanCard3')
    expect(r.aliased).toBe(true)
    expect(r.imported).toBe(`import PlanCard3 from './components/PlanCard'`)

    const page = read(root, 'src/App.tsx')
    expect(page).toContain('<PlanCard3 title="Team" seats={12} dense />')
    // the local components are untouched, and nothing shadows them
    expect(page).toContain('function PlanCard() {')
    expect(page).toContain('function PlanCard2() {')
    expect(page).toContain('      <PlanCard />')
    expect(countOf(page, 'import PlanCard3')).toBe(1)
    expect(parses(page)).toBe(true)
  })

  it('aliases a named import and imports it under the alias', () => {
    const root = repo(NAMED_COLLIDE)
    const r = placeEntry(root, {
      entry: entry({ file: 'src/components/cards.tsx', exportName: 'PlanCard', props: [], defaults: {} }),
      at: 'src/App.tsx:5:5',
    })
    expect(r.ok).toBe(true)
    expect(r.name).toBe('PlanCard2')
    expect(r.imported).toBe(`import { PlanCard as PlanCard2 } from './components/cards'`)
    const page = read(root, 'src/App.tsx')
    expect(page).toContain('<PlanCard2 />')
    expect(page).toContain('export const PlanCard = () => <div>local</div>')
    expect(parses(page)).toBe(true)
  })

  it('reuses an existing import of the same component instead of adding a second', () => {
    const root = repo(`import Card from './components/PlanCard'

export default function App() {
  return (
    <section>
      <Card title="Old" />
    </section>
  )
}
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    expect(r.ok).toBe(true)
    expect(r.reusedImport).toBe(true)
    expect(r.imported).toBeUndefined()
    expect(r.name).toBe('Card')

    const page = read(root, 'src/App.tsx')
    expect(countOf(page, `from './components/PlanCard'`)).toBe(1)
    expect(page).toContain('<Card title="Team" seats={12} dense />')
    expect(parses(page)).toBe(true)
  })

  it('reuses the import even when the extension was written out', () => {
    const root = repo(`import Card from './components/PlanCard.tsx'

export default function App() {
  return (
    <section>
      <Card title="Old" />
    </section>
  )
}
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    expect(r.reusedImport).toBe(true)
    expect(r.name).toBe('Card')
  })

  it('does not mistake a different export from the same file for the component', () => {
    const root = repo(`import { Footer } from './components/PlanCard'

export default function App() {
  return (
    <section>
      <Footer />
    </section>
  )
}
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    expect(r.ok).toBe(true)
    expect(r.reusedImport).toBeUndefined()
    expect(r.name).toBe('PlanCard')
    expect(read(root, 'src/App.tsx')).toContain(`import PlanCard from './components/PlanCard'`)
  })

  it('refuses to place a component inside its own file', () => {
    const root = repo()
    const r = placeEntry(root, { entry: entry(), at: 'src/components/PlanCard.tsx:2:10' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('would make it render itself')
    expect(read(root, 'src/components/PlanCard.tsx')).toBe(PLAN_SOURCE)
  })
})

//  3     <section className="relative">
//  4       <div className="absolute inset-0 pointer-events-none" />
//  5       <img src="/a.png" />
const LAYERED = `export default function App() {
  return (
    <section className="relative">
      <div className="absolute inset-0 pointer-events-none" />
      <img src="/a.png" />
    </section>
  )
}
`

describe('where it can and cannot go', () => {
  it('refuses a target that cannot hold children, and names the fix', () => {
    const root = repo(LAYERED)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toBe(
      '<img> at src/App.tsx:5:7 is self-closing, so nothing can go inside it. ' +
      'Drop onto the container around it, or ask for it to be placed after it.',
    )
    expect(read(root, 'src/App.tsx')).toBe(LAYERED)
  })

  it('places beside that same element when asked', () => {
    const root = repo(LAYERED)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:7', where: 'after' })
    expect(r.ok).toBe(true)
    expect(r.where).toBe('after')
    const page = read(root, 'src/App.tsx')
    expect(page).toContain('      <img src="/a.png" />\n      <PlanCard title="Team" seats={12} dense />\n')
    expect(parses(page)).toBe(true)
  })

  it('refuses a click-through decoration layer', () => {
    const root = repo(LAYERED)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:4:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('click-through decoration layer')
    expect(read(root, 'src/App.tsx')).toBe(LAYERED)
  })

  it('refuses "after" when there is no slot beside the element', () => {
    const root = repo(LAYERED)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:3:5', where: 'after' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('is the outermost element in src/App.tsx, so there is no slot beside it')
    expect(read(root, 'src/App.tsx')).toBe(LAYERED)
  })

  it('refuses a component that has no children to prove it renders any', () => {
    const page = `import Shell from './components/Shell'

export default function App() {
  return (
    <Shell></Shell>
  )
}
`
    const root = repo(page)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:5:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('only appears if Shell renders children')
    expect(read(root, 'src/App.tsx')).toBe(page)
  })

  it('places into a container that has no children yet', () => {
    const root = repo(`export default function App() {
  return (
    <section className="p-6"></section>
  )
}
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:3:5' })
    expect(r.ok).toBe(true)
    expect(read(root, 'src/App.tsx')).toContain(
      '    <section className="p-6">\n      <PlanCard title="Team" seats={12} dense /></section>',
    )
    expect(parses(read(root, 'src/App.tsx'))).toBe(true)
  })

  it('refuses a stale stamp, a malformed one, and an escape attempt', () => {
    const root = repo()
    expect(placeEntry(root, { entry: entry(), at: 'src/App.tsx:99:1' }).error).toContain('stale stamp')
    expect(placeEntry(root, { entry: entry(), at: 'nonsense' }).error).toContain('bad drop location')
    expect(placeEntry(root, { entry: entry(), at: '../outside.tsx:1:1' }).error).toContain('escapes the app root')
    expect(read(root, 'src/App.tsx')).toBe(PAGE)
  })
})

/** A fresh project: no library, no components directory of the entry's shape. */
function freshRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-place-fresh-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src/App.tsx'), `export default function App() {
  return (
    <main className="p-6">
      <h1>Hi</h1>
    </main>
  )
}
`)
  return root
}

/** How a global entry arrives: portable source, and a file from another app. */
const GLOBAL = entry({
  file: 'app/ui/PlanCard.tsx',
  portable: true,
  source: PLAN_SOURCE,
  props: [{ name: 'title', kind: 'string', required: true }],
  defaults: { title: 'Team' },
})

describe('entries that are not in this project yet', () => {
  it('materialises a portable global entry and places it with a correct relative path', () => {
    const root = freshRepo()
    const r = placeEntry(root, { entry: GLOBAL, at: 'src/App.tsx:3:5' })
    expect(r.ok).toBe(true)
    expect(r.materialised).toBe('src/components/PlanCard.tsx')
    expect(read(root, 'src/components/PlanCard.tsx')).toBe(PLAN_SOURCE)

    const page = read(root, 'src/App.tsx')
    expect(page).toContain(`import PlanCard from './components/PlanCard'`)
    expect(page).toContain('<PlanCard title="Team" />')
    expect(parses(page)).toBe(true)
  })

  it('lands next to the project\'s own components when the layout matches', () => {
    const root = repo()
    const made = materialiseEntry(root, entry({ file: 'src/components/Fancy.tsx', name: 'Fancy' }))
    expect(made).toEqual({ ok: true, file: 'src/components/Fancy.tsx' })
    expect(existsSync(join(root, 'src/components/Fancy.tsx'))).toBe(true)
  })

  it('never overwrites a file that is already there', () => {
    const root = repo()
    const made = materialiseEntry(root, GLOBAL)
    expect(made.file).toBe('src/components/PlanCard2.tsx')
    // the project's own PlanCard is untouched, and the import points at the copy
    expect(read(root, 'src/components/PlanCard.tsx')).toBe(PLAN_SOURCE)
    const r = placeEntry(root, { entry: { ...GLOBAL, file: made.file! }, at: 'src/App.tsx:5:5' })
    expect(r.imported).toBe(`import PlanCard from './components/PlanCard2'`)
  })

  it('refuses a non-portable entry this project does not have', () => {
    const root = freshRepo()
    const r = placeEntry(root, {
      entry: entry({ name: 'Fancy', file: 'app/ui/Fancy.tsx', portable: false, source: undefined }),
      at: 'src/App.tsx:3:5',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toBe(
      'Fancy is not in this project (app/ui/Fancy.tsx is missing) and cannot be copied in: ' +
      'its source imports files from the project it was captured in, which this one does not have. ' +
      'Open it in that project, or capture it again from a component that stands on its own.',
    )
    expect(existsSync(join(root, 'app/ui/Fancy.tsx'))).toBe(false)
    // and the page was not touched on the way to finding that out
    expect(read(root, 'src/App.tsx')).toContain('<h1>Hi</h1>')
    expect(read(root, 'src/App.tsx')).not.toContain('Fancy')
  })

  it('refuses a portable entry whose stored source is a lie', () => {
    const root = freshRepo()
    const withRelative = materialiseEntry(root, entry({
      file: 'app/ui/Fancy.tsx',
      name: 'Fancy',
      source: `import Icon from './Icon'\nexport default function Fancy() { return <Icon /> }\n`,
    }))
    expect(withRelative.ok).toBe(false)
    expect(withRelative.error).toContain(`its source imports './Icon', which this project does not have`)
    expect(existsSync(join(root, 'src/components/Fancy.tsx'))).toBe(false)
  })

  it('ensureEntry is idempotent for an entry that is already here', () => {
    const root = repo()
    const r = ensureEntry(root, entry())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.materialised).toBeUndefined()
      expect(r.entry.file).toBe('src/components/PlanCard.tsx')
    }
  })
})

describe('every write re-parses first', () => {
  it('refuses a target file that does not parse, byte for byte', () => {
    const broken = 'export default function App() { return (<div>\n'
    const root = repo(broken)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:1:41' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('cannot parse src/App.tsx')
    expect(read(root, 'src/App.tsx')).toBe(broken)
  })

  it('refuses source that would not parse rather than writing it', () => {
    const root = freshRepo()
    const r = placeEntry(root, {
      entry: entry({ file: 'app/ui/Broken.tsx', name: 'Broken', source: 'export default function Broken( {\n' }),
      at: 'src/App.tsx:3:5',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no longer parses')
    expect(existsSync(join(root, 'src/components/Broken.tsx'))).toBe(false)
    expect(read(root, 'src/App.tsx')).not.toContain('Broken')
  })

  it('refuses a prop name that could not be written as an attribute', () => {
    const root = repo()
    const r = placeEntry(root, {
      entry: entry({ props: [{ name: 'not a name', kind: 'string', required: true }], defaults: {} }),
      at: 'src/App.tsx:5:5',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not a usable prop name')
    expect(read(root, 'src/App.tsx')).toBe(PAGE)
  })

  it('does not anchor the import on an `import` line inside a string', () => {
    // a docs page with a code sample in a template literal: a `^import` match
    // would put the new import inside the string
    const root = repo(`export default function App() {
  const sample = \`
import Badge from './Badge'
\`
  return (
    <section>{sample}</section>
  )
}
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:6:5' })
    expect(r.ok).toBe(true)
    const page = read(root, 'src/App.tsx')
    expect(page.startsWith(`import PlanCard from './components/PlanCard'\nexport default function App()`)).toBe(true)
    expect(page).toContain("\nimport Badge from './Badge'\n`")
    expect(parses(page)).toBe(true)
  })

  it('places below an import that sits under the code that uses it', () => {
    // legal, if unusual: imports hoist, so the anchor can be past the JSX
    const root = repo(`export default function App() {
  return (
    <section>
      <Badge tone="ok" />
    </section>
  )
}
import Badge from './components/Badge'
`)
    const r = placeEntry(root, { entry: entry(), at: 'src/App.tsx:3:5' })
    expect(r.ok).toBe(true)
    const page = read(root, 'src/App.tsx')
    expect(page).toContain('      <PlanCard title="Team" seats={12} dense />\n')
    expect(page.trimEnd().endsWith(`import PlanCard from './components/PlanCard'`)).toBe(true)
    expect(r.callSite).toBe('src/App.tsx:5:7')
    expect(parses(page)).toBe(true)
  })
})

import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promoteToApi } from '../src/api.js'

// Every stamp below is a literal file:line:col, exactly as the build-time
// stamper writes it: the 1-based column of the element's `<`. The numbers are
// load-bearing, so each fixture carries its own line map.

//  1 const users = [ …            11 <section>  5
//                                 12 <h2>       7
//                                 14 <article>  9
//                                 15 <p.name>  11
//                                 16 <p.role>  11
const TEAM = `const users = [
  { name: 'Ada', role: 'Engineer', seats: 3 },
  { name: 'Grace', role: 'Admiral', seats: 1 },
]

const TITLE = 'Team'

export default function Team() {
  const heading = TITLE
  return (
    <section className="team">
      <h2>{heading}</h2>
      {users.map((u) => (
        <article key={u.name} className="row">
          <p className="name">{u.name}</p>
          <p className="role">{u.role}</p>
        </article>
      ))}
    </section>
  )
}
`

/** items comes in as a prop — the literal is in whoever renders <List />. 5:9 */
const PROPS = `export default function List({ items }: { items: { id: string }[] }) {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.id}>{i.id}</li>
      ))}
    </ul>
  )
}
`

/** rows is useState. 10:9 */
const STATE = `import { useState } from 'react'

const SEED = [{ id: 'a' }]

export default function Live() {
  const [rows, setRows] = useState(SEED)
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
    </ul>
  )
}
`

/** users is an import. 7:9 */
const IMPORTED = `import { users } from './data'

export default function Imported() {
  return (
    <ul>
      {users.map((u) => (
        <li key={u.name}>{u.name}</li>
      ))}
    </ul>
  )
}
`

/** rows is computed by a call. 11:9 */
const COMPUTED = `function buildRows() {
  return [{ id: 'a' }]
}

const rows = buildRows()

export default function Computed() {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
    </ul>
  )
}
`

/** the literal reaches out to ICON three levels down. 11:9 */
const IMPURE = `const ICON = '★'

const items = [
  { label: 'One', icon: ICON },
]

export default function Impure() {
  return (
    <ul>
      {items.map((i) => (
        <li key={i.label}>{i.label}</li>
      ))}
    </ul>
  )
}
`

/** rows is a local of the component. 6:9 */
const LOCAL = `export default function Local() {
  const rows = [{ id: 'a' }]
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
    </ul>
  )
}
`

/** plans is exported, so other files read the literal. 7:9 */
const EXPORTED = `export const plans = [{ id: 'free' }]

export default function Plans() {
  return (
    <ul>
      {plans.map((p) => (
        <li key={p.id}>{p.id}</li>
      ))}
    </ul>
  )
}
`

/** an outer list with an inner one: <li> 9:9, <span> 11:13 */
const NESTED = `const rows = [
  { id: 'a', tags: ['x', 'y'] },
]

export default function Nested() {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>
          {r.tags.map((tg) => (
            <span key={tg}>{tg}</span>
          ))}
        </li>
      ))}
    </ul>
  )
}
`

/** let, not const. 7:9 */
const LOOSE = `let rows = [{ id: 'a' }]

export default function Loose() {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
    </ul>
  )
}
`

/** tabs is read by a second component too. 7:9, and Count() on line 14 */
const SHARED = `const tabs = [{ id: 'a' }]

export default function Tabs() {
  return (
    <ul>
      {tabs.map((tb) => (
        <li key={tb.id}>{tb.id}</li>
      ))}
    </ul>
  )
}

export function Count() {
  return <p>{tabs.length}</p>
}
`

/** an arrow component with no block body. 6:7 */
const ARROW = `const rows = [{ id: 'a' }]

const Arrow = () => (
  <ul>
    {rows.map((r) => (
      <li key={r.id}>{r.id}</li>
    ))}
  </ul>
)

export default Arrow
`

/** two names in one const statement. 7:9 */
const PAIR = `const rows = [{ id: 'a' }], other = 2

export default function Pair() {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>{r.id}</li>
      ))}
      <li>{other}</li>
    </ul>
  )
}
`

/** two lists in one component: alpha 10:11, beta 15:11 */
const TWO = `const alpha = [{ id: 'a' }]

const beta = [{ id: 'b' }, { id: 'c' }]

export default function Two() {
  return (
    <section>
      <ul>
        {alpha.map((a) => (
          <li key={a.id}>{a.id}</li>
        ))}
      </ul>
      <ol>
        {beta.map((b) => (
          <li key={b.id}>{b.id}</li>
        ))}
      </ol>
    </section>
  )
}
`

const FILES: Record<string, string> = {
  'src/Team.tsx': TEAM,
  'src/List.tsx': PROPS,
  'src/Live.tsx': STATE,
  'src/Imported.tsx': IMPORTED,
  'src/data.ts': `export const users = [{ name: 'Ada' }]\n`,
  'src/Computed.tsx': COMPUTED,
  'src/Impure.tsx': IMPURE,
  'src/Local.tsx': LOCAL,
  'src/Exported.tsx': EXPORTED,
  'src/Nested.tsx': NESTED,
  'src/Loose.tsx': LOOSE,
  'src/Shared.tsx': SHARED,
  'src/Arrow.tsx': ARROW,
  'src/Pair.tsx': PAIR,
  'src/Two.tsx': TWO,
}

function repo(extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-api-'))
  for (const [rel, body] of Object.entries({ ...FILES, ...extra })) {
    mkdirSync(join(root, dirname(rel)), { recursive: true })
    writeFileSync(join(root, rel), body)
  }
  return root
}
const read = (root: string, rel: string): string => readFileSync(join(root, rel), 'utf8')
const has = (root: string, rel: string): boolean => existsSync(join(root, rel))

/** A stamp for a line found by its content — for a file this has already edited. */
function stampOf(root: string, rel: string, needle: string): string {
  const lines = read(root, rel).split('\n')
  const i = lines.findIndex((l) => l.includes(needle))
  expect(i, `no line containing ${needle} in ${rel}`).toBeGreaterThan(-1)
  return `${rel}:${String(i + 1)}:${String((lines[i] as string).indexOf('<') + 1)}`
}

describe('promoting a hardcoded list into a real endpoint', () => {
  it('writes the route, writes the hook, and rewires the component', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' })
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.route).toBe('/api/users')
    expect(r.files).toEqual(['server/api/users.ts', 'src/lib/useApi.ts'])
    expect(r.from).toBe('src/Team.tsx')
    expect(r.count).toBe(2)
    expect(r.change).toContain('2 records')

    // ── the route file: the data verbatim, a typed GET, no framework ──
    const route = read(root, 'server/api/users.ts')
    expect(route).toContain(`export const users = [
  { name: 'Ada', role: 'Engineer', seats: 3 },
  { name: 'Grace', role: 'Admiral', seats: 1 },
]`)
    expect(route).toContain('export type UsersData = typeof users')
    expect(route).toContain('export function GET(): UsersData {')
    expect(route).toContain('return users')
    expect(route).not.toMatch(/^import /m)
    expect(route).toContain('src/Team.tsx')

    // ── the hook: seed first, dependency-free ──
    const hook = read(root, 'src/lib/useApi.ts')
    expect(hook).toContain('export function useApi<T>(url: string, seed: T): T {')
    expect(hook).toContain('useState<T>(seed)')
    expect(hook).toContain('await fetch(url)')
    expect(hook).toMatch(/keeping the seed/)

    // ── the component: same name rendered, literal kept as the seed ──
    const page = read(root, 'src/Team.tsx')
    expect(page).toContain("import { useApi } from './lib/useApi'")
    expect(page).toContain('const users_SEED = [')
    expect(page).toContain("  const users = useApi('/api/users', users_SEED)\n")
    // the hook call is INSIDE the component (a hook at module scope throws),
    // and it comes before the code that was already there
    expect(page).toMatch(/function Team\(\) \{\n {2}const users = useApi\(/)
    // untouched: the list still renders from `users`, by the same name
    expect(page).toContain('{users.map((u) => (')
    expect(page).toContain('<p className="name">{u.name}</p>')
    expect(page).toContain('<h2>{heading}</h2>')
  })

  it('keeps the literal in the component, byte for byte, as the seed', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'src/Team.tsx:14:9' }).ok).toBe(true)
    const page = read(root, 'src/Team.tsx')
    const literal = TEAM.slice(TEAM.indexOf('['), TEAM.indexOf(']') + 1)
    expect(page).toContain(`const users_SEED = ${literal}`)
    // and the seed is what the hook starts from, so first paint is unchanged
    expect(page).toContain("useApi('/api/users', users_SEED)")
    expect(read(root, 'server/api/users.ts')).toContain(`export const users = ${literal}`)
  })

  it('takes a route name, and kebab-cases the constant when it is not given', () => {
    const root = repo()
    const named = promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11', name: 'Team Members' })
    expect(named.ok).toBe(true)
    expect(named.route).toBe('/api/team-members')
    expect(has(root, 'server/api/team-members.ts')).toBe(true)
    expect(read(root, 'src/Team.tsx')).toContain("useApi('/api/team-members', users_SEED)")

    const other = repo()
    writeFileSync(join(other, 'src/Team.tsx'), TEAM.replace('const users', 'const recentOrders').replace('{users.map', '{recentOrders.map'))
    const auto = promoteToApi(other, { srcLoc: 'src/Team.tsx:15:11' })
    expect(auto.route).toBe('/api/recent-orders')
    expect(read(other, 'server/api/recent-orders.ts')).toContain('export const recentOrders = [')
    expect(read(other, 'src/Team.tsx')).toContain('const recentOrders_SEED = [')
  })

  it('refuses a list built by Object.values(), naming what to do instead', () => {
    const root = repo({
      'src/Cfg.tsx': `const config = { a: { id: 'a' }, b: { id: 'b' } }

export default function Cfg() {
  return (
    <ul>
      {Object.values(config).map((c) => (
        <li key={c.id}>{c.id}</li>
      ))}
    </ul>
  )
}
`,
    })
    // the map is over Object.values(config), not over a name: the identifier
    // the route would be built from is not the one being rendered
    const r = promoteToApi(root, { srcLoc: 'src/Cfg.tsx:7:9' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('`Object.values(config).map(…)`')
    expect(r.error).toMatch(/not a constant of its own/)
    expect(has(root, 'server/api/config.ts')).toBe(false)
  })

  it('does not overwrite a useApi the project already has', () => {
    const mine = `export function useApi<T>(url: string, seed: T): T {\n  return seed\n}\n`
    const root = repo({ 'src/lib/useApi.ts': mine })
    const r = promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' })
    expect(r.ok).toBe(true)
    expect(r.files).toEqual(['server/api/users.ts'])
    expect(read(root, 'src/lib/useApi.ts')).toBe(mine)
    expect(read(root, 'src/Team.tsx')).toContain("import { useApi } from './lib/useApi'")
  })

  it('refuses when an existing useApi file does not export the hook', () => {
    const root = repo({ 'src/lib/useApi.ts': `export const nothing = 1\n` })
    const r = promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('src/lib/useApi.ts already exists but does not export `useApi`')
    expect(read(root, 'src/Team.tsx')).toBe(TEAM)
    expect(has(root, 'server/api/users.ts')).toBe(false)
  })

  it('refuses a second promote of the same list, and names the route', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' }).ok).toBe(true)
    const again = promoteToApi(root, { srcLoc: stampOf(root, 'src/Team.tsx', '{u.name}') })
    expect(again.ok).toBe(false)
    expect(again.error).toContain('already comes from an endpoint')
    expect(again.error).toContain("useApi('/api/users'")
    expect(again.error).toContain('server/api/users.ts')
  })

  it('a second list in the same file reuses the import', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'src/Two.tsx:10:11' }).ok).toBe(true)
    const second = promoteToApi(root, { srcLoc: stampOf(root, 'src/Two.tsx', '{b.id}') })
    expect(second.ok).toBe(true)
    expect(second.route).toBe('/api/beta')

    const page = read(root, 'src/Two.tsx')
    // exactly one import of the hook, and both lists fetched
    expect(page.match(/import \{ useApi \}/g)).toHaveLength(1)
    expect(page).toContain("const alpha = useApi('/api/alpha', alpha_SEED)")
    expect(page).toContain("const beta = useApi('/api/beta', beta_SEED)")
    expect(page).toContain('const alpha_SEED = [{ id: \'a\' }]')
    expect(page).toContain('const beta_SEED = [{ id: \'b\' }, { id: \'c\' }]')
    expect(read(root, 'server/api/beta.ts')).toContain('export function GET(): BetaData {')
  })

  it('rewrites its own route file, but never one it did not write', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' }).ok).toBe(true)
    // undo the component edit only: the route file is still ours, for this list
    writeFileSync(join(root, 'src/Team.tsx'), TEAM)
    expect(promoteToApi(root, { srcLoc: 'src/Team.tsx:15:11' }).ok).toBe(true)

    // someone else's file at that path is not ours to take
    writeFileSync(join(root, 'server/api/alpha.ts'), `export const handwritten = true\n`)
    const clash = promoteToApi(root, { srcLoc: 'src/Two.tsx:10:11' })
    expect(clash.ok).toBe(false)
    expect(clash.error).toContain('server/api/alpha.ts already exists and was not written by this tool')
    expect(read(root, 'server/api/alpha.ts')).toBe('export const handwritten = true\n')
    expect(read(root, 'src/Two.tsx')).toBe(TWO)

    // and two different lists cannot claim one route
    const taken = promoteToApi(root, { srcLoc: 'src/Two.tsx:10:11', name: 'users' })
    expect(taken.ok).toBe(false)
    expect(taken.error).toContain('/api/users is already served')
    expect(taken.error).toContain('src/Team.tsx')
  })

  it('refuses a list that arrives as a prop, and says where the data really is', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/List.tsx:5:9' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('`items` is a prop of List')
    expect(r.error).toContain('nothing in src/List.tsx to move')
    expect(r.error).toContain('<List items={…} />')
    expect(read(root, 'src/List.tsx')).toBe(PROPS)
    expect(has(root, 'server/api/items.ts')).toBe(false)
  })

  it('refuses state, an import, a computed value and a let', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'src/Live.tsx:10:9' }).error).toMatch(/React state \(useState\)/)
    const imported = promoteToApi(root, { srcLoc: 'src/Imported.tsx:7:9' })
    expect(imported.error).toContain("imported from './data'")
    expect(imported.error).toContain('not in src/Imported.tsx')
    const computed = promoteToApi(root, { srcLoc: 'src/Computed.tsx:11:9' })
    expect(computed.error).toContain('a function call (`buildRows()`)')
    expect(computed.error).toMatch(/already literal/)
    expect(promoteToApi(root, { srcLoc: 'src/Loose.tsx:7:9' }).error).toMatch(/declared with `let`/)

    for (const f of ['src/Live.tsx', 'src/Imported.tsx', 'src/Computed.tsx', 'src/Loose.tsx']) {
      expect(read(root, f)).toBe(FILES[f])
    }
    expect(has(root, 'src/lib/useApi.ts')).toBe(false)
  })

  it('refuses a literal that is not plain data, and points at the offending value', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Impure.tsx:11:9' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('is not plain data')
    expect(r.error).toContain('the identifier `ICON`')
    expect(r.error).toContain('items[0].icon')
    expect(read(root, 'src/Impure.tsx')).toBe(IMPURE)
  })

  it('refuses a local const and an exported one, each for its own reason', () => {
    const root = repo()
    const local = promoteToApi(root, { srcLoc: 'src/Local.tsx:6:9' })
    expect(local.error).toContain('declared inside Local()')
    expect(local.error).toMatch(/module scope/)
    const exported = promoteToApi(root, { srcLoc: 'src/Exported.tsx:7:9' })
    expect(exported.error).toContain('is exported from src/Exported.tsx')
    expect(exported.error).toMatch(/stale/)
    expect(read(root, 'src/Local.tsx')).toBe(LOCAL)
    expect(read(root, 'src/Exported.tsx')).toBe(EXPORTED)
  })

  it('refuses the inner list of a nested map, and promotes the outer one', () => {
    const root = repo()
    const inner = promoteToApi(root, { srcLoc: 'src/Nested.tsx:11:13' })
    expect(inner.ok).toBe(false)
    expect(inner.error).toContain('`r.tags.map(…)`')
    expect(inner.error).toMatch(/not a constant of its own/)
    expect(read(root, 'src/Nested.tsx')).toBe(NESTED)

    // the row of the outer list is promotable, nested map and all
    const outer = promoteToApi(root, { srcLoc: 'src/Nested.tsx:9:9' })
    expect(outer.ok).toBe(true)
    expect(outer.route).toBe('/api/rows')
    const page = read(root, 'src/Nested.tsx')
    expect(page).toContain("const rows = useApi('/api/rows', rows_SEED)")
    expect(page).toContain('{r.tags.map((tg) => (')
  })

  it('refuses a list a second component also reads, naming it', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Shared.tsx:7:9' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('`tabs` is also read in Count')
    expect(r.error).toContain('line 14')
    expect(read(root, 'src/Shared.tsx')).toBe(SHARED)
  })

  it('refuses a component with no block body, and names that fix', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Arrow.tsx:6:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Arrow returns its JSX directly')
    expect(r.error).toContain('block body')
    expect(read(root, 'src/Arrow.tsx')).toBe(ARROW)
  })

  it('refuses a const that shares its statement with another name', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Pair.tsx:7:9' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('shares one `const` statement with `other`')
    expect(read(root, 'src/Pair.tsx')).toBe(PAIR)
  })

  it('refuses an element that is not in a list at all', () => {
    const root = repo()
    const r = promoteToApi(root, { srcLoc: 'src/Team.tsx:12:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not rendered by a list')
    expect(read(root, 'src/Team.tsx')).toBe(TEAM)
  })

  it('refuses a bad stamp, a stale stamp, an unreadable file and an escape', () => {
    const root = repo()
    expect(promoteToApi(root, { srcLoc: 'nonsense' }).error).toMatch(/bad source location/)
    expect(promoteToApi(root, { srcLoc: 'src/Team.tsx:900:1' }).error).toMatch(/stale stamp/)
    expect(promoteToApi(root, { srcLoc: 'src/Nope.tsx:1:1' }).error).toMatch(/cannot read/)
    expect(promoteToApi(root, { srcLoc: '../outside.tsx:1:1' }).error).toMatch(/escapes the app root/)
    writeFileSync(join(root, 'src/Broken.tsx'), 'export default function ( {{{\n')
    expect(promoteToApi(root, { srcLoc: 'src/Broken.tsx:1:1' }).error).toMatch(/cannot parse/)
    expect(read(root, 'src/Team.tsx')).toBe(TEAM)
  })

  it('refuses when the seed name is already taken', () => {
    const root = repo({ 'src/Taken.tsx': TEAM.replace("const TITLE = 'Team'", "const users_SEED = 1") })
    const r = promoteToApi(root, { srcLoc: 'src/Taken.tsx:15:11' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already declares `users_SEED`')
  })

  it('refuses when the file has its own useApi', () => {
    const root = repo({ 'src/Own.tsx': `function useApi() {\n  return 1\n}\n\n${TEAM}` })
    const r = promoteToApi(root, { srcLoc: stampOf(root, 'src/Own.tsx', '{u.name}') })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already has its own `useApi`')
  })
})

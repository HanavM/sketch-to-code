import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import { commitPlan, planStructuralEdits } from '../src/codemod.js'
import type { GroundedAction, GroundedTarget } from '../src/intent2.js'

const STAT_CARDS = `const stats = [
  { label: 'Revenue', value: '$48,210' },
  { label: 'Active users', value: '3,904' },
  { label: 'Conversion', value: '4.7%' },
]

export default function StatCards() {
  return (
    <section className="grid grid-cols-3 gap-4">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg p-5">
          <p className="text-sm">{s.label}</p>
        </div>
      ))}
    </section>
  )
}
`

const APP = `import ContactForm from './components/ContactForm'
import UserTable from './components/UserTable'

export default function App() {
  return (
    <div className="grid grid-cols-2 gap-6">
      <ContactForm />
      <UserTable />
    </div>
  )
}
`

const FORM = `export default function ContactForm() {
  return (
    <section className="rounded p-4">
      <h2>Contact</h2>
      <p>Reach us</p>
      <button>Send</button>
    </section>
  )
}
`

const TABLE = `export default function UserTable() {
  return <section className="rounded p-4">Users</section>
}
`

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-codemod-'))
  for (const [rel, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), code)
  }
  return root
}

let seq = 0
function node(srcLoc: string | null, parent: string | null, extra: Partial<DomNode> = {}): DomNode {
  return {
    id: `e${seq++}`, tag: 'div', srcLoc, text: '', classes: [], parent, depth: 0,
    rect: { x: 0, y: 0, w: 100, h: 100 },
    style: {} as DomNode['style'],
    ...extra,
  }
}

const snapshot = (nodes: DomNode[], truncated = false): DomSnapshot => ({
  nodes, truncated, url: 'http://x/', takenAt: 0,
  viewport: { w: 1280, h: 900, scrollX: 0, scrollY: 0 },
})

const target = (n: DomNode): GroundedTarget => ({
  domId: n.id, srcLoc: n.srcLoc, tag: n.tag, text: n.text, subtreeText: n.text, classes: [], rect: n.rect,
})

const action = (kind: GroundedAction['kind'], targets: DomNode[], extra: Partial<GroundedAction> = {}): GroundedAction => ({
  kind, targets: targets.map(target), instruction: '', needsConfirm: false, ...extra,
})

/** StatCards page: section → three card divs (one template) → one <p> each. */
function statPage() {
  const section = node('src/StatCards.tsx:9:5', null, { tag: 'section' })
  const cards = [0, 1, 2].map(() => node('src/StatCards.tsx:11:9', section.id))
  const labels = cards.map((c) => node('src/StatCards.tsx:12:11', c.id, { tag: 'p' }))
  return { section, cards, labels, snap: snapshot([section, ...cards.flatMap((c, k) => [c, labels[k]!])]) }
}

/** App grid: div → ContactForm root (h2, p, button) + UserTable root. */
function appPage() {
  const grid = node('src/App.tsx:6:5', null)
  const form = node('src/components/ContactForm.tsx:3:5', grid.id, { tag: 'section' })
  const h2 = node('src/components/ContactForm.tsx:4:7', form.id, { tag: 'h2', text: 'Contact' })
  const p = node('src/components/ContactForm.tsx:5:7', form.id, { tag: 'p', text: 'Reach us' })
  const button = node('src/components/ContactForm.tsx:6:7', form.id, { tag: 'button', text: 'Send' })
  const table = node('src/components/UserTable.tsx:2:10', grid.id, { tag: 'section', text: 'Users' })
  return { grid, form, h2, p, button, table, snap: snapshot([grid, form, h2, p, button, table]) }
}

const appRepo = () => repo({
  'src/App.tsx': APP,
  'src/components/ContactForm.tsx': FORM,
  'src/components/UserTable.tsx': TABLE,
})

describe('planStructuralEdits — .map() data entries', () => {
  it('deletes exactly the marked instance from the data array', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(root, [action('delete', [cards[1]!])], snap)
    expect(plan.refused).toEqual([])
    expect(plan.handled).toEqual([{ index: 0, file: 'src/StatCards.tsx', change: "removed 'stats' entry 2" }])
    expect(plan.files.get('src/StatCards.tsx')).toBe(STAT_CARDS.replace("  { label: 'Active users', value: '3,904' },\n", ''))
  })

  it('groups several deletes on one array, including the last entry', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(root, [action('delete', [cards[1]!]), action('delete', [cards[2]!])], snap)
    expect(plan.handled.map((h) => h.index)).toEqual([0, 1])
    const out = plan.files.get('src/StatCards.tsx')!
    expect(out).toContain("const stats = [\n  { label: 'Revenue', value: '$48,210' },\n]")
  })

  it('swaps two entries in place', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(root, [action('swap', [cards[2]!, cards[0]!])], snap)
    const out = plan.files.get('src/StatCards.tsx')!
    expect(out.indexOf('Conversion')).toBeLessThan(out.indexOf('Active users'))
    expect(out.indexOf('Active users')).toBeLessThan(out.indexOf('Revenue'))
    expect(out.length).toBe(STAT_CARDS.length)
  })

  it('moves an entry after a sibling', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(
      root, [action('move', [cards[0]!], { dest: target(cards[2]!), position: 'after' })], snap,
    )
    const out = plan.files.get('src/StatCards.tsx')!
    expect(out.indexOf('Active users')).toBeLessThan(out.indexOf('Conversion'))
    expect(out.indexOf('Conversion')).toBeLessThan(out.indexOf('Revenue'))
  })

  it('refuses a child of the template — it renders once per entry', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { labels, snap } = statPage()
    const plan = planStructuralEdits(root, [action('delete', [labels[0]!])], snap)
    expect(plan.handled).toEqual([])
    expect(plan.refused[0]!.reason).toContain('renders 3 times')
    expect(plan.files.size).toBe(0)
  })

  it('refuses when rendered instances do not match the array', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { section, cards } = statPage()
    const snap = snapshot([section, cards[0]!, cards[1]!])
    const plan = planStructuralEdits(root, [action('delete', [cards[0]!])], snap)
    expect(plan.refused[0]!.reason).toContain("DOM shows 2 instances but 'stats' has 3")
  })

  it('refuses everything on a truncated snapshot', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(root, [action('delete', [cards[0]!])], { ...snap, truncated: true })
    expect(plan.refused).toEqual([{ index: 0, reason: 'DOM snapshot was truncated' }])
  })

  it('refuses a .map() over a derived array', () => {
    const code = STAT_CARDS.replace('stats.map(', 'visible.map(').replace('export default', 'const visible = stats.filter(Boolean)\nexport default')
    const root = repo({ 'src/StatCards.tsx': code })
    const { section, cards } = statPage()
    const shifted = cards.map((c) => ({ ...c, srcLoc: 'src/StatCards.tsx:12:9' }))
    const plan = planStructuralEdits(root, [action('delete', [shifted[0]!])], snapshot([section, ...shifted]))
    expect(plan.refused[0]!.reason).toContain("'visible' is not a same-file array literal")
  })
})

describe('planStructuralEdits — static JSX and component call sites', () => {
  it('deletes a static child along with its line', () => {
    const root = appRepo()
    const { p, snap } = appPage()
    const plan = planStructuralEdits(root, [action('delete', [p])], snap)
    expect(plan.files.get('src/components/ContactForm.tsx')).toBe(FORM.replace('      <p>Reach us</p>\n', ''))
  })

  it('swaps two components at their call site, not inside their files', () => {
    const root = appRepo()
    const { form, table, snap } = appPage()
    const plan = planStructuralEdits(root, [action('swap', [form, table])], snap)
    expect(plan.refused).toEqual([])
    expect([...plan.files.keys()]).toEqual(['src/App.tsx'])
    expect(plan.files.get('src/App.tsx')).toContain('      <UserTable />\n      <ContactForm />\n')
  })

  it('deletes a component at its call site', () => {
    const root = appRepo()
    const { table, snap } = appPage()
    const plan = planStructuralEdits(root, [action('delete', [table])], snap)
    expect(plan.files.get('src/App.tsx')).toBe(APP.replace('      <UserTable />\n', ''))
  })

  it('refuses a call site whose component is not the stamped file', () => {
    const root = repo({
      'src/App.tsx': APP.replace("'./components/UserTable'", "'./components/Other'"),
      'src/components/ContactForm.tsx': FORM,
      'src/components/UserTable.tsx': TABLE,
    })
    const { table, snap } = appPage()
    const plan = planStructuralEdits(root, [action('delete', [table])], snap)
    expect(plan.refused[0]!.reason).toContain('is not the component in src/components/UserTable.tsx')
  })

  it('refuses a component rendered through {children}', () => {
    const root = repo({
      'src/Shell.tsx': `export default function Shell({ children }) {\n  return <main>{children}</main>\n}\n`,
      'src/components/UserTable.tsx': TABLE,
    })
    const shell = node('src/Shell.tsx:2:10', null, { tag: 'main' })
    const table = node('src/components/UserTable.tsx:2:10', shell.id, { tag: 'section' })
    const plan = planStructuralEdits(root, [action('delete', [table])], snapshot([shell, table]))
    expect(plan.refused[0]!.reason).toContain('dynamic children')
  })

  it('refuses an element without its own stamp', () => {
    const root = appRepo()
    const { grid } = appPage()
    const bare = node(null, grid.id)
    const plan = planStructuralEdits(root, [action('delete', [bare])], snapshot([grid, bare]))
    expect(plan.refused[0]!.reason).toContain('no source stamp of its own')
  })

  it('refuses a stale stamp instead of editing a neighbour', () => {
    const root = appRepo()
    const { grid } = appPage()
    const stale = node('src/components/ContactForm.tsx:40:7', grid.id)
    const plan = planStructuralEdits(root, [action('delete', [stale])], snapshot([grid, stale]))
    expect(plan.refused[0]!.reason).toContain('stale stamp')
  })
})

describe('planStructuralEdits — composition', () => {
  it('ignores creative actions entirely', () => {
    const root = appRepo()
    const { grid, p, snap } = appPage()
    const plan = planStructuralEdits(root, [
      action('add', [], { dest: target(grid) }),
      action('modify', [p], { instruction: 'make it red' }),
      action('delete', [p]),
    ], snap)
    expect(plan.handled.map((h) => h.index)).toEqual([2])
    expect(plan.refused).toEqual([])
  })

  it('hands every action in a file back when their edits overlap', () => {
    const root = appRepo()
    const { form, table, snap } = appPage()
    const plan = planStructuralEdits(root, [action('delete', [table]), action('swap', [form, table])], snap)
    expect(plan.handled).toEqual([])
    expect(plan.refused.map((r) => r.index)).toEqual([0, 1])
    expect(plan.files.size).toBe(0)
  })

  it('lands edits in different files independently', () => {
    const root = repo({
      'src/App.tsx': APP,
      'src/components/ContactForm.tsx': FORM,
      'src/components/UserTable.tsx': TABLE,
      'src/StatCards.tsx': STAT_CARDS,
    })
    const app = appPage()
    const stat = statPage()
    const snap = snapshot([...app.snap.nodes, ...stat.snap.nodes])
    const plan = planStructuralEdits(root, [action('delete', [app.button]), action('delete', [stat.cards[0]!])], snap)
    expect(plan.handled.map((h) => h.index)).toEqual([0, 1])
    commitPlan(root, plan)
    expect(readFileSync(join(root, 'src/components/ContactForm.tsx'), 'utf8')).not.toContain('<button>')
    expect(readFileSync(join(root, 'src/StatCards.tsx'), 'utf8')).not.toContain('Revenue')
  })

  it('treats a move that is already satisfied as handled without an edit', () => {
    const root = repo({ 'src/StatCards.tsx': STAT_CARDS })
    const { cards, snap } = statPage()
    const plan = planStructuralEdits(
      root, [action('move', [cards[1]!], { dest: target(cards[0]!), position: 'after' })], snap,
    )
    expect(plan.handled).toHaveLength(1)
    expect(plan.files.size).toBe(0)
  })
})

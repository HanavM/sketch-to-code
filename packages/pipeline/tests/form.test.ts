import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { makeFormReal } from '../src/form.js'

// Every stamp below is a literal file:line:col, exactly as the build-time
// stamper writes it: the 1-based column of the element's `<`. The numbers are
// load-bearing, so each fixture carries its own line map.

//  1 function ContactForm         5 <form>      7
//  3 <section>            5       8 <input>     11  (id on its own line)
//  4 <h2>                 7      16 <input>     11  (id inline, required)
//                                20 <select>    11
//                                26 <textarea>  11
//                                28 <button>    9
const CONTACT = `export default function ContactForm() {
  return (
    <section className="card">
      <h2>Invite a teammate</h2>
      <form className="mt-4 space-y-4" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="name">Name</label>
          <input
            id="name"
            type="text"
            placeholder="Ada Lovelace"
          />
        </div>
        <div>
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required />
        </div>
        <div>
          <label htmlFor="role">Role</label>
          <select id="role">
            <option>Viewer</option>
          </select>
        </div>
        <div>
          <label htmlFor="note">Note</label>
          <textarea id="note" rows={3} />
        </div>
        <button type="submit">Send invite</button>
      </form>
    </section>
  )
}
`

/** No form anywhere: <section> 3:5, <button> 5:7 */
const LOOSE = `export default function Loose() {
  return (
    <section>
      <input id="email" />
      <button type="submit">Send</button>
    </section>
  )
}
`

/** A field with neither id nor name — the 2nd <input>. <form> 3:5 */
const ANON = `export default function SignupForm() {
  return (
    <form>
      <input id="email" type="email" />
      <input type="text" placeholder="Company" />
      <button type="submit">Go</button>
    </form>
  )
}
`

/** The submit is somebody else's: <Form> is a component. <input> 5:9 */
const WRAPPED = `import { Form } from './ui/Form'

export default function Wrapped() {
  return (
    <Form action="/nowhere">
      <input id="email" />
    </Form>
  )
}
`

/** An arrow component with no block body. <form> 3:5 */
const ARROW = `const Quick = () => (
  <div>
    <form>
      <input id="email" />
    </form>
  </div>
)

export default Quick
`

/** No onSubmit at all, one attribute. <form> 3:5 */
const BARE = `export default function NoteForm() {
  return (
    <form className="stack">
      <input id="body" required />
      <input type="submit" value="Save" />
    </form>
  )
}
`

/** No attributes at all on the form. <form> 3:5 */
const NAKED = `export default function MemoForm() {
  return (
    <form>
      <textarea id="body" required />
    </form>
  )
}
`

/** Two fields fighting over one key. <form> 3:5 */
const CLASH = `export default function DupeForm() {
  return (
    <form>
      <input id="email" />
      <textarea name="email" />
    </form>
  )
}
`

/** A spread that would win over whatever onSubmit we write. <form> 3:5 */
const SPREAD = `export default function SpreadForm({ rest }: { rest: object }) {
  return (
    <form onSubmit={(e) => e.preventDefault()} {...rest}>
      <input id="email" />
    </form>
  )
}
`

/** Two forms in one component: first <form> 4:7, second 7:7 */
const TWO = `export default function Both() {
  return (
    <>
      <form>
        <input id="email" />
      </form>
      <form>
        <input id="body" />
      </form>
    </>
  )
}
`

/** The component is called Form, which says nothing about its records. */
const ANONYMOUS_NAME = `export default function Form() {
  return (
    <form>
      <input id="email" />
    </form>
  )
}
`

const FILES: Record<string, string> = {
  'src/components/ContactForm.tsx': CONTACT,
  'src/components/Loose.tsx': LOOSE,
  'src/components/SignupForm.tsx': ANON,
  'src/components/Wrapped.tsx': WRAPPED,
  'src/components/Quick.tsx': ARROW,
  'src/components/NoteForm.tsx': BARE,
  'src/components/MemoForm.tsx': NAKED,
  'src/components/DupeForm.tsx': CLASH,
  'src/components/SpreadForm.tsx': SPREAD,
  'src/components/Both.tsx': TWO,
  'src/components/Form.tsx': ANONYMOUS_NAME,
}

function repo(extra: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-form-'))
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

describe('making a form that does nothing actually save something', () => {
  it('writes the route, writes the hook, and rewires the form', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' })
    expect(r.error).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.route).toBe('server/api/contacts.ts')
    expect(r.files).toEqual(['src/components/ContactForm.tsx', 'server/api/contacts.ts', 'src/lib/useForm.ts'])
    expect(r.fields).toEqual(['name', 'email', 'role', 'note'])
    expect(r.change).toContain('POST /api/contacts')
    expect(r.change).toContain('server/data/contacts.json')

    const page = read(root, 'src/components/ContactForm.tsx')
    // ── the import, resolved from this file's own directory ──
    expect(page).toContain("import { useForm } from '../lib/useForm'")
    // ── the hook, first statement INSIDE the component (module scope throws) ──
    expect(page).toMatch(/^export default function ContactForm\(\) \{\n {2}const form = useForm\('\/api\/contacts'\)\n {2}return \(/m)
    expect(page).not.toMatch(/^const form = /m)
    // ── the handler, in place of the placeholder ──
    expect(page).toContain('<form className="mt-4 space-y-4" onSubmit={form.onSubmit}>')
    expect(page).not.toContain('e.preventDefault()')
    // ── a name on every field, derived from its id, laid out like its neighbours ──
    expect(page).toContain('          <input\n            id="name"\n            name="name"\n            type="text"\n')
    expect(page).toContain('<input id="email" name="email" type="email" required />')
    expect(page).toContain('<select id="role" name="role">')
    expect(page).toContain('<textarea id="note" name="note" rows={3} />')
    // ── one status line, as the form's last child ──
    expect(page).toContain(
      '        <button type="submit">Send invite</button>\n' +
        '        <p aria-live="polite">{form.status === \'saved\' ? \'Saved\' : form.error}</p>\n' +
        '      </form>',
    )
    // ── and nothing else touched ──
    expect(page).toContain('<h2>Invite a teammate</h2>')
    expect(page).toContain('<option>Viewer</option>')
    expect(page).toContain('<label htmlFor="role">Role</label>')
  })

  it('writes a route that reads the store with fs, never as an imported module', () => {
    const root = repo()
    expect(makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' }).ok).toBe(true)
    const route = read(root, 'server/api/contacts.ts')

    // the whole point: an imported JSON file joins Vite's module graph, so every
    // submit would hot-reload the page out from under the person submitting
    expect(route).not.toMatch(/^import .*\.json'/m)
    expect(route.match(/^import /gm)).toHaveLength(1)
    expect(route).toContain("import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'")
    expect(route).toContain("readFileSync(STORE, 'utf8')")
    expect(route).toContain('writeFileSync(STORE,')
    // and the comment that stops someone "cleaning it up" next week
    expect(route).toContain('hot-reload the page')
    expect(route).toContain("Vite's module")

    // the two halves of a store, and the fields it knows about
    expect(route).toContain('export function GET(): ContactsRecord[] {')
    expect(route).toContain('export function POST(req: unknown, body: unknown): ContactsRecord | { error: string } {')
    expect(route).toContain("export const FIELDS: readonly string[] = ['name', 'email', 'role', 'note']")
    expect(route).toContain("export const REQUIRED: readonly string[] = ['email']")
    // required is required, the rest is optional, and both are read off the JSX
    expect(route).toContain('  email: string\n')
    expect(route).toContain('  name?: string\n')
    expect(route).toContain('  note?: string\n')
    // stamped, validated, and tolerant of a store that is not there yet
    expect(route).toContain('id: Math.random().toString(36).slice(2, 10)')
    expect(route).toContain('createdAt: new Date().toISOString()')
    expect(route).toContain("return { error: 'expected a JSON object of form fields' }")
    expect(route).toContain('if (!existsSync(STORE)) return []')
    expect(route).toMatch(/} catch \{\n(?: *\/\/[^\n]*\n)* *return \[\]/)

    // lazily: nothing is on disk until something is actually submitted
    expect(has(root, 'server/data/contacts.json')).toBe(false)
  })

  it('writes the hook once, and never over one the project already has', () => {
    const first = repo()
    expect(makeFormReal(first, { srcLoc: 'src/components/ContactForm.tsx:5:7' }).ok).toBe(true)
    const hook = read(first, 'src/lib/useForm.ts')
    expect(hook).toContain('export function useForm(url: string): {')
    expect(hook).toContain('onSubmit: (e: FormEvent<HTMLFormElement>) => void')
    expect(hook).toContain("status: FormStatus")
    expect(hook).toContain("export type FormStatus = 'idle' | 'saving' | 'saved' | 'error'")
    expect(hook).toContain('e.preventDefault()')
    expect(hook).toContain('new FormData(el)')
    expect(hook).toContain("method: 'POST'")
    expect(hook).toContain('el.reset()')
    expect(hook).toContain('@generated by sketch-to-code make-this-form-real')
    // never stuck on 'saving', and never a throw
    expect(hook).toContain("setStatus('error')")
    expect(hook.match(/setStatus\('error'\)/g)).toHaveLength(2)

    // a second form in the same project reuses it byte for byte
    const second = makeFormReal(first, { srcLoc: 'src/components/NoteForm.tsx:3:5' })
    expect(second.ok).toBe(true)
    expect(second.files).toEqual(['src/components/NoteForm.tsx', 'server/api/notes.ts'])
    expect(read(first, 'src/lib/useForm.ts')).toBe(hook)

    // and a hand-written one of the same shape is left exactly alone
    const mine = `export function useForm(url: string) {\n  return { onSubmit: () => {}, status: 'idle' as const, error: null, url }\n}\n`
    const root = repo({ 'src/lib/useForm.ts': mine })
    const r = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' })
    expect(r.ok).toBe(true)
    expect(r.files).toEqual(['src/components/ContactForm.tsx', 'server/api/contacts.ts'])
    expect(read(root, 'src/lib/useForm.ts')).toBe(mine)
    expect(read(root, 'src/components/ContactForm.tsx')).toContain("import { useForm } from '../lib/useForm'")
  })

  it('refuses when an existing useForm file does not export the hook', () => {
    const root = repo({ 'src/lib/useForm.ts': `export const nothing = 1\n` })
    const r = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('src/lib/useForm.ts already exists but does not export `useForm`')
    expect(read(root, 'src/components/ContactForm.tsx')).toBe(CONTACT)
    expect(has(root, 'server/api/contacts.ts')).toBe(false)
  })

  it('finds the form from any element inside it, and from the form itself', () => {
    for (const stamp of [
      'src/components/ContactForm.tsx:5:7', // the <form>
      'src/components/ContactForm.tsx:16:11', // a text input
      'src/components/ContactForm.tsx:20:11', // the <select>
      'src/components/ContactForm.tsx:28:9', // the submit button
    ]) {
      const root = repo()
      const r = makeFormReal(root, { srcLoc: stamp })
      expect(r.error, stamp).toBeUndefined()
      expect(r.fields).toEqual(['name', 'email', 'role', 'note'])
      expect(read(root, 'src/components/ContactForm.tsx')).toContain('onSubmit={form.onSubmit}')
    }
  })

  it('adds an onSubmit when the form has none, wherever the attributes are', () => {
    const root = repo()
    const one = makeFormReal(root, { srcLoc: 'src/components/NoteForm.tsx:3:5' })
    expect(one.ok).toBe(true)
    // `<input type="submit">` is a button, not a field to store
    expect(one.fields).toEqual(['body'])
    expect(one.route).toBe('server/api/notes.ts')
    const note = read(root, 'src/components/NoteForm.tsx')
    expect(note).toContain('<form className="stack" onSubmit={form.onSubmit}>')
    expect(note).toContain('<input id="body" name="body" required />')
    expect(note).toContain('<input type="submit" value="Save" />')
    expect(read(root, 'server/api/notes.ts')).toContain("export const REQUIRED: readonly string[] = ['body']")

    const two = makeFormReal(root, { srcLoc: 'src/components/MemoForm.tsx:3:5' })
    expect(two.ok).toBe(true)
    expect(two.fields).toEqual(['body'])
    expect(read(root, 'src/components/MemoForm.tsx')).toContain('<form onSubmit={form.onSubmit}>')
  })

  it('takes a route name, and otherwise pluralises the component', () => {
    const root = repo()
    const named = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7', name: 'Team Invites' })
    expect(named.ok).toBe(true)
    expect(named.route).toBe('server/api/team-invites.ts')
    expect(read(root, 'src/components/ContactForm.tsx')).toContain("useForm('/api/team-invites')")

    // 'SignupForm' → 'signup' → 'signups', and 'NoteForm' → 'notes'
    expect(makeFormReal(repo(), { srcLoc: 'src/components/NoteForm.tsx:3:5' }).route).toBe('server/api/notes.ts')
    const entry = repo({ 'src/components/EntryForm.tsx': CONTACT.replace(/ContactForm/g, 'EntryForm') })
    expect(makeFormReal(entry, { srcLoc: 'src/components/EntryForm.tsx:5:7' }).route).toBe('server/api/entries.ts')
    const already = repo({ 'src/components/InvitesForm.tsx': CONTACT.replace(/ContactForm/g, 'InvitesForm') })
    expect(makeFormReal(already, { srcLoc: 'src/components/InvitesForm.tsx:5:7' }).route).toBe('server/api/invites.ts')
  })

  it('refuses a name it cannot derive, and a name it cannot use', () => {
    const root = repo()
    const nameless = makeFormReal(root, { srcLoc: 'src/components/Form.tsx:3:5' })
    expect(nameless.ok).toBe(false)
    expect(nameless.error).toContain('Form does not say what one of its records is called')
    expect(nameless.error).toContain("'invites'")

    const bad = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7', name: '2fa codes' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('does not make a usable route name')
    expect(read(root, 'src/components/ContactForm.tsx')).toBe(CONTACT)
    expect(has(root, 'server/api/contacts.ts')).toBe(false)
  })

  it('refuses a route name that is already taken, ours or not', () => {
    const root = repo({ 'server/api/contacts.ts': `export const handwritten = true\n` })
    const clash = makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' })
    expect(clash.ok).toBe(false)
    expect(clash.error).toContain('server/api/contacts.ts already exists and was not written by this tool')
    expect(read(root, 'server/api/contacts.ts')).toBe('export const handwritten = true\n')
    expect(read(root, 'src/components/ContactForm.tsx')).toBe(CONTACT)

    // one of ours is not fair game either: there may be records behind it
    const mine = repo()
    expect(makeFormReal(mine, { srcLoc: 'src/components/ContactForm.tsx:5:7' }).ok).toBe(true)
    const route = read(mine, 'server/api/contacts.ts')
    const other = makeFormReal(mine, { srcLoc: 'src/components/NoteForm.tsx:3:5', name: 'contacts' })
    expect(other.ok).toBe(false)
    expect(other.error).toContain('this tool wrote it for a form already')
    expect(other.error).toContain('server/data/contacts.json')
    expect(read(mine, 'server/api/contacts.ts')).toBe(route)
    expect(read(mine, 'src/components/NoteForm.tsx')).toBe(BARE)
  })

  it('refuses a second pass over a form it has already made real', () => {
    const root = repo()
    expect(makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:5:7' }).ok).toBe(true)
    const edited = read(root, 'src/components/ContactForm.tsx')
    const again = makeFormReal(root, { srcLoc: stampOf(root, 'src/components/ContactForm.tsx', '<form ') })
    expect(again.ok).toBe(false)
    expect(again.error).toContain('that form is already real')
    expect(again.error).toContain('/api/contacts')
    expect(again.error).toContain('server/api/contacts.ts')
    expect(read(root, 'src/components/ContactForm.tsx')).toBe(edited)
  })

  it('refuses an element that is not in a form at all', () => {
    const root = repo()
    const section = makeFormReal(root, { srcLoc: 'src/components/Loose.tsx:3:5' })
    expect(section.ok).toBe(false)
    expect(section.error).toContain('not inside a <form>')
    expect(section.error).toContain('Wrap the fields in a <form>')
    const button = makeFormReal(root, { srcLoc: 'src/components/Loose.tsx:5:7' })
    expect(button.error).toContain('not inside a <form>')
    expect(read(root, 'src/components/Loose.tsx')).toBe(LOOSE)
    expect(has(root, 'src/lib/useForm.ts')).toBe(false)
  })

  it('refuses a component that only looks like a form', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/Wrapped.tsx:6:7' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('inside <Form>, which is a component rather than a real <form>')
    expect(read(root, 'src/components/Wrapped.tsx')).toBe(WRAPPED)
  })

  it('refuses a field it cannot name, and says which one', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/SignupForm.tsx:3:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('the 2nd <input> in that form has neither an `id` nor a `name`')
    expect(r.error).toContain('name="something"')
    expect(read(root, 'src/components/SignupForm.tsx')).toBe(ANON)
    expect(has(root, 'server/api/signups.ts')).toBe(false)

    // a computed name is just as unknowable
    const dyn = repo({
      'src/components/DynForm.tsx': ANON.replace('<input type="text" placeholder="Company" />', '<input name={key} />'),
    })
    const computed = makeFormReal(dyn, { srcLoc: 'src/components/DynForm.tsx:3:5' })
    expect(computed.ok).toBe(false)
    expect(computed.error).toContain('the 2nd <input> in that form has a computed name')
  })

  it('refuses two fields that would share one key', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/DupeForm.tsx:3:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('both called "email"')
    expect(r.error).toContain('the 1st <textarea>')
    expect(read(root, 'src/components/DupeForm.tsx')).toBe(CLASH)
  })

  it('refuses a form with no fields in it', () => {
    const root = repo({
      'src/components/EmptyForm.tsx': `export default function EmptyForm() {
  return (
    <form>
      <button type="submit">Send</button>
    </form>
  )
}
`,
    })
    const r = makeFormReal(root, { srcLoc: 'src/components/EmptyForm.tsx:3:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('has no fields in it')
    expect(has(root, 'server/api/empties.ts')).toBe(false)
  })

  it('refuses a spread that would swallow the submit handler', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/SpreadForm.tsx:3:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('spread after its `onSubmit`')
    expect(read(root, 'src/components/SpreadForm.tsx')).toBe(SPREAD)
  })

  it('refuses a component with no block body, and names that fix', () => {
    const root = repo()
    const r = makeFormReal(root, { srcLoc: 'src/components/Quick.tsx:3:5' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Quick returns its JSX directly')
    expect(r.error).toContain('block body')
    expect(read(root, 'src/components/Quick.tsx')).toBe(ARROW)
  })

  it('handles a second form in the same component without shadowing the first', () => {
    const root = repo()
    expect(makeFormReal(root, { srcLoc: 'src/components/Both.tsx:4:7' }).ok).toBe(true)
    const second = makeFormReal(root, {
      srcLoc: stampOf(root, 'src/components/Both.tsx', 'id="body"'),
      name: 'bodies',
    })
    expect(second.error).toBeUndefined()
    expect(second.ok).toBe(true)

    const page = read(root, 'src/components/Both.tsx')
    expect(page.match(/import \{ useForm \}/g)).toHaveLength(1)
    expect(page).toContain("const form = useForm('/api/boths')")
    expect(page).toContain("const bodiesForm = useForm('/api/bodies')")
    expect(page).toContain('<form onSubmit={form.onSubmit}>')
    expect(page).toContain('<form onSubmit={bodiesForm.onSubmit}>')
    expect(page).toContain("{bodiesForm.status === 'saved' ? 'Saved' : bodiesForm.error}")
  })

  it('refuses when the file has its own useForm', () => {
    const root = repo({ 'src/components/Own.tsx': `function useForm() {\n  return 1\n}\n\n${CONTACT}` })
    const r = makeFormReal(root, { srcLoc: stampOf(root, 'src/components/Own.tsx', '<form ') })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('already has its own `useForm`')
  })

  it('refuses a bad stamp, a stale stamp, an unreadable file and an escape', () => {
    const root = repo()
    expect(makeFormReal(root, { srcLoc: 'nonsense' }).error).toMatch(/bad source location/)
    expect(makeFormReal(root, { srcLoc: 'src/components/ContactForm.tsx:900:1' }).error).toMatch(/stale stamp/)
    expect(makeFormReal(root, { srcLoc: 'src/components/Nope.tsx:1:1' }).error).toMatch(/cannot read/)
    expect(makeFormReal(root, { srcLoc: '../outside.tsx:1:1' }).error).toMatch(/escapes the app root/)
    writeFileSync(join(root, 'src/components/Broken.tsx'), 'export default function ( {{{\n')
    expect(makeFormReal(root, { srcLoc: 'src/components/Broken.tsx:1:1' }).error).toMatch(/cannot parse/)
    expect(read(root, 'src/components/ContactForm.tsx')).toBe(CONTACT)
  })
})

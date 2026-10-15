import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  bumpUsed, captureEntry, entrySignature, entryThumbPath, findEntry, globalLibraryDir,
  libraryDir, libraryIndexPath, listEntries, matchScore, pruneLibrary, removeEntry,
  searchLibrary, signatureSimilarity, staleReason,
} from '../src/library.js'
import { shapeFromStrokes, shapeSignature } from '../src/shape-signature.js'

/**
 * A project is just files on disk here: nothing in the store needs git, and
 * every refusal it can produce comes from what a source file says.
 */
function project(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 's2c-lib-'))
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, body)
  }
  return root
}

/** A 1x1 PNG, as a browser hands it over. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const PNG_URL = `data:image/png;base64,${PNG_B64}`

const PORTABLE = `import { useState } from 'react'
import clsx from 'clsx'

type Tone = 'light' | 'dark'

const TONES: Record<Tone, string> = { light: 'bg-white', dark: 'bg-slate-900' }

const UNUSED = 'nobody references this'

export function Badge({ tone }: { tone: Tone }) {
  const [on, setOn] = useState(false)
  return <span className={clsx(TONES[tone], on && 'ring')} onClick={() => setOn(!on)}>hi</span>
}
`

const LOCAL = `import { Icon } from './Icon'

export default function Chip() {
  return <span><Icon /> chip</span>
}
`

/**
 * The global library lives under the user's home, so EVERY test points it at a
 * temp directory first. Without this a test run would write entries into the
 * person running it — which is exactly the accident the store is designed to
 * survive, and not one worth demonstrating on someone's laptop.
 */
let home: string
const realXdg = process.env.XDG_DATA_HOME

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 's2c-home-'))
  process.env.XDG_DATA_HOME = home
})

afterEach(() => {
  // a read-only home is one of the cases under test; put it back so the OS can
  // clean the directory up afterwards
  try {
    chmodSync(home, 0o700)
  } catch {
    // already gone, or never made unwritable
  }
  if (realXdg === undefined) delete process.env.XDG_DATA_HOME
  else process.env.XDG_DATA_HOME = realXdg
})

describe('capturing a component', () => {
  it('stores a pointer at the file, and the thumbnail as a real PNG beside the index', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const r = captureEntry(root, {
      file: 'src/Badge.tsx',
      exportName: 'Badge',
      kind: 'drawn',
      thumbnail: PNG_URL,
      props: [{ name: 'tone', kind: 'enum', options: ['light', 'dark'], required: true }],
      defaults: { tone: 'dark' },
    })
    expect(r.error).toBeUndefined()
    const e = r.entry!
    expect(e.file).toBe('src/Badge.tsx')
    expect(e.exportName).toBe('Badge')
    expect(e.name).toBe('Badge')
    expect(e.usedCount).toBe(0)
    expect(e.defaults).toEqual({ tone: 'dark' })
    expect(e.props).toEqual([{ name: 'tone', kind: 'enum', options: ['light', 'dark'], required: true }])

    expect(e.thumb).toBe(`${e.id}.png`)
    const png = readFileSync(entryThumbPath(libraryDir(root), e.id))
    expect(png.subarray(0, 4).toString('latin1')).toBe('\x89PNG')

    const index = readFileSync(libraryIndexPath(root), 'utf8')
    expect(index).not.toContain(PNG_B64)
    expect(libraryIndexPath(root)).toBe(join(root, '.sketch2code/library/index.json'))
  })

  it('names the default export after its declaration, not the file', () => {
    const root = project({ 'src/Chip.tsx': LOCAL })
    const e = captureEntry(root, { file: 'src/Chip.tsx', kind: 'extracted' }).entry!
    expect(e.exportName).toBe('default')
    expect(e.name).toBe('Chip')
  })

  it('refuses an export the file does not have, and says what it does have', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const r = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Missing', kind: 'scanned' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('doesn\'t export "Missing"')
    expect(r.error).toContain('"Badge"')
    expect(existsSync(libraryIndexPath(root))).toBe(false)
  })

  it('refuses a default export that is not there, pointing at the named ones', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const r = captureEntry(root, { file: 'src/Badge.tsx', kind: 'scanned' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('has no default export')
    expect(r.error).toContain('"Badge"')
  })

  it('refuses a file that does not parse', () => {
    const root = project({ 'src/Broken.tsx': 'export function Broken() { return <div> }\n' })
    const r = captureEntry(root, { file: 'src/Broken.tsx', exportName: 'Broken', kind: 'drawn' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("doesn't parse")
    expect(r.error).toContain('fix the syntax error')
  })

  it('refuses a name that is only re-exported, because there is no declaration to store', () => {
    const root = project({
      'src/index.ts': "export { Badge } from './Badge'\nexport { default } from './Badge'\n",
      'src/Badge.tsx': PORTABLE,
    })
    const named = captureEntry(root, { file: 'src/index.ts', exportName: 'Badge', kind: 'scanned' })
    expect(named.ok).toBe(false)
    expect(named.error).toContain('re-exports "Badge"')
    expect(named.error).toContain('the file that declares it')

    const dflt = captureEntry(root, { file: 'src/index.ts', kind: 'scanned' })
    expect(dflt.ok).toBe(false)
    expect(dflt.error).toContain('re-exports its default')
  })

  it('refuses an export that is not a component at all', () => {
    const root = project({ 'src/consts.ts': 'export const SIZE = 12\n' })
    const r = captureEntry(root, { file: 'src/consts.ts', exportName: 'SIZE', kind: 'scanned' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain("isn't a component")
  })

  it('refuses a missing file and a file outside the project', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    expect(captureEntry(root, { file: 'src/Nope.tsx', kind: 'drawn' }).error)
      .toContain('no readable file at src/Nope.tsx')
    expect(captureEntry(root, { file: '../elsewhere/X.tsx', kind: 'drawn' }).error)
      .toContain('outside this project')
  })

  it('refuses a thumbnail that is not a PNG, and writes nothing at all', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const jpeg = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn',
      thumbnail: 'data:image/jpeg;base64,/9j/4AAQ',
    })
    expect(jpeg.ok).toBe(false)
    expect(jpeg.error).toContain('image/jpeg')

    const junk = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', thumbnail: 'not-an-image',
    })
    expect(junk.error).toContain("isn't a PNG")
    expect(listEntries(root)).toEqual([])
  })

  it('refuses a kind it does not know', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const r = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge',
      kind: 'invented' as unknown as 'drawn',
    })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not a kind of entry')
  })
})

describe('the same component, captured again', () => {
  it('updates one row instead of adding a second, keeping the id and the use count', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const first = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', thumbnail: PNG_URL,
    }).entry!
    bumpUsed(root, first.id)
    bumpUsed(root, first.id)

    const again = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'scanned', name: 'Tone badge',
      props: [{ name: 'tone', kind: 'enum', required: false }],
    }).entry!

    expect(again.id).toBe(first.id)
    expect(again.usedCount).toBe(2)
    expect(again.createdAt).toBe(first.createdAt)
    expect(again.name).toBe('Tone badge')
    expect(again.kind).toBe('scanned')
    expect(again.props).toHaveLength(1)
    // a capture with no new picture must not blank the one that was there
    expect(again.thumb).toBe(`${first.id}.png`)
    expect(listEntries(root).filter((e) => e.home === 'project')).toHaveLength(1)
  })

  it('keeps a different export of the same file as its own entry', () => {
    const root = project({
      'src/two.tsx': 'export function A() { return <i /> }\nexport function B() { return <b /> }\n',
    })
    captureEntry(root, { file: 'src/two.tsx', exportName: 'A', kind: 'scanned' })
    captureEntry(root, { file: 'src/two.tsx', exportName: 'B', kind: 'scanned' })
    expect(listEntries(root).filter((e) => e.home === 'project').map((e) => e.name).sort())
      .toEqual(['A', 'B'])
  })
})

describe('portability', () => {
  it('is false when the component pulls in a relative import', () => {
    const root = project({ 'src/Chip.tsx': LOCAL, 'src/Icon.tsx': 'export const Icon = () => <i />\n' })
    const e = captureEntry(root, { file: 'src/Chip.tsx', kind: 'extracted' }).entry!
    expect(e.portable).toBe(false)
    expect(e.source).toBeUndefined()
    // nothing local ever reaches the global library
    expect(listEntries(root).filter((x) => x.home === 'global')).toEqual([])
  })

  it('is true when only packages are imported, and stores source that stands alone', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const e = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' }).entry!
    expect(e.portable).toBe(true)
    const src = e.source!
    expect(src).toContain("import { useState } from 'react'")
    expect(src).toContain("import clsx from 'clsx'")
    expect(src).toContain("type Tone = 'light' | 'dark'")
    expect(src).toContain('const TONES')
    expect(src).toContain('export function Badge')
    // only what the component references: a sibling constant is not its business
    expect(src).not.toContain('UNUSED')
  })

  it('appends an export when the declaration itself did not carry one', () => {
    const root = project({
      'src/Late.tsx': 'function Late() { return <hr /> }\n\nexport default Late\n',
    })
    const e = captureEntry(root, { file: 'src/Late.tsx', kind: 'drawn' }).entry!
    expect(e.portable).toBe(true)
    expect(e.source).toContain('function Late()')
    expect(e.source).toContain('export default Late')
  })
})

describe('signatures', () => {
  it('prefers the ink signature the caller hands over', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const ink = [0.25, 0.25, 0.25, 0.25]
    const e = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', signature: ink,
    }).entry!
    expect(e.signature).toEqual(ink)
  })

  it('takes a shape from the caller, and has none otherwise — even with SVG in the file', () => {
    const root = project({
      'src/Blob.tsx':
        'export default function Blob() {\n' +
        '  return <svg viewBox="0 0 10 10"><path d="M1,1 L9,1 L9,9 Z" /></svg>\n' +
        '}\n',
    })
    // It used to derive one from the source. That is deliberately gone: a
    // composition grid is normalised into each shape's own box, so it is not
    // comparable with the letterboxed descriptor the search uses, and two
    // formats in one field made a wide row and a tall form score 0.99 against
    // each other. No shape means "cannot be found by drawing at it", which the
    // panel says out loud.
    expect(captureEntry(root, { file: 'src/Blob.tsx', kind: 'drawn' }).entry!.signature)
      .toBeUndefined()

    const drawn = shapeSignature([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }]])!
    const e = captureEntry(root, {
      file: 'src/Blob.tsx', kind: 'drawn', signature: drawn.grid, aspect: drawn.aspect,
    }).entry!
    expect(e.signature!.some((n) => n > 0)).toBe(true)
    expect(e.aspect).toBeCloseTo(10 / 8, 5)
  })

  it('leaves the signature absent rather than storing a row of zeros', () => {
    const root = project({ 'src/Plain.tsx': 'export default function Plain() { return <p>hi</p> }\n' })
    const e = captureEntry(root, { file: 'src/Plain.tsx', kind: 'scanned' }).entry!
    expect(e.signature).toBeUndefined()
  })

  it('reports a near-identical entry without blocking the capture', () => {
    const root = project({
      'src/Alpha.tsx': 'export default function Alpha() { return <p>a</p> }\n',
      'src/Beta.tsx': 'export default function Beta() { return <p>b</p> }\n',
      'src/Gamma.tsx': 'export default function Gamma() { return <p>g</p> }\n',
    })
    const shape = [0.3, 0.3, 0.2, 0.2]
    const alpha = captureEntry(root, { file: 'src/Alpha.tsx', kind: 'drawn', signature: shape })
    expect(alpha.duplicateOf).toBeUndefined()

    const beta = captureEntry(root, {
      file: 'src/Beta.tsx', kind: 'drawn', signature: [0.31, 0.29, 0.2, 0.2],
    })
    expect(beta.ok).toBe(true)
    expect(beta.entry!.name).toBe('Beta')
    expect(beta.duplicateOf!.name).toBe('Alpha')

    const gamma = captureEntry(root, { file: 'src/Gamma.tsx', kind: 'drawn', signature: [1, 0, 0, 0] })
    expect(gamma.duplicateOf).toBeUndefined()

    // re-capturing Alpha is never a resemblance to itself — though Beta, which
    // genuinely does look like it, is still worth mentioning
    const twice = captureEntry(root, { file: 'src/Alpha.tsx', kind: 'drawn', signature: shape })
    expect(twice.entry!.id).toBe(alpha.entry!.id)
    expect(twice.duplicateOf!.name).toBe('Beta')
  })

  it('scores identical vectors 1 and mismatched lengths 0', () => {
    expect(signatureSimilarity([0.5, 0.5], [0.5, 0.5])).toBe(1)
    expect(signatureSimilarity([0.5, 0.5], [0.5])).toBe(0)
    expect(signatureSimilarity([1, 0], [0, 1])).toBe(0)
  })
})

describe('the library that follows the user', () => {
  it('mirrors a portable entry, thumbnail and all, and reads it back in another project', () => {
    const a = project({ 'src/Badge.tsx': PORTABLE })
    const e = captureEntry(a, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', thumbnail: PNG_URL,
    }).entry!

    expect(existsSync(entryThumbPath(globalLibraryDir(), e.id))).toBe(true)
    expect(globalLibraryDir()).toBe(join(home, 'sketch2code/library'))

    const b = project({ 'src/other.tsx': 'export default function Other() { return <i /> }\n' })
    const listed = listEntries(b)
    expect(listed).toHaveLength(1)
    expect(listed[0]!.home).toBe('global')
    expect(listed[0]!.name).toBe('Badge')
    expect(listed[0]!.source).toContain('export function Badge')
    expect(listed[0]!.alreadyHere).toBeUndefined()
    expect(findEntry(b, e.id)!.home).toBe('global')
  })

  it('marks a global entry already here when this project has the same name', () => {
    const a = project({ 'src/Badge.tsx': PORTABLE })
    captureEntry(a, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' })
    const rows = listEntries(a)
    expect(rows.map((r) => r.home).sort()).toEqual(['global', 'project'])
    expect(rows.find((r) => r.home === 'global')!.alreadyHere).toBe(true)
    expect(rows.find((r) => r.home === 'project')!.alreadyHere).toBeUndefined()
  })

  it('keeps the global library to one entry per name, newest winning', () => {
    const a = project({ 'src/Badge.tsx': PORTABLE })
    captureEntry(a, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' })
    const b = project({ 'app/Badge.tsx': PORTABLE })
    captureEntry(b, { file: 'app/Badge.tsx', exportName: 'Badge', kind: 'drawn' })

    const global = listEntries(b).filter((r) => r.home === 'global')
    expect(global).toHaveLength(1)
    expect(global[0]!.file).toBe('app/Badge.tsx')
  })

  it('degrades to project-only with a note when the home directory cannot be written', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    chmodSync(home, 0o500)
    const r = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' })

    expect(r.ok).toBe(true)
    expect(r.entry!.portable).toBe(true)
    expect(r.note).toContain('global')
    expect(r.note).toContain('writable')
    // the capture itself is intact
    expect(listEntries(root).map((e) => e.home)).toEqual(['project'])
  })

  it('survives a global library that does not exist yet', () => {
    process.env.XDG_DATA_HOME = join(home, 'never', 'made')
    const root = project({ 'src/Chip.tsx': LOCAL })
    expect(listEntries(root)).toEqual([])
    expect(captureEntry(root, { file: 'src/Chip.tsx', kind: 'drawn' }).ok).toBe(true)
    expect(pruneLibrary(root).removed).toEqual([])
  })
})

describe('an index that has been hand-edited into nonsense', () => {
  it('drops the bad rows instead of taking the panel down', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const good = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', thumbnail: PNG_URL,
    }).entry!

    const rows = JSON.parse(readFileSync(libraryIndexPath(root), 'utf8')) as unknown[]
    writeFileSync(libraryIndexPath(root), JSON.stringify([
      ...rows,
      null,
      'a string',
      { name: 'no id' },
      { ...(rows[0] as object), id: '../../etc/passwd' },
      { ...(rows[0] as object), id: 'ok1', file: '../outside.tsx' },
      { ...(rows[0] as object), id: 'ok2', kind: 'invented' },
      { ...(rows[0] as object), id: 'ok3', thumb: 'somebody-elses.png' },
      { ...(rows[0] as object), id: good.id, name: 'a duplicate id' },
    ]))

    const listed = listEntries(root).filter((e) => e.home === 'project')
    expect(listed).toHaveLength(2)
    expect(listed.map((e) => e.id).sort()).toEqual([good.id, 'ok3'].sort())
    // a thumb that is not ours is not served, and never becomes a delete target
    expect(listed.find((e) => e.id === 'ok3')!.thumb).toBeUndefined()

    writeFileSync(libraryIndexPath(root), '{ not even json')
    expect(listEntries(root).filter((e) => e.home === 'project')).toEqual([])
    expect(pruneLibrary(root, 1).removed).toEqual([])
    expect(removeEntry(root, 'lgone')).toEqual({ ok: true, removed: false })
  })
})

describe('forgetting an entry', () => {
  it('deletes the row and the thumbnail, and never the component', () => {
    const root = project({ 'src/Chip.tsx': LOCAL })
    const e = captureEntry(root, { file: 'src/Chip.tsx', kind: 'drawn', thumbnail: PNG_URL }).entry!
    const thumb = entryThumbPath(libraryDir(root), e.id)
    expect(existsSync(thumb)).toBe(true)

    expect(removeEntry(root, e.id)).toEqual({ ok: true, removed: true })
    expect(existsSync(thumb)).toBe(false)
    expect(listEntries(root)).toEqual([])
    // the whole point: an entry is a pointer, not the code
    expect(existsSync(join(root, 'src/Chip.tsx'))).toBe(true)
    expect(readFileSync(join(root, 'src/Chip.tsx'), 'utf8')).toBe(LOCAL)
  })

  it('takes the project copy first, leaving the one that follows the user', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const e = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn', thumbnail: PNG_URL,
    }).entry!

    expect(removeEntry(root, e.id).removed).toBe(true)
    expect(listEntries(root).map((x) => x.home)).toEqual(['global'])
    expect(existsSync(entryThumbPath(globalLibraryDir(), e.id))).toBe(true)

    expect(removeEntry(root, e.id, { home: 'global' }).removed).toBe(true)
    expect(listEntries(root)).toEqual([])
    expect(existsSync(entryThumbPath(globalLibraryDir(), e.id))).toBe(false)
  })

  it('says nothing was removed rather than inventing an error, but refuses a bad id', () => {
    const root = project({ 'src/Chip.tsx': LOCAL })
    expect(removeEntry(root, 'lnothing')).toEqual({ ok: true, removed: false })
    const bad = removeEntry(root, '../../etc/passwd')
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain("isn't a library id")
  })
})

describe('counting placements', () => {
  it('bumps both homes, and ignores an id it has never seen', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const e = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' }).entry!
    bumpUsed(root, e.id)
    bumpUsed(root, e.id)
    bumpUsed(root, 'lnever')
    for (const row of listEntries(root)) expect(row.usedCount).toBe(2)
  })
})

describe('staying bounded', () => {
  it('drops the least-used entries and deletes their thumbnails', () => {
    const root = project({
      'src/One.tsx': "import './a.css'\nexport default function One() { return <p>1</p> }\n",
      'src/Two.tsx': "import './a.css'\nexport default function Two() { return <p>2</p> }\n",
      'src/Three.tsx': "import './a.css'\nexport default function Three() { return <p>3</p> }\n",
      'src/a.css': 'p{}\n',
    })
    const one = captureEntry(root, { file: 'src/One.tsx', kind: 'drawn', thumbnail: PNG_URL }).entry!
    const two = captureEntry(root, { file: 'src/Two.tsx', kind: 'drawn', thumbnail: PNG_URL }).entry!
    const three = captureEntry(root, { file: 'src/Three.tsx', kind: 'drawn', thumbnail: PNG_URL }).entry!
    // One has been placed; a library keeps what gets used, not what is newest
    bumpUsed(root, one.id)

    const { removed } = pruneLibrary(root, 2)
    expect(removed).toEqual([two.id])
    expect(listEntries(root).map((e) => e.id).sort()).toEqual([one.id, three.id].sort())
    expect(existsSync(entryThumbPath(libraryDir(root), two.id))).toBe(false)
    expect(existsSync(entryThumbPath(libraryDir(root), one.id))).toBe(true)
    expect(existsSync(entryThumbPath(libraryDir(root), three.id))).toBe(true)
  })

  it('never prunes away the entry that was just captured', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    // a library already at its ceiling, every row more used than a new one can be
    const full = Array.from({ length: 200 }, (_, i) => ({
      id: `lfull${String(i)}`,
      name: `Full ${String(i)}`,
      kind: 'scanned',
      file: `src/Full${String(i)}.tsx`,
      exportName: 'default',
      props: [],
      defaults: {},
      portable: false,
      createdAt: 1_000 + i,
      usedCount: 5,
    }))
    mkdirSync(libraryDir(root), { recursive: true })
    writeFileSync(libraryIndexPath(root), JSON.stringify(full))

    const e = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' }).entry!
    // read the index itself: these rows point at files that were never written,
    // so listEntries would (rightly) hide them as stale
    const ids = (JSON.parse(readFileSync(libraryIndexPath(root), 'utf8')) as { id: string }[]).map((r) => r.id)
    expect(ids).toHaveLength(200)
    expect(ids).toContain(e.id)
    // the oldest of the equally-used rows is the one that went
    expect(ids).not.toContain('lfull0')
  })
})

describe('the global library never turns out to be the project one', () => {
  it('does not list a project entry twice when there is no usable home', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' })

    // The trap: a relative fallback for "no global directory" resolves against
    // the process CWD, and a dev server's CWD is the app itself — so the
    // project's own library became its own global mirror and every entry came
    // back twice. Reproduced by making the two paths coincide.
    const old = process.env.XDG_DATA_HOME
    try {
      process.env.XDG_DATA_HOME = root
      const listed = listEntries(root)
      expect(listed.filter((e) => e.name === 'Badge')).toHaveLength(1)
      expect(listed.every((e) => e.home === 'project')).toBe(true)
    } finally {
      if (old === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = old
    }
  })

  it('mirrors to a real global directory when it has one, and reads it back', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const home = mkdtempSync(join(tmpdir(), 's2c-home-'))
    const old = process.env.XDG_DATA_HOME
    try {
      process.env.XDG_DATA_HOME = home
      const cap = captureEntry(root, { file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn' })
      expect(cap.ok).toBe(true)
      expect(cap.entry!.portable).toBe(true)
      expect(existsSync(join(home, 'sketch2code/library/index.json'))).toBe(true)

      const listed = listEntries(root)
      expect(listed.filter((e) => e.home === 'global')).toHaveLength(1)
      // the same thing in both places is ONE thing, and the listing says so
      expect(listed.find((e) => e.home === 'global')!.alreadyHere).toBe(true)
    } finally {
      if (old === undefined) delete process.env.XDG_DATA_HOME
      else process.env.XDG_DATA_HOME = old
      rmSync(home, { recursive: true, force: true })
    }
  })
})

describe('searching the library by drawing at it', () => {
  const box = (x: number, y: number, w: number, h: number) =>
    [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }, { x, y }]
  const bar = (x: number, y: number, w: number) => [{ x, y }, { x: x + w, y }]
  const stroke = (pts: { x: number; y: number }[]) =>
    ({ id: 's', color: null, points: pts.map((p, i) => ({ ...p, t: i })) })

  /** How the page reports a component: the outlines of its boxes and its text. */
  const CARD = shapeSignature([box(0, 0, 300, 120), bar(20, 30, 140), bar(20, 70, 90)])!
  const NAV = shapeSignature([
    box(0, 0, 600, 40), bar(30, 20, 60), bar(120, 20, 60), bar(210, 20, 60),
  ])!

  it('ranks the card-shaped component first, by a margin worth ranking on', () => {
    const sketch = shapeFromStrokes([
      stroke(box(5, 3, 290, 118)), stroke(bar(25, 33, 130)), stroke(bar(22, 68, 95)),
    ])!
    const sk = { signature: sketch.grid }
    const card = matchScore(sk, { signature: CARD.grid })
    const nav = matchScore(sk, { signature: NAV.grid })
    // an order of magnitude, not a few points: proportion lives inside the grid,
    // so a 2.5:1 card and a 15:1 row do not resemble each other at all
    expect(card).toBeGreaterThan(0.8)
    expect(nav).toBeLessThan(0.3)
  })

  it('ranks the other way for a wide, short sketch — same library', () => {
    const wide = shapeFromStrokes([
      stroke(box(2, 1, 596, 38)), stroke(bar(32, 21, 56)), stroke(bar(122, 19, 58)),
      stroke(bar(208, 20, 62)),
    ])!
    const sk = { signature: wide.grid }
    expect(matchScore(sk, { signature: NAV.grid }))
      .toBeGreaterThan(matchScore(sk, { signature: CARD.grid }))
  })

  it('matches the same shape at a different size, which is the part that must keep working', () => {
    const small = shapeFromStrokes([stroke(box(0, 0, 150, 60)), stroke(bar(10, 15, 70))])!
    const big = shapeSignature([box(0, 0, 600, 240), bar(40, 60, 280)])!
    expect(matchScore({ signature: small.grid }, { signature: big.grid })).toBeGreaterThan(0.8)
  })

  it('scores an entry with no signature at zero, and still lists it', () => {
    const root = project({ 'src/Chip.tsx': LOCAL })
    // Chip is the file's DEFAULT export, so no exportName — and it renders a
    // <span> with a component inside, i.e. no SVG geometry for a signature to
    // come from, which is the case this test is about
    const cap = captureEntry(root, { file: 'src/Chip.tsx', kind: 'extracted' })
    expect(cap.ok).toBe(true)
    expect(cap.entry!.signature).toBeUndefined()
    const sketch = shapeFromStrokes([stroke(box(0, 0, 100, 50))])!
    const hits = searchLibrary(root, { signature: sketch.grid })
    // listed, not hidden: a component of plain divs whose page never supplied
    // outlines genuinely cannot be matched by shape, and dropping it from the
    // panel would look like the library had lost it
    expect(hits).toHaveLength(1)
    expect(hits[0]!.score).toBe(0)
  })

  it('remembers the proportions it was captured with', () => {
    const root = project({ 'src/Badge.tsx': PORTABLE })
    const sketch = shapeFromStrokes([stroke(box(0, 0, 300, 120))])!
    const cap = captureEntry(root, {
      file: 'src/Badge.tsx', exportName: 'Badge', kind: 'drawn',
      signature: sketch.grid, aspect: sketch.aspect,
    })
    expect(cap.entry!.aspect).toBeCloseTo(2.5, 1)
    expect(listEntries(root)[0]!.aspect).toBeCloseTo(2.5, 1)
  })
})

describe('an entry whose code is gone (the library outlives git clean)', () => {
  // .sketch2code/ is gitignored, so the index survives the files it points at
  const card = `export function Card() {\n  return <div className="card">card</div>\n}\n`
  const grid = Array.from({ length: 16 }, (_, i) => (i % 3 === 0 ? 1 : 0))

  it('hides a row whose file was deleted, from list, find and search alike', () => {
    const root = project({ 'src/Card.tsx': card, 'src/Keep.tsx': PORTABLE.replace(/Badge/g, 'Keep') })
    const gone = captureEntry(root, { file: 'src/Card.tsx', exportName: 'Card', kind: 'drawn', signature: grid })
    const kept = captureEntry(root, { file: 'src/Keep.tsx', exportName: 'Keep', kind: 'drawn', signature: grid })
    expect(gone.ok && kept.ok).toBe(true)
    // what `git clean -fd` does to a component a run created
    rmSync(join(root, 'src/Card.tsx'))

    const project_ = listEntries(root).filter((e) => e.home === 'project')
    expect(project_.map((e) => e.name)).toEqual(['Keep'])
    // placement goes through findEntry: the stale project row cannot be placed
    const found = findEntry(root, gone.entry!.id)
    expect(found?.home).not.toBe('project')
    expect(searchLibrary(root, { signature: grid }).some((m) => m.entry.home === 'project' && m.entry.name === 'Card')).toBe(false)
    expect(staleReason(root, gone.entry!)).toContain('no longer exists')
  })

  it('hides a row whose file no longer exports the component', () => {
    const root = project({ 'src/Card.tsx': card })
    const r = captureEntry(root, { file: 'src/Card.tsx', exportName: 'Card', kind: 'drawn' })
    expect(r.ok).toBe(true)
    writeFileSync(join(root, 'src/Card.tsx'), `export function Panel() {\n  return <div>panel</div>\n}\n`)
    expect(listEntries(root).filter((e) => e.home === 'project')).toEqual([])
    expect(staleReason(root, r.entry!)).toContain('Card')
  })

  it('does not delete the row: when the file comes back, so does the entry and its use count', () => {
    const root = project({ 'src/Card.tsx': card })
    const r = captureEntry(root, { file: 'src/Card.tsx', exportName: 'Card', kind: 'drawn' })
    bumpUsed(root, r.entry!.id)
    rmSync(join(root, 'src/Card.tsx'))
    expect(listEntries(root).some((e) => e.home === 'project')).toBe(false)
    expect(existsSync(libraryIndexPath(root))).toBe(true)
    writeFileSync(join(root, 'src/Card.tsx'), card)
    const back = listEntries(root).find((e) => e.home === 'project')
    expect(back?.id).toBe(r.entry!.id)
    expect(back?.usedCount).toBe(1)
  })

  it('treats a file that is mid-edit (does not parse) as live rather than flickering', () => {
    const root = project({ 'src/Card.tsx': card })
    const r = captureEntry(root, { file: 'src/Card.tsx', exportName: 'Card', kind: 'drawn' })
    writeFileSync(join(root, 'src/Card.tsx'), `export function Card() {\n  return <div className=\n`)
    expect(staleReason(root, r.entry!)).toBeUndefined()
    expect(listEntries(root).some((e) => e.id === r.entry!.id)).toBe(true)
  })

  it('does not offer a stale project row as "you drew this before"', () => {
    // a relative import keeps it out of the global library, which carries its
    // own source and is not checked against this project's files
    const local = `import './card.css'\n${card}`
    const root = project({ 'src/Card.tsx': local, 'src/Card2.tsx': local.replace('Card()', 'Card2()') })
    const first = captureEntry(root, { file: 'src/Card.tsx', exportName: 'Card', kind: 'drawn', signature: grid })
    expect(first.ok).toBe(true)
    rmSync(join(root, 'src/Card.tsx'))
    const second = captureEntry(root, { file: 'src/Card2.tsx', exportName: 'Card2', kind: 'drawn', signature: grid })
    expect(second.ok).toBe(true)
    expect(second.duplicateOf).toBeUndefined()
  })
})

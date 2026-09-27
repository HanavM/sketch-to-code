import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  diffVersions, historyIndexPath, listVersions, recordVersion, restoreVersion, type Version,
} from '../src/history.js'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

/**
 * A real repo with a committed file and a nested app dir, like the demo app.
 *
 * `ignoreState` is the interesting axis: this repo gitignores `.sketch2code/`,
 * but a user's project may not, and then the timeline's own index is an
 * untracked file sitting in the path of every revert. Both shapes are tested.
 */
function repo(ignoreState = false) {
  const root = mkdtempSync(join(tmpdir(), 's2c-hist-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 't@example.com')
  git(root, 'config', 'user.name', 'T')
  mkdirSync(join(root, 'app/src'), { recursive: true })
  writeFileSync(join(root, 'app/src/Existing.tsx'), 'export const a = 1\n')
  if (ignoreState) writeFileSync(join(root, '.gitignore'), '.sketch2code/\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'init')
  return { root, app: join(root, 'app') }
}

/** A 1x1 PNG, as a browser would hand it over. */
const PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='
const PNG_URL = `data:image/png;base64,${PNG_B64}`

/** Record and insist it worked, so a test failure points at the real problem. */
function record(app: string, label: string, thumbnail?: string): Version {
  const r = recordVersion(app, { label, thumbnail })
  expect(r.error).toBeUndefined()
  expect(r.entry, `expected "${label}" to be recorded, not skipped`).toBeTruthy()
  return r.entry!
}

describe('recording a moment', () => {
  it('stores the thumbnail as a file, not as base64 in the index', () => {
    const { app } = repo()
    const v = record(app, 'first look', PNG_URL)

    expect(v.thumb).toBe(`.sketch2code/history/${v.id}.png`)
    const png = readFileSync(join(app, v.thumb!))
    expect(png.subarray(0, 4).toString('latin1')).toBe('\x89PNG')

    const index = readFileSync(historyIndexPath(app), 'utf8')
    expect(index).not.toContain(PNG_B64)
    expect(listVersions(app).map((e) => e.label)).toEqual(['first look'])
  })

  it('accepts bare base64 as well as a data URL', () => {
    const { app } = repo()
    const v = record(app, 'bare', PNG_B64)
    expect(existsSync(join(app, v.thumb!))).toBe(true)
  })

  it('records with no thumbnail at all', () => {
    const { app } = repo()
    expect(record(app, 'no picture').thumb).toBeUndefined()
  })

  it('refuses a thumbnail that is not a PNG', () => {
    const { app } = repo()
    const jpeg = recordVersion(app, { label: 'x', thumbnail: 'data:image/jpeg;base64,/9j/4AAQ' })
    expect(jpeg.ok).toBe(false)
    expect(jpeg.error).toContain('image/jpeg')
    const junk = recordVersion(app, { label: 'x', thumbnail: 'not-an-image-at-all' })
    expect(junk.ok).toBe(false)
    expect(junk.error).toContain("isn't a PNG")
    // a refused thumbnail must not have half-written an entry
    expect(listVersions(app)).toEqual([])
  })

  it('refuses an empty label, because an unlabelled point is unscrubbable', () => {
    const { app } = repo()
    const r = recordVersion(app, { label: '   ' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('needs a label')
  })

  it('refuses outside a git repo, in the words checkpoint already uses', () => {
    const loose = mkdtempSync(join(tmpdir(), 's2c-hist-bare-'))
    const r = recordVersion(loose, { label: 'nope' })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('not inside a git repository')
    expect(r.error).not.toContain('refusing to edit')
  })

  it('names what changed since the previous entry, and nothing on the first', () => {
    const { app } = repo()
    expect(record(app, 'v1').files).toEqual([])
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')
    expect(record(app, 'v2').files).toEqual(['src/Existing.tsx', 'src/New.tsx'])
  })

  it('never reports its own history files as part of the page', () => {
    const { app } = repo() // deliberately NOT gitignoring .sketch2code
    record(app, 'v1', PNG_URL)
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    const v2 = record(app, 'v2', PNG_URL)
    expect(v2.files).toEqual(['src/Existing.tsx'])
    expect(Object.keys(v2.untracked)).toEqual([])
  })
})

describe('a timeline that only moves when the page does', () => {
  it('skips a record when nothing changed at all', () => {
    const { app } = repo()
    record(app, 'v1', PNG_URL)
    const again = recordVersion(app, { label: 'watcher fired again', thumbnail: PNG_URL })
    expect(again).toEqual({ ok: true, entry: null, unchanged: true })
    expect(listVersions(app)).toHaveLength(1)
  })

  it('does not leave a thumbnail behind for the entry it skipped', () => {
    const { app } = repo()
    record(app, 'v1', PNG_URL)
    recordVersion(app, { label: 'skipped', thumbnail: PNG_URL })
    const pngs = execFileSync('ls', [join(app, '.sketch2code/history')], { encoding: 'utf8' })
      .split('\n').filter((f) => f.endsWith('.png'))
    expect(pngs).toHaveLength(1)
  })

  it('still sees a change when the only new thing is an untracked file', () => {
    // the one `git stash create` is blind to: its tree is identical here, so a
    // version keyed on the tree alone would skip the most visible edit there is
    const { app } = repo()
    const v1 = record(app, 'v1')
    writeFileSync(join(app, 'src/Card.tsx'), 'export default () => null\n')
    const v2 = record(app, 'new component')
    expect(v2.tree).toBe(v1.tree)
    expect(v2.files).toEqual(['src/Card.tsx'])
    expect(Object.keys(v2.untracked)).toEqual(['src/Card.tsx'])
  })

  it('sees a change when a file is edited back and forth', () => {
    const { app } = repo()
    record(app, 'v1')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    record(app, 'v2')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 1\n')
    // back to the committed content, but NOT to the newest entry's content
    expect(record(app, 'v3').files).toEqual(['src/Existing.tsx'])
  })
})

describe('scrubbing back', () => {
  it('takes the created file with it, instead of leaving an orphan', () => {
    const { app } = repo()
    const v1 = record(app, 'before the extract', PNG_URL)

    // the exact shape an extract leaves: a new component plus a call site
    writeFileSync(join(app, 'src/Card.tsx'), 'export default function Card() { return null }\n')
    writeFileSync(join(app, 'src/Existing.tsx'), "import Card from './Card'\nexport const a = <Card />\n")
    record(app, 'after the extract', PNG_URL)

    const back = restoreVersion(app, v1.id, { thumbnail: PNG_URL })
    expect(back.ok).toBe(true)
    expect(back.files).toEqual(['src/Card.tsx', 'src/Existing.tsx'])
    expect(existsSync(join(app, 'src/Card.tsx'))).toBe(false)
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 1\n')
  })

  it('brings a created file back, which no tree of git\'s ever held', () => {
    const { app } = repo()
    record(app, 'v1')
    writeFileSync(join(app, 'src/Card.tsx'), 'export default function Card() { return <b /> }\n')
    const v2 = record(app, 'with the card')
    rmSync(join(app, 'src/Card.tsx'))
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 3\n')
    record(app, 'card deleted')

    expect(restoreVersion(app, v2.id).ok).toBe(true)
    expect(readFileSync(join(app, 'src/Card.tsx'), 'utf8'))
      .toBe('export default function Card() { return <b /> }\n')
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 1\n')
  })

  it('is itself undoable: unrecorded work is captured before it is replaced', () => {
    // the case that would really hurt: work done by hand since the last record,
    // which is the one thing git is not holding anywhere
    const { app } = repo()
    const v1 = record(app, 'plain', PNG_URL)
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 99\n')
    record(app, 'the one I liked', PNG_URL)
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')

    const back = restoreVersion(app, v1.id, { thumbnail: PNG_URL })
    expect(back.recorded?.label).toBe('before scrubbing back to "plain"')
    expect(existsSync(join(app, 'src/New.tsx'))).toBe(false)

    // and forward again, out of the entry the restore made
    expect(restoreVersion(app, back.recorded!.id).ok).toBe(true)
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 99\n')
    expect(readFileSync(join(app, 'src/New.tsx'), 'utf8')).toBe('export const b = 2\n')
  })

  it('adds no undo entry when the state it replaces is already on the timeline', () => {
    // scrubbing repeatedly would otherwise pile up identical entries, each one
    // labelled as the undo of the last
    const { app } = repo()
    const v1 = record(app, 'v1')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    const v2 = record(app, 'v2')

    const back = restoreVersion(app, v1.id)
    expect(back.ok).toBe(true)
    expect(back.recorded).toBeNull()
    expect(listVersions(app).map((e) => e.id)).toEqual([v2.id, v1.id])
    // still undoable — v2 is the entry that holds the replaced state
    expect(restoreVersion(app, v2.id).ok).toBe(true)
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 2\n')
  })

  it('does not delete the timeline it is being scrubbed from', () => {
    // .sketch2code is untracked here, so a plain revert would wipe the index
    // mid-scrub and take every later entry with it
    const { app } = repo()
    const v1 = record(app, 'v1', PNG_URL)
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    record(app, 'v2', PNG_URL)

    expect(restoreVersion(app, v1.id, { thumbnail: PNG_URL }).ok).toBe(true)
    expect(existsSync(historyIndexPath(app))).toBe(true)
    expect(listVersions(app).map((e) => e.label)).toEqual(['v2', 'v1'])
    expect(existsSync(join(app, v1.thumb!))).toBe(true)
  })

  it('works the same when the project gitignores .sketch2code, as this repo does', () => {
    const { app } = repo(true)
    const v1 = record(app, 'v1', PNG_URL)
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 2\n')
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')
    const v2 = record(app, 'v2', PNG_URL)
    expect(v2.files).toEqual(['src/Existing.tsx', 'src/New.tsx'])

    expect(restoreVersion(app, v1.id).ok).toBe(true)
    expect(existsSync(join(app, 'src/New.tsx'))).toBe(false)
    expect(existsSync(historyIndexPath(app))).toBe(true)
  })

  it('refuses an id that is not on the timeline', () => {
    const { app } = repo()
    record(app, 'v1')
    const r = restoreVersion(app, 'vnope')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('no version "vnope"')
    expect(r.files).toBeUndefined()
  })

  it('refuses a version whose code git has garbage-collected', () => {
    const { app } = repo()
    record(app, 'long ago')
    const entries = listVersions(app)
    entries[0]!.sha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    writeFileSync(historyIndexPath(app), JSON.stringify(entries))

    const r = restoreVersion(app, entries[0]!.id)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('garbage-collected')
    expect(r.error).toContain('deadbeefde')
  })

  it('names the created file whose saved copy is gone', () => {
    const { app } = repo()
    record(app, 'v1')
    writeFileSync(join(app, 'src/Card.tsx'), 'x\n')
    const v2 = record(app, 'v2')
    const entries = listVersions(app)
    entries.find((e) => e.id === v2.id)!.untracked['src/Card.tsx'] =
      'beefbeefbeefbeefbeefbeefbeefbeefbeefbeef'
    writeFileSync(historyIndexPath(app), JSON.stringify(entries))

    const r = restoreVersion(app, v2.id)
    expect(r.ok).toBe(false)
    expect(r.error).toContain('src/Card.tsx')
    // the worktree must be untouched by a refusal
    expect(readFileSync(join(app, 'src/Card.tsx'), 'utf8')).toBe('x\n')
  })
})

describe('keeping the timeline bounded', () => {
  it('prunes the oldest entries and deletes their thumbnails', () => {
    const { app } = repo()
    const made: Version[] = []
    for (let i = 0; i < 53; i++) {
      writeFileSync(join(app, 'src/Existing.tsx'), `export const a = ${String(i)}\n`)
      made.push(record(app, `step ${String(i)}`, PNG_URL))
    }
    const kept = listVersions(app)
    expect(kept).toHaveLength(50)
    expect(kept[0]!.label).toBe('step 52')
    expect(kept[49]!.label).toBe('step 3')

    // the pruned pictures are the point: they are megabytes in a user's project
    for (const gone of made.slice(0, 3)) {
      expect(existsSync(join(app, `.sketch2code/history/${gone.id}.png`))).toBe(false)
    }
    for (const alive of made.slice(3)) {
      expect(existsSync(join(app, `.sketch2code/history/${alive.id}.png`))).toBe(true)
    }
    // 53 real checkpoints of a real repo: slower than the default budget
  }, 120_000)
})

describe('an index nobody can trust', () => {
  const survives = (app: string) => {
    expect(() => listVersions(app)).not.toThrow()
    expect(listVersions(app)).toEqual([])
    // and recording still works afterwards, rather than inheriting the mess
    expect(record(app, 'after the mess').files).toEqual([])
  }

  it('tolerates a missing index', () => {
    const { app } = repo()
    expect(listVersions(app)).toEqual([])
  })

  it('tolerates a half-written index', () => {
    const { app } = repo()
    record(app, 'v1', PNG_URL)
    const partial = readFileSync(historyIndexPath(app), 'utf8').slice(0, 40)
    writeFileSync(historyIndexPath(app), partial)
    survives(app)
  })

  it('tolerates an index that is not even an array', () => {
    const { app } = repo()
    mkdirSync(join(app, '.sketch2code/history'), { recursive: true })
    writeFileSync(historyIndexPath(app), '{"versions": "soon"}')
    survives(app)
  })

  it('drops individual entries a hand-edit has broken, keeping the rest', () => {
    const { app } = repo()
    record(app, 'good one', PNG_URL)
    const good = listVersions(app)[0]!
    writeFileSync(historyIndexPath(app), JSON.stringify([
      good,
      null,
      'a string',
      { id: 'no-sha' },
      { id: 'bad id/../..', sha: good.sha },
      { ...good, id: 'dup-of-nothing', sha: 'zzzz' },
    ]))
    expect(listVersions(app).map((e) => e.id)).toEqual([good.id])
  })

  it('refuses to read or delete a thumbnail path pointing outside history', () => {
    const { app } = repo()
    const v = record(app, 'v1', PNG_URL)
    const entries = listVersions(app)
    entries[0]!.thumb = '../../../../etc/hosts'
    writeFileSync(historyIndexPath(app), JSON.stringify(entries))
    expect(listVersions(app)[0]!.thumb).toBeUndefined()
    // the real picture is still where it belongs
    expect(existsSync(join(app, `.sketch2code/history/${v.id}.png`))).toBe(true)
  })

  it('never hands the UI a thumbnail path that no longer exists', () => {
    const { app } = repo()
    const v = record(app, 'v1', PNG_URL)
    rmSync(join(app, v.thumb!))
    expect(listVersions(app)[0]!.thumb).toBeUndefined()
  })
})

describe('what changed between two points', () => {
  it('counts added and removed lines per file', () => {
    const { app } = repo()
    writeFileSync(join(app, 'src/Existing.tsx'), 'a\nb\nc\n')
    const v1 = record(app, 'v1')
    writeFileSync(join(app, 'src/Existing.tsx'), 'a\nB\nc\nd\n')
    const v2 = record(app, 'v2')

    const d = diffVersions(app, v1.id, v2.id)
    expect(d.ok).toBe(true)
    expect(d.files).toEqual([{ file: 'src/Existing.tsx', added: 2, removed: 1 }])
  })

  it('counts a created file, which lives in no tree', () => {
    const { app } = repo()
    const v1 = record(app, 'v1')
    writeFileSync(join(app, 'src/Card.tsx'), 'one\ntwo\nthree\n')
    const v2 = record(app, 'v2')

    expect(diffVersions(app, v1.id, v2.id).files)
      .toEqual([{ file: 'src/Card.tsx', added: 3, removed: 0 }])
    // and the other direction reads as a removal
    expect(diffVersions(app, v2.id, v1.id).files)
      .toEqual([{ file: 'src/Card.tsx', added: 0, removed: 3 }])
  })

  it('counts an edit to a file that is still untracked at both points', () => {
    const { app } = repo()
    writeFileSync(join(app, 'src/Card.tsx'), 'one\ntwo\n')
    const v1 = record(app, 'v1')
    writeFileSync(join(app, 'src/Card.tsx'), 'one\nTWO\nthree\n')
    const v2 = record(app, 'v2')
    expect(diffVersions(app, v1.id, v2.id).files)
      .toEqual([{ file: 'src/Card.tsx', added: 2, removed: 1 }])
  })

  it('is empty between a point and itself', () => {
    const { app } = repo()
    const v1 = record(app, 'v1')
    expect(diffVersions(app, v1.id, v1.id)).toEqual({ ok: true, files: [] })
  })

  it('says which id it could not find', () => {
    const { app } = repo()
    const v1 = record(app, 'v1')
    expect(diffVersions(app, v1.id, 'vgone').error).toContain('no version "vgone"')
    expect(diffVersions(app, 'vgone', v1.id).error).toContain('no version "vgone"')
    const both = diffVersions(app, 'va', 'vb')
    expect(both.ok).toBe(false)
    expect(both.error).toContain('neither "va" nor "vb"')
  })
})

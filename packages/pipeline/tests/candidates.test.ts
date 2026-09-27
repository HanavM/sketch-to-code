import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyWork, captureWork, pickBest, revertTouched, revertWork, touchedFiles, type Attempt,
} from '../src/candidates.js'
import { checkpoint } from '../src/safety.js'

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' })

/** A real repo with a committed file and a nested app dir, like the demo app. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 's2c-cand-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 't@example.com')
  git(root, 'config', 'user.name', 'T')
  mkdirSync(join(root, 'app/src'), { recursive: true })
  writeFileSync(join(root, 'app/src/Existing.tsx'), 'export const a = 1\n')
  git(root, 'add', '-A')
  git(root, 'commit', '-qm', 'init')
  return { root, app: join(root, 'app') }
}

describe('capturing an attempt', () => {
  it('sees created files, which a diff alone never does', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 99\n')
    expect(touchedFiles(app, cp).sort()).toEqual(['src/Existing.tsx', 'src/New.tsx'])
    const work = captureWork(app, cp)
    expect(work.get('src/New.tsx')).toContain('b = 2')
    expect(work.get('src/Existing.tsx')).toContain('a = 99')
  })

  it('records a deletion as a deletion', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    rmSync(join(app, 'src/Existing.tsx'))
    expect(captureWork(app, cp).get('src/Existing.tsx')).toBeNull()
  })
})

describe('undoing one edit, the way Ctrl+Z does', () => {
  it('takes the created component with it, not just the call site', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    // the exact shape an extract leaves behind: a new component plus a call
    // site pointing at it. Undo used to restore only the second, which left
    // the page importing a file that no longer had any reason to exist.
    writeFileSync(join(app, 'src/Card.tsx'), 'export default function Card() { return null }\n')
    writeFileSync(join(app, 'src/Existing.tsx'), "import Card from './Card'\nexport const a = <Card />\n")

    expect(revertTouched(app, cp).sort()).toEqual(['src/Card.tsx', 'src/Existing.tsx'])

    expect(existsSync(join(app, 'src/Card.tsx'))).toBe(false)
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 1\n')
  })

  it('reports nothing when there is nothing to undo', () => {
    const { app } = repo()
    expect(revertTouched(app, checkpoint(app, true))).toEqual([])
  })
})

describe('putting the tree back between attempts', () => {
  it('restores edits AND removes files the attempt created', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 99\n')
    const work = captureWork(app, cp)

    revertWork(app, cp, work)

    // this is the one that matters: a leaked file would contaminate the next
    // attempt and get credited to it
    expect(existsSync(join(app, 'src/New.tsx'))).toBe(false)
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 1\n')
    expect(touchedFiles(app, cp)).toEqual([])
  })

  it('round-trips: revert then re-apply the winner exactly', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    writeFileSync(join(app, 'src/New.tsx'), 'export const b = 2\n')
    writeFileSync(join(app, 'src/Existing.tsx'), 'export const a = 99\n')
    const work = captureWork(app, cp)

    revertWork(app, cp, work)
    applyWork(app, work)

    expect(readFileSync(join(app, 'src/New.tsx'), 'utf8')).toBe('export const b = 2\n')
    expect(readFileSync(join(app, 'src/Existing.tsx'), 'utf8')).toBe('export const a = 99\n')
  })

  it('re-applies a deletion as a deletion', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    rmSync(join(app, 'src/Existing.tsx'))
    const work = captureWork(app, cp)
    revertWork(app, cp, work)
    expect(existsSync(join(app, 'src/Existing.tsx'))).toBe(true)
    applyWork(app, work)
    expect(existsSync(join(app, 'src/Existing.tsx'))).toBe(false)
  })

  it('creates parent directories when re-applying into a new folder', () => {
    const { app } = repo()
    const cp = checkpoint(app, true)
    mkdirSync(join(app, 'src/deep/er'), { recursive: true })
    writeFileSync(join(app, 'src/deep/er/X.tsx'), 'x\n')
    const work = captureWork(app, cp)
    revertWork(app, cp, work)
    expect(existsSync(join(app, 'src/deep/er/X.tsx'))).toBe(false)
    applyWork(app, work)
    expect(readFileSync(join(app, 'src/deep/er/X.tsx'), 'utf8')).toBe('x\n')
  })
})

describe('picking the winner', () => {
  const at = (index: number, score: number): Attempt =>
    ({ index, score, detail: null, failures: [], files: [], work: new Map(), tokens: { input: 0, cacheRead: 0, output: 0 } })

  it('takes the highest score', () => {
    expect(pickBest([at(0, 0.4), at(1, 0.9), at(2, 0.7)])?.index).toBe(1)
  })
  it('breaks ties toward the attempt that needed no construction hint', () => {
    expect(pickBest([at(0, 0.8), at(1, 0.8)])?.index).toBe(0)
  })
  it('is null when there is nothing to pick', () => {
    expect(pickBest([])).toBeNull()
  })
})

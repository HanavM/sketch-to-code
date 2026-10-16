/**
 * s2c-026: Undo must not throw away a hand edit made after the tool's edit.
 *
 * Undo restores every file an edit touched to its checkpoint. A hand change
 * made to one of those files afterwards is in no checkpoint, so Ctrl+Z used to
 * erase it without a word. These drive the same calls the plugin's
 * /@s2c/undo handler makes: wouldRevert (only the files the edit wrote) ->
 * undoReason -> revertTouched.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkpoint, dirtReason, handChanges, recordOwnedState, undoReason, type Checkpoint } from '../src/safety.js'
import { revertTouched, touchedFiles, untrackedFiles, wouldRevert } from '../src/candidates.js'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' }).trim()

function project(sub = ''): { repo: string; root: string } {
  const repo = mkdtempSync(join(tmpdir(), 's2c-undo-hand-'))
  git(repo, 'init', '-q')
  const root = sub ? join(repo, sub) : repo
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.sketch2code/\n')
  writeFileSync(join(root, 'src/App.jsx'), 'export default () => <h1>Hi</h1>\n')
  writeFileSync(join(root, 'src/Nav.jsx'), 'export const Nav = () => <nav/>\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')
  return { repo, root }
}

interface Entry { cp: Checkpoint; untracked: string[]; after: string[]; touched: string[] | null }

/** What an edit endpoint + pushEdit do. */
function toolEdit(root: string, file: string, text: string, allowDirty = false): Entry {
  const untracked = untrackedFiles(root)
  const cp = checkpoint(root, allowDirty)
  writeFileSync(join(root, file), text)
  const after = untrackedFiles(root)
  const touched = touchedFiles(root, cp).filter((r) => !untracked.includes(r))
  recordOwnedState(root)
  return { cp, untracked, after, touched }
}

/** What /@s2c/undo does for one entry: the refusal, or the files it reverted. */
function undo(root: string, e: Entry): { refused: string } | { files: string[] } {
  const appeared = untrackedFiles(root).filter((r) => !e.after.includes(r))
  let keep = [...e.untracked, ...appeared]
  const touched = e.touched
  if (touched) keep = [...keep, ...wouldRevert(root, e.cp, keep).filter((r) => !touched.includes(r))]
  const pending = wouldRevert(root, e.cp, keep)
  const refusal = undoReason(root, pending)
  if (refusal) return { refused: refusal }
  const wasOwned = handChanges(root).owned
  const files = revertTouched(root, e.cp, keep)
  if (wasOwned) recordOwnedState(root)
  return { files }
}

const read = (root: string, f: string): string => readFileSync(join(root, f), 'utf8')

describe('undo vs a hand edit (s2c-026)', () => {
  it('tool edit, hand edit to the same file, Ctrl+Z: refused in words, nothing changes', () => {
    const { root } = project()
    const e = toolEdit(root, 'src/App.jsx', 'tool v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'tool v1\n// my tweak\n')
    const r = undo(root, e)
    expect(r).toHaveProperty('refused')
    const why = (r as { refused: string }).refused
    expect(why).toMatch(/^Undo stopped: src\/App\.jsx was changed by hand after sketch2code's last edit/)
    expect(why).toMatch(/Nothing was changed/)
    expect(read(root, 'src/App.jsx')).toBe('tool v1\n// my tweak\n') // the tweak survives
  })

  it('undo on a tree the tool left as it is behaves as before', () => {
    const { root } = project()
    const e1 = toolEdit(root, 'src/App.jsx', 'v1\n')
    const e2 = toolEdit(root, 'src/App.jsx', 'v2\n')
    expect(undo(root, e2)).toEqual({ files: ['src/App.jsx'] })
    expect(read(root, 'src/App.jsx')).toBe('v1\n')
    expect(undo(root, e1)).toEqual({ files: ['src/App.jsx'] })
    expect(read(root, 'src/App.jsx')).toContain('<h1>Hi</h1>')
  })

  it('a hand edit to a file the undo does not touch survives it, and still blocks the next sketch', () => {
    const { root } = project()
    const e = toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/Nav.jsx'), 'my nav\n')
    expect(undo(root, e)).toEqual({ files: ['src/App.jsx'] })
    expect(read(root, 'src/App.jsx')).toContain('<h1>Hi</h1>')
    expect(read(root, 'src/Nav.jsx')).toBe('my nav\n')
    // not laundered into an "owned" state by the undo
    expect(dirtReason(root)).toMatch(/src\/Nav\.jsx/)
  })

  it('once the hand edit is committed, undo goes ahead (git still has it)', () => {
    const { repo, root } = project()
    const e = toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'v1 + mine\n')
    expect(undo(root, e)).toHaveProperty('refused')
    git(repo, 'commit', '-qam', 'mine')
    expect(undo(root, e)).toEqual({ files: ['src/App.jsx'] })
    expect(git(repo, 'show', 'HEAD:src/App.jsx')).toBe('v1 + mine')
  })

  it('putting the file back the way the tool left it unblocks undo', () => {
    const { root } = project()
    const e = toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'v1 tweak\n')
    expect(undo(root, e)).toHaveProperty('refused')
    writeFileSync(join(root, 'src/App.jsx'), 'v1\n')
    expect(undo(root, e)).toEqual({ files: ['src/App.jsx'] })
  })

  it('a hand edit to a file the tool CREATED is protected too (undo would delete it)', () => {
    const { root } = project()
    const e = toolEdit(root, 'src/Card.jsx', 'export const Card = () => null\n')
    writeFileSync(join(root, 'src/Card.jsx'), 'export const Card = () => <b>mine</b>\n')
    const r = undo(root, e)
    expect(r).toHaveProperty('refused')
    expect((r as { refused: string }).refused).toMatch(/src\/Card\.jsx/)
    expect(read(root, 'src/Card.jsx')).toContain('mine')
  })

  it('a file the user created by hand after the edit is spared, not a reason to refuse', () => {
    const { root } = project()
    const e = toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/Mine.jsx'), 'mine\n')
    expect(undo(root, e)).toEqual({ files: ['src/App.jsx'] })
    expect(read(root, 'src/Mine.jsx')).toBe('mine\n')
  })

  it('allowDirty does not license undo to erase a later hand edit', () => {
    const { root } = project()
    writeFileSync(join(root, 'src/Nav.jsx'), 'dirt before\n')
    const e = toolEdit(root, 'src/App.jsx', 'v1\n', true)
    // dirt from BEFORE the edit is in its checkpoint, so undo keeps it
    expect(undo(root, e)).toEqual({ files: ['src/App.jsx'] })
    expect(read(root, 'src/Nav.jsx')).toBe('dirt before\n')
    const e2 = toolEdit(root, 'src/App.jsx', 'v2\n', true)
    writeFileSync(join(root, 'src/App.jsx'), 'v2 hand\n')
    expect(undo(root, e2)).toHaveProperty('refused')
  })

  it('works when the app lives in a subfolder of the repo', () => {
    const { root } = project('apps/web')
    const e = toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'hand\n')
    expect((undo(root, e) as { refused: string }).refused).toMatch(/^Undo stopped: src\/App\.jsx/)
  })

  it('an entry from before touched was recorded still refuses rather than erase a hand edit elsewhere', () => {
    const { root } = project()
    const e = { ...toolEdit(root, 'src/App.jsx', 'v1\n'), touched: null }
    writeFileSync(join(root, 'src/Nav.jsx'), 'my nav\n')
    expect((undo(root, e) as { refused: string }).refused).toMatch(/src\/Nav\.jsx/)
    expect(read(root, 'src/Nav.jsx')).toBe('my nav\n')
  })

  it('a project with no recorded state (from before s2c-024) undoes as it always did', () => {
    const { root } = project()
    const cp = checkpoint(root, false)
    writeFileSync(join(root, 'src/App.jsx'), 'v1\n')
    expect(undoReason(root, wouldRevert(root, cp, []))).toBeNull()
  })
})

/**
 * s2c-024: change #2 must not be refused.
 *
 * In a project set up by `init` (allowDirty unset) nothing commits after a
 * run, so the tree is dirty from change #1 on, and checkpoint() refused every
 * later edit. Now dirt that is exactly what sketch2code itself left behind is
 * allowed; anything changed by hand since is still refused, in plain words,
 * naming the file.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkpoint, dirtReason, recordOwnedState, revertToCheckpoint, worktreeId, ownedFile } from '../src/safety.js'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd, encoding: 'utf8' }).trim()

function project(sub = ''): { repo: string; root: string } {
  const repo = mkdtempSync(join(tmpdir(), 's2c-owned-'))
  git(repo, 'init', '-q')
  const root = sub ? join(repo, sub) : repo
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(repo, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(root, 'src/App.jsx'), 'export default () => <h1>Hi</h1>\n')
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', 'init')
  return { repo, root }
}

/** What an edit endpoint does: checkpoint, write, then pushEdit records. */
function toolEdit(root: string, file: string, text: string): ReturnType<typeof checkpoint> {
  const cp = checkpoint(root, false)
  writeFileSync(join(root, file), text)
  recordOwnedState(root)
  return cp
}

describe('owned dirt (s2c-024)', () => {
  it('runs 2 and 3 proceed on a non-allowDirty project, and undo restores each step', () => {
    const { root } = project()
    const cp1 = toolEdit(root, 'src/App.jsx', 'v1\n')
    expect(cp1.dirtyBefore).toBe(false)
    const cp2 = toolEdit(root, 'src/App.jsx', 'v2\n') // used to throw "uncommitted changes"
    expect(cp2.dirtyBefore).toBe(true)
    // a run that CREATES a file (scaffold, extract) leaves it untracked
    const cp3 = toolEdit(root, 'src/Card.jsx', 'export const Card = () => null\n')
    expect(checkpoint(root, false).sha).toMatch(/^[0-9a-f]{40}$/) // run 4 too

    revertToCheckpoint(root, cp2, ['src/App.jsx'])
    expect(readFileSync(join(root, 'src/App.jsx'), 'utf8')).toBe('v1\n')
    revertToCheckpoint(root, cp1, ['src/App.jsx'])
    expect(readFileSync(join(root, 'src/App.jsx'), 'utf8')).toContain('<h1>Hi</h1>')
    expect(cp3.sha).not.toBe(cp2.sha)
  })

  it('a state reached by undo is the tool\'s too', () => {
    const { root } = project()
    toolEdit(root, 'src/App.jsx', 'v1\n')
    const cp2 = toolEdit(root, 'src/App.jsx', 'v2\n')
    revertToCheckpoint(root, cp2, ['src/App.jsx']) // back to v1: a state already recorded
    expect(dirtReason(root)).toBeNull()
    writeFileSync(join(root, 'src/App.jsx'), 'v1b\n') // not recorded…
    expect(dirtReason(root)).not.toBeNull()
    recordOwnedState(root) // …until the plugin's undo handler records it
    expect(dirtReason(root)).toBeNull()
  })

  it('a hand edit after the tool\'s edit is refused, naming the file', () => {
    const { root } = project()
    toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'v1 + my hand edit\n')
    expect(() => checkpoint(root, false)).toThrow(/src\/App\.jsx changed outside sketch2code/)
    expect(() => checkpoint(root, false)).toThrow(/uncommitted/)
    expect(() => checkpoint(root, true)).not.toThrow() // allowDirty still overrides
  })

  it('a new untracked file by hand is dirt too; deleting it again is fine', () => {
    const { root } = project()
    toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/Mine.jsx'), 'mine\n')
    expect(dirtReason(root)).toMatch(/src\/Mine\.jsx/)
    execFileSync('rm', [join(root, 'src/Mine.jsx')])
    expect(dirtReason(root)).toBeNull()
  })

  it('dirt from before the tool ever edited is refused in plain words', () => {
    const { root } = project()
    writeFileSync(join(root, 'src/App.jsx'), 'mine\n')
    const why = dirtReason(root)
    expect(why).toMatch(/^refusing to edit: src\/App\.jsx has uncommitted changes that sketch2code didn't make/)
    expect(why).toMatch(/git commit/)
    expect(why).toMatch(/allowDirty: true/)
  })

  it('a commit resets everything: clean is always fine', () => {
    const { repo, root } = project()
    toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(root, 'src/App.jsx'), 'hand\n')
    git(repo, 'commit', '-qam', 'mine')
    expect(dirtReason(root)).toBeNull()
  })

  it('the tool folder and the form data store never count as dirt', () => {
    const { root } = project()
    toolEdit(root, 'src/App.jsx', 'v1\n')
    // no .gitignore entry for .sketch2code (init --no-gitignore)
    mkdirSync(join(root, '.sketch2code'), { recursive: true })
    writeFileSync(join(root, '.sketch2code/undo.json'), '{"entries":[]}\n')
    // someone submits the form a run made real
    mkdirSync(join(root, 'server/data'), { recursive: true })
    writeFileSync(join(root, 'server/data/signups.json'), '[{"email":"a@b"}]\n')
    expect(dirtReason(root)).toBeNull()
    expect(existsSync(ownedFile(root))).toBe(true)
  })

  it('works when the app lives in a subfolder of the repo, and ignores dirt outside it', () => {
    const { repo, root } = project('apps/web')
    toolEdit(root, 'src/App.jsx', 'v1\n')
    writeFileSync(join(repo, 'NOTES.md'), 'unrelated\n')
    expect(dirtReason(root)).toBeNull()
    writeFileSync(join(root, 'src/App.jsx'), 'hand\n')
    expect(dirtReason(root)).toMatch(/refusing to edit: src\/App\.jsx changed outside/)
  })

  it('works when .sketch2code and node_modules exist and are gitignored (the init layout)', () => {
    const { repo, root } = project()
    writeFileSync(join(repo, '.gitignore'), 'node_modules/\n.sketch2code/\n')
    git(repo, 'commit', '-qam', 'ignore')
    mkdirSync(join(root, 'node_modules/.vite'), { recursive: true })
    writeFileSync(join(root, 'node_modules/.vite/deps.json'), '{}\n')
    expect(worktreeId(root)).toMatch(/^[0-9a-f]{40}$/)
    toolEdit(root, 'src/App.jsx', 'v1\n')
    expect(() => toolEdit(root, 'src/App.jsx', 'v2\n')).not.toThrow()
  })

  it('never touches the real index', () => {
    const { repo, root } = project()
    writeFileSync(join(root, 'src/New.jsx'), 'x\n')
    const before = git(repo, 'status', '--porcelain')
    expect(worktreeId(root)).toMatch(/^[0-9a-f]{40}$/)
    expect(git(repo, 'status', '--porcelain')).toBe(before)
    expect(before).toMatch(/^\?\? src\/New\.jsx/)
  })
})

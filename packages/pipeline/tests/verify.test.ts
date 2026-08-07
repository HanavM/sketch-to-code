import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DomNode, DomSnapshot } from '@s2c/dom'
import type { EditOp } from '@s2c/intent'
import { changedFiles, checkpoint, revertToCheckpoint } from '../src/safety.js'
import { verifyOps } from '../src/verify.js'

const N = (
  id: string, srcLoc: string | null, text: string, x: number, y = 0,
  overrides: Partial<DomNode> = {},
): DomNode => ({
  id, tag: 'div', srcLoc, rect: { x, y, w: 100, h: 50 }, text, classes: [],
  style: {
    display: 'block', position: 'static', zIndex: 'auto', flexDirection: 'row',
    gap: '0', padding: '0', margin: '0', backgroundColor: 'white', color: 'black',
    fontSize: '14px', fontWeight: '400', borderRadius: '0',
  },
  parent: null, depth: 1,
  ...overrides,
})

const snap = (nodes: DomNode[]): DomSnapshot => ({
  nodes, viewport: { w: 1000, h: 800, scrollX: 0, scrollY: 0 },
  url: 'http://t/', takenAt: 0, truncated: false,
})

const target = (n: DomNode) => ({
  domId: n.id, srcLoc: n.srcLoc, tag: n.tag, text: n.text, classes: n.classes, rect: n.rect,
})

describe('verifyOps', () => {
  const cardA = N('a', 'src/C.tsx:5:3', 'Card A', 0)
  const cardB = N('b', 'src/C.tsx:5:3', 'Card B', 200)

  it('DELETE satisfied when the text-matched element is gone', () => {
    const ops: EditOp[] = [{ op: 'DELETE', target: target(cardB), inkIds: [], pendingTextIds: [] }]
    const before = snap([cardA, cardB])
    const afterGone = snap([cardA])
    const afterStill = snap([cardA, cardB])
    expect(verifyOps(ops, before, afterGone).satisfied).toBe(1)
    expect(verifyOps(ops, before, afterStill).satisfied).toBe(0)
  })

  it('MODIFY satisfied only when something observable changed', () => {
    const ops: EditOp[] = [{ op: 'MODIFY', target: target(cardA), inkIds: [], pendingTextIds: [], instruction: 'make red' }]
    const before = snap([cardA])
    const changed = snap([N('a2', 'src/C.tsx:5:3', 'Card A', 0, 0, {
      style: { ...cardA.style, backgroundColor: 'red' },
    })])
    const unchanged = snap([{ ...cardA, id: 'a3' }])
    expect(verifyOps(ops, before, changed).satisfied).toBe(1)
    expect(verifyOps(ops, before, unchanged).satisfied).toBe(0)
  })

  it('ADD satisfied when the page grew', () => {
    const form = N('f', 'src/F.tsx:3:1', '', 0, 0, { rect: { x: 0, y: 0, w: 400, h: 600 } })
    const ops: EditOp[] = [{
      op: 'ADD', container: target(form),
      sketch: { kind: 'rect', rect: { x: 10, y: 10, w: 100, h: 40 } },
      inkIds: [], pendingTextIds: [],
    }]
    const before = snap([form])
    const grew = snap([form, N('new', 'src/F.tsx:9:5', 'New', 10)])
    expect(verifyOps(ops, before, grew).satisfied).toBe(1)
    expect(verifyOps(ops, before, snap([form])).satisfied).toBe(0)
  })

  it('MOVE satisfied when document order matches the requested position', () => {
    const ops: EditOp[] = [{
      op: 'MOVE', source: target(cardB), dest: target(cardA), position: 'before',
      inkIds: [], pendingTextIds: [],
    }]
    const before = snap([cardA, cardB])
    const movedNodes = [
      { ...cardB, rect: { ...cardB.rect, x: 0 } },
      { ...cardA, rect: { ...cardA.rect, x: 200 } },
    ]
    expect(verifyOps(ops, before, snap(movedNodes)).satisfied).toBe(1)
    expect(verifyOps(ops, before, snap([cardA, cardB])).satisfied).toBe(0)
  })
})

describe('safety', () => {
  function makeRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 's2c-safety-'))
    execFileSync('git', ['init', '-q'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: dir })
    return dir
  }

  it('refuses dirty tree unless allowDirty; checkpoints capture the worktree', () => {
    const dir = makeRepo()
    writeFileSync(join(dir, 'a.txt'), 'v1\n')
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'v1'], { cwd: dir })

    // dirty it
    writeFileSync(join(dir, 'a.txt'), 'v2\n')
    expect(() => checkpoint(dir, false)).toThrow(/uncommitted/)

    const cp = checkpoint(dir, true)
    expect(cp.sha).toMatch(/^[0-9a-f]{40}$/)

    // "the model" edits the file
    writeFileSync(join(dir, 'a.txt'), 'model-mangled\n')
    expect(changedFiles(dir, cp)).toContain('a.txt')

    // revert restores the checkpointed (v2) content, not v1
    revertToCheckpoint(dir, cp, ['a.txt'])
    const restored = execFileSync('cat', ['a.txt'], { cwd: dir, encoding: 'utf8' })
    expect(restored).toBe('v2\n')
  })

  it('clean tree checkpoints at HEAD', () => {
    const dir = makeRepo()
    const cp = checkpoint(dir, false)
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim()
    expect(cp.sha).toBe(head)
    expect(cp.dirtyBefore).toBe(false)
  })

  it('refuses to operate outside any git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 's2c-nogit-'))
    expect(() => checkpoint(dir, true)).toThrow(/not inside a git repository/)
  })
})

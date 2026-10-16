import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

/**
 * s2c-022: stop means stop.
 *
 * The fake agent below behaves like the one that leaked: once it gets a turn
 * it keeps "editing" (appending to a file every 5ms) and never finishes on its
 * own. It stops only when the SDK's abortController fires or close() is
 * called — the two levers the real SDK gives us. This tests our wiring of
 * those levers, not the real SDK's process teardown (that costs tokens and
 * belongs to a live e2e).
 */
const agentLog = { file: '' }
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: ({ prompt, options }: { prompt: AsyncIterable<unknown>; options: { abortController?: AbortController } }) => {
    let stop: () => void = () => undefined
    const stopped = new Promise<void>((r) => { stop = r })
    let timer: ReturnType<typeof setInterval> | undefined
    const halt = () => { if (timer) clearInterval(timer); timer = undefined; stop() }
    options.abortController?.signal.addEventListener('abort', halt, { once: true })
    const stream = (async function* () {
      const it = prompt[Symbol.asyncIterator]()
      const first = await Promise.race([it.next(), stopped.then(() => null)])
      if (!first || first.done) return
      timer = setInterval(() => appendFileSync(agentLog.file, 'edit\n'), 5)
      await stopped
    })()
    return Object.assign(stream, { close: halt })
  },
}))

const { createCodegenSession } = await import('../src/codegen.js')
const { settleSession, sleepUnlessStopped, throwIfStopped, untilStopped } = await import('../src/abort.js')
const { checkpoint, PIN_PREFIX } = await import('../src/safety.js')
const { explainError } = await import('../src/explain.js')

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('codegen session: aborting the signal kills the agent (s2c-022)', () => {
  it('a pending turn rejects with the stop reason, and no edit lands after `closed`', async () => {
    agentLog.file = join(mkdtempSync(join(tmpdir(), 's2c-stop-')), 'edits.log')
    writeFileSync(agentLog.file, '')
    const ac = new AbortController()
    const s = createCodegenSession('/tmp/app', 'design', { onStage: () => undefined }, 'sys', ac.signal)
    const turn = s.send({ text: 'go' })
    await tick(40)
    expect(readFileSync(agentLog.file, 'utf8').length).toBeGreaterThan(0) // it really was editing
    ac.abort(new Error('stopped by you'))
    await expect(turn).rejects.toThrow('stopped by you')
    await settleSession(s.closed, 1_000)
    const atStop = readFileSync(agentLog.file, 'utf8')
    await tick(60)
    expect(readFileSync(agentLog.file, 'utf8')).toBe(atStop)
  })

  it('a session made with an already-aborted signal refuses its first turn', async () => {
    const ac = new AbortController()
    ac.abort(new Error('run exceeded 720s cap'))
    const s = createCodegenSession('/tmp/app', 'design', { onStage: () => undefined }, 'sys', ac.signal)
    await expect(s.send({ text: 'go' })).rejects.toThrow('720s cap')
    await settleSession(s.closed, 1_000)
  })

  it('without a signal nothing changes: close() still ends the session', async () => {
    const s = createCodegenSession('/tmp/app', 'design', { onStage: () => undefined })
    s.close()
    await settleSession(s.closed, 1_000)
    await expect(s.send({ text: 'late' })).rejects.toThrow('already closed')
  })
})

describe('abort helpers', () => {
  it('throwIfStopped throws the reason, and is a no-op without a signal', () => {
    expect(() => throwIfStopped(undefined)).not.toThrow()
    const ac = new AbortController()
    expect(() => throwIfStopped(ac.signal)).not.toThrow()
    ac.abort(new Error('stopped by you'))
    expect(() => throwIfStopped(ac.signal)).toThrow('stopped by you')
  })

  it('sleepUnlessStopped wakes early on a stop', async () => {
    const ac = new AbortController()
    const t0 = Date.now()
    const p = sleepUnlessStopped(5_000, ac.signal)
    setTimeout(() => ac.abort(new Error('stopped by you')), 10)
    await expect(p).rejects.toThrow('stopped by you')
    expect(Date.now() - t0).toBeLessThan(1_000)
  })

  it('untilStopped abandons a wait it cannot cancel, and passes results through', async () => {
    const ac = new AbortController()
    const never = new Promise<number>(() => undefined)
    const p = untilStopped(never, ac.signal)
    ac.abort(new Error('stopped by you'))
    await expect(p).rejects.toThrow('stopped by you')
    await expect(untilStopped(Promise.resolve(7), new AbortController().signal)).resolves.toBe(7)
    await expect(untilStopped(Promise.reject(new Error('snap failed')), undefined)).rejects.toThrow('snap failed')
  })

  it('settleSession gives up after its cap on an iterator that never ends', async () => {
    const t0 = Date.now()
    await settleSession(new Promise<void>(() => undefined), 30)
    expect(Date.now() - t0).toBeLessThan(500)
  })

  it('"stopped by you" reads as a stop, not as something going wrong', () => {
    expect(explainError('stopped by you', true).sentence).toMatch(/^Stopped, as you asked\. Undo puts/)
    expect(explainError('stopped by you', false).sentence).toMatch(/Nothing was changed/)
  })
})

describe('checkpoints are pinned so git gc cannot collect them (s2c-022)', () => {
  const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8' }).trim()
  const repo = () => {
    const dir = mkdtempSync(join(tmpdir(), 's2c-pin-'))
    git(dir, 'init', '-q')
    git(dir, 'config', 'user.email', 't@t')
    git(dir, 'config', 'user.name', 't')
    writeFileSync(join(dir, 'a.txt'), 'one\n')
    git(dir, 'add', '.')
    git(dir, 'commit', '-qm', 'init')
    return dir
  }
  const exists = (dir: string, sha: string) => {
    try { execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: dir, stdio: 'ignore' }); return true } catch { return false }
  }

  it('control: an unpinned `git stash create` object is deleted by gc --prune=now', () => {
    const dir = repo()
    writeFileSync(join(dir, 'a.txt'), 'two\n')
    const sha = git(dir, 'stash', 'create', 'unpinned')
    git(dir, 'gc', '-q', '--prune=now')
    expect(exists(dir, sha)).toBe(false) // this is the bug the pin fixes
  })

  it('a checkpoint survives gc --prune=now and still restores', () => {
    const dir = repo()
    writeFileSync(join(dir, 'a.txt'), 'two\n')
    const cp = checkpoint(dir, true)
    expect(git(dir, 'for-each-ref', '--format=%(refname)', PIN_PREFIX)).toContain(`${PIN_PREFIX}${cp.sha}`)
    writeFileSync(join(dir, 'a.txt'), 'three\n')
    git(dir, 'gc', '-q', '--prune=now')
    expect(exists(dir, cp.sha)).toBe(true)
    git(dir, 'restore', '--source', cp.sha, '--', 'a.txt')
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('two\n')
    // invisible to the user's usual views
    expect(git(dir, 'branch', '--list')).not.toMatch(/s2c/)
    expect(git(dir, 'stash', 'list')).toBe('')
  })
})
